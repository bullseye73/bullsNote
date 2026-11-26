// MODEL: Supabase Auth & Cloud Sync 서비스
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Note, Project } from './Note';
import { dedupeSeedTodos } from './NoteRepository';
import { CustomTodoStatus, TodoStatusLabels } from './TodoService';

export const SUPABASE_CONFIG_STORAGE_KEY = 'bullsnote.supabase.config.v1';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  source: 'env' | 'localStorage';
}

export interface SupabaseUserInfo {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  provider?: string;
}

export interface RemoteNoteRow {
  id: string;
  user_id?: string;
  data: Note;
  updated_at: number;
  deleted: boolean;
}

export interface RemoteProjectRow {
  id: string;
  user_id?: string;
  data: Project;
  updated_at: number;
  deleted: boolean;
}

export interface SupabaseSettingsPayload {
  todoStatusLabels?: TodoStatusLabels;
  customTodoStatuses?: CustomTodoStatus[];
  updatedAt?: number;
}

export interface RemoteSettingsRow {
  user_id?: string;
  data: SupabaseSettingsPayload;
  updated_at: number;
  deleted?: boolean;
}

export type PrimarySyncEngine = 'supabase' | 'local';

export function resolvePrimarySyncEngine(
  supabaseUser: SupabaseUserInfo | null | undefined,
  _googleDriveEnabled?: boolean,
): PrimarySyncEngine {
  return supabaseUser ? 'supabase' : 'local';
}

export interface AuthResult {
  success: boolean;
  user?: SupabaseUserInfo | null;
  needsEmailConfirmation?: boolean;
  alreadyRegistered?: boolean;
  error?: string;
}

let cachedClient: SupabaseClient | null = null;
let cachedClientKey = '';

function getRedirectUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.location.origin + window.location.pathname;
}

function mapUser(user: User | null | undefined): SupabaseUserInfo | null {
  if (!user) return null;
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const name =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    undefined;
  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) ||
    (typeof meta.picture === 'string' && meta.picture.trim()) ||
    undefined;
  const provider =
    typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : undefined;
  return {
    id: user.id,
    email: user.email || undefined,
    name,
    avatarUrl,
    provider,
  };
}

export function resolveSupabaseConfig(envOverride?: {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}): SupabaseConfig | null {
  const envSource =
    envOverride ??
    ((typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
      {});

  const envUrl = typeof envSource.VITE_SUPABASE_URL === 'string' ? envSource.VITE_SUPABASE_URL.trim() : '';
  const envKey =
    typeof envSource.VITE_SUPABASE_ANON_KEY === 'string' ? envSource.VITE_SUPABASE_ANON_KEY.trim() : '';

  if (envUrl && envKey) {
    return { url: envUrl, anonKey: envKey, source: 'env' };
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { url?: unknown; anonKey?: unknown };
        const url = typeof parsed.url === 'string' ? parsed.url.trim() : '';
        const anonKey = typeof parsed.anonKey === 'string' ? parsed.anonKey.trim() : '';
        if (url && anonKey) {
          return { url, anonKey, source: 'localStorage' };
        }
      }
    } catch {
      /* ignore invalid JSON */
    }
  }

  return null;
}

export function saveSupabaseConfig(url: string, anonKey: string): SupabaseConfig | null {
  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim();
  if (typeof localStorage !== 'undefined') {
    if (!cleanUrl || !cleanKey) {
      localStorage.removeItem(SUPABASE_CONFIG_STORAGE_KEY);
    } else {
      localStorage.setItem(
        SUPABASE_CONFIG_STORAGE_KEY,
        JSON.stringify({ url: cleanUrl, anonKey: cleanKey }),
      );
    }
  }
  cachedClient = null;
  cachedClientKey = '';
  return resolveSupabaseConfig();
}

export function isSupabaseConfigured(): boolean {
  return resolveSupabaseConfig() !== null;
}

export function getSupabaseClient(): SupabaseClient | null {
  const cfg = resolveSupabaseConfig();
  if (!cfg) {
    cachedClient = null;
    cachedClientKey = '';
    return null;
  }
  const key = `${cfg.url}|${cfg.anonKey}`;
  if (cachedClient && cachedClientKey === key) {
    return cachedClient;
  }
  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  cachedClientKey = key;
  return cachedClient;
}

export function formatSupabaseError(err: unknown): string {
  if (!err) return '알 수 없는 오류가 발생했습니다.';
  const rawMessage =
    typeof err === 'string'
      ? err
      : typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : String(err);

  const msg = rawMessage.trim();
  const lower = msg.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return '이메일 또는 비밀번호가 올바르지 않습니다. (Google로 가입한 계정이라면 [Google로 계속하기] 또는 [매직링크]를 이용해주세요)';
  }
  if (lower.includes('email not confirmed')) {
    return '이메일 인증이 완료되지 않았습니다. 메일함에서 인증 링크를 확인해주세요.';
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return '이미 가입된 이메일 주소입니다.';
  }
  if (lower.includes('password should be at least')) {
    return '비밀번호는 최소 6자 이상이어야 합니다.';
  }
  if (lower.includes('unable to validate email address') || lower.includes('invalid email')) {
    return '올바른 이메일 주소 형식이 아닙니다.';
  }
  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('for security purposes, you can only request this after')
  ) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  }
  if (lower.includes('signup is disabled') || lower.includes('signups not allowed')) {
    return '현재 신규 회원가입이 비활성화되어 있습니다.';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network request failed')) {
    return '네트워크 연결을 확인해주세요. Supabase URL이 올바른지도 확인해보세요.';
  }
  if (lower.includes('provider is not enabled')) {
    return '해당 로그인 방식(Provider)이 Supabase 대시보드에서 활성화되지 않았습니다.';
  }
  return msg || '인증 처리 중 오류가 발생했습니다.';
}

export async function getCurrentUser(): Promise<SupabaseUserInfo | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data: sessionData } = await client.auth.getSession();
    if (sessionData?.session?.user) {
      return mapUser(sessionData.session.user);
    }
    const { data, error } = await client.auth.getUser();
    if (error) return null;
    return mapUser(data.user);
  } catch {
    return null;
  }
}

export function onAuthStateChange(cb: (user: SupabaseUserInfo | null) => void): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    cb(mapUser(session?.user));
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

export async function signUpWithEmail(email: string, password: string, name?: string): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase 연결 설정(URL / Anon Key)이 필요합니다.' };
  }
  try {
    const cleanName = name?.trim();
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: getRedirectUrl(),
        ...(cleanName ? { data: { full_name: cleanName, name: cleanName } } : {}),
      },
    });
    if (error) {
      return { success: false, error: formatSupabaseError(error) };
    }
    // Supabase는 이메일 인증이 켜진 상태에서 이미 존재하는 이메일로 signUp 호출 시
    // 에러 대신 identities: []인 가짜 user를 반환하며 메일을 재발송하지 않는다.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return {
        success: false,
        alreadyRegistered: true,
        error:
          '이미 가입된 이메일입니다. Google로 가입했다면 [Google로 계속하기]를 누르시고, 비밀번호를 잊었거나 이메일 인증 전이라면 아래 버튼을 이용해주세요.',
      };
    }
    const needsEmailConfirmation = Boolean(data.user && !data.session);
    return {
      success: true,
      user: mapUser(data.user),
      needsEmailConfirmation,
    };
  } catch (err) {
    return { success: false, error: formatSupabaseError(err) };
  }
}

export async function resendSignupConfirmation(email: string): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase 연결 설정(URL / Anon Key)이 필요합니다.' };
  }
  const trimmed = email.trim();
  if (!trimmed) {
    return { success: false, error: '인증 메일을 받을 이메일 주소를 입력해주세요.' };
  }
  try {
    const { error } = await client.auth.resend({
      type: 'signup',
      email: trimmed,
      options: {
        emailRedirectTo: getRedirectUrl(),
      },
    });
    if (error) {
      return { success: false, error: formatSupabaseError(error) };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: formatSupabaseError(err) };
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase 연결 설정(URL / Anon Key)이 필요합니다.' };
  }
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      return { success: false, error: formatSupabaseError(error) };
    }
    return {
      success: true,
      user: mapUser(data.user),
    };
  } catch (err) {
    return { success: false, error: formatSupabaseError(err) };
  }
}

export async function signInWithMagicLink(email: string): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase 연결 설정(URL / Anon Key)이 필요합니다.' };
  }
  try {
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: getRedirectUrl(),
      },
    });
    if (error) {
      return { success: false, error: formatSupabaseError(error) };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: formatSupabaseError(err) };
  }
}

export async function signInWithGoogle(): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase 연결 설정(URL / Anon Key)이 필요합니다.' };
  }
  try {
    const googleAuth = typeof window !== 'undefined' ? window.bullsNote?.googleAuth : undefined;
    if (googleAuth?.prepareSupabaseLoopback && googleAuth?.awaitSupabaseCallback) {
      const prep = await googleAuth.prepareSupabaseLoopback();
      if (!prep.success || !prep.callbackUrl) {
        return { success: false, error: prep.error || '루프백 인증 서버를 시작할 수 없습니다.' };
      }

      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: prep.callbackUrl,
          skipBrowserRedirect: true,
        },
      });
      if (error) {
        return { success: false, error: formatSupabaseError(error) };
      }
      if (!data?.url) {
        return { success: false, error: 'Google 인증 URL을 생성하지 못했습니다.' };
      }

      const cb = await googleAuth.awaitSupabaseCallback(data.url);
      if (!cb.success || !cb.code) {
        return { success: false, error: cb.error || 'Google 인증이 완료되지 않았습니다.' };
      }

      const { data: sessionData, error: exchangeError } = await client.auth.exchangeCodeForSession(cb.code);
      if (exchangeError) {
        return { success: false, error: formatSupabaseError(exchangeError) };
      }
      return { success: true, user: mapUser(sessionData?.user) };
    }

    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getRedirectUrl(),
      },
    });
    if (error) {
      return { success: false, error: formatSupabaseError(error) };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: formatSupabaseError(err) };
  }
}

export async function resetPassword(email: string): Promise<AuthResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase 연결 설정(URL / Anon Key)이 필요합니다.' };
  }
  try {
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getRedirectUrl(),
    });
    if (error) {
      return { success: false, error: formatSupabaseError(error) };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: formatSupabaseError(err) };
  }
}

export async function signOut(): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: true };
  try {
    const { error } = await client.auth.signOut();
    if (error) return { success: false, error: formatSupabaseError(error) };
    return { success: true };
  } catch (err) {
    return { success: false, error: formatSupabaseError(err) };
  }
}

export function mergeNotesWithRemote(
  localNotes: Note[],
  remoteRows: RemoteNoteRow[],
): { notes: Note[]; toPush: Note[]; removedSeedIds: string[] } {
  const remoteMap = new Map<string, RemoteNoteRow>();
  for (const row of remoteRows) {
    if (row && typeof row.id === 'string') {
      remoteMap.set(row.id, row);
    }
  }

  const localMap = new Map<string, Note>();
  for (const note of localNotes) {
    localMap.set(note.id, note);
  }

  const merged: Note[] = [];
  const toPush: Note[] = [];

  for (const local of localNotes) {
    const remote = remoteMap.get(local.id);
    if (!remote) {
      merged.push(local);
      toPush.push(local);
      continue;
    }

    const remoteUpdatedAt = Number(remote.updated_at || remote.data?.updatedAt || 0);
    const localUpdatedAt = Number(local.updatedAt || 0);

    if (remote.deleted) {
      if (remoteUpdatedAt > localUpdatedAt) {
        // 원격 삭제 툼스톤이 더 최신이면 로컬에서도 제거
        continue;
      }
      // 로컬 수정이 삭제 시각보다 최신이면 복원 및 푸시
      merged.push(local);
      toPush.push(local);
      continue;
    }

    if (remoteUpdatedAt > localUpdatedAt && remote.data && typeof remote.data === 'object') {
      merged.push({
        ...remote.data,
        id: remote.id,
        updatedAt: remoteUpdatedAt,
      });
    } else if (localUpdatedAt > remoteUpdatedAt) {
      merged.push(local);
      toPush.push(local);
    } else {
      merged.push(local);
    }
  }

  for (const remote of remoteRows) {
    if (!remote || typeof remote.id !== 'string') continue;
    if (localMap.has(remote.id) || remote.deleted) continue;
    if (remote.data && typeof remote.data === 'object') {
      const remoteUpdatedAt = Number(remote.updated_at || remote.data.updatedAt || Date.now());
      merged.push({
        ...remote.data,
        id: remote.id,
        updatedAt: remoteUpdatedAt,
      });
    }
  }

  const deduped = dedupeSeedTodos(merged);
  const removedSet = new Set(deduped.removedIds);

  return {
    notes: deduped.notes,
    toPush: removedSet.size > 0 ? toPush.filter((n) => !removedSet.has(n.id)) : toPush,
    removedSeedIds: deduped.removedIds,
  };
}

export function mergeProjectsWithRemote(
  localProjects: Project[],
  remoteRows: RemoteProjectRow[],
): { projects: Project[]; toPush: Project[] } {
  const remoteMap = new Map<string, RemoteProjectRow>();
  for (const row of remoteRows) {
    if (row && typeof row.id === 'string') {
      remoteMap.set(row.id, row);
    }
  }

  const localMap = new Map<string, Project>();
  for (const proj of localProjects) {
    localMap.set(proj.id, proj);
  }

  const merged: Project[] = [];
  const toPush: Project[] = [];

  for (const local of localProjects) {
    const remote = remoteMap.get(local.id);
    if (!remote) {
      merged.push(local);
      toPush.push(local);
      continue;
    }

    const remoteUpdatedAt = Number(remote.updated_at || remote.data?.updatedAt || 0);
    const localUpdatedAt = Number(local.updatedAt || 0);

    if (remote.deleted) {
      if (remoteUpdatedAt > localUpdatedAt) {
        continue;
      }
      merged.push(local);
      toPush.push(local);
      continue;
    }

    if (remoteUpdatedAt > localUpdatedAt && remote.data && typeof remote.data === 'object') {
      merged.push({
        ...remote.data,
        id: remote.id,
        updatedAt: remoteUpdatedAt,
      });
    } else if (localUpdatedAt > remoteUpdatedAt) {
      merged.push(local);
      toPush.push(local);
    } else {
      merged.push(local);
    }
  }

  for (const remote of remoteRows) {
    if (!remote || typeof remote.id !== 'string') continue;
    if (localMap.has(remote.id) || remote.deleted) continue;
    if (remote.data && typeof remote.data === 'object') {
      const remoteUpdatedAt = Number(remote.updated_at || remote.data.updatedAt || Date.now());
      merged.push({
        ...remote.data,
        id: remote.id,
        updatedAt: remoteUpdatedAt,
      });
    }
  }

  return { projects: merged, toPush };
}

export async function pullAll(userId: string): Promise<{
  notes: RemoteNoteRow[];
  projects: RemoteProjectRow[];
  settings: RemoteSettingsRow | null;
}> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase가 설정되지 않았습니다.');
  }

  const [notesRes, projectsRes, settingsRes] = await Promise.all([
    client.from('bullsnote_notes').select('id, user_id, data, updated_at, deleted').eq('user_id', userId),
    client.from('bullsnote_projects').select('id, user_id, data, updated_at, deleted').eq('user_id', userId),
    client
      .from('bullsnote_settings')
      .select('user_id, data, updated_at, deleted')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (notesRes.error) throw new Error(formatSupabaseError(notesRes.error));
  if (projectsRes.error) throw new Error(formatSupabaseError(projectsRes.error));
  if (settingsRes.error) throw new Error(formatSupabaseError(settingsRes.error));

  return {
    notes: (notesRes.data ?? []) as RemoteNoteRow[],
    projects: (projectsRes.data ?? []) as RemoteProjectRow[],
    settings: (settingsRes.data ?? null) as RemoteSettingsRow | null,
  };
}

const UPSERT_CHUNK_SIZE = 150;

export async function upsertNotes(userId: string, notes: Note[]): Promise<void> {
  if (notes.length === 0) return;
  const client = getSupabaseClient();
  if (!client) return;

  for (let i = 0; i < notes.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = notes.slice(i, i + UPSERT_CHUNK_SIZE).map((n) => ({
      user_id: userId,
      id: n.id,
      data: n,
      updated_at: n.updatedAt || Date.now(),
      deleted: false,
    }));
    const { error } = await client.from('bullsnote_notes').upsert(chunk, { onConflict: 'user_id,id' });
    if (error) throw new Error(formatSupabaseError(error));
  }
}

export async function softDeleteNotes(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const client = getSupabaseClient();
  if (!client) return;

  const now = Date.now();
  const rows = ids.map((id) => ({
    user_id: userId,
    id,
    data: {},
    updated_at: now,
    deleted: true,
  }));
  const { error } = await client.from('bullsnote_notes').upsert(rows, { onConflict: 'user_id,id' });
  if (error) throw new Error(formatSupabaseError(error));
}

export async function upsertProjects(userId: string, projects: Project[]): Promise<void> {
  if (projects.length === 0) return;
  const client = getSupabaseClient();
  if (!client) return;

  const rows = projects.map((p) => ({
    user_id: userId,
    id: p.id,
    data: p,
    updated_at: p.updatedAt || Date.now(),
    deleted: false,
  }));
  const { error } = await client.from('bullsnote_projects').upsert(rows, { onConflict: 'user_id,id' });
  if (error) throw new Error(formatSupabaseError(error));
}

export async function softDeleteProjects(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const client = getSupabaseClient();
  if (!client) return;

  const now = Date.now();
  const rows = ids.map((id) => ({
    user_id: userId,
    id,
    data: {},
    updated_at: now,
    deleted: true,
  }));
  const { error } = await client.from('bullsnote_projects').upsert(rows, { onConflict: 'user_id,id' });
  if (error) throw new Error(formatSupabaseError(error));
}

export async function upsertSettings(userId: string, settings: SupabaseSettingsPayload): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  const updatedAt = settings.updatedAt || Date.now();
  const { error } = await client.from('bullsnote_settings').upsert(
    {
      user_id: userId,
      data: { ...settings, updatedAt },
      updated_at: updatedAt,
      deleted: false,
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(formatSupabaseError(error));
}

export const SupabaseService = {
  resolveSupabaseConfig,
  saveSupabaseConfig,
  isSupabaseConfigured,
  getSupabaseClient,
  getCurrentUser,
  onAuthStateChange,
  signUpWithEmail,
  resendSignupConfirmation,
  signInWithEmail,
  signInWithMagicLink,
  signInWithGoogle,
  resetPassword,
  signOut,
  formatSupabaseError,
  mergeNotesWithRemote,
  mergeProjectsWithRemote,
  pullAll,
  upsertNotes,
  softDeleteNotes,
  upsertProjects,
  softDeleteProjects,
  upsertSettings,
};
