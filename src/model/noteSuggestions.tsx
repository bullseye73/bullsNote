// MODEL: @ 멘션 및 / 슬래시 메뉴를 통한 다른 노트 / 서브노트 및 날짜 제안 통합
import { DefaultReactSuggestionItem } from '@blocknote/react';
import type { BlockNoteEditor } from '@blocknote/core';
import { filterSuggestionItems } from '@blocknote/core';
import {
  IconCornerDownRight,
  IconFileText,
  IconFolderUp,
  IconLink,
  IconPaperclip,
} from '@tabler/icons-react';
import { Note, Project } from './Note';
import { getDateAtSuggestions } from './dateSuggestions';

type AnyEditor = BlockNoteEditor<any, any, any>;

/**
 * 에디터의 현재 커서 위치에 대상 노트로의 인라인 링크 삽입
 */
export function insertNoteLink(editor: AnyEditor, targetNote: Note) {
  const title = (targetNote.title || '제목 없음').trim();
  editor.insertInlineContent([
    {
      type: 'link',
      href: `#note-${targetNote.id}`,
      content: `📄 ${title}`,
    },
    ' ',
  ]);
  // 비동기 틱으로 에디터 포커스를 복원하여 즉시 쓰기 모드 유지
  requestAnimationFrame(() => {
    try {
      editor.focus();
    } catch {}
  });
}

/**
 * @ 멘션 입력 시 나타나는 통합 추천 아이템 목록:
 * 1. 직속 서브노트 (하위 노트)
 * 2. 부모 노트 (상위 노트)
 * 3. 다른 노트들 (제목 및 태그 기반 실시간 필터링)
 * 4. Notion 스타일 날짜 프리셋 & 동적 날짜
 */
export function getCombinedAtSuggestions(
  query: string,
  editor: AnyEditor,
  notes: Note[],
  currentNote: Note,
  projects: Project[],
  onOpenDatePicker: () => void
): DefaultReactSuggestionItem[] {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const trimmed = query.trim().toLowerCase();

  // 단 1회(O(N)) 순회로 서브노트, 부모노트, 기타 노트 분류 (중복 filter/find 제거)
  const subNotes: Note[] = [];
  let parentNote: Note | null = null;
  const otherNotes: Note[] = [];

  for (const n of notes) {
    if (n.id === currentNote.id) continue;
    if (n.parentId === currentNote.id) {
      subNotes.push(n);
    } else if (currentNote.parentId && n.id === currentNote.parentId) {
      parentNote = n;
    } else {
      otherNotes.push(n);
    }
  }

  // 1. 현재 노트의 직속 하위(서브) 노트들
  const subNoteItems: DefaultReactSuggestionItem[] = subNotes.map((n) => ({
    title: n.title || '제목 없음',
    subtext: '↳ 하위 서브노트로 링크 연결',
    badge: '서브노트',
    aliases: [n.title, ...(n.tags || []), 'subnote', '서브노트'],
    group: '하위 서브노트',
    icon: <IconCornerDownRight size={18} color="var(--mantine-color-grape-6)" />,
    onItemClick: () => insertNoteLink(editor, n),
  }));

  // 2. 부모 노트 (있을 경우)
  const parentItems: DefaultReactSuggestionItem[] = parentNote
    ? [
        {
          title: parentNote.title || '제목 없음',
          subtext: '↰ 상위 부모 노트로 링크 연결',
          badge: '부모 노트',
          aliases: [parentNote.title, ...(parentNote.tags || []), 'parent', '부모'],
          group: '상위 부모 노트',
          icon: <IconFolderUp size={18} color="var(--mantine-color-orange-6)" />,
          onItemClick: () => insertNoteLink(editor, parentNote),
        },
      ]
    : [];

  // 3. 다른 모든 노트들 (최근 수정순 정렬)
  const sortedOtherNotes = otherNotes.sort((a, b) => b.updatedAt - a.updatedAt);

  const otherNoteItems: DefaultReactSuggestionItem[] = sortedOtherNotes.map((n) => {
    const proj = projectMap.get(n.projectId || 'default');
    const projDesc = proj ? `${proj.icon} ${proj.name}` : '';
    const tagDesc = n.tags.length > 0 ? ` · #${n.tags.slice(0, 3).join(' #')}` : '';

    return {
      title: n.title || '제목 없음',
      subtext: `${projDesc}${tagDesc}` || '노트 바로가기 링크',
      badge: n.tags[0] ? `#${n.tags[0]}` : undefined,
      aliases: [n.title, ...(n.tags || []), proj?.name || ''],
      group: '노트 링크',
      icon: <IconFileText size={18} color="var(--mantine-color-blue-6)" />,
      onItemClick: () => insertNoteLink(editor, n),
    };
  });

  // 4. 날짜 제안 아이템들 (기존 dateSuggestions 로직 활용)
  const dateItems = getDateAtSuggestions(query, editor, onOpenDatePicker);

  const allNoteItems = [...subNoteItems, ...parentItems, ...otherNoteItems];

  if (!trimmed) {
    // 쿼리가 없을 때: 서브노트, 부모노트, 최근 노트 최대 6개 + 기본 날짜 프리셋
    const recentOthers = otherNoteItems.slice(0, 6);
    return [...subNoteItems, ...parentItems, ...recentOthers, ...dateItems];
  }

  // 쿼리가 있을 때: 검색어 필터링
  const filteredNotes = filterSuggestionItems(allNoteItems, query);

  // 날짜 아이템과 노트 아이템 병합 (노트가 먼저 오고 그 뒤 날짜)
  return [...filteredNotes, ...dateItems];
}

/**
 * / 슬래시 메뉴에 추가할 노트/서브노트 링크 및 파일 첨부 아이템
 */
export function getNoteSlashMenuItems(
  editor: AnyEditor,
  notes: Note[],
  currentNote: Note,
  onAttachFile?: () => void
): DefaultReactSuggestionItem[] {
  const subNotes = notes.filter((n) => n.parentId === currentNote.id);

  const items: DefaultReactSuggestionItem[] = [
    {
      title: '노트 링크 삽입 (@노트 멘션)',
      subtext: '다른 노트나 서브노트로 이동하는 링크를 검색하여 삽입합니다',
      badge: '@',
      aliases: ['노트', '링크', 'link', 'note', 'page', '멘션', '참조'],
      group: '노트 링크',
      icon: <IconLink size={18} color="var(--mantine-color-blue-6)" />,
      onItemClick: () => {
        // 슬래시 메뉴 팝오버 닫힘 후 안정적으로 포커스를 복원하고 @ 삽입
        requestAnimationFrame(() => {
          try {
            editor.focus();
            editor.insertInlineContent('@');
          } catch {}
        });
      },
    },
    {
      title: '파일 첨부 (Supabase Storage)',
      subtext: '클라우드 스토리지에 파일을 업로드하고 본문에 연결합니다',
      badge: '스토리지',
      aliases: ['파일', '첨부', 'file', 'upload', 'attach', '스토리지'],
      group: '미디어 및 파일',
      icon: <IconPaperclip size={18} color="var(--mantine-color-teal-6)" />,
      onItemClick: () => {
        if (onAttachFile) {
          onAttachFile();
        }
      },
    },
  ];

  // 서브노트가 있는 경우 빠른 서브노트 바로가기 슬래시 아이템 제공
  if (subNotes.length > 0) {
    subNotes.slice(0, 3).forEach((sub) => {
      items.push({
        title: `서브노트: ${sub.title || '제목 없음'}`,
        subtext: '하위 서브노트 링크 삽입',
        badge: '서브노트',
        aliases: ['서브노트', 'subnote', sub.title],
        group: '노트 링크',
        icon: <IconCornerDownRight size={18} color="var(--mantine-color-grape-6)" />,
        onItemClick: () => insertNoteLink(editor, sub),
      });
    });
  }

  return items;
}
