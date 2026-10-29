import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Note, NoteAttachment, Project } from './Note';
import { CryptoService, VERIFIER_STORAGE_KEY } from './CryptoService';
import { GROUP_ID_TO_STATUS, isSystemGroupNote, TODO_PROJECT_ID } from './TodoService';

const SUPABASE_CONFIG_STORAGE_KEY = 'bullsnote.supabase.config.v1';
export const SUPABASE_STORAGE_BUCKET = 'bullsnote-attachments';

/**
 * 노트 조회 시 불필요한 대용량 history 컬럼(최대 30개 스냅샷)을 제외하여
 * Database Output(Egress) 사용량을 대폭 절감합니다.
 */
const NOTE_SYNC_COLUMNS =
  'id, title, project_id, color, reminder, content, tags, pinned, favorite, parent_id, attachments, created_at, updated_at';

const PROJECT_SYNC_COLUMNS = 'id, name, icon, created_at, updated_at';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  enabled: boolean;
  autoSync: boolean;
  lastSyncedAt: number | null;
}

export const DEFAULT_SUPABASE_CONFIG: SupabaseConfig = {
  url: '',
  anonKey: '',
  enabled: false,
  autoSync: true,
  lastSyncedAt: null,
};

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export type RealtimeChange =
  | { type: 'note'; action: 'INSERT' | 'UPDATE'; note: Note }
  | { type: 'note'; action: 'DELETE'; id: string }
  | { type: 'project'; action: 'INSERT' | 'UPDATE'; project: Project }
  | { type: 'project'; action: 'DELETE'; id: string }
  | { type: 'sync_needed'; reason: string };

export const SUPABASE_SETUP_SQL = `-- BullsNote용 Supabase 테이블 및 스토리지 생성 스크립트
-- Supabase 대시보드 -> SQL Editor -> New Query에 붙여넣고 Run을 클릭하세요.

-- 1. 프로젝트 테이블 생성
CREATE TABLE IF NOT EXISTS bullsnote_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📁',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 2. 노트 테이블 생성 (첨부파일 컬럼 포함)
CREATE TABLE IF NOT EXISTS bullsnote_notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '제목 없음',
  project_id TEXT,
  color TEXT DEFAULT 'blue',
  reminder JSONB,
  content TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  pinned BOOLEAN DEFAULT false,
  favorite BOOLEAN DEFAULT false,
  parent_id TEXT,
  history JSONB DEFAULT '[]'::jsonb,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 기존 테이블이 이미 있을 경우 attachments 컬럼 추가
ALTER TABLE bullsnote_notes 
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- 3. RLS(Row Level Security) 설정 및 공개 접근 정책
ALTER TABLE bullsnote_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE bullsnote_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for bullsnote_projects" ON bullsnote_projects;
CREATE POLICY "Allow all for bullsnote_projects" ON bullsnote_projects
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for bullsnote_notes" ON bullsnote_notes;
CREATE POLICY "Allow all for bullsnote_notes" ON bullsnote_notes
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 4. 첨부파일 전용 스토리지 버킷 생성 (공개 버킷, 최대 50MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bullsnote-attachments',
  'bullsnote-attachments',
  true,
  52428800,
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- 5. 스토리지 객체에 대한 RLS 정책 (업로드, 다운로드, 삭제 허용)
DROP POLICY IF EXISTS "Allow all for bullsnote-attachments" ON storage.objects;
CREATE POLICY "Allow all for bullsnote-attachments" ON storage.objects
  FOR ALL TO anon, authenticated
  USING (bucket_id = 'bullsnote-attachments')
  WITH CHECK (bucket_id = 'bullsnote-attachments');

-- 6. 다른 기기 간 실시간 자동 동기화(Realtime) 활성화
-- Supabase에서 DB 변경 시 다른 기기에 실시간으로 브로드캐스트합니다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bullsnote_projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bullsnote_projects;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bullsnote_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bullsnote_notes;
  END IF;
END $$;

-- PK(id)만 old 레코드로 전송하여 UPDATE 시 불필요한 본문/히스토리 중복 전송(Output 폭증) 방지
ALTER TABLE bullsnote_projects REPLICA IDENTITY DEFAULT;
ALTER TABLE bullsnote_notes REPLICA IDENTITY DEFAULT;
`;

export interface DbProjectRow {
  id: string;
  name: string;
  icon: string | null;
  created_at: number;
  updated_at: number;
}

export interface DbNoteRow {
  id: string;
  title: string;
  project_id: string | null;
  color: string | null;
  reminder: unknown;
  content: string;
  tags: unknown;
  pinned: boolean;
  favorite: boolean;
  parent_id: string | null;
  history?: unknown;
  attachments?: unknown;
  created_at: number;
  updated_at: number;
}

interface DbNoteMetaRow {
  id: string;
  updated_at: number;
}

class SupabaseSyncManager {
  private client: SupabaseClient | null = null;
  private currentConfig: SupabaseConfig = { ...DEFAULT_SUPABASE_CONFIG };

  // 실시간 동기화(Realtime) 채널 및 리스너 관리
  private realtimeChannel: RealtimeChannel | null = null;
  private realtimeListeners = new Set<(change: RealtimeChange) => void>();
  private realtimeStatus: RealtimeStatus = 'disconnected';
  private realtimeStatusListeners = new Set<(status: RealtimeStatus) => void>();
  private hasRealtimeConnectedOnce = false;
  private realtimeHadDisconnection = false;

  // 중복 업로드(Input) 및 Realtime 자체 에코(Output/복호화) 방지용 타임스탬프 캐시
  private lastSyncedNoteAt = new Map<string, number>();
  private lastSyncedProjectAt = new Map<string, number>();
  private lastSyncedVerifier: string | null = null;
  private lastSyncedVerifierAt = 0;

  constructor() {
    this.currentConfig = this.loadConfig();
    this.initClient();
  }

  public loadConfig(): SupabaseConfig {
    try {
      const raw = localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SUPABASE_CONFIG };
      const parsed = JSON.parse(raw);
      return {
        url: typeof parsed.url === 'string' ? parsed.url.trim() : '',
        anonKey: typeof parsed.anonKey === 'string' ? parsed.anonKey.trim() : '',
        enabled: Boolean(parsed.enabled),
        autoSync: parsed.autoSync !== false,
        lastSyncedAt: typeof parsed.lastSyncedAt === 'number' ? parsed.lastSyncedAt : null,
      };
    } catch {
      return { ...DEFAULT_SUPABASE_CONFIG };
    }
  }

  public saveConfig(config: SupabaseConfig): void {
    const cleanConfig: SupabaseConfig = {
      ...config,
      url: (config.url || '').trim().replace(/\/+$/, ''),
      anonKey: (config.anonKey || '').trim(),
    };
    const prev = this.currentConfig;
    const credentialsChanged =
      cleanConfig.url !== prev.url ||
      cleanConfig.anonKey !== prev.anonKey ||
      cleanConfig.enabled !== prev.enabled;
    const wasAutoSync = prev.autoSync;

    this.currentConfig = cleanConfig;
    try {
      localStorage.setItem(SUPABASE_CONFIG_STORAGE_KEY, JSON.stringify(cleanConfig));
    } catch {}

    // URL, API Key, 활성화 여부가 실제로 변경되었을 때만 클라이언트를 재초기화 (무한 재연결 루프 방지)
    if (credentialsChanged || (cleanConfig.enabled && !this.client)) {
      this.lastSyncedNoteAt.clear();
      this.lastSyncedProjectAt.clear();
      this.lastSyncedVerifier = null;
      this.lastSyncedVerifierAt = 0;
      this.initClient();
      return;
    }

    if (!cleanConfig.autoSync && wasAutoSync) {
      this.teardownRealtime();
    } else if (cleanConfig.autoSync && this.isConnected() && this.realtimeListeners.size > 0) {
      this.ensureRealtimeSubscription();
    }
  }

  public getConfig(): SupabaseConfig {
    return { ...this.currentConfig };
  }

  public updateLastSyncedAt(timestamp = Date.now()): void {
    this.currentConfig = { ...this.currentConfig, lastSyncedAt: timestamp };
    try {
      localStorage.setItem(SUPABASE_CONFIG_STORAGE_KEY, JSON.stringify(this.currentConfig));
    } catch {}
  }

  public isConnected(): boolean {
    return Boolean(this.client && this.currentConfig.enabled && this.currentConfig.url && this.currentConfig.anonKey);
  }

  public getRealtimeStatus(): RealtimeStatus {
    return this.realtimeStatus;
  }

  private setRealtimeStatus(status: RealtimeStatus): void {
    if (this.realtimeStatus === status) return;
    this.realtimeStatus = status;
    for (const listener of this.realtimeStatusListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('RealtimeStatus 리스너 오류:', err);
      }
    }
  }

  public subscribeToRealtimeStatus(listener: (status: RealtimeStatus) => void): () => void {
    this.realtimeStatusListeners.add(listener);
    listener(this.realtimeStatus);
    return () => {
      this.realtimeStatusListeners.delete(listener);
    };
  }

  public subscribeToRealtime(listener: (change: RealtimeChange) => void): () => void {
    this.realtimeListeners.add(listener);
    this.ensureRealtimeSubscription();
    return () => {
      this.realtimeListeners.delete(listener);
      if (this.realtimeListeners.size === 0) {
        this.teardownRealtime();
      }
    };
  }

  private notifyRealtimeListeners(change: RealtimeChange): void {
    for (const listener of this.realtimeListeners) {
      try {
        listener(change);
      } catch (err) {
        console.error('Realtime 변경 리스너 오류:', err);
      }
    }
  }

  public teardownRealtime(): void {
    if (this.realtimeChannel) {
      try {
        if (this.client) {
          void this.client.removeChannel(this.realtimeChannel);
        } else {
          void this.realtimeChannel.unsubscribe();
        }
      } catch {}
      this.realtimeChannel = null;
    }
    this.hasRealtimeConnectedOnce = false;
    this.realtimeHadDisconnection = false;
    this.setRealtimeStatus('disconnected');
  }

  public ensureRealtimeSubscription(): void {
    if (!this.isConnected() || !this.client || !this.currentConfig.autoSync) {
      this.teardownRealtime();
      return;
    }

    if (this.realtimeChannel) {
      return;
    }

    this.setRealtimeStatus('connecting');

    try {
      const channel = this.client.channel('bullsnote-realtime-sync');

      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bullsnote_notes' },
          async (payload) => {
            try {
              const eventType = payload.eventType;
              if (eventType === 'DELETE') {
                const oldId = (payload.old as { id?: string })?.id;
                if (oldId) {
                  this.lastSyncedNoteAt.delete(oldId);
                  this.notifyRealtimeListeners({ type: 'note', action: 'DELETE', id: oldId });
                }
              } else if (eventType === 'INSERT' || eventType === 'UPDATE') {
                const row = payload.new as DbNoteRow;
                if (row && row.id) {
                  if (row.id === '__bullsnote_security_verifier__') {
                    if (row.content && CryptoService.isEncrypted(row.content)) {
                      this.lastSyncedVerifier = row.content;
                      this.lastSyncedVerifierAt = Number(row.updated_at) || Date.now();
                      try {
                        localStorage.setItem(VERIFIER_STORAGE_KEY, row.content);
                      } catch {}
                    }
                    return;
                  }

                  const remoteUpdatedAt = Number(row.updated_at) || 0;
                  const knownAt = this.lastSyncedNoteAt.get(row.id);
                  // 현재 기기에서 방금 업로드했거나 이미 동일한 타임스탬프로 반영된 에코 이벤트는 즉시 무시
                  if (knownAt !== undefined && remoteUpdatedAt > 0 && remoteUpdatedAt <= knownAt) {
                    return;
                  }

                  this.lastSyncedNoteAt.set(row.id, remoteUpdatedAt);
                  const note = await this.rowToNote(row);
                  this.notifyRealtimeListeners({ type: 'note', action: eventType, note });
                }
              }
            } catch (err) {
              console.warn('[Supabase Realtime] 노트 변경 처리 오류:', err);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bullsnote_projects' },
          (payload) => {
            try {
              const eventType = payload.eventType;
              if (eventType === 'DELETE') {
                const oldId = (payload.old as { id?: string })?.id;
                if (oldId) {
                  this.lastSyncedProjectAt.delete(oldId);
                  this.notifyRealtimeListeners({ type: 'project', action: 'DELETE', id: oldId });
                }
              } else if (eventType === 'INSERT' || eventType === 'UPDATE') {
                const row = payload.new as DbProjectRow;
                if (row && row.id) {
                  const remoteUpdatedAt = Number(row.updated_at) || 0;
                  const knownAt = this.lastSyncedProjectAt.get(row.id);
                  if (knownAt !== undefined && remoteUpdatedAt > 0 && remoteUpdatedAt <= knownAt) {
                    return;
                  }
                  this.lastSyncedProjectAt.set(row.id, remoteUpdatedAt);
                  const project = this.rowToProject(row);
                  this.notifyRealtimeListeners({ type: 'project', action: eventType, project });
                }
              }
            } catch (err) {
              console.warn('[Supabase Realtime] 프로젝트 변경 처리 오류:', err);
            }
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            this.setRealtimeStatus('connected');
            // 최초 구독 시에는 초기 동기화(initialSupabaseSyncedRef)가 이미 실행되므로 중복 호출하지 않고,
            // 네트워크 단절/오류 이후 재연결된 경우에만 누락분 증분 동기화를 요청합니다.
            if (this.hasRealtimeConnectedOnce && this.realtimeHadDisconnection) {
              this.realtimeHadDisconnection = false;
              this.notifyRealtimeListeners({ type: 'sync_needed', reason: 'reconnected' });
            }
            this.hasRealtimeConnectedOnce = true;
          } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            if (this.hasRealtimeConnectedOnce) {
              this.realtimeHadDisconnection = true;
            }
            this.setRealtimeStatus('error');
            console.warn('[Supabase Realtime] 채널 상태 경고:', status, err);
          } else if (status === 'CLOSED') {
            if (this.hasRealtimeConnectedOnce) {
              this.realtimeHadDisconnection = true;
            }
            this.setRealtimeStatus('disconnected');
          }
        });

      this.realtimeChannel = channel;
    } catch (err) {
      console.error('[Supabase Realtime] 채널 초기화 실패:', err);
      this.setRealtimeStatus('error');
    }
  }

  private initClient(): void {
    this.teardownRealtime();
    const cleanUrl = (this.currentConfig.url || '').trim().replace(/\/+$/, '');
    const cleanKey = (this.currentConfig.anonKey || '').trim();
    if (this.currentConfig.enabled && cleanUrl && cleanKey) {
      try {
        this.client = createClient(cleanUrl, cleanKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        if (this.currentConfig.autoSync && this.realtimeListeners.size > 0) {
          this.ensureRealtimeSubscription();
        }
      } catch (err) {
        console.error('Supabase 클라이언트 초기화 실패:', err);
        this.client = null;
      }
    } else {
      this.client = null;
    }
  }

  public async testConnection(rawUrl: string, rawAnonKey: string): Promise<{
    success: boolean;
    error?: string;
    tablesExist?: boolean;
  }> {
    try {
      const url = rawUrl.trim().replace(/\/+$/, '');
      const anonKey = rawAnonKey.trim();

      if (!url || !anonKey) {
        return { success: false, error: 'URL과 Anon API Key를 모두 입력해주세요.' };
      }

      // 간단한 URL 포맷 검증
      if (!url.startsWith('https://') && !url.startsWith('http://')) {
        return { success: false, error: 'Supabase URL은 https:// 로 시작해야 합니다. (예: https://xxxx.supabase.co)' };
      }

      const tempClient = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // bullsnote_projects 테이블에 쿼리 테스트
      const { error: projError } = await tempClient
        .from('bullsnote_projects')
        .select('id')
        .limit(1);

      if (projError) {
        const errMsg = projError.message || '';
        if (
          projError.code === 'PGRST205' ||
          errMsg.includes('relation "bullsnote_projects" does not exist') ||
          projError.code === '42P01' ||
          errMsg.includes('does not exist')
        ) {
          return {
            success: true,
            tablesExist: false,
            error: 'Supabase 서버 연결은 성공했으나, BullsNote 전용 테이블이 아직 생성되지 않았습니다. [초기 설정 가이드 & SQL] 탭의 스크립트를 실행해주세요.',
          };
        }

        if (errMsg.includes('Failed to fetch') || projError.code === 'ERR') {
          return {
            success: false,
            error: '서버에 연결할 수 없습니다. (Failed to fetch)\n1. Project URL이 정확한지 확인해주세요.\n2. Supabase 프로젝트가 Paused(일시 정지) 상태가 아닌지 확인해주세요.\n3. 인터넷 연결을 확인해주세요.',
          };
        }

        if (projError.code === 'PGRST301' || projError.code === '401' || errMsg.includes('JWT') || errMsg.includes('Invalid API key')) {
          return {
            success: false,
            error: 'Anon API Key가 올바르지 않습니다. Supabase 대시보드 -> Project Settings -> API에서 anon public 키를 다시 복사해주세요.',
          };
        }

        return {
          success: false,
          error: `Supabase 오류 (${projError.code || 'ERR'}): ${projError.message}`,
        };
      }

      // bullsnote_notes 테이블도 검증
      const { error: noteError } = await tempClient
        .from('bullsnote_notes')
        .select('id')
        .limit(1);

      if (noteError) {
        return {
          success: true,
          tablesExist: false,
          error: 'bullsnote_notes 테이블이 없습니다. [초기 설정 가이드 & SQL] 탭의 스크립트를 실행해주세요.',
        };
      }

      return { success: true, tablesExist: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Failed to fetch')) {
        return {
          success: false,
          error: '서버에 연결할 수 없습니다. (Failed to fetch)\n1. Supabase Project URL에 오타가 없는지 확인해주세요.\n2. Supabase 프로젝트가 일시 정지(Paused) 상태인지 확인해주세요.',
        };
      }
      return { success: false, error: `연결 실패: ${msg}` };
    }
  }

  // --- 보안 토큰 서버 동기화 (동일 토큰 중복 업로드 방지) ---
  public async uploadSecurityVerifier(verifierString: string): Promise<boolean> {
    if (!this.isConnected() || !this.client || !verifierString) return false;
    if (this.lastSyncedVerifier === verifierString) {
      return true;
    }
    try {
      const now = Date.now();
      const { error } = await this.client.from('bullsnote_notes').upsert(
        {
          id: '__bullsnote_security_verifier__',
          title: '__BULLSNOTE_SECURITY_VERIFIER__',
          content: verifierString,
          project_id: '__sys__',
          history: [],
          created_at: now,
          updated_at: now,
        },
        { onConflict: 'id' }
      );
      if (!error) {
        this.lastSyncedVerifier = verifierString;
        this.lastSyncedVerifierAt = now;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // --- 데이터 변환 헬퍼 ---
  private projectToRow(p: Project): DbProjectRow {
    return {
      id: p.id,
      name: p.name,
      icon: p.icon || '📁',
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    };
  }

  public rowToProject(row: DbProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon || '📁',
      createdAt: Number(row.created_at) || Date.now(),
      updatedAt: Number(row.updated_at) || Date.now(),
    };
  }

  public async noteToRow(n: Note): Promise<DbNoteRow> {
    let encryptedContent = n.content || '';
    // 언락 상태이고 평문인 경우에만 암호화 수행 (이미 암호문이거나 잠금 상태면 원본 그대로 보존)
    if (CryptoService.isUnlocked() && !CryptoService.isEncrypted(encryptedContent)) {
      encryptedContent = await CryptoService.encrypt(encryptedContent);
    }
    // DB Input/Output 및 저장 용량 폭증을 막기 위해 최대 30개 본문 복사본이 누적되는 history는 로컬 전용으로 유지하고
    // 클라우드 DB 행에는 빈 배열로 저장합니다.
    return {
      id: n.id,
      title: n.title,
      project_id: n.projectId || 'default',
      color: n.color || 'blue',
      reminder: n.reminder || null,
      content: encryptedContent,
      tags: n.tags || [],
      pinned: Boolean(n.pinned),
      favorite: Boolean(n.favorite),
      parent_id: n.parentId,
      history: [],
      attachments: n.attachments || [],
      created_at: n.createdAt,
      updated_at: n.updatedAt,
    };
  }

  public async rowToNote(row: DbNoteRow, localExisting?: Note): Promise<Note> {
    const rawContent = row.content || '';
    let content = rawContent;
    // 언락되어 있다면 복호화, 잠겨있다면 암호문 그대로 유지하여 데이터 보존! (절대 플레이스홀더 문자열로 덮어쓰지 않음)
    if (CryptoService.isUnlocked() && CryptoService.isEncrypted(rawContent)) {
      content = await CryptoService.decrypt(rawContent);
    }

    const rawAttachments = Array.isArray((row as { attachments?: unknown }).attachments)
      ? ((row as { attachments: NoteAttachment[] }).attachments as NoteAttachment[])
      : [];

    const systemGroupType = GROUP_ID_TO_STATUS[row.id] ?? localExisting?.systemGroupType;
    const projectId = row.project_id || 'default';
    const parentId = row.parent_id || null;

    // 할일 관리 항목인 경우 기존 로컬 todoMeta 보존 및 상태 동기화
    let todoMeta = localExisting?.todoMeta;
    if (projectId === TODO_PROJECT_ID && !systemGroupType) {
      const inferredStatus = (parentId && GROUP_ID_TO_STATUS[parentId]) || todoMeta?.status || 'todo';
      if (todoMeta) {
        todoMeta = { ...todoMeta, status: inferredStatus };
      } else {
        const match = content.match(/#note-([a-zA-Z0-9_-]+)/);
        todoMeta = {
          sourceNoteId: match ? match[1] : undefined,
          status: inferredStatus,
        };
      }
    }

    return {
      id: row.id,
      title: row.title || '제목 없음',
      projectId,
      color: row.color || 'blue',
      reminder: (row.reminder as Note['reminder']) || null,
      content,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      pinned: Boolean(row.pinned),
      favorite: Boolean(row.favorite),
      parentId,
      history: localExisting?.history ?? [],
      attachments: rawAttachments,
      todoMeta,
      systemGroupType,
      createdAt: Number(row.created_at) || Date.now(),
      updatedAt: Number(row.updated_at) || Date.now(),
    };
  }

  public async upsertNote(note: Note): Promise<boolean> {
    return this.upsertNotes([note]);
  }

  public async upsertNotes(notes: Note[], force = false): Promise<boolean> {
    if (!this.isConnected() || !this.client || notes.length === 0) return false;
    try {
      // 이미 동일한 updatedAt으로 동기화된 노트는 중복 업로드(Input) 스킵
      const changedNotes = force
        ? notes
        : notes.filter((n) => this.lastSyncedNoteAt.get(n.id) !== n.updatedAt);

      if (changedNotes.length === 0) return true;

      const rows = await Promise.all(changedNotes.map((n) => this.noteToRow(n)));
      // 먼저 타임스탬프를 기록하여 직후 도착하는 Realtime 에코를 차단
      for (const n of changedNotes) {
        this.lastSyncedNoteAt.set(n.id, n.updatedAt);
      }

      const { error } = await this.client.from('bullsnote_notes').upsert(rows, { onConflict: 'id' });
      if (error) {
        console.warn('[Supabase] 노트 동기화 실패:', error);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[Supabase] 노트 upsert 예외:', e);
      return false;
    }
  }

  public async deleteNote(id: string): Promise<boolean> {
    if (!this.isConnected() || !this.client) return false;
    try {
      this.lastSyncedNoteAt.delete(id);
      const { error } = await this.client.from('bullsnote_notes').delete().eq('id', id);
      if (error) {
        console.warn('[Supabase] 노트 삭제 동기화 실패:', error);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[Supabase] 노트 delete 예외:', e);
      return false;
    }
  }

  // --- Supabase Storage (첨부파일) 메서드 ---
  public async uploadAttachment(noteId: string, file: File): Promise<NoteAttachment> {
    if (!this.isConnected() || !this.client) {
      throw new Error('Supabase가 연동되지 않았거나 비활성화되어 있습니다. 먼저 Supabase 설정을 완료해주세요.');
    }

    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${noteId}/${Date.now()}-${cleanFileName}`;

    const { error } = await this.client.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      throw new Error(`파일 업로드 실패: ${error.message}`);
    }

    const { data: urlData } = this.client.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    return {
      id: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      storagePath,
      url: urlData.publicUrl,
      createdAt: Date.now(),
    };
  }

  public async downloadAttachment(storagePath: string): Promise<Blob> {
    if (!this.isConnected() || !this.client) {
      throw new Error('Supabase가 연동되지 않았거나 비활성화되어 있습니다.');
    }

    const { data, error } = await this.client.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .download(storagePath);

    if (error) {
      throw new Error(`파일 다운로드 실패: ${error.message}`);
    }

    return data;
  }

  public async deleteAttachment(storagePath: string): Promise<boolean> {
    if (!this.isConnected() || !this.client) return false;

    const { error } = await this.client.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .remove([storagePath]);

    if (error) {
      console.warn('[Supabase] 스토리지 파일 삭제 실패:', error);
      return false;
    }
    return true;
  }

  public async upsertProject(project: Project): Promise<boolean> {
    return this.upsertProjects([project]);
  }

  public async upsertProjects(projects: Project[], force = false): Promise<boolean> {
    if (!this.isConnected() || !this.client || projects.length === 0) return false;
    try {
      const changedProjects = force
        ? projects
        : projects.filter((p) => this.lastSyncedProjectAt.get(p.id) !== p.updatedAt);

      if (changedProjects.length === 0) return true;

      const rows = changedProjects.map((p) => this.projectToRow(p));
      for (const p of changedProjects) {
        this.lastSyncedProjectAt.set(p.id, p.updatedAt);
      }

      const { error } = await this.client.from('bullsnote_projects').upsert(rows, { onConflict: 'id' });
      if (error) {
        console.warn('[Supabase] 프로젝트 동기화 실패:', error);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[Supabase] 프로젝트 upsert 예외:', e);
      return false;
    }
  }

  public async deleteProject(id: string): Promise<boolean> {
    if (!this.isConnected() || !this.client) return false;
    try {
      this.lastSyncedProjectAt.delete(id);
      const { error } = await this.client.from('bullsnote_projects').delete().eq('id', id);
      if (error) {
        console.warn('[Supabase] 프로젝트 삭제 동기화 실패:', error);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[Supabase] 프로젝트 delete 예외:', e);
      return false;
    }
  }

  // --- 메타데이터 기반 스마트 증분 동기화 (Metadata-First Delta Sync) ---
  public async syncAll(
    localNotes: Note[],
    localProjects: Project[],
  ): Promise<{
    success: boolean;
    notes: Note[];
    projects: Project[];
    uploadedCount: number;
    downloadedCount: number;
    hasRemoteChanges: boolean;
    error?: string;
  }> {
    if (!this.isConnected() || !this.client) {
      return {
        success: false,
        notes: localNotes,
        projects: localProjects,
        uploadedCount: 0,
        downloadedCount: 0,
        hasRemoteChanges: false,
        error: 'Supabase가 연동되지 않았거나 비활성화되어 있습니다.',
      };
    }

    try {
      // 1. 원격 프로젝트 조회 및 원격 노트의 경량 메타데이터(id, updated_at)만 우선 조회
      // (전체 본문 SELECT * 를 피하여 Database Output 사용량을 99% 이상 절감)
      const { data: remoteProjectsRaw, error: projError } = await this.client
        .from('bullsnote_projects')
        .select(PROJECT_SYNC_COLUMNS);

      if (projError) {
        throw new Error(`원격 프로젝트 조회 실패: ${projError.message}`);
      }

      const { data: remoteNotesMetaRaw, error: metaError } = await this.client
        .from('bullsnote_notes')
        .select('id, updated_at');

      if (metaError) {
        throw new Error(`원격 노트 메타데이터 조회 실패: ${metaError.message}`);
      }

      const remoteNotesMeta = (remoteNotesMetaRaw as DbNoteMetaRow[]) || [];
      const localNoteMap = new Map<string, Note>(localNotes.map((n) => [n.id, n]));
      const localProjectMap = new Map<string, Project>(localProjects.map((p) => [p.id, p]));

      // 2. 실제로 다운로드가 필요한 노트 ID만 선별 (신규 노트 또는 서버 버전이 더 최신인 노트)
      const idsToDownload: string[] = [];

      const verifierMeta = remoteNotesMeta.find((r) => r.id === '__bullsnote_security_verifier__');
      const localVerifier = localStorage.getItem(VERIFIER_STORAGE_KEY);
      if (
        verifierMeta &&
        (!localVerifier || Number(verifierMeta.updated_at) > this.lastSyncedVerifierAt)
      ) {
        idsToDownload.push('__bullsnote_security_verifier__');
      }

      const userNotesMeta = remoteNotesMeta.filter((r) => r.id !== '__bullsnote_security_verifier__');

      for (const meta of userNotesMeta) {
        const remoteUpdatedAt = Number(meta.updated_at) || 0;
        const localNote = localNoteMap.get(meta.id);
        if (
          !localNote ||
          remoteUpdatedAt > (localNote.updatedAt || 0) ||
          CryptoService.isCorruptedPlaceholder(localNote.content)
        ) {
          idsToDownload.push(meta.id);
        } else {
          // 이미 최신 버전을 로컬에 보유 중이므로 본문 다운로드 생략 및 타임스탬프 캐시 갱신
          this.lastSyncedNoteAt.set(meta.id, remoteUpdatedAt);
        }
      }

      // 3. 선별된 변경 노트만 배치(100개 단위)로 본문 조회 (history 컬럼 제외)
      const downloadedNotesMap = new Map<string, Note>();
      const BATCH_SIZE = 100;
      for (let i = 0; i < idsToDownload.length; i += BATCH_SIZE) {
        const chunk = idsToDownload.slice(i, i + BATCH_SIZE);
        const { data: chunkRows, error: chunkErr } = await this.client
          .from('bullsnote_notes')
          .select(NOTE_SYNC_COLUMNS)
          .in('id', chunk);

        if (chunkErr) {
          throw new Error(`원격 노트 상세 조회 실패: ${chunkErr.message}`);
        }

        for (const row of (chunkRows as DbNoteRow[]) || []) {
          if (row.id === '__bullsnote_security_verifier__') {
            if (row.content && CryptoService.isEncrypted(row.content)) {
              this.lastSyncedVerifier = row.content;
              this.lastSyncedVerifierAt = Number(row.updated_at) || Date.now();
              try {
                localStorage.setItem(VERIFIER_STORAGE_KEY, row.content);
              } catch {}
            }
            continue;
          }
          const existingLocal = localNoteMap.get(row.id);
          const converted = await this.rowToNote(row, existingLocal);
          downloadedNotesMap.set(row.id, converted);
          this.lastSyncedNoteAt.set(row.id, converted.updatedAt);
        }
      }

      const remoteProjects: Project[] = ((remoteProjectsRaw as DbProjectRow[]) || []).map((r) => {
        const p = this.rowToProject(r);
        this.lastSyncedProjectAt.set(p.id, p.updatedAt);
        return p;
      });

      let uploadedCount = 0;
      const downloadedCount = downloadedNotesMap.size;
      const serverHasData = remoteProjects.length > 0 || userNotesMeta.length > 0;

      // 4. 프로젝트 동기화 병합
      const projectMap = new Map<string, Project>();
      const projectsToUpload: Project[] = [];
      let projectsChangedFromRemote = remoteProjects.length !== localProjects.length;

      for (const p of remoteProjects) {
        const lp = localProjectMap.get(p.id);
        if (!lp || lp.updatedAt !== p.updatedAt || lp.name !== p.name || lp.icon !== p.icon) {
          projectsChangedFromRemote = true;
        }
        projectMap.set(p.id, p);
      }

      if (serverHasData) {
        for (const lp of localProjects) {
          const rp = projectMap.get(lp.id);
          if (!rp) {
            projectMap.set(lp.id, lp);
            projectsToUpload.push(lp);
          } else if (lp.updatedAt > rp.updatedAt && lp.id !== TODO_PROJECT_ID) {
            projectMap.set(lp.id, lp);
            projectsToUpload.push(lp);
          }
        }
      } else {
        for (const lp of localProjects) {
          projectMap.set(lp.id, lp);
          projectsToUpload.push(lp);
        }
      }

      // 5. 노트 동기화 병합
      const noteMap = new Map<string, Note>();
      const notesToUpload: Note[] = [];
      const remoteMetaMap = new Map<string, number>(
        userNotesMeta.map((m) => [m.id, Number(m.updated_at) || 0]),
      );

      // 원격에 존재하는 노트들을 먼저 구성 (다운로드된 최신 노트 또는 기존 로컬 최신 노트)
      for (const meta of userNotesMeta) {
        const downloaded = downloadedNotesMap.get(meta.id);
        if (downloaded) {
          noteMap.set(meta.id, downloaded);
        } else {
          const local = localNoteMap.get(meta.id);
          if (local) {
            noteMap.set(meta.id, local);
          }
        }
      }

      if (userNotesMeta.length > 0) {
        for (const ln of localNotes) {
          if (CryptoService.isCorruptedPlaceholder(ln.content)) continue;

          const remoteUpdatedAt = remoteMetaMap.get(ln.id);
          if (remoteUpdatedAt === undefined) {
            // 서버에 없는 로컬 전용 노트
            const isUnmodifiedSeed =
              (ln.id === 'seed-1' && ln.title.includes('환영')) ||
              (ln.id === 'seed-1-1' && ln.title.includes('치트시트')) ||
              (ln.id.startsWith('seed-') && (ln.title.includes('환영') || ln.title.includes('치트시트')));
            if (!isUnmodifiedSeed) {
              noteMap.set(ln.id, ln);
              notesToUpload.push(ln);
            }
          } else {
            // 서버에 이미 있는 노트: 로컬이 실제로 더 최신이고 시스템 기본 그룹 노트가 아닐 때만 업로드
            if (ln.updatedAt > remoteUpdatedAt && !isSystemGroupNote(ln)) {
              noteMap.set(ln.id, ln);
              notesToUpload.push(ln);
            }
          }
        }
      } else {
        // 서버에 노트가 전혀 없는 경우 (새 DB 최초 연동)
        for (const ln of localNotes) {
          if (!CryptoService.isCorruptedPlaceholder(ln.content)) {
            noteMap.set(ln.id, ln);
            notesToUpload.push(ln);
          }
        }
      }

      if (noteMap.size === 0 && localNotes.length > 0) {
        for (const ln of localNotes) {
          noteMap.set(ln.id, ln);
          notesToUpload.push(ln);
        }
      }

      // 6. 변경된 항목들만 최소 업로드 실행
      if (projectsToUpload.length > 0) {
        const ok = await this.upsertProjects(projectsToUpload);
        if (!ok) throw new Error('프로젝트 업로드에 실패했습니다.');
        uploadedCount += projectsToUpload.length;
      }

      if (notesToUpload.length > 0) {
        const ok = await this.upsertNotes(notesToUpload);
        if (!ok) throw new Error('노트 업로드에 실패했습니다.');
        uploadedCount += notesToUpload.length;
      }

      // 7. 최종 병합 리스트 생성
      let mergedProjects = Array.from(projectMap.values());
      if (mergedProjects.length === 0) {
        const defaultProj: Project = {
          id: 'default',
          name: '개인 메모',
          icon: '📁',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        mergedProjects = [defaultProj];
        await this.upsertProjects([defaultProj]);
      }

      const mergedNotes = Array.from(noteMap.values());
      const notesCountChanged = mergedNotes.length !== localNotes.length;
      const hasRemoteChanges =
        downloadedCount > 0 || notesCountChanged || projectsChangedFromRemote;

      // 8. 동기화 성공 타임스탬프만 경량 기록 (saveConfig 호출로 인한 Realtime 재연결 루프 원천 차단!)
      this.updateLastSyncedAt(Date.now());

      return {
        success: true,
        notes: mergedNotes,
        projects: mergedProjects,
        uploadedCount,
        downloadedCount,
        hasRemoteChanges,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        notes: localNotes,
        projects: localProjects,
        uploadedCount: 0,
        downloadedCount: 0,
        hasRemoteChanges: false,
        error: msg,
      };
    }
  }
}

export const SupabaseService = new SupabaseSyncManager();
