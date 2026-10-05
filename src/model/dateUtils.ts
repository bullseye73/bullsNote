// MODEL / UTIL: 날짜 서식 및 동적 파싱 유틸리티 (Notion 스타일 날짜 완성 지원)

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD */
export function formatDateIso(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** YYYY-MM-DD (요일) */
export function formatDateWithWeekday(date: Date): string {
  return `${formatDateIso(date)} (${WEEKDAYS[date.getDay()]})`;
}

/** YYYY년 M월 D일 */
export function formatDateKorean(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** YYYY년 M월 D일 (요일) */
export function formatDateKoreanWithWeekday(date: Date): string {
  return `${formatDateKorean(date)} (${WEEKDAYS[date.getDay()]})`;
}

/** HH:mm */
export function formatTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** YYYY-MM-DD HH:mm */
export function formatDateTimeIso(date: Date, timeStr?: string): string {
  const t = timeStr || formatTime(date);
  return `${formatDateIso(date)} ${t}`;
}

/** YYYY년 M월 D일 (요일) HH:mm */
export function formatDateTimeKorean(date: Date, timeStr?: string): string {
  const t = timeStr || formatTime(date);
  return `${formatDateKoreanWithWeekday(date)} ${t}`;
}

/** 오늘 00:00:00 기준 Date */
export function getToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 내일 Date */
export function getTomorrow(): Date {
  const d = getToday();
  d.setDate(d.getDate() + 1);
  return d;
}

/** 어제 Date */
export function getYesterday(): Date {
  const d = getToday();
  d.setDate(d.getDate() - 1);
  return d;
}

/** 다음 주 월요일 */
export function getNextMonday(): Date {
  const d = getToday();
  const currentDay = d.getDay(); // 0: 일, 1: 월 ...
  let diff = 1 - currentDay;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** 이번 주 토요일 */
export function getThisSaturday(): Date {
  const d = getToday();
  const currentDay = d.getDay();
  let diff = 6 - currentDay;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** 상대 일자 계산 (+N일) */
export function getRelativeDays(days: number): Date {
  const d = getToday();
  d.setDate(d.getDate() + days);
  return d;
}

/** 상대 개월 계산 (+N개월) */
export function getRelativeMonths(months: number): Date {
  const d = getToday();
  d.setMonth(d.getMonth() + months);
  return d;
}

export type DateFormatStyle =
  | 'iso' // 2026-10-05
  | 'iso-weekday' // 2026-10-05 (월)
  | 'korean' // 2026년 10월 5일
  | 'korean-weekday' // 2026년 10월 5일 (월)
  | 'time-iso' // 2026-10-05 14:30
  | 'time-korean'; // 2026년 10월 5일 (월) 14:30

/** 포맷 스타일과 시간 문자열에 따른 최종 문자열 생성 */
export function formatFormattedDate(
  date: Date,
  style: DateFormatStyle,
  includeTime = false,
  timeStr?: string
): string {
  if (includeTime) {
    if (style.includes('korean')) {
      return formatDateTimeKorean(date, timeStr);
    }
    return formatDateTimeIso(date, timeStr);
  }

  switch (style) {
    case 'iso':
      return formatDateIso(date);
    case 'iso-weekday':
      return formatDateWithWeekday(date);
    case 'korean':
      return formatDateKorean(date);
    case 'korean-weekday':
      return formatDateKoreanWithWeekday(date);
    case 'time-iso':
      return formatDateTimeIso(date, timeStr);
    case 'time-korean':
      return formatDateTimeKorean(date, timeStr);
    default:
      return formatDateIso(date);
  }
}

/**
 * 사용자 입력 쿼리(예: '11/20', '2026-12-25', '10월 15일', '+3일', '25일')를 Date로 동적 파싱
 */
export function parseDynamicDate(query: string): Date | null {
  if (!query) return null;
  const q = query.trim().toLowerCase();
  if (q.length < 1) return null;

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  // YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  let m = q.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const da = parseInt(m[3], 10);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      const d = new Date(y, mo - 1, da);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // MM-DD or MM/DD or MM.DD
  m = q.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const mo = parseInt(m[1], 10);
    const da = parseInt(m[2], 10);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      const d = new Date(curYear, mo - 1, da);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // YYYY년 M월 D일
  m = q.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일?$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const da = parseInt(m[3], 10);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      const d = new Date(y, mo - 1, da);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // M월 D일
  m = q.match(/^(\d{1,2})월\s*(\d{1,2})일?$/);
  if (m) {
    const mo = parseInt(m[1], 10);
    const da = parseInt(m[2], 10);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      const d = new Date(curYear, mo - 1, da);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // D일
  m = q.match(/^(\d{1,2})일$/);
  if (m) {
    const da = parseInt(m[1], 10);
    if (da >= 1 && da <= 31) {
      const d = new Date(curYear, curMonth, da);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // +N일, +Nd, +Nday
  m = q.match(/^\+(\d+)(?:일|d|day)?$/);
  if (m) {
    const days = parseInt(m[1], 10);
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  }

  // +N주, +Nw, +Nweek
  m = q.match(/^\+(\d+)(?:주|w|week)?$/);
  if (m) {
    const weeks = parseInt(m[1], 10);
    const d = new Date();
    d.setDate(d.getDate() + weeks * 7);
    return d;
  }

  // +N달, +N개월, +Nm, +Nmonth
  m = q.match(/^\+(\d+)(?:달|개월|m|month)?$/);
  if (m) {
    const months = parseInt(m[1], 10);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d;
  }

  return null;
}
