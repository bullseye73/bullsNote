// MODEL: Notion 스타일 @ 멘션 및 / 슬래시 메뉴 날짜 자동완성 아이템 생성기
import { DefaultReactSuggestionItem } from '@blocknote/react';
import type { BlockNoteEditor } from '@blocknote/core';
import { filterSuggestionItems } from '@blocknote/core';
import {
  IconCalendar,
  IconCalendarCheck,
  IconCalendarEvent,
  IconCalendarMinus,
  IconCalendarPlus,
  IconCalendarWeek,
} from '@tabler/icons-react';
import {
  formatDateIso,
  formatDateWithWeekday,
  getNextMonday,
  getThisSaturday,
  getToday,
  getTomorrow,
  getYesterday,
  parseDynamicDate,
} from './dateUtils';
import { SHORTCUTS } from './shortcutUtils';

type AnyEditor = BlockNoteEditor<any, any, any>;

/**
 * @ 멘션 입력 시 표시되는 Notion 스타일 날짜 추천 아이템 목록
 */
export function getDateAtSuggestions(
  query: string,
  editor: AnyEditor,
  onOpenPicker: () => void
): DefaultReactSuggestionItem[] {
  const today = getToday();
  const tomorrow = getTomorrow();
  const yesterday = getYesterday();
  const nextMonday = getNextMonday();
  const thisSaturday = getThisSaturday();

  const presetItems: DefaultReactSuggestionItem[] = [
    {
      title: '특정 날짜 선택 (달력)...',
      subtext: '원하는 과거/미래 날짜 및 시간 직접 선택',
      badge: '달력',
      aliases: ['달력', 'calendar', 'date', 'picker', '선택', '날짜', '특정'],
      group: '날짜',
      icon: <IconCalendarEvent size={18} color="var(--mantine-color-blue-5)" />,
      onItemClick: () => {
        onOpenPicker();
      },
    },
    {
      title: `오늘 (${formatDateIso(today)})`,
      subtext: `오늘 날짜 (${formatDateWithWeekday(today)})`,
      badge: SHORTCUTS.insertDateBadge,
      aliases: ['오늘', 'today', 'now', '현재'],
      group: '날짜',
      icon: <IconCalendar size={18} color="var(--mantine-color-teal-5)" />,
      onItemClick: () => {
        editor.insertInlineContent(formatDateIso(today));
      },
    },
    {
      title: `내일 (${formatDateIso(tomorrow)})`,
      subtext: `내일 날짜 (${formatDateWithWeekday(tomorrow)})`,
      badge: '내일',
      aliases: ['내일', 'tomorrow'],
      group: '날짜',
      icon: <IconCalendarPlus size={18} color="var(--mantine-color-cyan-5)" />,
      onItemClick: () => {
        editor.insertInlineContent(formatDateIso(tomorrow));
      },
    },
    {
      title: `어제 (${formatDateIso(yesterday)})`,
      subtext: `어제 날짜 (${formatDateWithWeekday(yesterday)})`,
      aliases: ['어제', 'yesterday'],
      group: '날짜',
      icon: <IconCalendarMinus size={18} color="var(--mantine-color-gray-5)" />,
      onItemClick: () => {
        editor.insertInlineContent(formatDateIso(yesterday));
      },
    },
    {
      title: `다음 주 월요일 (${formatDateIso(nextMonday)})`,
      subtext: `다음 주 시작일 (${formatDateWithWeekday(nextMonday)})`,
      aliases: ['다음주', 'next week', '월요일', '다음'],
      group: '날짜',
      icon: <IconCalendarWeek size={18} color="var(--mantine-color-grape-5)" />,
      onItemClick: () => {
        editor.insertInlineContent(formatDateIso(nextMonday));
      },
    },
    {
      title: `이번 주말 (${formatDateIso(thisSaturday)})`,
      subtext: `이번 주 토요일 (${formatDateWithWeekday(thisSaturday)})`,
      aliases: ['주말', 'weekend', '토요일'],
      group: '날짜',
      icon: <IconCalendarEvent size={18} color="var(--mantine-color-orange-5)" />,
      onItemClick: () => {
        editor.insertInlineContent(formatDateIso(thisSaturday));
      },
    },
  ];

  const trimmed = query.trim();
  if (!trimmed) {
    return presetItems;
  }

  // 동적 날짜 파싱 (예: 11/20, 2026-12-25, 10월 15일, +3일 등)
  const parsed = parseDynamicDate(trimmed);
  const filteredPresets = filterSuggestionItems(presetItems, trimmed);

  if (parsed) {
    const dynamicItem: DefaultReactSuggestionItem = {
      title: `입력한 날짜: ${formatDateIso(parsed)}`,
      subtext: `${formatDateWithWeekday(parsed)} 삽입`,
      badge: 'Enter',
      aliases: [trimmed],
      group: '입력된 날짜',
      icon: <IconCalendarCheck size={18} color="var(--mantine-color-blue-6)" />,
      onItemClick: () => {
        editor.insertInlineContent(formatDateIso(parsed));
      },
    };
    return [dynamicItem, ...filteredPresets];
  }

  return filteredPresets;
}

/**
 * / 슬래시 메뉴에 통합되는 날짜 아이템 목록
 */
export function getDateSlashMenuItems(
  editor: AnyEditor,
  onOpenPicker: () => void
): DefaultReactSuggestionItem[] {
  const today = getToday();
  const tomorrow = getTomorrow();

  return [
    {
      title: '날짜 삽입 (달력 / 사용자 지정)...',
      subtext: '원하는 날짜/시간 달력에서 직접 선택',
      badge: '달력',
      aliases: ['날짜', '달력', 'date', 'calendar', 'time'],
      group: '날짜 삽입',
      icon: <IconCalendarEvent size={18} color="var(--mantine-color-blue-5)" />,
      onItemClick: () => {
        onOpenPicker();
      },
    },
    {
      title: `오늘 날짜 (${formatDateIso(today)})`,
      subtext: `오늘 날짜 삽입 (${formatDateWithWeekday(today)})`,
      badge: SHORTCUTS.insertDateBadge,
      aliases: ['오늘', 'today', '날짜', '현재'],
      group: '날짜 삽입',
      icon: <IconCalendar size={18} color="var(--mantine-color-teal-5)" />,
      onItemClick: () => {
        editor.insertInlineContent(formatDateIso(today));
      },
    },
    {
      title: `내일 날짜 (${formatDateIso(tomorrow)})`,
      subtext: `내일 날짜 삽입 (${formatDateWithWeekday(tomorrow)})`,
      aliases: ['내일', 'tomorrow'],
      group: '날짜 삽입',
      icon: <IconCalendarPlus size={18} color="var(--mantine-color-cyan-5)" />,
      onItemClick: () => {
        editor.insertInlineContent(formatDateIso(tomorrow));
      },
    },
  ];
}
