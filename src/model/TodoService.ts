// MODEL: 할일관리(Todo) 프로젝트 및 상위 그룹(To Do, Doing, Done, Drop) 비즈니스 로직
import { Note, Project, TodoMeta, TodoStatus, createEmptyNote } from './Note';
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
 * 할일관리 프로젝트 및 상위 4대 그룹(To Do, Doing, Done, Drop)이 존재하는지 확인하고 보장
 */
export function ensureTodoProjectAndGroups(
  projects: Project[],
  notes: Note[]
): { projects: Project[]; notes: Note[]; created: boolean } {
  let created = false;
  let nextProjects = [...projects];
  let nextNotes = [...notes];

  // 1. 할일관리 프로젝트 확인/생성
  const hasTodoProject = nextProjects.some((p) => p.id === TODO_PROJECT_ID);
  if (!hasTodoProject) {
    const todoProject: Project = {
      id: TODO_PROJECT_ID,
      name: TODO_PROJECT_NAME,
      icon: TODO_PROJECT_ICON,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    nextProjects = [todoProject, ...nextProjects];
    created = true;
  }

  // 2. 4대 상위 그룹 노트 확인/생성 및 무결성 강제 보정
  TODO_GROUPS.forEach((group, index) => {
    const existing = nextNotes.find((n) => n.id === group.id);
    if (!existing) {
      const now = Date.now() + index; // 순서 보장
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
        createdAt: now,
        updatedAt: now,
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

/**
 * 마크다운 텍스트에서 체크리스트 항목(- [ ] / - [x]) 추출
 */
export function extractChecklistFromMarkdown(md: string): Array<{ text: string; checked: boolean }> {
  if (!md) return [];
  const lines = md.split('\n');
  const items: Array<{ text: string; checked: boolean }> = [];

  for (const line of lines) {
    const match = line.match(/^[\s*-]*\[([ xX])\]\s*(.*)$/);
    if (match) {
      const checked = match[1].toLowerCase() === 'x';
      let text = match[2].trim();
      // 기존 완료/중단 텍스트 태그가 붙어있으면 본문 정리
      text = cleanTodoSuffix(text);
      if (text) {
        items.push({ text, checked });
      }
    }
  }

  return items;
}

/**
 * BlockNote 블록들에서 체크리스트 블록(checkListItem) 추출
 */
export function extractChecklistFromBlocks(
  blocksJsonOrArray: unknown
): Array<{ id: string; text: string; checked: boolean }> {
  let blocks: Array<Record<string, unknown>> | undefined;
  if (typeof blocksJsonOrArray === 'string') {
    blocks = parseBlocks(blocksJsonOrArray);
  } else if (Array.isArray(blocksJsonOrArray)) {
    blocks = blocksJsonOrArray as Array<Record<string, unknown>>;
  }

  if (!blocks) return [];

  const results: Array<{ id: string; text: string; checked: boolean }> = [];

  function traverse(list: Array<Record<string, unknown>>) {
    for (const b of list) {
      if (b.type === 'checkListItem') {
        const id = (b.id as string) || '';
        const props = (b.props as Record<string, unknown>) || {};
        const checked = Boolean(props.checked);
        const contentArr = (b.content as Array<{ text?: string }>) || [];
        const rawText = contentArr.map((c) => c.text || '').join('');
        const text = cleanTodoSuffix(rawText);
        if (text) {
          results.push({ id, text, checked });
        }
      }
      if (Array.isArray(b.children)) {
        traverse(b.children as Array<Record<string, unknown>>);
      }
    }
  }

  traverse(blocks);
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
 * 할일 노트를 생성할 때 사용하는 초기 블록 JSON 생성
 */
export function buildTodoNoteContent(sourceNote: Note, todoText: string): string {
  const nowStr = formatDateTimeIso(new Date());
  const sourceTitle = sourceNote.title || '제목 없음';

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
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: todoText,
        },
      ],
    },
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
 * 개별 체크리스트 항목들로부터 '할일관리' 프로젝트의 To Do 그룹 하위 노트들 생성
 */
export function createTodoNotes(
  sourceNote: Note,
  items: Array<{ id?: string; text: string; checked?: boolean }>,
  existingNotes: Note[]
): { newNotes: Note[]; duplicateCount: number } {
  const newNotes: Note[] = [];
  let duplicateCount = 0;
  const now = Date.now();

  items.forEach((item, idx) => {
    const cleanText = cleanTodoSuffix(item.text);
    if (!cleanText) return;

    // 중복 검사: 이미 동일 원본 노트의 동일 블록ID 또는 동일 텍스트로 등록된 활성 할일이 있는지 확인
    const isDuplicate = existingNotes.some(
      (n) =>
        n.projectId === TODO_PROJECT_ID &&
        n.todoMeta?.sourceNoteId === sourceNote.id &&
        ((item.id && n.todoMeta?.sourceBlockId === item.id) || n.title === cleanText)
    );

    if (isDuplicate) {
      duplicateCount++;
      return;
    }

    const todoNote = createEmptyNote({
      title: cleanText,
      projectId: TODO_PROJECT_ID,
      parentId: item.checked ? TODO_GROUP_DONE_ID : TODO_GROUP_TODO_ID,
      color: 'blue',
      tags: ['할일', item.checked ? 'done' : 'todo'],
      content: buildTodoNoteContent(sourceNote, cleanText),
      todoMeta: {
        sourceNoteId: sourceNote.id,
        sourceBlockId: item.id,
        status: item.checked ? 'done' : 'todo',
        completedAt: item.checked ? now : null,
      },
      createdAt: now + idx,
      updatedAt: now + idx,
    });

    newNotes.push(todoNote);
  });

  return { newNotes, duplicateCount };
}

/**
 * 할일 노드가 To Do, Doing, Done, Drop으로 이동(상태 변경)될 때
 * 원본 노트 본문의 체크리스트([x] 및 완료/중단 일시)를 동기화
 */
export function syncTodoStatusToSourceNote(
  todoNote: Note,
  newStatus: TodoStatus,
  allNotes: Note[]
): { updatedNotes: Note[]; sourceUpdated: boolean } {
  const now = Date.now();
  const nowStr = formatDateTimeIso(new Date(now));
  const targetGroupId = STATUS_TO_GROUP_ID[newStatus];
  const targetGroup = TODO_GROUPS.find((g) => g.status === newStatus);
  const statusColor = targetGroup?.color || 'blue';

  // 1. 할일 노트 자체 갱신 (상태별 색상 동적 변경)
  const updatedTodo: Note = {
    ...todoNote,
    projectId: TODO_PROJECT_ID,
    parentId: targetGroupId,
    color: statusColor,
    tags: Array.from(new Set([...(todoNote.tags || []).filter((t) => !['todo', 'doing', 'done', 'drop'].includes(t)), newStatus])),
    todoMeta: {
      ...(todoNote.todoMeta || { status: 'todo' }),
      status: newStatus,
      completedAt: newStatus === 'done' ? (todoNote.todoMeta?.completedAt || now) : null,
      droppedAt: newStatus === 'drop' ? (todoNote.todoMeta?.droppedAt || now) : null,
    },
    updatedAt: now,
  };

  const updatedNotesMap = new Map<string, Note>();
  updatedNotesMap.set(updatedTodo.id, updatedTodo);

  // 2. 원본 노트가 있는 경우 원본 노트의 본문 체크리스트 갱신
  let sourceUpdated = false;
  const sourceNoteId = todoNote.todoMeta?.sourceNoteId;
  const sourceBlockId = todoNote.todoMeta?.sourceBlockId;
  const todoCleanTitle = cleanTodoSuffix(todoNote.title);

  if (sourceNoteId) {
    const sourceNote = allNotes.find((n) => n.id === sourceNoteId);
    if (sourceNote) {
      const blocks = parseBlocks(sourceNote.content);
      if (blocks) {
        let blockFound = false;

        function updateChecklistBlocks(list: Array<Record<string, unknown>>) {
          for (const b of list) {
            if (b.type === 'checkListItem') {
              const currentId = b.id as string;
              const contentArr = (b.content as Array<{ text?: string; styles?: Record<string, unknown> }>) || [];
              const rawText = contentArr.map((c) => c.text || '').join('');
              const cleanItemText = cleanTodoSuffix(rawText);

              // blockId가 일치하거나 텍스트가 일치하는 블록 탐색
              const isMatch = (sourceBlockId && currentId === sourceBlockId) || cleanItemText === todoCleanTitle;

              if (isMatch) {
                blockFound = true;
                const props = ((b.props as Record<string, unknown>) || {});

                if (newStatus === 'done') {
                  // 완료 처리: checked = true, 접미사 (완료: YYYY-MM-DD HH:mm)
                  b.props = { ...props, checked: true };
                  b.content = [
                    {
                      type: 'text',
                      text: `${cleanItemText} (완료: ${nowStr})`,
                      styles: { strike: false },
                    },
                  ];
                } else if (newStatus === 'drop') {
                  // 중단 처리: checked = false, 취소선 + 접미사 (중단: YYYY-MM-DD HH:mm)
                  b.props = { ...props, checked: false };
                  b.content = [
                    {
                      type: 'text',
                      text: `${cleanItemText} (중단: ${nowStr})`,
                      styles: { strike: true, textColor: 'gray' },
                    },
                  ];
                } else {
                  // todo 또는 doing으로 복귀: checked = false, 접미사 제거
                  b.props = { ...props, checked: false };
                  b.content = [
                    {
                      type: 'text',
                      text: cleanItemText,
                      styles: { strike: false },
                    },
                  ];
                }
              }
            }
            if (Array.isArray(b.children)) {
              updateChecklistBlocks(b.children as Array<Record<string, unknown>>);
            }
          }
        }

        updateChecklistBlocks(blocks);

        if (blockFound) {
          const updatedSource: Note = {
            ...sourceNote,
            content: JSON.stringify(blocks),
            updatedAt: now,
          };
          updatedNotesMap.set(updatedSource.id, updatedSource);
          sourceUpdated = true;
        }
      }
    }
  }

  // 전체 리스트 맵핑 반영
  const resultNotes = allNotes.map((n) => updatedNotesMap.get(n.id) || n);
  if (!allNotes.some((n) => n.id === updatedTodo.id)) {
    resultNotes.push(updatedTodo);
  }

  return { updatedNotes: resultNotes, sourceUpdated };
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
    (n) => n.projectId === TODO_PROJECT_ID && n.todoMeta?.sourceNoteId === sourceNote.id
  );

  for (const item of currentItems) {
    const cleanItemText = cleanTodoSuffix(item.text);
    const matchedTodo = relatedTodoNotes.find(
      (n) => (item.id && n.todoMeta?.sourceBlockId === item.id) || cleanTodoSuffix(n.title) === cleanItemText
    );

    if (matchedTodo) {
      const currentStatus = matchedTodo.todoMeta?.status || GROUP_ID_TO_STATUS[matchedTodo.parentId || ''] || 'todo';
      const shouldBeDone = item.checked;

      if (shouldBeDone && currentStatus !== 'done') {
        // 체크됨 -> Done으로 이동 (색상: mint)
        const updated: Note = {
          ...matchedTodo,
          parentId: TODO_GROUP_DONE_ID,
          color: 'mint',
          tags: Array.from(new Set([...(matchedTodo.tags || []).filter((t) => !['todo', 'doing', 'done', 'drop'].includes(t)), 'done'])),
          todoMeta: {
            ...matchedTodo.todoMeta,
            status: 'done',
            completedAt: now,
          },
          updatedAt: now,
        };
        updatedMap.set(updated.id, updated);
        changed = true;
      } else if (!shouldBeDone && currentStatus === 'done') {
        // 체크 해제됨 -> To Do로 복귀 (색상: blue)
        const updated: Note = {
          ...matchedTodo,
          parentId: TODO_GROUP_TODO_ID,
          color: 'blue',
          tags: Array.from(new Set([...(matchedTodo.tags || []).filter((t) => !['todo', 'doing', 'done', 'drop'].includes(t)), 'todo'])),
          todoMeta: {
            ...matchedTodo.todoMeta,
            status: 'todo',
            completedAt: null,
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
