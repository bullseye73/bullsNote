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

export interface NoteSnapshot {
  title: string;
  /** 마크다운 콘텐츠 */
  content: string;
  tags: string[];
  savedAt: number;
}

export interface Note {
  id: string;
  title: string;
  /** 소속 프로젝트 id */
  projectId: string;
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
    content: '',
    tags: [],
    pinned: false,
    favorite: false,
    parentId: null,
    history: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export interface TreeNode {
  note: Note;
  children: TreeNode[];
}

function sortNotes(a: Note, b: Note): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.updatedAt - a.updatedAt;
}

/** 평탄 리스트 -> 트리 (형제 정렬: 핀 우선, 수정일 내림차순) */
export function buildTree(notes: Note[]): TreeNode[] {
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
    list.sort((a, b) => sortNotes(a.note, b.note));
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
