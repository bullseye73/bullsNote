// MODEL: 도메인 엔티티 (MVC의 M) - 프로젝트 + 트리(parentId) + 히스토리 지원
export interface Project {
  id: string;
  name: string;
  /** 프로젝트 아이콘 (이모지 또는 심볼, 예: 📁, 🚀, 💡, 📝, 🎯 등) */
  icon: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_PROJECT_ID = 'default';

export const DEFAULT_PROJECTS: Project[] = [
  {
    id: DEFAULT_PROJECT_ID,
    name: '기본 프로젝트',
    icon: '📁',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export function createProjectId(): string {
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface PastelColorConfig {
  id: string;
  name: string;
  /** 밝은 파스텔 배경색 */
  bg: string;
  /** 선택 시 강조 테두리 색 */
  border: string;
  /** 파스텔 배경 위의 본문 텍스트 색 (다크모드에서도 완벽한 가독성을 제공하는 짙은 톤) */
  textColor: string;
  /** 파스텔 배경 위의 보조/요약 텍스트 색 */
  dimmedColor: string;
  /** 태그 뱃지 배경색 */
  badgeBg: string;
  /** 태그 뱃지 글자색 */
  badgeColor: string;
  /** 아이콘 버튼 색상 */
  iconColor: string;
}

export const PASTEL_COLORS: Record<string, PastelColorConfig> = {
  blue: {
    id: 'blue',
    name: '스카이 블루',
    bg: '#e7f5ff',
    border: '#339af0',
    textColor: '#183247',
    dimmedColor: '#365873',
    badgeBg: 'rgba(24, 50, 71, 0.12)',
    badgeColor: '#183247',
    iconColor: '#183247',
  },
  mint: {
    id: 'mint',
    name: '민트 그린',
    bg: '#e6fcf5',
    border: '#20c997',
    textColor: '#0c382e',
    dimmedColor: '#2b5c50',
    badgeBg: 'rgba(12, 56, 46, 0.12)',
    badgeColor: '#0c382e',
    iconColor: '#0c382e',
  },
  yellow: {
    id: 'yellow',
    name: '버터 옐로우',
    bg: '#fff9db',
    border: '#fcc419',
    textColor: '#493803',
    dimmedColor: '#6d5718',
    badgeBg: 'rgba(73, 56, 3, 0.12)',
    badgeColor: '#493803',
    iconColor: '#493803',
  },
  peach: {
    id: 'peach',
    name: '피치 오렌지',
    bg: '#ffe8cc',
    border: '#ff922b',
    textColor: '#4e2802',
    dimmedColor: '#78430e',
    badgeBg: 'rgba(78, 40, 2, 0.12)',
    badgeColor: '#4e2802',
    iconColor: '#4e2802',
  },
  pink: {
    id: 'pink',
    name: '파스텔 핑크',
    bg: '#ffe3e3',
    border: '#ff6b6b',
    textColor: '#4c1414',
    dimmedColor: '#7a2929',
    badgeBg: 'rgba(76, 20, 20, 0.12)',
    badgeColor: '#4c1414',
    iconColor: '#4c1414',
  },
  purple: {
    id: 'purple',
    name: '라벤더 퍼플',
    bg: '#f3f0ff',
    border: '#845ef7',
    textColor: '#2f1554',
    dimmedColor: '#522c85',
    badgeBg: 'rgba(47, 21, 84, 0.12)',
    badgeColor: '#2f1554',
    iconColor: '#2f1554',
  },
  gray: {
    id: 'gray',
    name: '소프트 그레이',
    bg: '#f1f3f5',
    border: '#868e96',
    textColor: '#212529',
    dimmedColor: '#495057',
    badgeBg: 'rgba(33, 37, 41, 0.12)',
    badgeColor: '#212529',
    iconColor: '#212529',
  },
};

export function getPastelConfig(colorId?: string): PastelColorConfig {
  return PASTEL_COLORS[colorId || 'blue'] || PASTEL_COLORS.blue;
}

export type NoteReminderRepeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';

export interface NoteReminder {
  /** 알람 목표 시각 (Unix timestamp ms) */
  targetAt: number;
  /** 반복 설정 */
  repeat: NoteReminderRepeat;
  /** 알람 확인/해제 완료 여부 */
  dismissed: boolean;
  /** 스누즈 목표 시각 (스누즈 중일 때 ms, 아니면 null) */
  snoozedUntil?: number | null;
}

export function computeNextReminderTime(currentTimestamp: number, repeat: NoteReminderRepeat): number {
  if (repeat === 'none') return currentTimestamp;
  const d = new Date(currentTimestamp);
  const now = Date.now();

  if (repeat === 'daily') {
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getTime() <= now);
  } else if (repeat === 'weekdays') {
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getDay() === 0 || d.getDay() === 6 || d.getTime() <= now);
  } else if (repeat === 'weekly') {
    do {
      d.setDate(d.getDate() + 7);
    } while (d.getTime() <= now);
  } else if (repeat === 'monthly') {
    do {
      d.setMonth(d.getMonth() + 1);
    } while (d.getTime() <= now);
  }

  return d.getTime();
}

export interface NoteSnapshot {
  title: string;
  /** 마크다운 콘텐츠 */
  content: string;
  tags: string[];
  savedAt: number;
}

export interface NoteAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  storagePath: string;
  url: string;
  createdAt: number;
}

export interface Note {
  id: string;
  title: string;
  /** 소속 프로젝트 id */
  projectId: string;
  /** 노트별 파스텔 색상 키 (blue, mint, yellow, peach, pink, purple, gray) */
  color?: string;
  /** 알람 리마인더 설정 (없거나 해제 시 null/undefined) */
  reminder?: NoteReminder | null;
  /** 마크다운 콘텐츠 */
  content: string;
  /** 소문자 정규화된 태그 (# 제외, 예: "회의록") */
  tags: string[];
  pinned: boolean;
  favorite: boolean;
  /** 트리 구조: 부모 노트 id (최상위는 null) */
  parentId: string | null;
  /** 최신순 스냅샷 (최대 MAX_HISTORY개) */
  history: NoteSnapshot[];
  /** 첨부 파일 목록 (Supabase Storage 등) */
  attachments?: NoteAttachment[];
  createdAt: number;
  updatedAt: number;
}

export const MAX_HISTORY = 30;
/** 히스토리 스냅샷 최소 간격 (연속 타이핑이 매번 쌓이지 않도록) */
export const HISTORY_INTERVAL_MS = 60_000;

export function createNoteId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyNote(partial?: Partial<Note>): Note {
  const now = Date.now();
  return {
    id: createNoteId(),
    title: '제목 없음',
    projectId: DEFAULT_PROJECT_ID,
    color: 'blue',
    reminder: null,
    content: '',
    tags: [],
    pinned: false,
    favorite: false,
    parentId: null,
    history: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export interface TreeNode {
  note: Note;
  children: TreeNode[];
}

export type SortField = 'none' | 'name' | 'createdAt' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

export interface SortOption {
  field: SortField;
  order: SortOrder;
}

export const DEFAULT_SORT_OPTION: SortOption = {
  field: 'none',
  order: 'desc',
};

export function compareProjects(a: Project, b: Project, opt?: SortOption): number {
  if (!a || !b) return 0;
  if (!opt || opt.field === 'none') return 0;
  if (opt.field === 'name') {
    const nameA = a.name || '';
    const nameB = b.name || '';
    const diff = nameA.localeCompare(nameB, 'ko', { sensitivity: 'base' });
    return opt.order === 'asc' ? diff : -diff;
  }
  if (opt.field === 'createdAt') {
    const diff = (a.createdAt || 0) - (b.createdAt || 0);
    return opt.order === 'asc' ? diff : -diff;
  }
  if (opt.field === 'updatedAt') {
    const diff = (a.updatedAt || 0) - (b.updatedAt || 0);
    return opt.order === 'asc' ? diff : -diff;
  }
  return 0;
}

export function compareNotesWithOption(a: Note, b: Note, opt?: SortOption): number {
  if (!a || !b) return 0;
  // 핀 고정 노트는 항상 최우선 정렬 유지
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;

  if (!opt || opt.field === 'none') {
    // 기본 순서: 수정일 내림차순
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  }
  if (opt.field === 'name') {
    const titleA = a.title || '제목 없음';
    const titleB = b.title || '제목 없음';
    const diff = titleA.localeCompare(titleB, 'ko', { sensitivity: 'base' });
    return opt.order === 'asc' ? diff : -diff;
  }
  if (opt.field === 'createdAt') {
    const diff = (a.createdAt || 0) - (b.createdAt || 0);
    return opt.order === 'asc' ? diff : -diff;
  }
  if (opt.field === 'updatedAt') {
    const diff = (a.updatedAt || 0) - (b.updatedAt || 0);
    return opt.order === 'asc' ? diff : -diff;
  }
  return (b.updatedAt || 0) - (a.updatedAt || 0);
}

function sortNotes(a: Note, b: Note): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.updatedAt - a.updatedAt;
}

/** 평탄 리스트 -> 트리 (형제 정렬: sortFn 기준, 기본값은 핀 우선+수정일 내림차순) */
export function buildTree(notes: Note[], sortFn: (a: Note, b: Note) => number = sortNotes): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const n of notes) byId.set(n.id, { note: n, children: [] });
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const pid = node.note.parentId;
    const parent = pid ? byId.get(pid) : undefined;
    // 끊어진 parentId(필터 등으로 부모가 없을 때)는 루트로 취급
    if (parent && parent.note.id !== node.note.id) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (list: TreeNode[]) => {
    list.sort((a, b) => sortFn(a.note, b.note));
    for (const c of list) sortRec(c.children);
  };
  sortRec(roots);
  return roots;
}

/** id 기준 자손 id 집합 (자기 자신 포함, 사이클 방지용 가드 포함) */
export function getDescendantIds(notes: Note[], id: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const n of notes) {
    if (!n.parentId) continue;
    const arr = childrenOf.get(n.parentId) ?? [];
    arr.push(n.id);
    childrenOf.set(n.parentId, arr);
  }
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const c of childrenOf.get(cur) ?? []) {
      if (!out.has(c)) {
        out.add(c);
        stack.push(c);
      }
    }
  }
  return out;
}

/** 루트부터 자신까지의 경로 노트 배열 (브레드크럼용) */
export function getPathTitles(notes: Note[], id: string): string[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const path: string[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur.title || '제목 없음');
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

/** 루트부터 자신까지의 경로 Note 객체 배열 (클릭 가능한 브레드크럼용) */
export function getPathNodes(notes: Note[], id: string): Note[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const path: Note[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

/** 특정 노트 ID를 본문에서 참조(링크)하고 있는 다른 백링크 노트 목록 탐색 */
export function findBacklinks(notes: Note[], targetNoteId: string): Note[] {
  if (!targetNoteId) return [];
  const anchor = `#note-${targetNoteId}`;
  const schema = `note://${targetNoteId}`;
  return notes.filter((n) => {
    if (n.id === targetNoteId) return false;
    return n.content.includes(anchor) || n.content.includes(schema);
  });
}

