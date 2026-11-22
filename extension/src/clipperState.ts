import type { ClipMode } from './clipperClient';

export interface ClipperDraft {
  url: string;
  title: string;
  mode: ClipMode;
  tags: string;
  content: string;
  updateExisting: boolean;
  updatedAt: number;
}

export type ClipperStatusKind = 'idle' | 'saving' | 'success' | 'queued' | 'error';

export interface ClipperStatus {
  kind: ClipperStatusKind;
  message: string;
  at: number;
}

const CLIPPER_DRAFT_KEY = 'bullsnote_clipper_draft';
const CLIPPER_STATUS_KEY = 'bullsnote_clipper_status';

export const DEFAULT_DRAFT: ClipperDraft = {
  url: '',
  title: '',
  mode: 'note',
  tags: '',
  content: '',
  updateExisting: true,
  updatedAt: 0,
};

export const DEFAULT_STATUS: ClipperStatus = {
  kind: 'idle',
  message: '',
  at: 0,
};

export function getTargetLocationBadge(mode: ClipMode): string {
  if (mode === 'todo') return '저장 위치: 📋 할일관리';
  if (mode === 'daily') return '저장 위치: 📅 Daily Note';
  return '저장 위치: 📁 03_Resources';
}

export function getSuccessSaveMessage(mode: ClipMode, delivered?: boolean): string {
  const dest = mode === 'todo' ? '할일관리' : mode === 'daily' ? 'Daily Note' : '03_Resources';
  if (delivered === false) {
    return `✓ ${dest}에 전송됨 (열려 있는 메인 창 대기 중)`;
  }
  return `✓ ${dest}에 저장/업데이트 요청됨`;
}

function normalizeDraft(raw: unknown): ClipperDraft {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DRAFT };
  const obj = raw as Partial<ClipperDraft>;
  const mode: ClipMode = obj.mode === 'todo' || obj.mode === 'daily' ? obj.mode : 'note';
  return {
    url: typeof obj.url === 'string' ? obj.url : '',
    title: typeof obj.title === 'string' ? obj.title : '',
    mode,
    tags: typeof obj.tags === 'string' ? obj.tags : '',
    content: typeof obj.content === 'string' ? obj.content : '',
    updateExisting: obj.updateExisting !== false,
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
  };
}

function normalizeStatus(raw: unknown): ClipperStatus {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATUS };
  const obj = raw as Partial<ClipperStatus>;
  const kind: ClipperStatusKind =
    obj.kind === 'saving' || obj.kind === 'success' || obj.kind === 'queued' || obj.kind === 'error'
      ? obj.kind
      : 'idle';
  return {
    kind,
    message: typeof obj.message === 'string' ? obj.message : '',
    at: typeof obj.at === 'number' ? obj.at : 0,
  };
}

export async function loadDraft(): Promise<ClipperDraft> {
  if (!chrome?.storage?.local) return { ...DEFAULT_DRAFT };
  const res = await chrome.storage.local.get(CLIPPER_DRAFT_KEY);
  return normalizeDraft(res[CLIPPER_DRAFT_KEY]);
}

export async function saveDraft(patch: Partial<ClipperDraft>): Promise<ClipperDraft> {
  const current = await loadDraft();
  const next: ClipperDraft = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  if (chrome?.storage?.local) {
    await chrome.storage.local.set({ [CLIPPER_DRAFT_KEY]: next });
  }
  return next;
}

export async function loadStatus(): Promise<ClipperStatus> {
  if (!chrome?.storage?.local) return { ...DEFAULT_STATUS };
  const res = await chrome.storage.local.get(CLIPPER_STATUS_KEY);
  return normalizeStatus(res[CLIPPER_STATUS_KEY]);
}

export async function setStatus(
  status: Omit<ClipperStatus, 'at'> & { at?: number },
): Promise<ClipperStatus> {
  const next: ClipperStatus = {
    kind: status.kind,
    message: status.message,
    at: status.at ?? Date.now(),
  };
  if (chrome?.storage?.local) {
    await chrome.storage.local.set({ [CLIPPER_STATUS_KEY]: next });
  }
  return next;
}

export function onClipperStorageChange(
  cb: (changes: { draft?: ClipperDraft; status?: ClipperStatus }) => void,
): () => void {
  if (!chrome?.storage?.onChanged) return () => {};

  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string,
  ) => {
    if (areaName !== 'local') return;
    const payload: { draft?: ClipperDraft; status?: ClipperStatus } = {};
    let hasChange = false;
    if (CLIPPER_DRAFT_KEY in changes) {
      payload.draft = normalizeDraft(changes[CLIPPER_DRAFT_KEY].newValue);
      hasChange = true;
    }
    if (CLIPPER_STATUS_KEY in changes) {
      payload.status = normalizeStatus(changes[CLIPPER_STATUS_KEY].newValue);
      hasChange = true;
    }
    if (hasChange) {
      cb(payload);
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}
