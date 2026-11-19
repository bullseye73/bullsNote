import { getDescendantIds, Note } from './Note';

export interface PopoutParams {
  isPopout: boolean;
  noteId: string | null;
}

/**
 * URL 쿼리스트링에서 독립 창(popout) 모드 여부와 대상 noteId를 파싱한다.
 */
export function parsePopoutParams(search: string): PopoutParams {
  if (!search) {
    return { isPopout: false, noteId: null };
  }
  const params = new URLSearchParams(search);
  const isPopout = params.get('popout') === '1';
  const rawNoteId = params.get('noteId');
  const noteId = rawNoteId && rawNoteId.trim().length > 0 ? rawNoteId.trim() : null;
  return { isPopout, noteId };
}

export interface MergeRemoteNoteResult {
  notes: Note[];
  changed: boolean;
  appliedNote: Note | null;
}

/**
 * 다른 창(BroadcastChannel)에서 수신한 노트를 현재 목록에 병합한다.
 * - 기존 노트가 없으면 목록 맨 앞에 추가한다.
 * - 기존 노트가 있으면 incoming.updatedAt > existing.updatedAt 인 경우에만 덮어쓴다.
 */
export function mergeRemoteWindowNote(notes: Note[], incoming: Note): MergeRemoteNoteResult {
  if (!incoming || typeof incoming.id !== 'string' || !incoming.id) {
    return { notes, changed: false, appliedNote: null };
  }

  const existing = notes.find((n) => n.id === incoming.id);
  if (!existing) {
    return {
      notes: [incoming, ...notes],
      changed: true,
      appliedNote: incoming,
    };
  }

  if (incoming.updatedAt > existing.updatedAt) {
    return {
      notes: notes.map((n) => (n.id === incoming.id ? incoming : n)),
      changed: true,
      appliedNote: incoming,
    };
  }

  return { notes, changed: false, appliedNote: null };
}

export interface RemoveRemoteNoteResult {
  notes: Note[];
  changed: boolean;
  removedIds: Set<string>;
}

/**
 * 다른 창에서 삭제된 노트(및 하위 노트)를 현재 목록에서 제거한다.
 */
export function removeRemoteWindowNote(notes: Note[], noteId: string): RemoveRemoteNoteResult {
  if (!noteId || !notes.some((n) => n.id === noteId)) {
    return { notes, changed: false, removedIds: new Set() };
  }

  const doomed = getDescendantIds(notes, noteId);
  const remaining = notes.filter((n) => !doomed.has(n.id));
  return {
    notes: remaining,
    changed: remaining.length !== notes.length,
    removedIds: doomed,
  };
}
