// MODEL: Google Drive 클라우드 동기화 및 스토리지 서비스 (REST API v3 기반, 무의존성 native fetch)
import { createNoteId, Note, NoteAttachment, Project } from './Note';

const CONFIG_STORAGE_KEY = 'bullsnote.googledrive.config.v1';
const TOKENS_STORAGE_KEY = 'bullsnote.googledrive.tokens.v1';
const DELETED_RECORDS_KEY = 'bullsnote.googledrive.deleted.v1';

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

export interface RemoteBullsNoteDb {
  app: 'BullsNote';
  version: number;
  lastModified: number;
  projects: Project[];
  notes: Note[];
  deletedNotes?: DeletedRecord[];
  deletedProjects?: DeletedRecord[];
}

export interface SyncResult {
  success: boolean;
  error?: string;
  notes: Note[];
  projects: Project[];
  hasRemoteChanges: boolean;
}

class GoogleDriveServiceImpl {
  private bullsNoteFolderId: string | null = null;
  private attachmentsFolderId: string | null = null;
  private dbFileId: string | null = null;
  private isSyncing = false;

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
    // 최근 500개만 유지
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

  /** 유효한 Access Token 반환 (만료 시 자동 갱신) */
  async getValidAccessToken(forceRefresh = false): Promise<string | null> {
    const tokens = this.getTokens();
    if (!tokens) return null;

    // 만료 1분 전까지 유효로 판단 (강제 갱신이 아닌 경우)
    if (!forceRefresh && Date.now() < tokens.expiresAt - 60_000) {
      return tokens.accessToken;
    }

    // Refresh Token이 있으면 갱신 시도
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
      }
    }

    return null;
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
        const urlMatch = message.match(/https:\/\/console\.developers\.google\.com\/apis\/api\/drive\.googleapis\.com\/overview\?project=[0-9]+/);
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
        error: 'Google OAuth Client ID가 입력되지 않았습니다. Google Cloud Console에서 데스크톱 클라이언트 ID를 발급받아 입력해주세요.',
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
        this.attachmentsFolderId = null;
        this.dbFileId = null;

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
    // (구글 정책상 response_type=token 호출 시 400 unsupported_response_type이 발생하므로 최신 GIS 사용)
    const googleAccounts = typeof window !== 'undefined' ? (window as unknown as { google?: { accounts?: { oauth2?: any } } }).google?.accounts?.oauth2 : undefined;

    if (googleAccounts) {
      return new Promise((resolve) => {
        try {
          const client = googleAccounts.initTokenClient({
            client_id: cfg.customClientId!,
            scope: [
              'https://www.googleapis.com/auth/drive.file',
              'https://www.googleapis.com/auth/userinfo.profile',
              'https://www.googleapis.com/auth/userinfo.email',
            ].join(' '),
            callback: async (tokenRes: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) => {
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
              this.attachmentsFolderId = null;
              this.dbFileId = null;

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
      error: 'Google Identity 라이브러리가 로드되지 않았습니다. 페이지를 새로고침하거나 데스크톱 앱(npm run electron:dev)에서 실행해주세요.',
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
    this.attachmentsFolderId = null;
    this.dbFileId = null;
  }

  /** Google Drive REST API 호출 헬퍼 */
  private async driveFetch(
    endpoint: string,
    options: RequestInit = {},
    isUpload = false,
  ): Promise<Response> {
    let token = await this.getValidAccessToken(false);
    if (!token) throw new Error('Google 계정 인증이 만료되었거나 연동되지 않았습니다. 다시 로그인해주세요.');

    const baseUrl = isUpload
      ? 'https://www.googleapis.com/upload/drive/v3'
      : 'https://www.googleapis.com/drive/v3';

    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    let res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      // 401 발생 시 Refresh Token으로 1회 강제 재발급 후 재시도
      const refreshedToken = await this.getValidAccessToken(true);
      if (refreshedToken) {
        token = refreshedToken;
        headers.set('Authorization', `Bearer ${token}`);
        res = await fetch(url, { ...options, headers });
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

    // 폴더가 없으면 새로 생성
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

  /** attachments 폴더 id 획득 */
  async getAttachmentsFolderId(): Promise<string> {
    if (this.attachmentsFolderId) return this.attachmentsFolderId;
    const rootId = await this.getBullsNoteFolderId();
    const id = await this.getOrCreateFolder('attachments', rootId);
    this.attachmentsFolderId = id;
    return id;
  }

  /** 원격 DB 파일 메타데이터 조회 */
  private async getRemoteDbFileInfo(folderId: string): Promise<{ id: string; modifiedTime: string } | null> {
    const q = `'${folderId}' in parents and name = 'bullsnote_db.json' and trashed = false`;
    const res = await this.driveFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(this.formatDriveApiError(res.status, errText, 'Google Drive DB 메타데이터 조회 실패'));
    }
    const data = await res.json();
    if (Array.isArray(data.files) && data.files.length > 0) {
      return { id: data.files[0].id, modifiedTime: data.files[0].modifiedTime };
    }
    return null;
  }

  /** 원격 DB 내용 다운로드 */
  private async downloadRemoteDb(fileId: string): Promise<RemoteBullsNoteDb | null> {
    const res = await this.driveFetch(`/files/${fileId}?alt=media`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(this.formatDriveApiError(res.status, errText, 'Google Drive DB 다운로드 실패'));
    }
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  /** 원격 DB 업로드 (신규 생성 또는 기존 파일 패치) */
  private async uploadRemoteDb(
    folderId: string,
    existingFileId: string | null,
    db: RemoteBullsNoteDb,
  ): Promise<{ id: string }> {
    const jsonStr = JSON.stringify(db);
    const blob = new Blob([jsonStr], { type: 'application/json' });

    if (existingFileId) {
      // 기존 파일 내용 업데이트 (PATCH)
      const res = await this.driveFetch(
        `/files/${existingFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: blob,
        },
        true,
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(this.formatDriveApiError(res.status, err, 'Google Drive DB 파일 업데이트 실패'));
      }
      return { id: existingFileId };
    } else {
      // 신규 파일 업로드 (Multipart)
      const boundary = '-------BullsNoteBoundary' + Math.random().toString(36).substring(2);
      const metadata = {
        name: 'bullsnote_db.json',
        parents: [folderId],
        mimeType: 'application/json',
      };

      const multipartBody = [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
          metadata,
        )}\r\n`,
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
        throw new Error(this.formatDriveApiError(res.status, err, 'Google Drive DB 파일 생성 실패'));
      }
      const data = await res.json();
      return { id: data.id };
    }
  }

  /**
   * 폴링 시 초경량 변경 감지 (트래픽 최소화)
   * 원격 bullsnote_db.json의 modifiedTime만 조회하여 로컬 lastSyncedAt보다 최신인지만 확인
   */
  async hasRemoteChangesQuick(): Promise<boolean> {
    if (!this.isConnected()) return false;
    try {
      const folderId = await this.getBullsNoteFolderId();
      const fileInfo = await this.getRemoteDbFileInfo(folderId);
      if (!fileInfo) return false;

      this.dbFileId = fileInfo.id;
      const remoteMtime = new Date(fileInfo.modifiedTime).getTime();
      const lastSyncedAt = this.getConfig().lastSyncedAt || 0;

      // 원격 수정 시간이 마지막 동기화 시간보다 3초 이상 최신이면 변경 있음으로 판정
      return remoteMtime > lastSyncedAt + 3000;
    } catch {
      return false;
    }
  }

  /**
   * 전체 양방향 동기화 (3-Way Merge)
   */
  async syncAll(localNotes: Note[], localProjects: Project[]): Promise<SyncResult> {
    if (!this.isConnected()) {
      return { success: false, error: 'Google 계정이 연동되지 않았습니다.', notes: localNotes, projects: localProjects, hasRemoteChanges: false };
    }
    if (this.isSyncing) {
      return { success: true, notes: localNotes, projects: localProjects, hasRemoteChanges: false };
    }

    this.isSyncing = true;
    try {
      const folderId = await this.getBullsNoteFolderId();
      const fileInfo = await this.getRemoteDbFileInfo(folderId);
      const deletedRecords = this.getDeletedRecords();

      let mergedNotes: Note[] = [...localNotes];
      let mergedProjects: Project[] = [...localProjects];
      let hasRemoteChanges = false;
      let shouldUpload = false;

      if (!fileInfo) {
        // 원격에 DB가 전혀 없는 경우: 로컬 전체 데이터를 원격에 최초 업로드
        const initialDb: RemoteBullsNoteDb = {
          app: 'BullsNote',
          version: 2,
          lastModified: Date.now(),
          projects: localProjects,
          notes: localNotes,
          deletedNotes: deletedRecords.notes,
          deletedProjects: deletedRecords.projects,
        };
        const created = await this.uploadRemoteDb(folderId, null, initialDb);
        this.dbFileId = created.id;
      } else {
        this.dbFileId = fileInfo.id;
        const remoteDb = await this.downloadRemoteDb(fileInfo.id);

        if (!remoteDb || !Array.isArray(remoteDb.notes) || !Array.isArray(remoteDb.projects)) {
          throw new Error('Google Drive의 BullsNote 데이터 파일 형식이 올바르지 않습니다.');
        }

        // --- 1. 프로젝트 3-way 병합 ---
        const projectMap = new Map<string, Project>();
        const localDeletedProjectIds = new Set(deletedRecords.projects.map((r) => r.id));
        const remoteDeletedProjectMap = new Map((remoteDb.deletedProjects || []).map((r) => [r.id, r.deletedAt]));

        // 원격 프로젝트 반영
        for (const rp of remoteDb.projects) {
          // 로컬에서 이미 삭제된 경우 확인
          const localDel = deletedRecords.projects.find((d) => d.id === rp.id);
          if (localDel && localDel.deletedAt >= rp.updatedAt) {
            shouldUpload = true;
            continue;
          }
          projectMap.set(rp.id, rp);
        }

        // 로컬 프로젝트 비교 병합
        for (const lp of localProjects) {
          // 원격에서 삭제된 경우
          const remoteDelAt = remoteDeletedProjectMap.get(lp.id);
          if (remoteDelAt && remoteDelAt >= lp.updatedAt) {
            hasRemoteChanges = true;
            continue;
          }

          const existing = projectMap.get(lp.id);
          if (!existing) {
            // 로컬에만 있음 -> 추가
            projectMap.set(lp.id, lp);
            shouldUpload = true;
          } else if (lp.updatedAt > existing.updatedAt) {
            // 로컬이 더 최신
            projectMap.set(lp.id, lp);
            shouldUpload = true;
          } else if (existing.updatedAt > lp.updatedAt) {
            // 원격이 더 최신
            hasRemoteChanges = true;
          }
        }
        mergedProjects = Array.from(projectMap.values());

        // --- 2. 노트 3-way 병합 ---
        const noteMap = new Map<string, Note>();
        const localDeletedNoteMap = new Map(deletedRecords.notes.map((r) => [r.id, r.deletedAt]));
        const remoteDeletedNoteMap = new Map((remoteDb.deletedNotes || []).map((r) => [r.id, r.deletedAt]));

        // 원격 노트 반영
        for (const rn of remoteDb.notes) {
          const localDelAt = localDeletedNoteMap.get(rn.id);
          if (localDelAt && localDelAt >= rn.updatedAt) {
            shouldUpload = true;
            continue;
          }
          noteMap.set(rn.id, rn);
        }

        // 로컬 노트 비교 병합
        for (const ln of localNotes) {
          const remoteDelAt = remoteDeletedNoteMap.get(ln.id);
          if (remoteDelAt && remoteDelAt >= ln.updatedAt) {
            hasRemoteChanges = true;
            continue;
          }

          const existing = noteMap.get(ln.id);
          if (!existing) {
            noteMap.set(ln.id, ln);
            shouldUpload = true;
          } else if (ln.updatedAt > existing.updatedAt) {
            noteMap.set(ln.id, ln);
            shouldUpload = true;
          } else if (existing.updatedAt > ln.updatedAt) {
            hasRemoteChanges = true;
          }
        }
        mergedNotes = Array.from(noteMap.values());

        // 로컬 삭제 이력과 원격 삭제 이력 합산
        const mergedDeletedNotes = [
          ...deletedRecords.notes,
          ...(remoteDb.deletedNotes || []).filter((r) => !localDeletedNoteMap.has(r.id)),
        ].slice(-500);

        const mergedDeletedProjects = [
          ...deletedRecords.projects,
          ...(remoteDb.deletedProjects || []).filter((r) => !localDeletedProjectIds.has(r.id)),
        ].slice(-200);

        // 로컬 변경사항이 있거나 동기화된 결과가 원격과 다르면 원격에 재업로드
        if (shouldUpload || hasRemoteChanges) {
          const updatedDb: RemoteBullsNoteDb = {
            app: 'BullsNote',
            version: 2,
            lastModified: Date.now(),
            projects: mergedProjects,
            notes: mergedNotes,
            deletedNotes: mergedDeletedNotes,
            deletedProjects: mergedDeletedProjects,
          };
          await this.uploadRemoteDb(folderId, fileInfo.id, updatedDb);
        }
      }

      const now = Date.now();
      this.saveConfig({ lastSyncedAt: now });

      return {
        success: true,
        notes: mergedNotes,
        projects: mergedProjects,
        hasRemoteChanges,
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
   * 첨부파일 업로드 (BullsNote/attachments 폴더에 저장)
   */
  async uploadAttachment(noteId: string, file: File): Promise<NoteAttachment> {
    const attFolderId = await this.getAttachmentsFolderId();
    const safeName = file.name.replace(/[/\\?%*:|"<>]/g, '_');
    const uploadName = `${noteId}_${Date.now()}_${safeName}`;

    const metadata = {
      name: uploadName,
      parents: [attFolderId],
      mimeType: file.type || 'application/octet-stream',
    };

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
      throw new Error(`Google Drive 파일 업로드 실패: ${errText}`);
    }

    const data = await res.json();
    const fileId = data.id as string;

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
   * 첨부파일 다운로드 (Blob 반환)
   */
  async downloadAttachment(storagePath: string): Promise<Blob> {
    const res = await this.driveFetch(`/files/${storagePath}?alt=media`);
    if (!res.ok) {
      throw new Error(`Google Drive 파일 다운로드 실패 (${res.status})`);
    }
    return res.blob();
  }

  /**
   * 첨부파일 삭제
   */
  async deleteAttachment(storagePath: string): Promise<void> {
    try {
      await this.driveFetch(`/files/${storagePath}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Google Drive 파일 삭제 실패 (무시됨):', e);
    }
  }
}

export const GoogleDriveService = new GoogleDriveServiceImpl();
