// MODEL: Google Drive 클라우드 동기화 및 스토리지 서비스 (대안 2: index.json + notes/ 개별 노트 증분 동기화 + attachments/ 분리)
import { createNoteId, Note, NoteAttachment, Project } from './Note';

const CONFIG_STORAGE_KEY = 'bullsnote.googledrive.config.v1';
const TOKENS_STORAGE_KEY = 'bullsnote.googledrive.tokens.v1';
const DELETED_RECORDS_KEY = 'bullsnote.googledrive.deleted.v1';
const SYNCED_MAP_KEY = 'bullsnote.googledrive.syncedmap.v1';

/** 클라우드에 업로드할 노트당 최대 히스토리 스냅샷 개수 (로컬은 30개 유지, 클라우드 개별 파일은 경량화) */
const CLOUD_MAX_HISTORY = 5;

export interface GoogleUserInfo {
  email: string;
  name: string;
  picture?: string;
}

export interface GoogleDriveConfig {
  enabled: boolean;
  autoSync: boolean;
  /** 폴링 주기 (ms) - 0: 수동 동기화, 15000, 30000(기본값), 60000, 120000, 300000, 600000 */
  pollingIntervalMs: number;
  lastSyncedAt: number | null;
  user: GoogleUserInfo | null;
  customClientId?: string;
  customClientSecret?: string;
}

export const DEFAULT_GOOGLE_DRIVE_CONFIG: GoogleDriveConfig = {
  enabled: false,
  autoSync: true,
  pollingIntervalMs: 30_000, // 기본 30초
  lastSyncedAt: null,
  user: null,
};

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface DeletedRecord {
  id: string;
  deletedAt: number;
}

/** 구버전(v2) 단일 파일 DB 포맷 (자동 마이그레이션 호환용) */
export interface RemoteBullsNoteDb {
  app: 'BullsNote';
  version: number;
  lastModified: number;
  projects: Project[];
  notes: Note[];
  deletedNotes?: DeletedRecord[];
  deletedProjects?: DeletedRecord[];
}

/** 대안 2(v3): 개별 노트 메타데이터 인덱스 엔트리 */
export interface RemoteNoteIndexEntry {
  id: string;
  fileId: string;
  updatedAt: number;
  title: string;
  projectId: string;
}

/** 대안 2(v3): 경량 인덱스 파일 (BullsNote/index.json) */
export interface RemoteIndexDb {
  app: 'BullsNote';
  version: 3;
  lastModified: number;
  projects: Project[];
  noteIndex: Record<string, RemoteNoteIndexEntry>;
  deletedNotes?: DeletedRecord[];
  deletedProjects?: DeletedRecord[];
}

export interface LocalNoteSyncMeta {
  syncedAt: number;
  fileId?: string;
}

export interface SyncResult {
  success: boolean;
  error?: string;
  notes: Note[];
  projects: Project[];
  hasRemoteChanges: boolean;
  uploadedCount?: number;
  downloadedCount?: number;
}

/** Google Drive URL에서 파일 ID 추출 */
export function extractDriveFileIdFromUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const m1 = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1?.[1]) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2?.[1] && url.includes('drive.google.com')) return m2[1];
  return null;
}

/** 동시성 제한 병렬 실행 헬퍼 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await worker(items[current]);
    }
  });
  await Promise.all(runners);
  return results;
}

/** data:image/...;base64,... 문자열을 File 객체로 변환 */
function dataUrlToFile(dataUrl: string, fileName: string): File | null {
  try {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) return null;
    const mime = match[1];
    const b64 = match[2];
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], fileName, { type: mime });
  } catch {
    return null;
  }
}

/** 바이너리 SHA-256 16진 문자열 (Drive 이미지 중복 업로드 방지용 콘텐츠 해시) */
async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Drive appProperties 키: 업로드 이미지의 콘텐츠 해시 / 소속 노트 ID */
const APP_PROP_HASH = 'bnHash';
const APP_PROP_NOTE = 'bnNote';

/** 네트워크 지연/단절 시 무한 대기(ANR) 방지를 위한 타임아웃 fetch 헬퍼 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 12_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: options.signal ?? controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('네트워크 응답 시간이 초과되었습니다. 인터넷 연결 상태를 확인해주세요.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

class GoogleDriveServiceImpl {
  private bullsNoteFolderId: string | null = null;
  private notesFolderId: string | null = null;
  private attachmentsFolderId: string | null = null;
  private indexFileId: string | null = null;
  private isSyncing = false;
  private isCheckingRemote = false;
  private orphanScanCompleted = false;
  private refreshTokenPromise: Promise<string | null> | null = null;

  /** 노트 내 이미지 표시를 위한 Drive FileId -> ObjectURL 메모리 캐시 */
  private attachmentBlobUrlCache = new Map<string, string>();
  private inFlightBlobPromises = new Map<string, Promise<string>>();
  /** `${attachmentsFolderId}:${noteId}:${sha256}` -> 이미 업로드된 첨부 (세션 내 중복 업로드 방지) */
  private uploadedImageByHash = new Map<string, NoteAttachment>();

  /** 현재 브라우저/기기가 오프라인 상태인지 즉시 판별 */
  isOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  getConfig(): GoogleDriveConfig {
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_GOOGLE_DRIVE_CONFIG, ...parsed };
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_GOOGLE_DRIVE_CONFIG;
  }

  saveConfig(patch: Partial<GoogleDriveConfig>): GoogleDriveConfig {
    const cur = this.getConfig();
    const updated = { ...cur, ...patch };
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      /* ignore */
    }
    return updated;
  }

  getTokens(): GoogleTokens | null {
    try {
      const raw = localStorage.getItem(TOKENS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return null;
  }

  saveTokens(tokens: GoogleTokens | null): void {
    try {
      if (!tokens) {
        localStorage.removeItem(TOKENS_STORAGE_KEY);
      } else {
        localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens));
      }
    } catch {
      /* ignore */
    }
  }

  isConnected(): boolean {
    const cfg = this.getConfig();
    const tokens = this.getTokens();
    return Boolean(cfg.enabled && tokens?.accessToken);
  }

  /** 로컬 노트별 동기화 완료 상태 맵 조회 */
  getSyncedMap(): Record<string, LocalNoteSyncMeta> {
    try {
      const raw = localStorage.getItem(SYNCED_MAP_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      /* ignore */
    }
    return {};
  }

  saveSyncedMap(map: Record<string, LocalNoteSyncMeta>): void {
    try {
      localStorage.setItem(SYNCED_MAP_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  /** 특정 노트의 마지막 클라우드 동기화 타임스탬프 반환 */
  getNoteSyncedAt(noteId: string): number | null {
    const map = this.getSyncedMap();
    return map[noteId]?.syncedAt ?? null;
  }

  /** 해당 노트가 아직 Google Drive와 동기화되지 않았는지(수정 후 미업로드 상태인지) 여부 판별 */
  isNoteUnsynced(note: Note): boolean {
    if (note.systemGroupType) return false;
    const syncedAt = Math.max(note.syncedAt || 0, this.getNoteSyncedAt(note.id) || 0);
    return !syncedAt || note.updatedAt > syncedAt;
  }

  getDeletedRecords(): { notes: DeletedRecord[]; projects: DeletedRecord[] } {
    try {
      const raw = localStorage.getItem(DELETED_RECORDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          notes: Array.isArray(parsed.notes) ? parsed.notes : [],
          projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        };
      }
    } catch {
      /* ignore */
    }
    return { notes: [], projects: [] };
  }

  recordDeletedNote(id: string): void {
    const current = this.getDeletedRecords();
    const filtered = current.notes.filter((r) => r.id !== id);
    filtered.push({ id, deletedAt: Date.now() });
    if (filtered.length > 500) filtered.splice(0, filtered.length - 500);
    localStorage.setItem(DELETED_RECORDS_KEY, JSON.stringify({ ...current, notes: filtered }));
  }

  recordDeletedProject(id: string): void {
    const current = this.getDeletedRecords();
    const filtered = current.projects.filter((r) => r.id !== id);
    filtered.push({ id, deletedAt: Date.now() });
    if (filtered.length > 200) filtered.splice(0, filtered.length - 200);
    localStorage.setItem(DELETED_RECORDS_KEY, JSON.stringify({ ...current, projects: filtered }));
  }

  /** 유효한 Access Token 반환 (만료 시 자동 갱신 + 동시 갱신 요청 중복 방지) */
  async getValidAccessToken(forceRefresh = false): Promise<string | null> {
    const tokens = this.getTokens();
    if (!tokens) return null;

    // 만료 1분 전까지 유효로 판단 (강제 갱신이 아닌 경우)
    if (!forceRefresh && Date.now() < tokens.expiresAt - 60_000 && tokens.accessToken) {
      return tokens.accessToken;
    }

    // 오프라인 상태이면 네트워크 갱신을 시도하지 않고 즉시 반환하여 대기 방지
    if (this.isOffline()) {
      return tokens.accessToken || null;
    }

    // 이미 진행 중인 토큰 갱신 요청이 있으면 동일 Promise를 공유 (Token Refresh Stampede 방지)
    if (this.refreshTokenPromise) {
      return this.refreshTokenPromise;
    }

    this.refreshTokenPromise = (async () => {
      try {
        if (tokens.refreshToken) {
          const cfg = this.getConfig();
          if (window.bullsNote?.googleAuth) {
            const res = await window.bullsNote.googleAuth.refreshToken({
              clientId: cfg.customClientId,
              clientSecret: cfg.customClientSecret,
              refreshToken: tokens.refreshToken,
            });
            if (res.success && res.accessToken) {
              const updatedTokens: GoogleTokens = {
                accessToken: res.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: res.expiresAt || Date.now() + 3600 * 1000,
              };
              this.saveTokens(updatedTokens);
              return res.accessToken;
            }
          } else if (cfg.customClientId) {
            try {
              const bodyParams: Record<string, string> = {
                client_id: cfg.customClientId,
                refresh_token: tokens.refreshToken,
                grant_type: 'refresh_token',
              };
              if (cfg.customClientSecret) {
                bodyParams.client_secret = cfg.customClientSecret;
              }
              const tokenRes = await fetchWithTimeout(
                'https://oauth2.googleapis.com/token',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams(bodyParams).toString(),
                },
                10_000,
              );
              if (tokenRes.ok) {
                const data = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
                if (data.access_token) {
                  const updatedTokens: GoogleTokens = {
                    accessToken: data.access_token,
                    refreshToken: tokens.refreshToken,
                    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
                  };
                  this.saveTokens(updatedTokens);
                  return data.access_token;
                }
              }
            } catch (err) {
              console.warn('[GoogleDriveService] 모바일/웹 토큰 갱신 실패:', err);
            }
          }
        }
        return null;
      } finally {
        this.refreshTokenPromise = null;
      }
    })();

    return this.refreshTokenPromise;
  }

  /** Google Drive API 에러 응답을 사용자가 이해하고 즉시 조치할 수 있는 한글 메시지로 변환 */
  private formatDriveApiError(status: number, rawText: string, context: string): string {
    try {
      const parsed = JSON.parse(rawText);
      const errObj = parsed?.error;
      const message: string = errObj?.message || rawText;
      const details: any[] = Array.isArray(errObj?.details) ? errObj.details : [];
      const errors: any[] = Array.isArray(errObj?.errors) ? errObj.errors : [];

      const isServiceDisabled =
        message.includes('Google Drive API has not been used') ||
        message.includes('it is disabled') ||
        details.some((d) => d?.reason === 'SERVICE_DISABLED') ||
        errors.some((e) => e?.reason === 'accessNotConfigured');

      if (isServiceDisabled) {
        const urlMatch = message.match(
          /https:\/\/console\.developers\.google\.com\/apis\/api\/drive\.googleapis\.com\/overview\?project=[0-9]+/,
        );
        const enableUrl =
          urlMatch?.[0] || 'https://console.cloud.google.com/apis/library/drive.googleapis.com';
        return `[Google Drive API 미활성화] 현재 Google Cloud 프로젝트에서 'Google Drive API'가 꺼져 있어 파일을 생성/조회할 수 없습니다.\n아래 링크를 열어 [사용(Enable)] 버튼을 누른 뒤 1~2분 후 다시 [지금 동기화]를 눌러주세요:\n${enableUrl}`;
      }

      const isInsufficientScope =
        message.includes('insufficient authentication scopes') ||
        details.some((d) => d?.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
        errors.some((e) => e?.reason === 'insufficientPermissions');

      if (isInsufficientScope) {
        return `[Google Drive 권한 부족] 로그인 동의 화면에서 Google Drive 파일 접근 권한이 허용되지 않았습니다. 우측의 [연동 해제]를 누른 뒤 다시 로그인하면서 'Google Drive 파일 보기, 편집, 생성, 삭제' 체크박스를 꼭 체크해주세요.`;
      }

      if (status === 401) {
        return 'Google Drive 인증 토큰이 만료되었습니다. [연동 해제] 후 다시 로그인해주세요.';
      }

      return `${context} (${status}): ${message}`;
    } catch {
      return `${context} (${status}): ${rawText}`;
    }
  }

  /** Google 계정 OAuth 로그인 실행 */
  async login(): Promise<{ success: boolean; error?: string; user?: GoogleUserInfo }> {
    const cfg = this.getConfig();

    if (!cfg.customClientId) {
      return {
        success: false,
        error:
          'Google OAuth Client ID가 입력되지 않았습니다. Google Cloud Console에서 데스크톱 클라이언트 ID를 발급받아 입력해주세요.',
      };
    }

    // 1. Electron 데스크톱 루프백 인증
    if (window.bullsNote?.googleAuth) {
      try {
        const res = await window.bullsNote.googleAuth.startLogin({
          clientId: cfg.customClientId,
          clientSecret: cfg.customClientSecret,
        });

        if (!res.success || !res.accessToken) {
          return { success: false, error: res.error || '로그인에 실패했습니다.' };
        }

        const tokens: GoogleTokens = {
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          expiresAt: res.expiresAt || Date.now() + 3600 * 1000,
        };
        this.saveTokens(tokens);

        const user: GoogleUserInfo = res.user || { email: '', name: 'Google 사용자' };
        this.saveConfig({
          enabled: true,
          user,
        });

        // 캐시 리셋
        this.bullsNoteFolderId = null;
        this.notesFolderId = null;
        this.attachmentsFolderId = null;
        this.indexFileId = null;

        return { success: true, user };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    // 1-1. Electron 환경이지만 preload.js가 미반영된 구버전 프로세스인 경우
    if (
      typeof window !== 'undefined' &&
      (window.bullsNote || (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent))) &&
      !window.bullsNote?.googleAuth
    ) {
      return {
        success: false,
        error:
          'Electron 데스크톱 프로세스가 이전 버전(트레이 상주 상태)으로 실행 중입니다. 화면 우측 상단 메뉴바(트레이)의 BullsNote 아이콘을 우클릭하여 [완전히 종료]한 뒤, 터미널에서 `npm run electron:dev`로 다시 실행해주세요.',
      };
    }

    // 2. 일반 웹 브라우저 환경: 구글 공식 Google Identity Services(GIS) initTokenClient 프로토콜 사용
    const googleAccounts =
      typeof window !== 'undefined'
        ? (window as unknown as { google?: { accounts?: { oauth2?: any } } }).google?.accounts?.oauth2
        : undefined;

    if (googleAccounts) {
      return new Promise((resolve) => {
        try {
          const client = googleAccounts.initTokenClient({
            client_id: cfg.customClientId!,
            scope: [
              'https://www.googleapis.com/auth/drive.file',
              'https://www.googleapis.com/auth/calendar.events',
              'https://www.googleapis.com/auth/userinfo.profile',
              'https://www.googleapis.com/auth/userinfo.email',
            ].join(' '),
            callback: async (tokenRes: {
              access_token?: string;
              expires_in?: number;
              error?: string;
              error_description?: string;
            }) => {
              if (tokenRes.error || !tokenRes.access_token) {
                resolve({
                  success: false,
                  error: `Google 인증 실패: ${tokenRes.error_description || tokenRes.error || '토큰을 받지 못했습니다.'}`,
                });
                return;
              }

              const accessToken = tokenRes.access_token;
              const expiresIn = tokenRes.expires_in || 3600;
              const tokens: GoogleTokens = {
                accessToken,
                expiresAt: Date.now() + expiresIn * 1000,
              };
              this.saveTokens(tokens);

              let userInfo: GoogleUserInfo = { email: '', name: 'Google 사용자' };
              try {
                const uRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (uRes.ok) {
                  const u = await uRes.json();
                  userInfo = {
                    email: u.email || '',
                    name: u.name || u.email || 'Google 사용자',
                    picture: u.picture || '',
                  };
                }
              } catch {
                /* ignore */
              }

              this.saveConfig({ enabled: true, user: userInfo });
              this.bullsNoteFolderId = null;
              this.notesFolderId = null;
              this.attachmentsFolderId = null;
              this.indexFileId = null;

              resolve({ success: true, user: userInfo });
            },
            error_callback: (err: unknown) => {
              resolve({ success: false, error: `Google OAuth 오류: ${String(err)}` });
            },
          });

          client.requestAccessToken({ prompt: 'consent' });
        } catch (err) {
          resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      });
    }

    return {
      success: false,
      error:
        'Google Identity 라이브러리가 로드되지 않았습니다. 페이지를 새로고침하거나 데스크톱 앱(npm run electron:dev)에서 실행해주세요.',
    };
  }

  /** Google 연동 해제 및 로그아웃 */
  logout(): void {
    this.saveTokens(null);
    this.saveConfig({
      enabled: false,
      user: null,
      lastSyncedAt: null,
    });
    this.bullsNoteFolderId = null;
    this.notesFolderId = null;
    this.attachmentsFolderId = null;
    this.indexFileId = null;
  }

  /**
   * PC에 연동된 Google OAuth 설정 및 인증 토큰을 모바일(Pad/Phone) 기기에서 원클릭으로 불러올 수 있도록
   * 인코딩된 연동 코드(BNM1:...)로 내보냅니다.
   */
  exportMobileSyncCode(): string | null {
    const cfg = this.getConfig();
    const tokens = this.getTokens();
    if (!cfg.customClientId || (!tokens?.refreshToken && !tokens?.accessToken)) {
      return null;
    }
    // 메신저/SMS 전송 시 길이 제한으로 잘리는 문제를 방지하기 위해
    // refreshToken이 있는 경우 불필요하게 긴 accessToken(aTok)과 프로필 이미지 URL은 제외하여 코드 길이를 최소화합니다.
    const hasRefresh = Boolean(tokens.refreshToken);
    const compactUser = cfg.user
      ? { email: cfg.user.email, name: cfg.user.name }
      : null;
    const payload = {
      v: 1,
      cId: cfg.customClientId,
      cSec: cfg.customClientSecret || '',
      aTok: hasRefresh ? '' : tokens.accessToken || '',
      rTok: tokens.refreshToken || '',
      exp: hasRefresh ? 0 : tokens.expiresAt || 0,
      usr: compactUser,
    };
    const jsonStr = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(jsonStr);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const encoded = btoa(binary);
    return `BNM1:${encoded}`;
  }

  /**
   * PC에서 복사한 모바일 연동 코드(BNM1:...)를 파싱하여 모바일 기기에 Google Drive 연동을 즉시 설정합니다.
   * 메신저(카카오톡, 문자, 메모장 등) 전달 과정에서 섞인 줄바꿈·공백·특수문자·앞뒤 안내 문구를 자동으로 정제합니다.
   */
  async importMobileSyncCode(
    rawCode: string,
  ): Promise<{ success: boolean; error?: string; user?: GoogleUserInfo }> {
    // 제로폭 공백 및 양끝 따옴표/백틱 제거
    const cleaned = rawCode
      .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
      .trim()
      .replace(/^['"`]+|['"`]+$/g, '')
      .trim();

    if (!cleaned) {
      return {
        success: false,
        error: '모바일 연동 코드(BNM1:...)를 입력해주세요.',
      };
    }

    if (cleaned.includes('.apps.googleusercontent.com') && !/bnm1:/i.test(cleaned)) {
      return {
        success: false,
        error:
          '입력된 값은 모바일 연동 코드(BNM1:...)가 아니라 Google OAuth Client ID입니다. PC/기존 기기의 [Google Drive 동기화 설정] > [모바일 연동 코드 복사]에서 복사한 BNM1:... 코드를 붙여넣거나, 위쪽 Google OAuth Client ID 입력란을 이용해주세요.',
      };
    }

    if (/^https?:\/\//i.test(cleaned) && !/bnm1:/i.test(cleaned)) {
      return {
        success: false,
        error: `클립보드에 웹 주소(${cleaned.slice(0, 32)}...)가 복사되어 있습니다. PC 앱의 [Google Drive 동기화 설정]에서 [모바일 연동 코드 복사] 버튼을 눌러 BNM1:... 코드를 다시 복사해주세요.`,
      };
    }

    // 문자열 내 BNM1: 접두사 위치 탐색 (앞에 다른 텍스트가 섞여 있거나 줄바꿈이 포함된 경우에도 추출)
    let base64Part = '';
    const prefixIdx = cleaned.toUpperCase().indexOf('BNM1:');
    if (prefixIdx !== -1) {
      base64Part = cleaned.slice(prefixIdx + 'BNM1:'.length).replace(/\s+/g, '');
    } else {
      // 접두사(BNM1:) 없이 Base64 본문(eyJ... 또는 JTdC...)만 복사된 경우 자동 허용
      const compactCandidate = cleaned.replace(/\s+/g, '');
      if (/^[A-Za-z0-9+/=%_-]{24,}$/.test(compactCandidate)) {
        base64Part = compactCandidate;
      } else {
        const preview = cleaned.length > 24 ? `${cleaned.slice(0, 24)}...` : cleaned;
        return {
          success: false,
          error: `유효한 BullsNote 모바일 연동 코드(BNM1:...)가 아닙니다 (현재 입력값: "${preview}"). PC 앱의 [Google Drive 동기화 설정]에서 연동 코드를 다시 복사해주세요.`,
        };
      }
    }

    try {
      // URL-safe Base64 문자 및 패딩(=) 보정
      let normalizedB64 = base64Part.replace(/-/g, '+').replace(/_/g, '/');
      const padMod = normalizedB64.length % 4;
      if (padMod > 0) {
        normalizedB64 += '='.repeat(4 - padMod);
      }

      const binaryStr = atob(normalizedB64);
      let jsonStr = '';
      if (binaryStr.startsWith('%7B') || binaryStr.startsWith('%7b')) {
        // 구버전 encodeURIComponent 기반 인코딩 호환
        jsonStr = decodeURIComponent(binaryStr);
      } else {
        // 신버전 UTF-8 바이트 스트림 디코딩
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        jsonStr = new TextDecoder().decode(bytes);
      }

      const parsed = JSON.parse(jsonStr) as {
        v?: number;
        cId?: string;
        cSec?: string;
        aTok?: string;
        rTok?: string;
        exp?: number;
        usr?: GoogleUserInfo | null;
      };

      if (!parsed.cId || (!parsed.aTok && !parsed.rTok)) {
        return { success: false, error: '연동 코드의 인증 정보가 손상되었거나 중간에 잘렸습니다. 코드를 다시 복사해주세요.' };
      }

      this.saveConfig({
        enabled: true,
        customClientId: parsed.cId,
        customClientSecret: parsed.cSec || undefined,
        user: parsed.usr || { email: '', name: 'Google 사용자' },
      });

      this.saveTokens({
        accessToken: parsed.aTok || '',
        refreshToken: parsed.rTok || undefined,
        expiresAt: parsed.exp || 0,
      });

      // 토큰 유효성 확인 및 필요 시(또는 압축 코드로 aTok이 비어 있는 경우) 즉시 갱신
      const validToken = await this.getValidAccessToken(!parsed.aTok);
      if (!validToken) {
        return {
          success: false,
          error: '연동 코드의 인증 토큰이 만료되었으며 자동 갱신에 실패했습니다. PC에서 다시 로그인한 후 새 연동 코드를 발급받아 주세요.',
        };
      }

      this.bullsNoteFolderId = null;
      this.notesFolderId = null;
      this.attachmentsFolderId = null;
      this.indexFileId = null;

      return {
        success: true,
        user: parsed.usr || { email: '', name: 'Google 사용자' },
      };
    } catch (err) {
      return {
        success: false,
        error: `연동 코드가 중간에 잘렸거나 손상되었습니다 (${err instanceof Error ? err.message : String(err)}). PC에서 연동 코드를 다시 복사해주세요.`,
      };
    }
  }

  /** Google Drive REST API 호출 헬퍼 (타임아웃 및 오프라인 즉시 차단 포함) */
  private async driveFetch(
    endpoint: string,
    options: RequestInit = {},
    isUpload = false,
    timeoutMs?: number,
  ): Promise<Response> {
    if (this.isOffline()) {
      throw new Error('현재 오프라인 상태입니다. 네트워크 연결 후 다시 시도해주세요.');
    }

    let token = await this.getValidAccessToken(false);
    if (!token) throw new Error('Google 계정 인증이 만료되었거나 연동되지 않았습니다. 다시 로그인해주세요.');

    const baseUrl = isUpload
      ? 'https://www.googleapis.com/upload/drive/v3'
      : 'https://www.googleapis.com/drive/v3';

    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    const effectiveTimeout = timeoutMs ?? (isUpload ? 25_000 : 12_000);
    let res = await fetchWithTimeout(url, { ...options, headers }, effectiveTimeout);
    if (res.status === 401) {
      const refreshedToken = await this.getValidAccessToken(true);
      if (refreshedToken) {
        token = refreshedToken;
        headers.set('Authorization', `Bearer ${token}`);
        res = await fetchWithTimeout(url, { ...options, headers }, effectiveTimeout);
      }
      if (res.status === 401) {
        throw new Error('Google Drive 인증 토큰이 만료되었습니다. [연동 해제] 후 다시 로그인해주세요.');
      }
    }
    return res;
  }

  /** Google Drive 내 폴더 조회 또는 생성 */
  private async getOrCreateFolder(name: string, parentId?: string): Promise<string> {
    let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) {
      q += ` and '${parentId}' in parents`;
    }

    const searchRes = await this.driveFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
    if (!searchRes.ok) {
      const errText = await searchRes.text();
      throw new Error(this.formatDriveApiError(searchRes.status, errText, `Google Drive 폴더("${name}") 조회 실패`));
    }

    const data = await searchRes.json();
    if (Array.isArray(data.files) && data.files.length > 0) {
      return data.files[0].id;
    }

    const metadata: Record<string, unknown> = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) {
      metadata.parents = [parentId];
    }

    const createRes = await this.driveFetch('/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(this.formatDriveApiError(createRes.status, err, `Google Drive 폴더("${name}") 생성 실패`));
    }

    const folder = await createRes.json();
    return folder.id;
  }

  /** BullsNote 루트 폴더 id 획득 */
  async getBullsNoteFolderId(): Promise<string> {
    if (this.bullsNoteFolderId) return this.bullsNoteFolderId;
    const id = await this.getOrCreateFolder('BullsNote');
    this.bullsNoteFolderId = id;
    return id;
  }

  /** BullsNote/notes 폴더 id 획득 (개별 노트 파일 저장용) */
  async getNotesFolderId(): Promise<string> {
    if (this.notesFolderId) return this.notesFolderId;
    const rootId = await this.getBullsNoteFolderId();
    const id = await this.getOrCreateFolder('notes', rootId);
    this.notesFolderId = id;
    return id;
  }

  /** BullsNote/attachments 폴더 id 획득 (첨부파일 및 이미지 저장용) */
  async getAttachmentsFolderId(): Promise<string> {
    if (this.attachmentsFolderId) return this.attachmentsFolderId;
    const rootId = await this.getBullsNoteFolderId();
    const id = await this.getOrCreateFolder('attachments', rootId);
    this.attachmentsFolderId = id;
    return id;
  }

  /** 특정 폴더 내 파일명으로 메타데이터 조회 */
  private async getFileInfoByName(
    folderId: string,
    fileName: string,
  ): Promise<{ id: string; modifiedTime: string } | null> {
    const q = `'${folderId}' in parents and name = '${fileName}' and trashed = false`;
    const res = await this.driveFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(this.formatDriveApiError(res.status, errText, `Google Drive 파일("${fileName}") 조회 실패`));
    }
    const data = await res.json();
    if (Array.isArray(data.files) && data.files.length > 0) {
      return { id: data.files[0].id, modifiedTime: data.files[0].modifiedTime };
    }
    return null;
  }

  /** notes 폴더 내 존재하는 모든 개별 노트 파일(note_*.json) 목록 조회 (인덱스 유실/고아 노트 자동 복구용) */
  private async listNoteFilesInFolder(
    notesFolderId: string,
  ): Promise<Array<{ id: string; name: string; modifiedTime: string }>> {
    try {
      const q = `'${notesFolderId}' in parents and name contains 'note_' and trashed = false`;
      const res = await this.driveFetch(
        `/files?q=${encodeURIComponent(q)}&pageSize=500&fields=files(id,name,modifiedTime)`,
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.files) ? data.files : [];
    } catch {
      return [];
    }
  }

  /** JSON 파일 다운로드 헬퍼 */
  private async downloadJsonFile<T>(fileId: string, label: string): Promise<T | null> {
    const res = await this.driveFetch(`/files/${fileId}?alt=media`);
    if (res.status === 404) return null;
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(this.formatDriveApiError(res.status, errText, `${label} 다운로드 실패`));
    }
    try {
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  /** JSON 파일 생성 또는 업데이트 헬퍼 (existingFileId가 있으면 PATCH, 없으면 Multipart POST) */
  private async uploadJsonFile(
    folderId: string,
    fileName: string,
    existingFileId: string | null,
    payload: unknown,
    label: string,
  ): Promise<{ id: string }> {
    const jsonStr = JSON.stringify(payload);
    const blob = new Blob([jsonStr], { type: 'application/json' });

    if (existingFileId) {
      const res = await this.driveFetch(
        `/files/${existingFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: blob,
        },
        true,
      );
      if (res.ok) {
        return { id: existingFileId };
      }
      // 만약 원격 파일이 수동 삭제되어 404인 경우 아래 신규 생성으로 폴백
      if (res.status !== 404) {
        const err = await res.text();
        throw new Error(this.formatDriveApiError(res.status, err, `${label} 업데이트 실패`));
      }
    }

    const boundary = '-------BullsNoteBoundary' + Math.random().toString(36).substring(2);
    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/json',
    };

    const multipartBody = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonStr}\r\n`,
      `--${boundary}--`,
    ].join('');

    const res = await this.driveFetch(
      '/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      },
      true,
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(this.formatDriveApiError(res.status, err, `${label} 생성 실패`));
    }
    const data = await res.json();
    return { id: data.id };
  }

  /** 개별 노트 파일 업로드 (클라우드에는 최근 CLOUD_MAX_HISTORY개의 히스토리만 유지하여 용량 최적화) */
  private async uploadSingleNote(
    notesFolderId: string,
    note: Note,
    existingFileId?: string | null,
  ): Promise<{ fileId: string; note: Note }> {
    // 업로드 전 본문 내 인라인 data:image/... Base64 이미지가 있다면 자동으로 attachments/ 폴더로 분리 업로드
    const processedNote = await this.extractAndUploadInlineImages(note);

    let targetFileId = existingFileId || null;
    const fileName = `note_${processedNote.id}.json`;
    if (!targetFileId) {
      const found = await this.getFileInfoByName(notesFolderId, fileName);
      if (found) targetFileId = found.id;
    }

    const cloudNotePayload: Note = {
      ...processedNote,
      history: Array.isArray(processedNote.history)
        ? processedNote.history.slice(0, CLOUD_MAX_HISTORY)
        : [],
      syncedAt: processedNote.updatedAt,
    };

    const uploaded = await this.uploadJsonFile(
      notesFolderId,
      fileName,
      targetFileId,
      cloudNotePayload,
      `노트("${processedNote.title || processedNote.id}")`,
    );

    return {
      fileId: uploaded.id,
      note: { ...processedNote, syncedAt: processedNote.updatedAt },
    };
  }

  /**
   * 노트 본문(BlockNote JSON 또는 마크다운) 내의 Base64 인라인 이미지(data:image/...)를
   * 자동으로 BullsNote/attachments/ 폴더에 업로드하고 링크로 치환
   */
  private async extractAndUploadInlineImages(note: Note): Promise<Note> {
    if (!note.content || !note.content.includes('data:image/')) {
      return note;
    }

    let modified = false;
    const nextAttachments: NoteAttachment[] = [...(note.attachments || [])];

    // 1. BlockNote JSON 배열인 경우
    try {
      const blocks = JSON.parse(note.content);
      if (Array.isArray(blocks)) {
        let imgCounter = 0;
        const traverse = async (items: any[]) => {
          for (const block of items) {
            if (
              block &&
              block.type === 'image' &&
              typeof block.props?.url === 'string' &&
              block.props.url.startsWith('data:image/')
            ) {
              const extMatch = /^data:image\/([a-zA-Z0-9+.-]+);base64,/.exec(block.props.url);
              const rawExt = extMatch?.[1] === 'jpeg' ? 'jpg' : extMatch?.[1] || 'png';
              const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '') || 'png';
              const fileName = block.props.name || `image_${Date.now()}_${++imgCounter}.${safeExt}`;
              const file = dataUrlToFile(block.props.url, fileName);
              if (file) {
                // 동일 이미지(콘텐츠 해시)가 이미 업로드되어 있으면 재업로드하지 않고 기존 파일 재사용
                const att = await this.uploadImageDeduped(note.id, file);
                if (!nextAttachments.some((a) => a.storagePath === att.storagePath)) {
                  nextAttachments.push(att);
                }
                block.props.url = att.url;
                if (!block.props.name) block.props.name = att.name;
                modified = true;
              }
            }
            if (Array.isArray(block?.children) && block.children.length > 0) {
              await traverse(block.children);
            }
          }
        };
        await traverse(blocks);

        if (modified) {
          return {
            ...note,
            content: JSON.stringify(blocks),
            attachments: nextAttachments,
          };
        }
      }
    } catch {
      /* ignore JSON parse error */
    }

    return note;
  }

  /**
   * 폴링 시 초경량 변경 감지 (트래픽 최소화 + 중복 폴링/오프라인 차단 + 5초 타임아웃)
   * 원격 index.json의 modifiedTime만 조회하여 로컬 lastSyncedAt보다 최신인지만 확인
   */
  async hasRemoteChangesQuick(): Promise<boolean> {
    if (!this.isConnected() || this.isOffline() || this.isSyncing || this.isCheckingRemote) {
      return false;
    }
    this.isCheckingRemote = true;
    try {
      let modifiedTimeStr: string | null = null;

      // indexFileId가 이미 캐시되어 있으면 단일 경량 요청(5초 타임아웃)으로 즉시 조회
      if (this.indexFileId) {
        const res = await this.driveFetch(
          `/files/${this.indexFileId}?fields=id,modifiedTime,trashed`,
          {},
          false,
          5_000,
        );
        if (res.ok) {
          const info = (await res.json()) as { id?: string; modifiedTime?: string; trashed?: boolean };
          if (info && !info.trashed && info.modifiedTime) {
            modifiedTimeStr = info.modifiedTime;
          } else {
            this.indexFileId = null;
          }
        } else if (res.status === 404) {
          this.indexFileId = null;
        }
      }

      if (!modifiedTimeStr) {
        const folderId = await this.getBullsNoteFolderId();
        const fileInfo = await this.getFileInfoByName(folderId, 'index.json');
        if (!fileInfo) return false;
        this.indexFileId = fileInfo.id;
        modifiedTimeStr = fileInfo.modifiedTime;
      }

      const remoteMtime = new Date(modifiedTimeStr).getTime();
      const lastSyncedAt = this.getConfig().lastSyncedAt || 0;

      // 원격 수정 시간이 마지막 동기화 시간보다 3초 이상 최신이면 변경 있음으로 판정
      return remoteMtime > lastSyncedAt + 3000;
    } catch {
      return false;
    } finally {
      this.isCheckingRemote = false;
    }
  }

  /**
   * 대안 2: 하이브리드 인덱스(index.json) + 개별 노트 파일(notes/note_<id>.json) 증분 동기화
   * - 변경된(미동기화) 노트만 개별 업로드하고, 원격에서 변경된 노트만 개별 다운로드합니다.
   */
  async syncAll(localNotes: Note[], localProjects: Project[]): Promise<SyncResult> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: 'Google 계정이 연동되지 않았습니다.',
        notes: localNotes,
        projects: localProjects,
        hasRemoteChanges: false,
      };
    }
    if (this.isOffline()) {
      return {
        success: false,
        error: '현재 오프라인 상태입니다. 인터넷 연결 시 자동으로 동기화됩니다.',
        notes: localNotes,
        projects: localProjects,
        hasRemoteChanges: false,
      };
    }
    if (this.isSyncing) {
      return { success: true, notes: localNotes, projects: localProjects, hasRemoteChanges: false };
    }

    this.isSyncing = true;
    try {
      const rootFolderId = await this.getBullsNoteFolderId();
      const notesFolderId = await this.getNotesFolderId();
      const deletedRecords = this.getDeletedRecords();
      const syncedMap = this.getSyncedMap();

      let indexInfo = await this.getFileInfoByName(rootFolderId, 'index.json');
      let remoteIndex: RemoteIndexDb | null = null;

      if (indexInfo) {
        this.indexFileId = indexInfo.id;
        remoteIndex = await this.downloadJsonFile<RemoteIndexDb>(indexInfo.id, 'Google Drive 인덱스(index.json)');
      } else {
        // 구버전(v2) 단일 파일 bullsnote_db.json이 존재하는지 확인 후 자동 마이그레이션
        const legacyInfo = await this.getFileInfoByName(rootFolderId, 'bullsnote_db.json');
        if (legacyInfo) {
          const legacyDb = await this.downloadJsonFile<RemoteBullsNoteDb>(
            legacyInfo.id,
            '구버전 Google Drive DB',
          );
          if (legacyDb && Array.isArray(legacyDb.notes)) {
            const migratedIndex: Record<string, RemoteNoteIndexEntry> = {};
            await runWithConcurrency(legacyDb.notes, 4, async (rn) => {
              const { fileId } = await this.uploadSingleNote(notesFolderId, rn, null);
              migratedIndex[rn.id] = {
                id: rn.id,
                fileId,
                updatedAt: rn.updatedAt,
                title: rn.title,
                projectId: rn.projectId || 'default',
              };
            });
            remoteIndex = {
              app: 'BullsNote',
              version: 3,
              lastModified: Date.now(),
              projects: Array.isArray(legacyDb.projects) ? legacyDb.projects : localProjects,
              noteIndex: migratedIndex,
              deletedNotes: legacyDb.deletedNotes || [],
              deletedProjects: legacyDb.deletedProjects || [],
            };
          }
        }
      }

      let hasRemoteChanges = false;
      let shouldUpdateIndex = false;
      let uploadedCount = 0;
      let downloadedCount = 0;

      // 1. 원격에 index.json이 전혀 없는 최초 동기화인 경우: 로컬 노트 중 필요한 노트만 병렬 업로드
      if (!remoteIndex) {
        const newNoteIndex: Record<string, RemoteNoteIndexEntry> = {};
        const updatedLocalNotes: Note[] = [...localNotes];

        await runWithConcurrency(
          updatedLocalNotes.map((n, i) => ({ n, i })),
          4,
          async ({ n, i }) => {
            const { fileId, note: uploadedNote } = await this.uploadSingleNote(
              notesFolderId,
              n,
              syncedMap[n.id]?.fileId,
            );
            updatedLocalNotes[i] = uploadedNote;
            newNoteIndex[uploadedNote.id] = {
              id: uploadedNote.id,
              fileId,
              updatedAt: uploadedNote.updatedAt,
              title: uploadedNote.title,
              projectId: uploadedNote.projectId || 'default',
            };
            syncedMap[uploadedNote.id] = {
              syncedAt: uploadedNote.updatedAt,
              fileId,
            };
            uploadedCount += 1;
          },
        );

        const initialIndex: RemoteIndexDb = {
          app: 'BullsNote',
          version: 3,
          lastModified: Date.now(),
          projects: localProjects,
          noteIndex: newNoteIndex,
          deletedNotes: deletedRecords.notes,
          deletedProjects: deletedRecords.projects,
        };

        const createdIndex = await this.uploadJsonFile(
          rootFolderId,
          'index.json',
          null,
          initialIndex,
          'Google Drive 인덱스(index.json)',
        );
        this.indexFileId = createdIndex.id;
        this.saveSyncedMap(syncedMap);
        this.saveConfig({ lastSyncedAt: Date.now() });

        return {
          success: true,
          notes: updatedLocalNotes,
          projects: localProjects,
          hasRemoteChanges: true, // syncedAt 및 인라인 이미지 치환 반영을 위해 상태 갱신
          uploadedCount,
          downloadedCount: 0,
        };
      }

      // --- 2. 프로젝트 3-Way 병합 (Google Drive 스토리지 데이터 우선 정책) ---
      const SEED_NOTE_IDS = new Set(['seed-1', 'seed-1-1', 'seed-2']);
      const isInitialLocalSync =
        !this.getConfig().lastSyncedAt && Object.keys(syncedMap).length === 0;
      const isDefaultPlaceholderProject = (p: Project) =>
        p.id === 'default' && p.name === '기본 프로젝트';

      const projectMap = new Map<string, Project>();
      const localDeletedProjectIds = new Set(deletedRecords.projects.map((r) => r.id));
      const remoteDeletedProjectMap = new Map(
        (remoteIndex.deletedProjects || []).map((r) => [r.id, r.deletedAt]),
      );

      for (const rp of remoteIndex.projects || []) {
        const localDel = deletedRecords.projects.find((d) => d.id === rp.id);
        if (!isInitialLocalSync && localDel && localDel.deletedAt >= rp.updatedAt) {
          shouldUpdateIndex = true;
          continue;
        }
        projectMap.set(rp.id, rp);
      }

      for (const lp of localProjects) {
        const remoteDelAt = remoteDeletedProjectMap.get(lp.id);
        if (remoteDelAt && remoteDelAt >= lp.updatedAt) {
          hasRemoteChanges = true;
          continue;
        }

        const existing = projectMap.get(lp.id);
        if (!existing) {
          // 최초 동기화 시 원격 스토리지에 이미 프로젝트가 존재한다면 로컬 기본 플레이스홀더는 추가하지 않음
          if (isInitialLocalSync && isDefaultPlaceholderProject(lp) && projectMap.size > 0) {
            hasRemoteChanges = true;
            continue;
          }
          projectMap.set(lp.id, lp);
          shouldUpdateIndex = true;
        } else if (isDefaultPlaceholderProject(lp) && !isDefaultPlaceholderProject(existing)) {
          // 로컬이 기본값('기본 프로젝트')이고 스토리지가 사용자 지정 폴더명(예: '01_Projects')인 경우:
          // 타임스탬프와 무관하게 무조건 스토리지 폴더명을 우선 유지!
          hasRemoteChanges = true;
        } else if (!isDefaultPlaceholderProject(lp) && isDefaultPlaceholderProject(existing)) {
          // 반대로 로컬에서 폴더명을 변경했고 원격이 아직 '기본 프로젝트'인 경우 로컬 변경 반영
          projectMap.set(lp.id, lp);
          shouldUpdateIndex = true;
        } else if (isInitialLocalSync) {
          // 새 기기/브라우저 최초 동기화 시에는 무조건 스토리지(existing) 데이터를 우선!
          hasRemoteChanges = true;
        } else if (lp.updatedAt > existing.updatedAt) {
          projectMap.set(lp.id, lp);
          shouldUpdateIndex = true;
        } else if (existing.updatedAt > lp.updatedAt) {
          hasRemoteChanges = true;
        }
      }
      const mergedProjects = Array.from(projectMap.values());

      // 로컬 프로젝트 목록과 병합된 프로젝트 목록이 다르면 UI/스토리지 즉시 갱신 보장
      if (
        mergedProjects.length !== localProjects.length ||
        mergedProjects.some((mp, idx) => {
          const lp = localProjects[idx];
          return (
            !lp ||
            mp.id !== lp.id ||
            mp.name !== lp.name ||
            mp.icon !== lp.icon ||
            (mp.parentId ?? null) !== (lp.parentId ?? null)
          );
        })
      ) {
        hasRemoteChanges = true;
      }

      // --- 3. 개별 노트 증분 비교 및 동기화 (변경된 노트만 업로드/다운로드) ---
      const nextNoteIndex: Record<string, RemoteNoteIndexEntry> = { ...(remoteIndex.noteIndex || {}) };
      const localNoteMap = new Map<string, Note>(localNotes.map((n) => [n.id, n]));
      const localDeletedNoteMap = new Map(deletedRecords.notes.map((r) => [r.id, r.deletedAt]));
      const remoteDeletedNoteMap = new Map(
        (remoteIndex.deletedNotes || []).map((r) => [r.id, r.deletedAt]),
      );

      // 3-0. 스토리지(BullsNote/notes/) 내 고아 노트 파일(index.json에서 누락된 파일) 자동 스캔 및 복원 (세션당 1회 또는 최초 동기화 시에만 실행하여 저속 네트워크 부하 방지)
      if (!this.orphanScanCompleted || isInitialLocalSync) {
        const storageNoteFiles = await this.listNoteFilesInFolder(notesFolderId);
        this.orphanScanCompleted = true;
        for (const sf of storageNoteFiles) {
          const match = /^note_(.+)\.json$/.exec(sf.name);
          if (!match) continue;
          const noteId = match[1];
          if (SEED_NOTE_IDS.has(noteId)) continue;
          if (nextNoteIndex[noteId]) continue;
          if (localDeletedNoteMap.has(noteId) || remoteDeletedNoteMap.has(noteId)) continue;

          const restoredModifiedMs = sf.modifiedTime ? new Date(sf.modifiedTime).getTime() : Date.now();
          const restoredEntry: RemoteNoteIndexEntry = {
            id: noteId,
            fileId: sf.id,
            updatedAt: Number.isFinite(restoredModifiedMs) ? restoredModifiedMs : Date.now(),
            title: noteId,
            projectId: 'default',
          };
          nextNoteIndex[noteId] = restoredEntry;
          remoteIndex.noteIndex = nextNoteIndex;
          shouldUpdateIndex = true;
        }
      }

      const remoteHasRealNotes = Object.keys(remoteIndex.noteIndex || {}).some(
        (id) => !SEED_NOTE_IDS.has(id),
      );

      const finalNotesMap = new Map<string, Note>();
      const toDownload: RemoteNoteIndexEntry[] = [];
      const toUpload: Array<{ note: Note; existingFileId?: string }> = [];
      const toDeleteRemoteFileIds: string[] = [];
      let hasSyncStampUpdates = false;

      // 3-1. 원격 인덱스에 있는 노트들 검사
      for (const [noteId, remoteEntry] of Object.entries(remoteIndex.noteIndex || {})) {
        const localDelAt = localDeletedNoteMap.get(noteId);
        if (!isInitialLocalSync && localDelAt && localDelAt >= remoteEntry.updatedAt) {
          // 로컬에서 삭제된 노트 -> 원격 파일도 삭제 예약 및 인덱스에서 제거
          delete nextNoteIndex[noteId];
          if (remoteEntry.fileId) toDeleteRemoteFileIds.push(remoteEntry.fileId);
          delete syncedMap[noteId];
          shouldUpdateIndex = true;
          continue;
        }

        const localNote = localNoteMap.get(noteId);
        if (!localNote) {
          // 로컬에 없는 원격 신규 노트 -> 다운로드 대상
          toDownload.push(remoteEntry);
        } else if (isInitialLocalSync || remoteEntry.updatedAt > localNote.updatedAt) {
          // 최초 동기화이거나 원격이 더 최신인 노트 -> 스토리지 데이터 우선 다운로드
          toDownload.push(remoteEntry);
        } else if (localNote.updatedAt > remoteEntry.updatedAt) {
          // 로컬이 더 최신인 노트 -> 업로드 대상
          toUpload.push({ note: localNote, existingFileId: remoteEntry.fileId });
        } else {
          // 양쪽 updatedAt이 동일함 -> 네트워크 전송 없이 동기화 완료 마킹만 보장!
          const prevSyncedAt = Math.max(localNote.syncedAt || 0, syncedMap[noteId]?.syncedAt || 0);
          if (prevSyncedAt < localNote.updatedAt) {
            hasSyncStampUpdates = true;
          }
          syncedMap[noteId] = { syncedAt: localNote.updatedAt, fileId: remoteEntry.fileId };
          finalNotesMap.set(noteId, { ...localNote, syncedAt: localNote.updatedAt });
        }
      }

      // 3-2. 로컬에만 존재하는 노트들 검사
      for (const ln of localNotes) {
        if (remoteIndex.noteIndex && remoteIndex.noteIndex[ln.id]) {
          continue; // 이미 위 3-1에서 처리됨
        }
        // 원격 스토리지에 실제 사용자 노트가 존재하거나 최초 동기화인 경우, 로컬 초기 샘플 노트(seed-*)는 업로드하지 않고 폐기!
        if (SEED_NOTE_IDS.has(ln.id) && (remoteHasRealNotes || isInitialLocalSync)) {
          delete syncedMap[ln.id];
          hasRemoteChanges = true;
          continue;
        }
        const remoteDelAt = remoteDeletedNoteMap.get(ln.id);
        if (remoteDelAt && remoteDelAt >= ln.updatedAt) {
          // 원격에서 삭제된 노트 -> 로컬에서도 제거
          delete syncedMap[ln.id];
          hasRemoteChanges = true;
          continue;
        }
        // 로컬에서 새로 작성된 미동기화 노트 -> 업로드 대상
        toUpload.push({ note: ln, existingFileId: syncedMap[ln.id]?.fileId });
      }

      // 3-3. 원격 삭제 파일 정리 (백그라운드 비차단)
      if (toDeleteRemoteFileIds.length > 0) {
        await runWithConcurrency(toDeleteRemoteFileIds, 4, async (fid) => {
          try {
            await this.driveFetch(`/files/${fid}`, { method: 'DELETE' });
          } catch {
            /* ignore */
          }
        });
      }

      // 3-4. 변경된 원격 노트만 병렬 다운로드
      if (toDownload.length > 0) {
        await runWithConcurrency(toDownload, 4, async (entry) => {
          const downloaded = await this.downloadJsonFile<Note>(
            entry.fileId,
            `노트("${entry.title || entry.id}")`,
          );
          if (downloaded && downloaded.id) {
            const localExisting = localNoteMap.get(downloaded.id);
            // 로컬 히스토리와 병합하여 로컬 30개 히스토리 보존
            const mergedHistory = localExisting?.history?.length
              ? [
                  ...(downloaded.history || []),
                  ...localExisting.history.filter(
                    (lh) => !(downloaded.history || []).some((dh) => dh.savedAt === lh.savedAt),
                  ),
                ].slice(0, 30)
              : downloaded.history || [];

            const syncedNote: Note = {
              ...downloaded,
              history: mergedHistory,
              syncedAt: downloaded.updatedAt,
            };
            finalNotesMap.set(downloaded.id, syncedNote);
            nextNoteIndex[downloaded.id] = {
              id: downloaded.id,
              fileId: entry.fileId,
              updatedAt: downloaded.updatedAt,
              title: downloaded.title,
              projectId: downloaded.projectId || 'default',
            };
            syncedMap[downloaded.id] = { syncedAt: downloaded.updatedAt, fileId: entry.fileId };
            downloadedCount += 1;
            hasRemoteChanges = true;
          }
        });
      }

      // 3-5. 변경된(미동기화) 로컬 노트만 병렬 업로드
      if (toUpload.length > 0) {
        await runWithConcurrency(toUpload, 4, async ({ note, existingFileId }) => {
          const { fileId, note: uploadedNote } = await this.uploadSingleNote(
            notesFolderId,
            note,
            existingFileId,
          );
          finalNotesMap.set(uploadedNote.id, uploadedNote);
          nextNoteIndex[uploadedNote.id] = {
            id: uploadedNote.id,
            fileId,
            updatedAt: uploadedNote.updatedAt,
            title: uploadedNote.title,
            projectId: uploadedNote.projectId || 'default',
          };
          syncedMap[uploadedNote.id] = {
            syncedAt: uploadedNote.updatedAt,
            fileId,
          };
          uploadedCount += 1;
          shouldUpdateIndex = true;
          hasSyncStampUpdates = true;
        });
      }

      // 3-6. 인덱스 파일(index.json)은 변경사항이 있을 때만 업데이트
      if (shouldUpdateIndex) {
        const mergedDeletedNotes = [
          ...deletedRecords.notes,
          ...(remoteIndex.deletedNotes || []).filter((r) => !localDeletedNoteMap.has(r.id)),
        ].slice(-500);

        const mergedDeletedProjects = [
          ...deletedRecords.projects,
          ...(remoteIndex.deletedProjects || []).filter((r) => !localDeletedProjectIds.has(r.id)),
        ].slice(-200);

        const updatedIndex: RemoteIndexDb = {
          app: 'BullsNote',
          version: 3,
          lastModified: Date.now(),
          projects: mergedProjects,
          noteIndex: nextNoteIndex,
          deletedNotes: mergedDeletedNotes,
          deletedProjects: mergedDeletedProjects,
        };

        const savedIndex = await this.uploadJsonFile(
          rootFolderId,
          'index.json',
          this.indexFileId,
          updatedIndex,
          'Google Drive 인덱스(index.json)',
        );
        this.indexFileId = savedIndex.id;
      }

      const now = Date.now();
      this.saveSyncedMap(syncedMap);
      this.saveConfig({ lastSyncedAt: now });

      const mergedNotes = Array.from(finalNotesMap.values());

      return {
        success: true,
        notes: mergedNotes,
        projects: mergedProjects,
        hasRemoteChanges: hasRemoteChanges || hasSyncStampUpdates,
        uploadedCount,
        downloadedCount,
      };
    } catch (err) {
      console.error('Google Drive syncAll error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        notes: localNotes,
        projects: localProjects,
        hasRemoteChanges: false,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 첨부파일 및 이미지를 BullsNote/attachments 폴더에 분리 업로드
   * - 이미지 파일인 경우 업로드 즉시 메모리 ObjectURL 캐시에 등록하여 노트 본문에서 즉시 보이도록 처리
   */
  async uploadAttachment(
    noteId: string,
    file: File,
    opts: { contentHash?: string } = {},
  ): Promise<NoteAttachment> {
    const attFolderId = await this.getAttachmentsFolderId();
    const safeName = file.name.replace(/[/\\?%*:|"<>]/g, '_');
    const uploadName = `${noteId}_${Date.now()}_${safeName}`;

    const metadata: Record<string, unknown> = {
      name: uploadName,
      parents: [attFolderId],
      mimeType: file.type || 'application/octet-stream',
    };
    if (opts.contentHash) {
      // 앱 전용 속성(appProperties)에 콘텐츠 해시를 기록해 다음 동기화 때 같은 이미지를 찾아 재사용
      metadata.appProperties = { [APP_PROP_HASH]: opts.contentHash, [APP_PROP_NOTE]: noteId };
    }

    const boundary = '-------BullsNoteAttBoundary' + Math.random().toString(36).substring(2);
    const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      metadata,
    )}\r\n`;
    const endBoundary = `\r\n--${boundary}--`;

    const fileBuffer = await file.arrayBuffer();

    const multipartPayload = new Blob([
      metadataPart,
      `--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
      fileBuffer,
      endBoundary,
    ]);

    const res = await this.driveFetch(
      '/files?uploadType=multipart&fields=id,name,size,mimeType,webViewLink',
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartPayload,
      },
      true,
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(this.formatDriveApiError(res.status, errText, 'Google Drive 첨부파일 업로드 실패'));
    }

    const data = await res.json();
    const fileId = data.id as string;

    // 이미지/미디어 파일이면 즉시 로컬 Blob URL을 캐싱하여 노트 에디터에서 0ms로 표시되도록 함
    if (
      file.type.startsWith('image/') ||
      file.type.startsWith('video/') ||
      file.type.startsWith('audio/')
    ) {
      try {
        const localBlobUrl = URL.createObjectURL(file);
        this.attachmentBlobUrlCache.set(fileId, localBlobUrl);
      } catch {
        /* ignore */
      }
    }

    return {
      id: createNoteId(),
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      storagePath: fileId,
      url: data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
      createdAt: Date.now(),
    };
  }

  /**
   * 콘텐츠 해시 기반 중복 제거 업로드 (노트 단위)
   * - 같은 노트에 같은 이미지가 이미 업로드되어 있으면(세션 캐시 → Drive appProperties 조회) 기존 파일을 재사용
   * - 노트 단위로만 공유하므로 한 노트의 첨부 삭제가 다른 노트 이미지를 깨뜨리지 않음
   */
  private async uploadImageDeduped(noteId: string, file: File): Promise<NoteAttachment> {
    const hash = await sha256Hex(await file.arrayBuffer());
    const attFolderId = await this.getAttachmentsFolderId();
    const key = `${attFolderId}:${noteId}:${hash}`;

    const cached = this.uploadedImageByHash.get(key);
    if (cached) return cached;

    const existing = await this.findImageByHash(attFolderId, noteId, hash, file);
    if (existing) {
      this.uploadedImageByHash.set(key, existing);
      return existing;
    }

    const uploaded = await this.uploadAttachment(noteId, file, { contentHash: hash });
    this.uploadedImageByHash.set(key, uploaded);
    return uploaded;
  }

  /** attachments 폴더에서 appProperties(해시+노트ID)가 일치하는 기존 업로드 파일 조회 */
  private async findImageByHash(
    attFolderId: string,
    noteId: string,
    hash: string,
    file: File,
  ): Promise<NoteAttachment | null> {
    // hash 는 16진수, noteId 는 [A-Za-z0-9_-] 이므로 쿼리 문자열에 그대로 넣어도 안전 (방어적으로 재검증)
    if (!/^[a-f0-9]{64}$/.test(hash) || !/^[A-Za-z0-9_-]+$/.test(noteId)) return null;
    const q =
      `'${attFolderId}' in parents and trashed = false` +
      ` and appProperties has { key='${APP_PROP_HASH}' and value='${hash}' }` +
      ` and appProperties has { key='${APP_PROP_NOTE}' and value='${noteId}' }`;
    try {
      const res = await this.driveFetch(
        `/files?q=${encodeURIComponent(q)}&pageSize=1&fields=files(id,name,size,mimeType,webViewLink)`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      const f = Array.isArray(data.files) ? data.files[0] : null;
      if (!f || !f.id) return null;
      return {
        id: createNoteId(),
        name: file.name,
        size: Number(f.size) || file.size,
        type: f.mimeType || file.type || 'application/octet-stream',
        storagePath: f.id,
        url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        createdAt: Date.now(),
      };
    } catch {
      // 조회 실패 시에는 업로드로 진행 (동기화 자체를 막지 않음)
      return null;
    }
  }

  /**
   * 노트 본문 내 Google Drive 이미지/파일 URL을 에디터 표시용 URL로 변환 (BlockNote resolveFileUrl 연동)
   * - attachments/ 폴더에 업로드된 비공개 Google Drive 이미지를 OAuth 토큰으로 안전하게 가져와 노트 본문에 직접 렌더링합니다.
   * - 일반 문서/압축 파일은 링크(https://drive.google.com/file/d/.../view)를 그대로 반환합니다.
   */
  async resolveDriveFileUrl(url: string): Promise<string> {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;

    const fileId = extractDriveFileIdFromUrl(url);
    if (!fileId) return url;

    const cached = this.attachmentBlobUrlCache.get(fileId);
    if (cached) return cached;

    if (!this.isConnected()) return url;

    const existingPromise = this.inFlightBlobPromises.get(fileId);
    if (existingPromise) return existingPromise;

    const promise = (async () => {
      try {
        const blob = await this.downloadAttachment(fileId);
        // 이미지, 비디오, 오디오인 경우 Blob ObjectURL을 생성하여 에디터 내부에 바로 렌더링
        if (
          blob.type.startsWith('image/') ||
          blob.type.startsWith('video/') ||
          blob.type.startsWith('audio/') ||
          blob.type === 'application/octet-stream'
        ) {
          const blobUrl = URL.createObjectURL(blob);
          this.attachmentBlobUrlCache.set(fileId, blobUrl);
          return blobUrl;
        }
        return url;
      } catch {
        return url;
      } finally {
        this.inFlightBlobPromises.delete(fileId);
      }
    })();

    this.inFlightBlobPromises.set(fileId, promise);
    return promise;
  }

  /**
   * 첨부파일 다운로드 (Blob 반환)
   */
  async downloadAttachment(storagePath: string): Promise<Blob> {
    const res = await this.driveFetch(`/files/${storagePath}?alt=media`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(this.formatDriveApiError(res.status, errText, 'Google Drive 첨부파일 다운로드 실패'));
    }
    return res.blob();
  }

  /**
   * 첨부파일 삭제
   */
  async deleteAttachment(storagePath: string): Promise<void> {
    try {
      const cachedUrl = this.attachmentBlobUrlCache.get(storagePath);
      if (cachedUrl) {
        URL.revokeObjectURL(cachedUrl);
        this.attachmentBlobUrlCache.delete(storagePath);
      }
      for (const [key, att] of this.uploadedImageByHash) {
        if (att.storagePath === storagePath) this.uploadedImageByHash.delete(key);
      }
      await this.driveFetch(`/files/${storagePath}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Google Drive 파일 삭제 실패 (무시됨):', e);
    }
  }
}

export const GoogleDriveService = new GoogleDriveServiceImpl();
