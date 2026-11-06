// MODEL: 할일관리(Todo) 프로젝트 및 상위 그룹(To Do, Doing, Done, Drop) 비즈니스 로직
import { Note, Project, TodoMeta, TodoStatus, createEmptyNote, getDescendantIds } from './Note';
import { formatDateTimeIso } from './dateUtils';
import { parseBlocks } from './HashtagService';

export const TODO_PROJECT_ID = 'todo-project';
export const TODO_PROJECT_NAME = '할일관리';
export const TODO_PROJECT_ICON = '📋';

export const TODO_GROUP_TODO_ID = 'todo-group-todo';
export const TODO_GROUP_DOING_ID = 'todo-group-doing';
export const TODO_GROUP_DONE_ID = 'todo-group-done';
export const TODO_GROUP_DROP_ID = 'todo-group-drop';

export interface TodoGroupConfig {
  id: string;
  status: TodoStatus;
  title: string;
  icon: string;
  color: string;
  description: string;
}

export const TODO_GROUPS: TodoGroupConfig[] = [
  {
    id: TODO_GROUP_TODO_ID,
    status: 'todo',
    title: '📥 To Do',
    icon: '📥',
    color: 'blue',
    description: '대기 중인 할 일 목록',
  },
  {
    id: TODO_GROUP_DOING_ID,
    status: 'doing',
    title: '⏳ Doing',
    icon: '⏳',
    color: 'yellow',
    description: '현재 진행 중인 작업',
  },
  {
    id: TODO_GROUP_DONE_ID,
    status: 'done',
    title: '✅ Done',
    icon: '✅',
    color: 'mint',
    description: '완료된 할 일',
  },
  {
    id: TODO_GROUP_DROP_ID,
    status: 'drop',
    title: '🚫 Drop',
    icon: '🚫',
    color: 'gray',
    description: '중단 및 취소된 항목',
  },
];

export const STATUS_TO_GROUP_ID: Record<TodoStatus, string> = {
  todo: TODO_GROUP_TODO_ID,
  doing: TODO_GROUP_DOING_ID,
  done: TODO_GROUP_DONE_ID,
  drop: TODO_GROUP_DROP_ID,
};

export const GROUP_ID_TO_STATUS: Record<string, TodoStatus> = {
  [TODO_GROUP_TODO_ID]: 'todo',
  [TODO_GROUP_DOING_ID]: 'doing',
  [TODO_GROUP_DONE_ID]: 'done',
  [TODO_GROUP_DROP_ID]: 'drop',
};

/**
 * 특정 노트 또는 ID가 To Do, Doing, Done, Drop 시스템 고정 그룹인지 판별
 */
export function isSystemGroupNote(noteOrId: Note | string | null | undefined): boolean {
  if (!noteOrId) return false;
  if (typeof noteOrId === 'string') {
    return Boolean(GROUP_ID_TO_STATUS[noteOrId]);
  }
  return Boolean(noteOrId.systemGroupType || GROUP_ID_TO_STATUS[noteOrId.id]);
}

/**
 * 할일 노트의 유효 상태(todo | doing | done | drop)를 상위 그룹 체인 또는 todoMeta로부터 판별
 */
export function getEffectiveTodoStatus(note: Note | undefined, allNotes: Note[]): TodoStatus {
  if (!note) return 'todo';
  if (note.systemGroupType) return note.systemGroupType;
  if (GROUP_ID_TO_STATUS[note.id]) return GROUP_ID_TO_STATUS[note.id];
  if (note.todoMeta?.status) return note.todoMeta.status;

  const byId = new Map(allNotes.map((n) => [n.id, n]));
  let curPid = note.parentId;
  const visited = new Set<string>();
  while (curPid && !visited.has(curPid)) {
    visited.add(curPid);
    if (GROUP_ID_TO_STATUS[curPid]) return GROUP_ID_TO_STATUS[curPid];
    const p = byId.get(curPid);
    if (!p) break;
    if (p.systemGroupType) return p.systemGroupType;
    if (p.todoMeta?.status) return p.todoMeta.status;
    curPid = p.parentId;
  }
  return 'todo';
}

/**
 * 할일 노트의 sourceNoteId 추출 (todoMeta 우선, 없으면 본문 #note- 링크에서 폴백 추출)
 */
export function resolveSourceNoteId(note: Note | undefined): string | undefined {
  if (!note) return undefined;
  if (note.todoMeta?.sourceNoteId) return note.todoMeta.sourceNoteId;
  const m = (note.content || '').match(/#note-([a-zA-Z0-9_-]+)/);
  return m?.[1];
}

/**
 * 할일관리 프로젝트 및 상위 4대 그룹(To Do, Doing, Done, Drop)이 존재하는지 확인하고 보장
 */
export function ensureTodoProjectAndGroups(
  projects: Project[],
  notes: Note[]
): { projects: Project[]; notes: Note[]; created: boolean } {
  let created = false;
  let nextProjects = [...projects];
  let nextNotes = [...notes];

  // 1. 할일관리 프로젝트 확인/생성 (고정 초기 타임스탬프 사용하여 타 기기 동기화 시 불필요한 재업로드 방지)
  const SYSTEM_BASE_TS = 1700000000000;
  const hasTodoProject = nextProjects.some((p) => p.id === TODO_PROJECT_ID);
  if (!hasTodoProject) {
    const todoProject: Project = {
      id: TODO_PROJECT_ID,
      name: TODO_PROJECT_NAME,
      icon: TODO_PROJECT_ICON,
      createdAt: SYSTEM_BASE_TS,
      updatedAt: SYSTEM_BASE_TS,
    };
    nextProjects = [todoProject, ...nextProjects];
    created = true;
  }

  // 2. 4대 상위 그룹 노트 확인/생성 및 무결성 강제 보정
  TODO_GROUPS.forEach((group, index) => {
    const existing = nextNotes.find((n) => n.id === group.id);
    if (!existing) {
      const ts = SYSTEM_BASE_TS + index; // 순서 보장 및 불필요한 서버 덮어쓰기 방지
      const groupNote: Note = {
        id: group.id,
        title: group.title,
        projectId: TODO_PROJECT_ID,
        parentId: null,
        pinned: true,
        favorite: false,
        color: group.color,
        tags: ['할일그룹', group.status],
        content: JSON.stringify([
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `${group.title} 그룹입니다. ${group.description}`,
                styles: { italic: true },
              },
            ],
          },
        ]),
        history: [],
        attachments: [],
        reminder: null,
        systemGroupType: group.status,
        createdAt: ts,
        updatedAt: ts,
      };
      nextNotes.push(groupNote);
      created = true;
    } else {
      // 기존 그룹 노트의 parentId가 null이 아니거나(사이클 유발 방지) 속성이 비정상이면 정상 복구
      if (
        existing.parentId !== null ||
        existing.systemGroupType !== group.status ||
        existing.projectId !== TODO_PROJECT_ID ||
        !existing.pinned
      ) {
        nextNotes = nextNotes.map((n) =>
          n.id === group.id
            ? {
                ...n,
                parentId: null,
                systemGroupType: group.status,
                projectId: TODO_PROJECT_ID,
                pinned: true,
              }
            : n
        );
        created = true;
      }
    }
  });

  return { projects: nextProjects, notes: nextNotes, created };
}

export interface ExtractedChecklistItem {
  id?: string;
  text: string;
  checked?: boolean;
  /** 상위 체크리스트 항목의 블록 ID (계층형 하위 할일 연결용) */
  parentBlockId?: string;
  /** 상위 체크리스트 항목의 정제된 제목 (블록 ID가 없을 때 상위 할일 매칭용) */
  parentText?: string;
  /** 해당 할일 항목 하위에 작성된 세부 내용 블록들 */
  detailBlocks?: Array<Record<string, unknown>>;
}

function generateBlockId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function extractInlineText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const rec = item as Record<string, unknown>;
      if (typeof rec.text === 'string') return rec.text;
      if (Array.isArray(rec.content)) return extractInlineText(rec.content);
      return '';
    })
    .join('');
}

/**
 * 하위 세부 내용 블록들을 깊은 복사하며 새로운 블록 ID를 부여 (원본 노트 블록 ID와의 충돌 방지)
 */
function cloneDetailBlocks(blocks: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return blocks.map((b) => {
    const cloned: Record<string, unknown> = {
      ...b,
      id: generateBlockId(),
    };
    if (Array.isArray(b.content)) {
      cloned.content = JSON.parse(JSON.stringify(b.content));
    }
    if (b.props && typeof b.props === 'object') {
      cloned.props = { ...(b.props as Record<string, unknown>) };
    }
    if (Array.isArray(b.children) && b.children.length > 0) {
      cloned.children = cloneDetailBlocks(b.children as Array<Record<string, unknown>>);
    } else {
      cloned.children = [];
    }
    return cloned;
  });
}

/**
 * 블록 배열 비교 시 랜덤 생성되는 블록 id를 제외하고 구조/내용 동일성 비교를 위한 정규화
 */
function stripBlockIds(blocks: unknown): unknown {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((b) => {
    if (!b || typeof b !== 'object') return b;
    const { id: _id, ...rest } = b as Record<string, unknown>;
    return {
      ...rest,
      children: Array.isArray(rest.children) ? stripBlockIds(rest.children) : [],
    };
  });
}

/**
 * 마크다운 텍스트에서 체크리스트 항목(- [ ] / - [x]) 및 들여쓰기된 하위 내용 추출
 */
export function extractChecklistFromMarkdown(md: string): ExtractedChecklistItem[] {
  if (!md) return [];
  const lines = md.split('\n');
  const items: ExtractedChecklistItem[] = [];
  const stack: Array<{ indent: number; item: ExtractedChecklistItem }> = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;

    const match = rawLine.match(/^(\s*)[*-]?\s*\[([ xX])\]\s*(.*)$/);
    if (match) {
      const indent = match[1].replace(/\t/g, '  ').length;
      const checked = match[2].toLowerCase() === 'x';
      const text = cleanTodoSuffix(match[3].trim());
      if (!text) continue;

      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const parent = stack.length > 0 ? stack[stack.length - 1].item : undefined;
      const itemId = `md-${i}`;
      const newItem: ExtractedChecklistItem = {
        id: itemId,
        text,
        checked,
        parentBlockId: parent?.id,
        parentText: parent?.text,
        detailBlocks: [],
      };

      if (parent) {
        parent.detailBlocks = parent.detailBlocks || [];
        parent.detailBlocks.push({
          id: generateBlockId(),
          type: 'checkListItem',
          props: { checked },
          content: [{ type: 'text', text, styles: {} }],
          children: [],
        });
      }

      items.push(newItem);
      stack.push({ indent, item: newItem });
      continue;
    }

    // 현재 활성 체크리스트 항목 아래에 들여쓰기된 하위 불릿/텍스트가 있는 경우 세부 내용 블록으로 추가
    const indentMatch = rawLine.match(/^(\s+)(.*)$/);
    if (indentMatch && stack.length > 0) {
      const lineIndent = indentMatch[1].replace(/\t/g, '  ').length;
      const currentTop = stack[stack.length - 1];
      if (lineIndent > currentTop.indent) {
        const bodyText = indentMatch[2].trim();
        const bulletMatch = bodyText.match(/^[*-]\s+(.*)$/);
        const numberedMatch = bodyText.match(/^\d+\.\s+(.*)$/);
        currentTop.item.detailBlocks = currentTop.item.detailBlocks || [];
        if (bulletMatch) {
          currentTop.item.detailBlocks.push({
            id: generateBlockId(),
            type: 'bulletListItem',
            content: [{ type: 'text', text: bulletMatch[1].trim(), styles: {} }],
            children: [],
          });
        } else if (numberedMatch) {
          currentTop.item.detailBlocks.push({
            id: generateBlockId(),
            type: 'numberedListItem',
            content: [{ type: 'text', text: numberedMatch[1].trim(), styles: {} }],
            children: [],
          });
        } else if (bodyText) {
          currentTop.item.detailBlocks.push({
            id: generateBlockId(),
            type: 'paragraph',
            content: [{ type: 'text', text: bodyText, styles: {} }],
            children: [],
          });
        }
      }
    }
  }

  return items;
}

/**
 * BlockNote 블록들에서 체크리스트 블록(checkListItem)과 하위 계층 구조 및 세부 내용 추출
 */
export function extractChecklistFromBlocks(
  blocksJsonOrArray: unknown
): ExtractedChecklistItem[] {
  let blocks: Array<Record<string, unknown>> | undefined;
  if (typeof blocksJsonOrArray === 'string') {
    blocks = parseBlocks(blocksJsonOrArray);
  } else if (Array.isArray(blocksJsonOrArray)) {
    blocks = blocksJsonOrArray as Array<Record<string, unknown>>;
  }

  if (!blocks) return [];

  const results: ExtractedChecklistItem[] = [];

  function traverse(
    list: Array<Record<string, unknown>>,
    parentCheckItem?: { id?: string; text: string }
  ) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const rawText = extractInlineText(b.content);
      const bracketTodoMatch =
        b.type !== 'checkListItem' && (b.type === 'paragraph' || b.type === 'bulletListItem')
          ? rawText.match(/^\s*(?:[-*+]\s+)?\[\s*([xX]?)\s*\]\s+(.+)$/)
          : null;

      if (b.type === 'checkListItem' || bracketTodoMatch) {
        const id = (b.id as string) || '';
        const props = (b.props as Record<string, unknown>) || {};
        const checked = bracketTodoMatch
          ? bracketTodoMatch[1].toLowerCase() === 'x'
          : Boolean(props.checked);
        const text = cleanTodoSuffix(bracketTodoMatch ? bracketTodoMatch[2] : rawText);

        const rawChildren = Array.isArray(b.children)
          ? (b.children as Array<Record<string, unknown>>)
          : [];

        // 체크리스트 바로 아래에 Tab 들여쓰기 없이 작성된 연속된 불릿(bulletListItem)도 하위 세부 내용으로 수집
        const trailingBullets: Array<Record<string, unknown>> = [];
        while (
          i + 1 < list.length &&
          list[i + 1].type === 'bulletListItem' &&
          !extractInlineText(list[i + 1].content).match(/^\s*\[\s*[xX]?\s*\]\s+/)
        ) {
          trailingBullets.push(list[i + 1]);
          i += 1;
        }

        const combinedDetailSource = [...rawChildren, ...trailingBullets];
        const detailBlocks =
          combinedDetailSource.length > 0 ? cloneDetailBlocks(combinedDetailSource) : [];

        if (text) {
          results.push({
            id,
            text,
            checked,
            parentBlockId: parentCheckItem?.id,
            parentText: parentCheckItem?.text,
            detailBlocks,
          });
        }

        const nextParent = text ? { id, text } : parentCheckItem;
        if (rawChildren.length > 0) {
          traverse(rawChildren, nextParent);
        }
        for (const tb of trailingBullets) {
          if (Array.isArray(tb.children) && tb.children.length > 0) {
            traverse(tb.children as Array<Record<string, unknown>>, nextParent);
          }
        }
      } else if (Array.isArray(b.children) && b.children.length > 0) {
        traverse(b.children as Array<Record<string, unknown>>, parentCheckItem);
      }
    }
  }

  traverse(blocks, undefined);
  return results;
}

/**
 * 완료/중단 타임스탬프 접미사 제거 유틸
 */
export function cleanTodoSuffix(text: string): string {
  return text
    .replace(/\s*\((완료|중단|취소):\s*[\d\s\-:]+\)/g, '')
    .trim();
}

/**
 * 할일 노트를 생성/업데이트할 때 사용하는 블록 JSON 생성 (하위 세부 내용 블록 포함)
 */
export function buildTodoNoteContent(
  sourceNote: Note,
  todoText: string,
  detailBlocks?: Array<Record<string, unknown>>,
  createdAtMs?: number
): string {
  const nowStr = formatDateTimeIso(new Date(createdAtMs ?? Date.now()));
  const sourceTitle = sourceNote.title || '제목 없음';

  const bodyBlocks: Array<Record<string, unknown>> =
    detailBlocks && detailBlocks.length > 0
      ? cloneDetailBlocks(detailBlocks)
      : [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: todoText,
              },
            ],
          },
        ];

  const blocks = [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '📌 원본 노트: ',
          styles: { bold: true },
        },
        {
          type: 'link',
          href: `#note-${sourceNote.id}`,
          content: [
            {
              type: 'text',
              text: `📄 ${sourceTitle}`,
              styles: { bold: true, textColor: 'blue' },
            },
          ],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `⏰ 작성 일시: ${nowStr}`,
          styles: { textColor: 'gray' },
        },
      ],
    },
    {
      type: 'divider',
    },
    {
      type: 'heading',
      props: { level: 3 },
      content: [
        {
          type: 'text',
          text: '📝 세부 내용 및 작업 메모',
        },
      ],
    },
    ...bodyBlocks,
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '',
        },
      ],
    },
  ];

  return JSON.stringify(blocks);
}

/**
 * 개별 체크리스트 항목들로부터 '할일관리' 프로젝트의 할일 노트들을 계층 구조(방안 B)로 생성하거나
 * 이미 등록된 할일이 있는 경우 하위 내용·제목·계층·상태를 업데이트
 */
export function createTodoNotes(
  sourceNote: Note,
  items: ExtractedChecklistItem[],
  existingNotes: Note[]
): {
  newNotes: Note[];
  updatedNotes: Note[];
  updatedCount: number;
  duplicateCount: number;
} {
  const newNotes: Note[] = [];
  const updatedNotes: Note[] = [];
  let updatedCount = 0;
  let duplicateCount = 0;
  const now = Date.now();

  // 부모 체크리스트 -> 할일 노트 ID 매핑 (방안 B: 하위 체크리스트를 부모 할일 카드의 자식으로 연결)
  const blockIdToTodoId = new Map<string, string>();
  const titleToTodoId = new Map<string, string>();
  const matchedExistingIds = new Set<string>();

  // 기존에 이 원본 노트에서 생성된 할일 노트들을 먼저 인덱싱
  for (const n of existingNotes) {
    if (
      n.projectId === TODO_PROJECT_ID &&
      !n.systemGroupType &&
      n.todoMeta?.sourceNoteId === sourceNote.id
    ) {
      if (n.todoMeta.sourceBlockId) {
        blockIdToTodoId.set(n.todoMeta.sourceBlockId, n.id);
      }
      const cTitle = cleanTodoSuffix(n.title);
      if (cTitle && !titleToTodoId.has(cTitle)) {
        titleToTodoId.set(cTitle, n.id);
      }
    }
  }

  items.forEach((item, idx) => {
    const cleanText = cleanTodoSuffix(item.text);
    if (!cleanText) return;

    // 1. 이미 등록된 할일 노트가 있는지 검색 (블록 ID 우선, 없으면 제목 매칭)
    const matchedExisting = existingNotes.find((n) => {
      if (
        n.projectId !== TODO_PROJECT_ID ||
        n.systemGroupType ||
        n.todoMeta?.sourceNoteId !== sourceNote.id ||
        matchedExistingIds.has(n.id)
      ) {
        return false;
      }
      if (item.id && n.todoMeta?.sourceBlockId) {
        return n.todoMeta.sourceBlockId === item.id;
      }
      return cleanTodoSuffix(n.title) === cleanText;
    });

    // 2. 상위 할일 노트 ID 결정 (방안 B: 상위 체크리스트가 있으면 해당 할일 노트의 하위로 배치)
    const parentTodoId =
      (item.parentBlockId && blockIdToTodoId.get(item.parentBlockId)) ||
      (item.parentText && titleToTodoId.get(cleanTodoSuffix(item.parentText))) ||
      null;

    if (matchedExisting) {
      matchedExistingIds.add(matchedExisting.id);
      if (item.id && ! item.id.startsWith('md-')) {
        blockIdToTodoId.set(item.id, matchedExisting.id);
      }
      titleToTodoId.set(cleanText, matchedExisting.id);

      const currentStatus: TodoStatus =
        matchedExisting.todoMeta?.status ||
        GROUP_ID_TO_STATUS[matchedExisting.parentId || ''] ||
        'todo';

      let nextStatus: TodoStatus = currentStatus;
      if (item.checked && currentStatus !== 'done') {
        nextStatus = 'done';
      } else if (!item.checked && currentStatus === 'done') {
        nextStatus = 'todo';
      }

      const targetGroup = TODO_GROUPS.find((g) => g.status === nextStatus);
      const nextColor = targetGroup?.color || matchedExisting.color || 'blue';
      const hasCustomTodoParent =
        matchedExisting.parentId &&
        !isSystemGroupNote(matchedExisting.parentId) &&
        existingNotes.some((n) => n.id === matchedExisting.parentId);
      const nextParentId =
        parentTodoId && parentTodoId !== matchedExisting.id
          ? parentTodoId
          : hasCustomTodoParent
          ? matchedExisting.parentId
          : STATUS_TO_GROUP_ID[nextStatus];

      const candidateContent = buildTodoNoteContent(
        sourceNote,
        cleanText,
        item.detailBlocks,
        matchedExisting.createdAt
      );

      const existingStripped = JSON.stringify(stripBlockIds(parseBlocks(matchedExisting.content)));
      const candidateStripped = JSON.stringify(stripBlockIds(parseBlocks(candidateContent)));
      const contentChanged = existingStripped !== candidateStripped;
      const nextSourceBlockId =
        item.id && !item.id.startsWith('md-') ? item.id : matchedExisting.todoMeta?.sourceBlockId;

      const hasChanges =
        matchedExisting.title !== cleanText ||
        contentChanged ||
        matchedExisting.parentId !== nextParentId ||
        matchedExisting.color !== nextColor ||
        matchedExisting.todoMeta?.status !== nextStatus ||
        matchedExisting.todoMeta?.sourceBlockId !== nextSourceBlockId;

      if (hasChanges) {
        const updatedNote: Note = {
          ...matchedExisting,
          title: cleanText,
          parentId: nextParentId,
          color: nextColor,
          content: contentChanged ? candidateContent : matchedExisting.content,
          tags: Array.from(
            new Set([
              ...(matchedExisting.tags || []).filter(
                (t) => !['todo', 'doing', 'done', 'drop'].includes(t)
              ),
              '할일',
              nextStatus,
            ])
          ),
          todoMeta: {
            ...(matchedExisting.todoMeta || { status: nextStatus }),
            sourceNoteId: sourceNote.id,
            sourceBlockId: nextSourceBlockId,
            status: nextStatus,
            completedAt:
              nextStatus === 'done' ? matchedExisting.todoMeta?.completedAt || now : null,
          },
          updatedAt: now + idx,
        };
        updatedNotes.push(updatedNote);
        updatedCount++;
      } else {
        duplicateCount++;
      }
      return;
    }

    // 3. 신규 할일 노트 생성
    const initialStatus: TodoStatus = item.checked ? 'done' : 'todo';
    const targetGroup = TODO_GROUPS.find((g) => g.status === initialStatus);
    const initialParentId =
      parentTodoId || (item.checked ? TODO_GROUP_DONE_ID : TODO_GROUP_TODO_ID);
    const sourceBlockId = item.id && !item.id.startsWith('md-') ? item.id : undefined;

    const todoNote = createEmptyNote({
      title: cleanText,
      projectId: TODO_PROJECT_ID,
      parentId: initialParentId,
      color: targetGroup?.color || 'blue',
      tags: ['할일', initialStatus],
      content: buildTodoNoteContent(sourceNote, cleanText, item.detailBlocks, now + idx),
      todoMeta: {
        sourceNoteId: sourceNote.id,
        sourceBlockId,
        status: initialStatus,
        completedAt: item.checked ? now : null,
      },
      createdAt: now + idx,
      updatedAt: now + idx,
    });

    if (item.id) {
      blockIdToTodoId.set(item.id, todoNote.id);
    }
    titleToTodoId.set(cleanText, todoNote.id);
    newNotes.push(todoNote);
  });

  return { newNotes, updatedNotes, updatedCount, duplicateCount };
}

function normalizeMatchText(s: string): string {
  return cleanTodoSuffix(s || '')
    .replace(/^\s*(?:[-*+]\s+)?\[\s*[xX]?\s*\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 할일 노드가 To Do, Doing, Done, Drop으로 이동(상태 변경)될 때
 * 할일 노드(및 하위 자식 할일 노드들)와 원본 노트 본문의 체크리스트([x] 및 완료/중단 일시)를 동기화
 */
export function syncTodoStatusToSourceNote(
  todoNote: Note,
  newStatus: TodoStatus,
  allNotes: Note[],
  options?: { moveToGroupRoot?: boolean }
): { updatedNotes: Note[]; sourceUpdated: boolean; changedNoteIds: string[] } {
  const now = Date.now();
  const nowStr = formatDateTimeIso(new Date(now));
  const targetGroupId = STATUS_TO_GROUP_ID[newStatus];
  const targetGroup = TODO_GROUPS.find((g) => g.status === newStatus);
  const statusColor = targetGroup?.color || 'blue';

  const descendantIds = getDescendantIds(allNotes, todoNote.id);
  const targetTodoNotes = allNotes.filter(
    (n) =>
      descendantIds.has(n.id) &&
      n.projectId === TODO_PROJECT_ID &&
      !isSystemGroupNote(n)
  );
  if (!targetTodoNotes.some((n) => n.id === todoNote.id)) {
    targetTodoNotes.unshift(todoNote);
  }

  const updatedNotesMap = new Map<string, Note>();
  const changedNoteIds: string[] = [];

  // 원본 노트별로 갱신할 할일 항목 매핑 수집
  const sourceTargetsByNoteId = new Map<
    string,
    Array<{
      todoId: string;
      sourceBlockId?: string;
      cleanTitle: string;
      matchedBlockId?: string;
    }>
  >();

  for (const itemNote of targetTodoNotes) {
    const isRootTarget = itemNote.id === todoNote.id;
    const isChildTodo = Boolean(
      itemNote.parentId &&
        !isSystemGroupNote(itemNote.parentId) &&
        allNotes.some((x) => x.id === itemNote.parentId)
    );
    const nextParentId = isRootTarget
      ? options?.moveToGroupRoot || !isChildTodo
        ? targetGroupId
        : itemNote.parentId
      : itemNote.parentId;

    const srcNoteId = resolveSourceNoteId(itemNote);
    const updatedItem: Note = {
      ...itemNote,
      projectId: TODO_PROJECT_ID,
      parentId: nextParentId,
      color: statusColor,
      tags: Array.from(
        new Set([
          ...(itemNote.tags || []).filter((t) => !['todo', 'doing', 'done', 'drop'].includes(t)),
          newStatus,
        ])
      ),
      todoMeta: {
        ...(itemNote.todoMeta || { status: 'todo' }),
        sourceNoteId: srcNoteId,
        status: newStatus,
        completedAt: newStatus === 'done' ? itemNote.todoMeta?.completedAt || now : null,
        droppedAt: newStatus === 'drop' ? itemNote.todoMeta?.droppedAt || now : null,
      },
      updatedAt: now,
    };

    updatedNotesMap.set(updatedItem.id, updatedItem);
    changedNoteIds.push(updatedItem.id);

    if (srcNoteId) {
      const arr = sourceTargetsByNoteId.get(srcNoteId) ?? [];
      arr.push({
        todoId: updatedItem.id,
        sourceBlockId: updatedItem.todoMeta?.sourceBlockId,
        cleanTitle: normalizeMatchText(updatedItem.title),
      });
      sourceTargetsByNoteId.set(srcNoteId, arr);
    }
  }

  // 2. 원본 노트가 있는 경우 원본 노트의 본문 체크리스트 갱신
  let sourceUpdated = false;

  for (const [sourceNoteId, targets] of sourceTargetsByNoteId.entries()) {
    const sourceNote = allNotes.find((n) => n.id === sourceNoteId);
    if (!sourceNote) continue;
    const blocks = parseBlocks(sourceNote.content);
    if (!blocks) continue;

    let blockFound = false;

    const updateChecklistBlocks = (list: Array<Record<string, unknown>>) => {
      for (const b of list) {
        const currentId = (b.id as string) || '';
        const rawText = extractInlineText(b.content);
        const bracketTodoMatch =
          b.type !== 'checkListItem' && (b.type === 'paragraph' || b.type === 'bulletListItem')
            ? rawText.match(/^\s*(?:[-*+]\s+)?\[\s*([xX]?)\s*\]\s+(.+)$/)
            : null;

        if (b.type === 'checkListItem' || bracketTodoMatch) {
          const itemRawCore = bracketTodoMatch ? bracketTodoMatch[2] : rawText;
          const cleanItemText = cleanTodoSuffix(itemRawCore);
          const normItemText = normalizeMatchText(cleanItemText);

          const matchedTarget = targets.find(
            (t) =>
              (t.sourceBlockId && currentId && currentId === t.sourceBlockId) ||
              (normItemText && normItemText === t.cleanTitle)
          );

          if (matchedTarget) {
            blockFound = true;
            if (currentId && !matchedTarget.sourceBlockId) {
              matchedTarget.matchedBlockId = currentId;
            }
            const displayTitle = cleanItemText || matchedTarget.cleanTitle;
            const props = (b.props as Record<string, unknown>) || {};
            b.type = 'checkListItem';

            if (newStatus === 'done') {
              // 완료 처리: checked = true, 접미사 (완료: YYYY-MM-DD HH:mm)
              b.props = { ...props, checked: true };
              b.content = [
                {
                  type: 'text',
                  text: `${displayTitle} (완료: ${nowStr})`,
                  styles: {},
                },
              ];
            } else if (newStatus === 'drop') {
              // 중단 처리: checked = false, 취소선 + 접미사 (중단: YYYY-MM-DD HH:mm)
              b.props = { ...props, checked: false };
              b.content = [
                {
                  type: 'text',
                  text: `${displayTitle} (중단: ${nowStr})`,
                  styles: { strike: true, textColor: 'gray' },
                },
              ];
            } else {
              // todo 또는 doing으로 복귀: checked = false, 접미사 제거
              b.props = { ...props, checked: false };
              b.content = [
                {
                  type: 'text',
                  text: displayTitle,
                  styles: {},
                },
              ];
            }
          }
        }
        if (Array.isArray(b.children) && b.children.length > 0) {
          updateChecklistBlocks(b.children as Array<Record<string, unknown>>);
        }
      }
    };

    updateChecklistBlocks(blocks);

    for (const t of targets) {
      if (t.matchedBlockId) {
        const prevTodo = updatedNotesMap.get(t.todoId);
        if (prevTodo && prevTodo.todoMeta) {
          updatedNotesMap.set(t.todoId, {
            ...prevTodo,
            todoMeta: {
              ...prevTodo.todoMeta,
              sourceBlockId: t.matchedBlockId,
            },
          });
        }
      }
    }

    if (blockFound) {
      const updatedSource: Note = {
        ...sourceNote,
        content: JSON.stringify(blocks),
        updatedAt: now,
      };
      updatedNotesMap.set(updatedSource.id, updatedSource);
      if (!changedNoteIds.includes(updatedSource.id)) {
        changedNoteIds.push(updatedSource.id);
      }
      sourceUpdated = true;
    }
  }

  // 전체 리스트 맵핑 반영
  const resultNotes = allNotes.map((n) => updatedNotesMap.get(n.id) || n);
  const rootUpdated = updatedNotesMap.get(todoNote.id);
  if (rootUpdated && !allNotes.some((n) => n.id === rootUpdated.id)) {
    resultNotes.push(rootUpdated);
  }

  return { updatedNotes: resultNotes, sourceUpdated, changedNoteIds };
}

/**
 * 원본 노트에서 체크리스트의 checked 상태가 변경되었을 때,
 * 연결된 할일 노트를 Done 또는 To Do로 자동 동기화
 */
export function syncSourceChecklistToTodoNotes(
  sourceNote: Note,
  blocksJson: string,
  allNotes: Note[]
): { updatedNotes: Note[]; changed: boolean } {
  const blocks = parseBlocks(blocksJson);
  if (!blocks) return { updatedNotes: allNotes, changed: false };

  const currentItems = extractChecklistFromBlocks(blocks);
  if (currentItems.length === 0) return { updatedNotes: allNotes, changed: false };

  let changed = false;
  const now = Date.now();
  const updatedMap = new Map<string, Note>();

  // 해당 원본 노트를 바라보는 모든 할일 노트 탐색
  const relatedTodoNotes = allNotes.filter(
    (n) =>
      n.projectId === TODO_PROJECT_ID &&
      !n.systemGroupType &&
      resolveSourceNoteId(n) === sourceNote.id
  );
  if (relatedTodoNotes.length === 0) return { updatedNotes: allNotes, changed: false };

  const blockIdToTodoId = new Map<string, string>();
  const titleToTodoId = new Map<string, string>();
  for (const n of relatedTodoNotes) {
    if (n.todoMeta?.sourceBlockId) blockIdToTodoId.set(n.todoMeta.sourceBlockId, n.id);
    const ct = cleanTodoSuffix(n.title);
    if (ct && !titleToTodoId.has(ct)) titleToTodoId.set(ct, n.id);
  }

  for (const item of currentItems) {
    const cleanItemText = cleanTodoSuffix(item.text);
    if (!cleanItemText) continue;

    const matchedTodo = relatedTodoNotes.find(
      (n) =>
        (item.id && n.todoMeta?.sourceBlockId === item.id) ||
        normalizeMatchText(n.title) === normalizeMatchText(cleanItemText)
    );

    if (matchedTodo) {
      if (item.id) blockIdToTodoId.set(item.id, matchedTodo.id);
      titleToTodoId.set(cleanItemText, matchedTodo.id);

      const currentStatus: TodoStatus = getEffectiveTodoStatus(matchedTodo, allNotes);
      const shouldBeDone = Boolean(item.checked);

      let nextStatus: TodoStatus = currentStatus;
      if (shouldBeDone && currentStatus !== 'done') {
        nextStatus = 'done';
      } else if (!shouldBeDone && currentStatus === 'done') {
        nextStatus = 'todo';
      }

      const parentTodoId =
        (item.parentBlockId && blockIdToTodoId.get(item.parentBlockId)) ||
        (item.parentText && titleToTodoId.get(cleanTodoSuffix(item.parentText))) ||
        null;

      const hasCustomTodoParent =
        matchedTodo.parentId &&
        !isSystemGroupNote(matchedTodo.parentId) &&
        allNotes.some((n) => n.id === matchedTodo.parentId);

      const nextParentId =
        parentTodoId && parentTodoId !== matchedTodo.id
          ? parentTodoId
          : hasCustomTodoParent
          ? matchedTodo.parentId
          : STATUS_TO_GROUP_ID[nextStatus];

      const targetGroup = TODO_GROUPS.find((g) => g.status === nextStatus);
      const nextColor = targetGroup?.color || matchedTodo.color || 'blue';

      const candidateContent = buildTodoNoteContent(
        sourceNote,
        cleanItemText,
        item.detailBlocks,
        matchedTodo.createdAt
      );
      const existingStripped = JSON.stringify(stripBlockIds(parseBlocks(matchedTodo.content)));
      const candidateStripped = JSON.stringify(stripBlockIds(parseBlocks(candidateContent)));
      const contentChanged = existingStripped !== candidateStripped;
      const nextSourceBlockId = item.id || matchedTodo.todoMeta?.sourceBlockId;

      if (
        matchedTodo.title !== cleanItemText ||
        contentChanged ||
        matchedTodo.parentId !== nextParentId ||
        matchedTodo.color !== nextColor ||
        currentStatus !== nextStatus ||
        matchedTodo.todoMeta?.sourceBlockId !== nextSourceBlockId
      ) {
        const updated: Note = {
          ...matchedTodo,
          title: cleanItemText,
          parentId: nextParentId,
          color: nextColor,
          content: contentChanged ? candidateContent : matchedTodo.content,
          tags: Array.from(
            new Set([
              ...(matchedTodo.tags || []).filter((t) => !['todo', 'doing', 'done', 'drop'].includes(t)),
              '할일',
              nextStatus,
            ])
          ),
          todoMeta: {
            ...matchedTodo.todoMeta,
            sourceNoteId: sourceNote.id,
            sourceBlockId: nextSourceBlockId,
            status: nextStatus,
            completedAt: nextStatus === 'done' ? matchedTodo.todoMeta?.completedAt || now : null,
          },
          updatedAt: now,
        };
        updatedMap.set(updated.id, updated);
        changed = true;
      }
    }
  }

  if (!changed) {
    return { updatedNotes: allNotes, changed: false };
  }

  return {
    updatedNotes: allNotes.map((n) => updatedMap.get(n.id) || n),
    changed: true,
  };
}
