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
  // 1행: 따뜻하고 화사한 웜톤 & 라임/민트 (8개)
  red: {
    id: 'red',
    name: '루비 레드',
    bg: '#ffeae8',
    border: '#fa5252',
    textColor: '#4c1212',
    dimmedColor: '#7a2424',
    badgeBg: 'rgba(76, 18, 18, 0.12)',
    badgeColor: '#4c1212',
    iconColor: '#4c1212',
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
  orange: {
    id: 'orange',
    name: '탠저린 오렌지',
    bg: '#fff3e6',
    border: '#fd7e14',
    textColor: '#542600',
    dimmedColor: '#803c03',
    badgeBg: 'rgba(84, 38, 0, 0.12)',
    badgeColor: '#542600',
    iconColor: '#542600',
  },
  amber: {
    id: 'amber',
    name: '앰버 골드',
    bg: '#fff9e6',
    border: '#fab005',
    textColor: '#4a3300',
    dimmedColor: '#735205',
    badgeBg: 'rgba(74, 51, 0, 0.12)',
    badgeColor: '#4a3300',
    iconColor: '#4a3300',
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
  lime: {
    id: 'lime',
    name: '라임 그린',
    bg: '#f4fce3',
    border: '#94d82d',
    textColor: '#273802',
    dimmedColor: '#455e0c',
    badgeBg: 'rgba(39, 56, 2, 0.12)',
    badgeColor: '#273802',
    iconColor: '#273802',
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

  // 2행: 청량하고 차분한 쿨톤 & 뉴트럴 (8개)
  teal: {
    id: 'teal',
    name: '오션 틸',
    bg: '#e6fffa',
    border: '#12b886',
    textColor: '#08483b',
    dimmedColor: '#1d6e5d',
    badgeBg: 'rgba(8, 72, 59, 0.12)',
    badgeColor: '#08483b',
    iconColor: '#08483b',
  },
  cyan: {
    id: 'cyan',
    name: '아쿠아 시안',
    bg: '#e3fafc',
    border: '#15aabf',
    textColor: '#0c3e47',
    dimmedColor: '#1b6370',
    badgeBg: 'rgba(12, 62, 71, 0.12)',
    badgeColor: '#0c3e47',
    iconColor: '#0c3e47',
  },
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
  indigo: {
    id: 'indigo',
    name: '로열 인디고',
    bg: '#edf2ff',
    border: '#4c6ef5',
    textColor: '#1b2a4a',
    dimmedColor: '#354b7d',
    badgeBg: 'rgba(27, 42, 74, 0.12)',
    badgeColor: '#1b2a4a',
    iconColor: '#1b2a4a',
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
  violet: {
    id: 'violet',
    name: '딥 바이올렛',
    bg: '#f8f0fc',
    border: '#be4bdb',
    textColor: '#3d1245',
    dimmedColor: '#672274',
    badgeBg: 'rgba(61, 18, 69, 0.12)',
    badgeColor: '#3d1245',
    iconColor: '#3d1245',
  },
  warmGray: {
    id: 'warmGray',
    name: '웜 샌드',
    bg: '#f8f7f4',
    border: '#adb5bd',
    textColor: '#343a40',
    dimmedColor: '#5a626a',
    badgeBg: 'rgba(52, 58, 64, 0.12)',
    badgeColor: '#343a40',
    iconColor: '#343a40',
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

/** URL이 Supabase 등 클라우드 스토리지 첨부파일 URL인지 확인 */
export function isAttachmentUrl(url?: string | null): boolean {
  if (!url) return false;
  return (
    url.includes('bullsnote-attachments') ||
    url.includes('/storage/v1/object/public/') ||
    url.includes('#deleted') ||
    url.includes('deleted=true')
  );
}

/**
 * 주어진 URL이 삭제된 첨부파일 URL인지 판별합니다.
 * - URL에 명시적으로 #deleted 해시가 있는 경우
 * - 스토리지 버킷 첨부파일 URL이지만 현재 노트(또는 전체 노트)의 attachments 목록에 없는 경우
 */
export function isDeletedAttachmentUrl(
  url?: string | null,
  currentNoteAttachments?: NoteAttachment[],
  allNotes?: Note[]
): boolean {
  if (!url) return false;
  if (url.includes('#deleted') || url.includes('deleted=true')) {
    return true;
  }
  if (!isAttachmentUrl(url)) {
    return false;
  }

  // 1. 현재 노트의 활성 첨부파일 목록과 비교
  const inCurrent = (currentNoteAttachments || []).some(
    (att) =>
      (att.url && url.includes(att.url)) ||
      (att.storagePath && url.includes(att.storagePath))
  );
  if (inCurrent) return false;

  // 2. 전체 노트의 활성 첨부파일 목록과 비교 (다른 노트에서 복사한 링크 대비)
  if (allNotes && allNotes.length > 0) {
    const inAnyNote = allNotes.some((n) =>
      (n.attachments || []).some(
        (att) =>
          (att.url && url.includes(att.url)) ||
          (att.storagePath && url.includes(att.storagePath))
      )
    );
    if (inAnyNote) return false;
  }

  return true;
}

/**
 * 노트 본문(BlockNote JSON 또는 텍스트)에서 삭제된 특정 첨부파일의 링크를 찾아
 * 파일명에 (삭제된 파일) 및 취소선, 안내 캡션을 추가하여 갱신합니다.
 */
export function markAttachmentDeletedInContent(
  content: string,
  deletedAtt: NoteAttachment
): string {
  if (!content) return content;

  // 1. BlockNote JSON인 경우
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      let modified = false;

      const traverse = (blocks: any[]): any[] => {
        return blocks.map((block) => {
          let updatedBlock = { ...block };

          // file 블록 검사
          if (block.type === 'file' && block.props?.url) {
            const url = String(block.props.url);
            if (
              url === deletedAtt.url ||
              (deletedAtt.storagePath && url.includes(deletedAtt.storagePath))
            ) {
              const currentName = String(block.props.name || deletedAtt.name);
              const cleanName = currentName.replace(/ \(삭제(?:된 파일|됨)\)/g, '').trim();
              updatedBlock.props = {
                ...block.props,
                name: cleanName,
                caption: '',
              };
              modified = true;
            }
          }

          // image 블록 검사
          if (block.type === 'image' && block.props?.url) {
            const url = String(block.props.url);
            if (
              url === deletedAtt.url ||
              (deletedAtt.storagePath && url.includes(deletedAtt.storagePath))
            ) {
              updatedBlock.props = {
                ...block.props,
                caption: '',
              };
              modified = true;
            }
          }

          // content 내 inlineContent(link) 검사
          if (Array.isArray(block.content)) {
            const newContent = block.content.map((item: any) => {
              if (item && item.type === 'link' && item.href) {
                const href = String(item.href);
                if (
                  href === deletedAtt.url ||
                  (deletedAtt.storagePath && href.includes(deletedAtt.storagePath))
                ) {
                  modified = true;
                  const updatedChildren = Array.isArray(item.content)
                    ? item.content.map((t: any) => {
                        const origText = String(t.text || '');
                        const cleanText = origText.replace(/ \(삭제(?:된 파일|됨)\)/g, '').trim();
                        return {
                          ...t,
                          text: cleanText,
                          styles: { ...(t.styles || {}), strike: true },
                        };
                      })
                    : item.content;
                  return {
                    ...item,
                    content: updatedChildren,
                  };
                }
              }
              return item;
            });
            updatedBlock.content = newContent;
          }

          // children 재귀 순회
          if (Array.isArray(block.children) && block.children.length > 0) {
            updatedBlock.children = traverse(block.children);
          }

          return updatedBlock;
        });
      };

      const updatedBlocks = traverse(parsed);
      if (modified) {
        return JSON.stringify(updatedBlocks);
      }
      return content;
    }
  } catch {
    // JSON이 아니면 마크다운 처리로 진행
  }

  // 2. 일반 마크다운 / 텍스트인 경우
  if (deletedAtt.url && content.includes(deletedAtt.url)) {
    const escapedUrl = deletedAtt.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkRegex = new RegExp(`\\[([^\\]]+)\\]\\(${escapedUrl}\\)`, 'g');
    return content.replace(linkRegex, (_match, text) => {
      const cleanText = text.replace(/ \(삭제(?:된 파일|됨)\)$/, '');
      return `~~[${cleanText}](${deletedAtt.url})~~`;
    });
  }

  return content;
}

/**
 * BlockNote 블록 배열을 순회하여 이미 삭제된 첨부파일 블록들의 이름과 캡션을 보정합니다.
 */
export function markDeletedBlocks(
  blocks: any[],
  currentNoteAttachments?: NoteAttachment[],
  allNotes?: Note[]
): any[] {
  if (!Array.isArray(blocks)) return blocks;

  return blocks.map((block) => {
    let updatedBlock = { ...block };

    if (block.type === 'file' && block.props?.url) {
      const url = String(block.props.url);
      if (isDeletedAttachmentUrl(url, currentNoteAttachments, allNotes)) {
        const currentName = String(block.props.name || '첨부파일');
        const cleanName = currentName.replace(/ \(삭제(?:된 파일|됨)\)/g, '').trim();
        updatedBlock.props = {
          ...block.props,
          name: cleanName,
          caption: '',
        };
      }
    }

    if (Array.isArray(block.children) && block.children.length > 0) {
      updatedBlock.children = markDeletedBlocks(
        block.children,
        currentNoteAttachments,
        allNotes
      );
    }

    return updatedBlock;
  });
}

