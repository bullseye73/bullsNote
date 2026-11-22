export const DEFAULT_CLIPPER_URL = 'http://127.0.0.1:41905';

export type ClipMode = 'note' | 'todo' | 'daily';

export interface ClipPayload {
  mode: ClipMode;
  title?: string;
  content?: string;
  url?: string;
  tags?: string[];
  quickCaptureText?: string;
  updateExisting?: boolean;
  projectId?: string;
}

export interface StoredClipItem extends ClipPayload {
  id: string;
  savedAt: number;
}

export interface ClipHealth {
  ok: boolean;
  app?: string;
  version?: string;
  port?: number;
  error?: string;
}

export interface SendClipResult {
  ok: boolean;
  delivered?: boolean;
  queued?: boolean;
  error?: string;
}

const PENDING_STORAGE_KEY = 'bullsnote_pending_clips';
const RECENT_STORAGE_KEY = 'bullsnote_recent_clips';
const MAX_PENDING_CLIPS = 100;
const MAX_RECENT_CLIPS = 20;

export function parseTagsInput(raw: string): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const tokens = raw
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean);
  return Array.from(new Set(tokens)).slice(0, 30);
}

/**
 * 클립 페이로드를 BullsNote 호환 마크다운 문자열로 포맷하는 순수 함수
 */
export function formatClipMarkdown(payload: ClipPayload): string {
  const title = (payload.title || '').trim();
  const url = (payload.url || '').trim();
  const content = (payload.content || '').trim();
  const tags = Array.isArray(payload.tags)
    ? Array.from(new Set(payload.tags.map((t) => t.trim().replace(/^#/, '')).filter(Boolean)))
    : [];

  const parts: string[] = [];

  if (title && url) {
    parts.push(`### [${title}](${url})`);
  } else if (title) {
    parts.push(`### ${title}`);
  } else if (url) {
    parts.push(`출처: ${url}`);
  }

  if (title && url) {
    parts.push(`출처: ${url}`);
  }

  if (content) {
    parts.push(content);
  }

  if (tags.length > 0) {
    parts.push(tags.map((t) => `#${t}`).join(' '));
  }

  return parts.join('\n\n').trim();
}

export async function checkHealth(baseUrl = DEFAULT_CLIPPER_URL): Promise<ClipHealth> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as ClipHealth;
    return data && data.ok ? data : { ok: false, error: 'Invalid health response' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'BullsNote 앱에 연결할 수 없습니다.',
    };
  }
}

export async function sendClip(
  payload: ClipPayload,
  baseUrl = DEFAULT_CLIPPER_URL,
): Promise<SendClipResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${baseUrl}/clip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; delivered?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }

    await addRecentClip(payload);
    return { ok: true, delivered: Boolean(data.delivered) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : '전송 실패',
    };
  }
}

interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function getStorageArea(): StorageAreaLike | null {
  const g = globalThis as unknown as {
    chrome?: { storage?: { local?: StorageAreaLike } };
  };
  if (g.chrome && g.chrome.storage && g.chrome.storage.local) {
    return g.chrome.storage.local;
  }
  return null;
}

export async function getPendingClips(): Promise<StoredClipItem[]> {
  const storage = getStorageArea();
  if (!storage) return [];
  const result = await storage.get(PENDING_STORAGE_KEY);
  const list = result[PENDING_STORAGE_KEY];
  return Array.isArray(list) ? (list as StoredClipItem[]) : [];
}

export async function queueClip(payload: ClipPayload): Promise<number> {
  const storage = getStorageArea();
  if (!storage) return 0;
  const existing = await getPendingClips();
  const item: StoredClipItem = {
    ...payload,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
  };
  const next = [...existing, item].slice(-MAX_PENDING_CLIPS);
  await storage.set({ [PENDING_STORAGE_KEY]: next });
  return next.length;
}

export async function flushPendingClips(
  baseUrl = DEFAULT_CLIPPER_URL,
): Promise<{ flushed: number; remaining: number }> {
  const storage = getStorageArea();
  if (!storage) return { flushed: 0, remaining: 0 };

  const pending = await getPendingClips();
  if (pending.length === 0) return { flushed: 0, remaining: 0 };

  const remaining: StoredClipItem[] = [];
  let flushed = 0;

  for (let i = 0; i < pending.length; i += 1) {
    const item = pending[i];
    const { id: _id, savedAt: _savedAt, ...payload } = item;
    const res = await sendClip(payload, baseUrl);
    if (res.ok) {
      flushed += 1;
    } else {
      remaining.push(...pending.slice(i));
      break;
    }
  }

  await storage.set({ [PENDING_STORAGE_KEY]: remaining });
  return { flushed, remaining: remaining.length };
}

export async function addRecentClip(payload: ClipPayload): Promise<void> {
  const storage = getStorageArea();
  if (!storage) return;
  const existing = await getRecentClips();
  const item: StoredClipItem = {
    ...payload,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
  };
  const next = [item, ...existing].slice(0, MAX_RECENT_CLIPS);
  await storage.set({ [RECENT_STORAGE_KEY]: next });
}

export async function getRecentClips(): Promise<StoredClipItem[]> {
  const storage = getStorageArea();
  if (!storage) return [];
  const result = await storage.get(RECENT_STORAGE_KEY);
  const list = result[RECENT_STORAGE_KEY];
  return Array.isArray(list) ? (list as StoredClipItem[]) : [];
}
