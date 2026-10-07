import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Note, Project } from './Note';
import { CryptoService, VERIFIER_STORAGE_KEY } from './CryptoService';

const SUPABASE_CONFIG_STORAGE_KEY = 'bullsnote.supabase.config.v1';

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

export const SUPABASE_SETUP_SQL = `-- BullsNote용 Supabase 테이블 생성 스크립트
-- Supabase 대시보드 -> SQL Editor -> New Query에 붙여넣고 Run을 클릭하세요.

-- 1. 프로젝트 테이블 생성
CREATE TABLE IF NOT EXISTS bullsnote_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📁',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 2. 노트 테이블 생성
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
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 3. RLS(Row Level Security) 설정 및 공개 접근 정책
-- (단일 사용자 로컬-클라우드 동기화를 위한 anon 전체 접근 허용)
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
`;

interface DbProjectRow {
  id: string;
  name: string;
  icon: string | null;
  created_at: number;
  updated_at: number;
}

interface DbNoteRow {
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
  history: unknown;
  created_at: number;
  updated_at: number;
}

class SupabaseSyncManager {
  private client: SupabaseClient | null = null;
  private currentConfig: SupabaseConfig = { ...DEFAULT_SUPABASE_CONFIG };

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
    this.currentConfig = cleanConfig;
    localStorage.setItem(SUPABASE_CONFIG_STORAGE_KEY, JSON.stringify(cleanConfig));
    this.initClient();
  }

  public getConfig(): SupabaseConfig {
    return { ...this.currentConfig };
  }

  public isConnected(): boolean {
    return Boolean(this.client && this.currentConfig.enabled && this.currentConfig.url && this.currentConfig.anonKey);
  }

  private initClient(): void {
    const cleanUrl = (this.currentConfig.url || '').trim().replace(/\/+$/, '');
    const cleanKey = (this.currentConfig.anonKey || '').trim();
    if (this.currentConfig.enabled && cleanUrl && cleanKey) {
      try {
        this.client = createClient(cleanUrl, cleanKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
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

  // --- 보안 토큰 서버 동기화 ---
  public async uploadSecurityVerifier(verifierString: string): Promise<boolean> {
    if (!this.isConnected() || !this.client) return false;
    try {
      await this.client.from('bullsnote_notes').upsert(
        {
          id: '__bullsnote_security_verifier__',
          title: '__BULLSNOTE_SECURITY_VERIFIER__',
          content: verifierString,
          project_id: '__sys__',
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        { onConflict: 'id' }
      );
      return true;
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

  private rowToProject(row: DbProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon || '📁',
      createdAt: Number(row.created_at) || Date.now(),
      updatedAt: Number(row.updated_at) || Date.now(),
    };
  }

  private async noteToRow(n: Note): Promise<DbNoteRow> {
    let encryptedContent = n.content || '';
    // 언락 상태이고 평문인 경우에만 암호화 수행 (이미 암호문이거나 잠금 상태면 원본 그대로 보존)
    if (CryptoService.isUnlocked() && !CryptoService.isEncrypted(encryptedContent)) {
      encryptedContent = await CryptoService.encrypt(encryptedContent);
    }
    // 히스토리 스냅샷도 암호화 보장
    let historyToSave = n.history || [];
    if (CryptoService.isUnlocked() && Array.isArray(historyToSave) && historyToSave.length > 0) {
      historyToSave = await Promise.all(
        historyToSave.map(async (h) => {
          if (h.content && !CryptoService.isEncrypted(h.content)) {
            return { ...h, content: await CryptoService.encrypt(h.content) };
          }
          return h;
        })
      );
    }
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
      history: historyToSave,
      created_at: n.createdAt,
      updated_at: n.updatedAt,
    };
  }

  private async rowToNote(row: DbNoteRow): Promise<Note> {
    const rawContent = row.content || '';
    let content = rawContent;
    // 언락되어 있다면 복호화, 잠겨있다면 암호문 그대로 유지하여 데이터 보존! (절대 플레이스홀더 문자열로 덮어쓰지 않음)
    if (CryptoService.isUnlocked() && CryptoService.isEncrypted(rawContent)) {
      content = await CryptoService.decrypt(rawContent);
    }
    let historyLoaded = Array.isArray(row.history) ? (row.history as Note['history']) : [];
    if (CryptoService.isUnlocked() && historyLoaded.length > 0) {
      historyLoaded = await Promise.all(
        historyLoaded.map(async (h) => {
          if (h.content && CryptoService.isEncrypted(h.content)) {
            return { ...h, content: await CryptoService.decrypt(h.content) };
          }
          return h;
        })
      );
    }
    return {
      id: row.id,
      title: row.title || '제목 없음',
      projectId: row.project_id || 'default',
      color: row.color || 'blue',
      reminder: (row.reminder as Note['reminder']) || null,
      content,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      pinned: Boolean(row.pinned),
      favorite: Boolean(row.favorite),
      parentId: row.parent_id || null,
      history: historyLoaded,
      createdAt: Number(row.created_at) || Date.now(),
      updatedAt: Number(row.updated_at) || Date.now(),
    };
  }

  public async upsertNote(note: Note): Promise<boolean> {
    return this.upsertNotes([note]);
  }

  public async upsertNotes(notes: Note[]): Promise<boolean> {
    if (!this.isConnected() || !this.client || notes.length === 0) return false;
    try {
      const rows = await Promise.all(notes.map((n) => this.noteToRow(n)));
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

  public async upsertProject(project: Project): Promise<boolean> {
    return this.upsertProjects([project]);
  }

  public async upsertProjects(projects: Project[]): Promise<boolean> {
    if (!this.isConnected() || !this.client || projects.length === 0) return false;
    try {
      const rows = projects.map((p) => this.projectToRow(p));
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

  // --- 전체 서버 우선 양방향 동기화 (Server-First Bidirectional Sync) ---
  public async syncAll(
    localNotes: Note[],
    localProjects: Project[],
  ): Promise<{
    success: boolean;
    notes: Note[];
    projects: Project[];
    uploadedCount: number;
    downloadedCount: number;
    error?: string;
  }> {
    if (!this.isConnected() || !this.client) {
      return {
        success: false,
        notes: localNotes,
        projects: localProjects,
        uploadedCount: 0,
        downloadedCount: 0,
        error: 'Supabase가 연동되지 않았거나 비활성화되어 있습니다.',
      };
    }

    try {
      // 1. Supabase에서 모든 원격 프로젝트와 노트 조회 (서버가 최우선 원천)
      const { data: remoteProjectsRaw, error: projError } = await this.client
        .from('bullsnote_projects')
        .select('*');

      if (projError) {
        throw new Error(`원격 프로젝트 조회 실패: ${projError.message}`);
      }

      const { data: remoteNotesRaw, error: noteError } = await this.client
        .from('bullsnote_notes')
        .select('*');

      if (noteError) {
        throw new Error(`원격 노트 조회 실패: ${noteError.message}`);
      }

      // 서버에 보안 verifier가 저장되어 있다면 로컬스토리지에 동기화
      const verifierRow = (remoteNotesRaw || []).find((r) => r.id === '__bullsnote_security_verifier__');
      if (verifierRow && verifierRow.content && CryptoService.isEncrypted(verifierRow.content)) {
        try {
          localStorage.setItem(VERIFIER_STORAGE_KEY, verifierRow.content);
        } catch {}
      }

      // 실제 사용자 노트만 필터링 (시스템용 verifier 행 제외)
      const userNotesRaw = (remoteNotesRaw as DbNoteRow[] || []).filter(
        (r) => r.id !== '__bullsnote_security_verifier__'
      );

      const remoteProjects: Project[] = (remoteProjectsRaw as DbProjectRow[] || []).map((r) => this.rowToProject(r));
      const remoteNotes: Note[] = await Promise.all(userNotesRaw.map((r) => this.rowToNote(r)));

      let uploadedCount = 0;
      const downloadedCount = remoteNotes.length;
      const serverHasData = remoteProjects.length > 0 || remoteNotes.length > 0;

      // 2. 프로젝트 동기화 (서버 우선 정책)
      const projectMap = new Map<string, Project>();
      const projectsToUpload: Project[] = [];

      // [서버 최우선] 원격에 있는 프로젝트를 먼저 맵에 등록 (동일 ID 충돌 시 서버 버전 우선)
      for (const p of remoteProjects) {
        projectMap.set(p.id, p);
      }

      if (serverHasData) {
        // 서버에 이미 프로젝트가 있는 경우: 서버에 존재하지 않는 로컬 고유 프로젝트만 업로드 대상에 추가
        for (const lp of localProjects) {
          if (!projectMap.has(lp.id)) {
            projectMap.set(lp.id, lp);
            projectsToUpload.push(lp);
          }
        }
      } else {
        // 서버가 완전히 비어있는 최초 연동: 로컬의 모든 프로젝트를 서버로 업로드
        for (const lp of localProjects) {
          projectMap.set(lp.id, lp);
          projectsToUpload.push(lp);
        }
      }

      // 3. 노트 동기화 (서버 우선 정책 & 서버에 없는 로컬 노트만 업로드)
      const noteMap = new Map<string, Note>();
      const notesToUpload: Note[] = [];

      // [서버 최우선] 원격에 있는 노트를 먼저 맵에 등록 (동일 ID 충돌 시 서버 버전 우선 채택)
      for (const n of remoteNotes) {
        noteMap.set(n.id, n);
      }

      if (remoteNotes.length > 0) {
        // 서버에 기존 노트가 이미 존재하는 경우:
        for (const ln of localNotes) {
          // 손상된 플레이스홀더 노트는 서버에 업로드하지 않음
          if (CryptoService.isCorruptedPlaceholder(ln.content)) continue;

          const remote = noteMap.get(ln.id);
          if (!remote) {
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
            // 서버에 이미 있는 노트: 로컬의 수정 시간이 서버보다 더 최신인 경우 로컬 버전 채택 및 업로드
            if (ln.updatedAt > remote.updatedAt) {
              noteMap.set(ln.id, ln);
              notesToUpload.push(ln);
            }
          }
        }
      } else {
        // 서버에 노트가 전혀 없는 경우 (새 DB 최초 연동):
        // 로컬에 있는 모든 노트를 서버로 최초 업로드
        for (const ln of localNotes) {
          if (!CryptoService.isCorruptedPlaceholder(ln.content)) {
            noteMap.set(ln.id, ln);
            notesToUpload.push(ln);
          }
        }
      }

      // 만약 결과적으로 노트가 하나도 없는데 로컬에 노트가 있었다면 로컬 노트 보존
      if (noteMap.size === 0 && localNotes.length > 0) {
        for (const ln of localNotes) {
          noteMap.set(ln.id, ln);
          notesToUpload.push(ln);
        }
      }

      // 4. 서버에 없는 항목들만 업로드 실행
      if (projectsToUpload.length > 0) {
        const rows = projectsToUpload.map((p) => this.projectToRow(p));
        const { error: upProjErr } = await this.client.from('bullsnote_projects').upsert(rows, { onConflict: 'id' });
        if (upProjErr) throw new Error(`프로젝트 업로드 실패: ${upProjErr.message}`);
        uploadedCount += projectsToUpload.length;
      }

      if (notesToUpload.length > 0) {
        const rows = await Promise.all(notesToUpload.map((n) => this.noteToRow(n)));
        const { error: upNoteErr } = await this.client.from('bullsnote_notes').upsert(rows, { onConflict: 'id' });
        if (upNoteErr) throw new Error(`노트 업로드 실패: ${upNoteErr.message}`);
        uploadedCount += notesToUpload.length;
      }

      // 5. 최종 병합 리스트 생성 (프로젝트가 비어있을 경우 기본 프로젝트 보장)
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
        await this.client.from('bullsnote_projects').upsert([this.projectToRow(defaultProj)], { onConflict: 'id' });
      }

      const mergedNotes = Array.from(noteMap.values());

      // 6. 동기화 성공 타임스탬프 기록
      const now = Date.now();
      const updatedConfig = { ...this.currentConfig, lastSyncedAt: now };
      this.saveConfig(updatedConfig);

      return {
        success: true,
        notes: mergedNotes,
        projects: mergedProjects,
        uploadedCount,
        downloadedCount,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        notes: localNotes,
        projects: localProjects,
        uploadedCount: 0,
        downloadedCount: 0,
        error: msg,
      };
    }
  }
}

export const SupabaseService = new SupabaseSyncManager();
