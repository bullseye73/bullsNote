// MODEL: 달력 기반 노트 집계 및 달력 그리드 계산 서비스
import { Note } from './Note';
import { formatDateIso } from './dateUtils';

export interface CalendarDayCell {
  date: Date;
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  dayOfWeek: number; // 0: 일요일, 6: 토요일
}

/**
 * 특정 연도와 월(0~11)에 해당하는 7열 달력 날짜 그리드 배열 생성
 * (5주 35칸 또는 6주 42칸으로 최적화)
 */
export function getCalendarMatrix(year: number, month: number): CalendarDayCell[] {
  const firstDay = new Date(year, month, 1);
  const startingDayOfWeek = firstDay.getDay(); // 0: 일요일

  // 일요일 시작 기준 첫 주 첫 날
  const startDate = new Date(year, month, 1 - startingDayOfWeek);
  const matrix: CalendarDayCell[] = [];
  const todayStr = formatDateIso(new Date());

  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    const dateStr = formatDateIso(d);
    matrix.push({
      date: d,
      dateStr,
      dayNumber: d.getDate(),
      isCurrentMonth: d.getMonth() === month,
      isToday: dateStr === todayStr,
      dayOfWeek: d.getDay(),
    });
  }

  // 6번째 주(35~41번째 셀)에 이번 달 날짜가 하나도 없으면 5주(35칸)로 축소하여 높이 절약
  if (!matrix.slice(35).some((c) => c.isCurrentMonth)) {
    return matrix.slice(0, 35);
  }

  return matrix;
}

/**
 * 노트 목록에서 작성일(createdAt) 기준으로 날짜별(YYYY-MM-DD) 노트 맵 생성
 */
export function buildCreatedDateMap(notes: Note[]): Map<string, Note[]> {
  const map = new Map<string, Note[]>();
  for (const note of notes) {
    if (!note.createdAt) continue;
    const dateStr = formatDateIso(new Date(note.createdAt));
    const list = map.get(dateStr);
    if (list) {
      list.push(note);
    } else {
      map.set(dateStr, [note]);
    }
  }
  return map;
}
