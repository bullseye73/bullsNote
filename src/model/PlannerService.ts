// MODEL: 플래너(Schedule / Gantt) 일정 계산, 근무일(Working Day · 주말/공휴일 제외) 엔진 및 Due-Date 09:00 알림 자동화 서비스
import { Note, NoteReminder, TodoMeta, TodoStatus } from './Note';
import { getEffectiveTodoStatus, isSystemGroupNote, TODO_PROJECT_ID } from './TodoService';

export type PlannerViewScale = 'day' | 'week' | 'month';

export interface CustomHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

const CUSTOM_HOLIDAYS_STORAGE_KEY = 'bullsnote.planner.customHolidays.v1';

/**
 * 양력 고정 대한민국 공휴일 (MM-DD)
 */
const SOLAR_FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': '신정',
  '03-01': '삼일절',
  '05-05': '어린이날',
  '06-06': '현충일',
  '08-15': '광복절',
  '10-03': '개천절',
  '10-09': '한글날',
  '12-25': '성탄절',
};

/**
 * 연도별 대한민국 음력 공휴일(설날, 부처님오신날, 추석) 및 대체공휴일·주요 공휴일 (2024~2030)
 */
const YEARLY_KOREAN_HOLIDAYS: Record<string, string> = {
  // 2024년
  '2024-02-09': '설날 연휴',
  '2024-02-10': '설날',
  '2024-02-11': '설날 연휴',
  '2024-02-12': '대체공휴일(설날)',
  '2024-04-10': '국회의원 선거일',
  '2024-05-06': '대체공휴일(어린이날)',
  '2024-05-15': '부처님오신날',
  '2024-09-16': '추석 연휴',
  '2024-09-17': '추석',
  '2024-09-18': '추석 연휴',
  '2024-10-01': '국군의 날(임시)',

  // 2025년
  '2025-01-27': '임시공휴일',
  '2025-01-28': '설날 연휴',
  '2025-01-29': '설날',
  '2025-01-30': '설날 연휴',
  '2025-03-03': '대체공휴일(삼일절)',
  '2025-05-05': '어린이날·부처님오신날',
  '2025-05-06': '대체공휴일(부처님오신날)',
  '2025-10-05': '추석 연휴',
  '2025-10-06': '추석',
  '2025-10-07': '추석 연휴',
  '2025-10-08': '대체공휴일(추석)',

  // 2026년
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-02': '대체공휴일(삼일절)',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일(부처님오신날)',
  '2026-06-03': '지방선거일',
  '2026-08-17': '대체공휴일(광복절)',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-05': '대체공휴일(개천절)',

  // 2027년
  '2027-02-06': '설날 연휴',
  '2027-02-07': '설날',
  '2027-02-08': '설날 연휴',
  '2027-02-09': '대체공휴일(설날)',
  '2027-05-13': '부처님오신날',
  '2027-08-16': '대체공휴일(광복절)',
  '2027-09-14': '추석 연휴',
  '2027-09-15': '추석',
  '2027-09-16': '추석 연휴',
  '2027-10-04': '대체공휴일(개천절)',
  '2027-10-11': '대체공휴일(한글날)',
  '2027-12-27': '대체공휴일(성탄절)',

  // 2028년
  '2028-01-26': '설날 연휴',
  '2028-01-27': '설날',
  '2028-01-28': '설날 연휴',
  '2028-05-02': '부처님오신날',
  '2028-10-02': '추석 연휴',
  '2028-10-03': '추석·개천절',
  '2028-10-04': '추석 연휴',
  '2028-10-05': '대체공휴일(개천절)',

  // 2029년
  '2029-02-12': '설날 연휴',
  '2029-02-13': '설날',
  '2029-02-14': '설날 연휴',
  '2029-05-07': '대체공휴일(어린이날)',
  '2029-05-20': '부처님오신날',
  '2029-05-21': '대체공휴일(부처님오신날)',
  '2029-09-21': '추석 연휴',
  '2029-09-22': '추석',
  '2029-09-23': '추석 연휴',
  '2029-09-24': '대체공휴일(추석)',

  // 2030년
  '2030-02-02': '설날 연휴',
  '2030-02-03': '설날',
  '2030-02-04': '설날 연휴',
  '2030-02-05': '대체공휴일(설날)',
  '2030-05-06': '대체공휴일(어린이날)',
  '2030-05-09': '부처님오신날',
  '2030-09-11': '추석 연휴',
  '2030-09-12': '추석',
  '2030-09-13': '추석 연휴',
};

export function loadCustomHolidays(): CustomHoliday[] {
  try {
    const raw = localStorage.getItem(CUSTOM_HOLIDAYS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is CustomHoliday =>
          Boolean(item && typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date))
      )
      .map((item) => ({ date: item.date, name: String(item.name || '사용자 휴일').trim() }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export function saveCustomHolidays(holidays: CustomHoliday[]): void {
  try {
    localStorage.setItem(CUSTOM_HOLIDAYS_STORAGE_KEY, JSON.stringify(holidays));
  } catch {
    // ignore storage errors
  }
}

/**
 * 로컬 타임존 기준 Date -> YYYY-MM-DD 변환
 */
export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * YYYY-MM-DD 문자열을 로컬 정오(12:00:00) Date 객체로 안전하게 파싱 (DST/자정 오차 방지)
 */
export function parseIsoDateLocal(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
  if (!m) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

/**
 * 오늘 날짜 YYYY-MM-DD 반환
 */
export function getTodayIsoStr(): string {
  return toIsoDateLocal(new Date());
}

/**
 * 달력 일수 더하기/빼기 (YYYY-MM-DD 반환)
 */
export function addCalendarDays(dateStr: string, deltaDays: number): string {
  const d = parseIsoDateLocal(dateStr);
  d.setDate(d.getDate() + deltaDays);
  return toIsoDateLocal(d);
}

/**
 * 두 날짜(startDateStr, endDateStr) 사이의 달력 일수 차이 (end - start, 동일 날짜면 0)
 */
export function diffCalendarDays(startDateStr: string, endDateStr: string): number {
  const s = parseIsoDateLocal(startDateStr);
  const e = parseIsoDateLocal(endDateStr);
  return Math.round((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * 주말(토요일=6, 일요일=0) 여부 확인
 */
export function isWeekendDate(dateStr: string): boolean {
  const day = parseIsoDateLocal(dateStr).getDay();
  return day === 0 || day === 6;
}

/**
 * 공휴일(대한민국 법정공휴일 + 사용자 지정 휴일) 명칭 조회 (평일이면 null)
 */
export function getHolidayName(dateStr: string, customHolidays?: CustomHoliday[]): string | null {
  if (!dateStr || dateStr.length < 10) return null;
  if (customHolidays && customHolidays.length > 0) {
    const found = customHolidays.find((h) => h.date === dateStr);
    if (found) return found.name;
  }
  if (YEARLY_KOREAN_HOLIDAYS[dateStr]) {
    return YEARLY_KOREAN_HOLIDAYS[dateStr];
  }
  const mmdd = dateStr.slice(5, 10);
  if (SOLAR_FIXED_HOLIDAYS[mmdd]) {
    return SOLAR_FIXED_HOLIDAYS[mmdd];
  }
  return null;
}

/**
 * 비근무일(주말 또는 공휴일) 여부 판별
 */
export function isNonWorkingDay(dateStr: string, customHolidays?: CustomHoliday[]): boolean {
  return isWeekendDate(dateStr) || Boolean(getHolidayName(dateStr, customHolidays));
}

/**
 * 시작일이 주말/공휴일이고 useWorkingDays=true인 경우 가장 가까운 다음 근무일로 보정
 */
export function snapToWorkingDay(
  dateStr: string,
  useWorkingDays = true,
  customHolidays?: CustomHoliday[],
  direction: 1 | -1 = 1
): string {
  if (!useWorkingDays) return dateStr;
  let cur = dateStr;
  let guard = 0;
  while (isNonWorkingDay(cur, customHolidays) && guard < 365) {
    cur = addCalendarDays(cur, direction);
    guard++;
  }
  return cur;
}

/**
 * 시작일(startDateStr)과 실작업일수(durationDays)로부터 마감일(Due Date)을 계산
 * - useWorkingDays=true일 때 주말과 공휴일을 건너뛰어 N번째 근무일을 마감일로 반환
 * - 예: 금요일 시작 + Duration 2일 (주말 제외) -> 월요일이 Due Date
 */
export function calculateDueDateFromDuration(
  startDateStr: string,
  durationDays: number,
  useWorkingDays = true,
  customHolidays?: CustomHoliday[]
): string {
  const safeDuration = Math.max(1, Math.round(durationDays || 1));
  if (!useWorkingDays) {
    return addCalendarDays(startDateStr, safeDuration - 1);
  }

  let cur = snapToWorkingDay(startDateStr, true, customHolidays, 1);
  let remaining = safeDuration - 1;
  let guard = 0;

  while (remaining > 0 && guard < 3650) {
    cur = addCalendarDays(cur, 1);
    if (!isNonWorkingDay(cur, customHolidays)) {
      remaining--;
    }
    guard++;
  }
  return cur;
}

/**
 * 시작일(startDateStr)과 마감일(dueDateStr) 사이의 실작업일수(Duration) 계산
 * - useWorkingDays=true일 때 구간 내 주말·공휴일을 제외한 근무일 수 반환 (최소 1일)
 */
export function calculateDurationFromDates(
  startDateStr: string,
  dueDateStr: string,
  useWorkingDays = true,
  customHolidays?: CustomHoliday[]
): number {
  if (dueDateStr < startDateStr) return 1;
  if (!useWorkingDays) {
    return Math.max(1, diffCalendarDays(startDateStr, dueDateStr) + 1);
  }

  let cur = startDateStr;
  let count = 0;
  let guard = 0;
  while (cur <= dueDateStr && guard < 3650) {
    if (!isNonWorkingDay(cur, customHolidays)) {
      count++;
    }
    cur = addCalendarDays(cur, 1);
    guard++;
  }
  return Math.max(1, count);
}

/**
 * 구간 내 포함된 비근무일(주말/공휴일) 일수 및 상세 목록 반환 (UI 툴팁/안내용)
 */
export function getSkippedHolidaysInRange(
  startDateStr: string,
  dueDateStr: string,
  customHolidays?: CustomHoliday[]
): { weekendCount: number; holidays: Array<{ date: string; name: string }> } {
  if (!startDateStr || !dueDateStr || dueDateStr < startDateStr) {
    return { weekendCount: 0, holidays: [] };
  }
  let cur = startDateStr;
  let weekendCount = 0;
  const holidays: Array<{ date: string; name: string }> = [];
  let guard = 0;

  while (cur <= dueDateStr && guard < 1000) {
    const hName = getHolidayName(cur, customHolidays);
    const isWknd = isWeekendDate(cur);
    if (hName) {
      holidays.push({ date: cur, name: hName });
    } else if (isWknd) {
      weekendCount++;
    }
    cur = addCalendarDays(cur, 1);
    guard++;
  }
  return { weekendCount, holidays };
}

export interface SchedulePatchInput {
  startDate?: string | null;
  dueDate?: string | null;
  durationDays?: number | null;
  useWorkingDays?: boolean;
  progress?: number | null;
}

/**
 * 시작일 · 소요일(Working Days) · 마감일(Due Date) 3자 양방향 동기화 계산
 */
export function resolveTaskSchedulePatch(
  currentMeta: TodoMeta | undefined,
  patch: SchedulePatchInput,
  fallbackStartDateStr: string,
  customHolidays?: CustomHoliday[]
): {
  startDate: string;
  dueDate: string;
  durationDays: number;
  useWorkingDays: boolean;
  progress: number | null;
} {
  const useWorkingDays =
    patch.useWorkingDays !== undefined
      ? patch.useWorkingDays
      : currentMeta?.useWorkingDays !== false;

  let startDate =
    patch.startDate !== undefined && patch.startDate !== null
      ? patch.startDate
      : currentMeta?.startDate || fallbackStartDateStr;

  if (useWorkingDays && patch.startDate !== undefined && patch.dueDate === undefined) {
    startDate = snapToWorkingDay(startDate, true, customHolidays, 1);
  }

  let durationDays =
    patch.durationDays !== undefined && patch.durationDays !== null
      ? Math.max(1, Math.round(patch.durationDays))
      : Math.max(1, currentMeta?.durationDays || 1);

  let dueDate =
    patch.dueDate !== undefined && patch.dueDate !== null
      ? patch.dueDate
      : currentMeta?.dueDate ||
        calculateDueDateFromDuration(startDate, durationDays, useWorkingDays, customHolidays);

  // 1) 사용자가 Due Date를 직접 변경한 경우 (durationDays는 패치되지 않음)
  if (patch.dueDate !== undefined && patch.durationDays === undefined) {
    if (dueDate < startDate) {
      startDate = dueDate;
      durationDays = 1;
    } else {
      durationDays = calculateDurationFromDates(
        startDate,
        dueDate,
        useWorkingDays,
        customHolidays
      );
    }
  }
  // 2) 사용자가 Start Date 또는 Duration 또는 useWorkingDays를 변경한 경우 -> Due Date 자동 산출
  else {
    dueDate = calculateDueDateFromDuration(
      startDate,
      durationDays,
      useWorkingDays,
      customHolidays
    );
  }

  const progress =
    patch.progress !== undefined
      ? patch.progress
      : currentMeta?.progress !== undefined
      ? currentMeta.progress
      : null;

  return {
    startDate,
    dueDate,
    durationDays,
    useWorkingDays,
    progress,
  };
}

/**
 * 새 작업의 일정 계산: 마감일만 주어지면 마감일을 지키고 소요일을 역산, 아니면 소요일(기본 1일)로 마감일 산출
 */
export function buildNewTaskSchedule(
  params: { startDate?: string; dueDate?: string; durationDays?: number; useWorkingDays?: boolean },
  defaultStart: string,
  customHolidays?: CustomHoliday[]
): { startDate: string; dueDate: string; durationDays: number; useWorkingDays: boolean } {
  const useWorkingDays = params.useWorkingDays !== false;
  const keepDueDate = Boolean(params.dueDate) && params.durationDays === undefined;
  const r = resolveTaskSchedulePatch(
    { status: 'todo', useWorkingDays },
    {
      startDate: params.startDate ?? defaultStart,
      ...(keepDueDate ? { dueDate: params.dueDate } : { durationDays: params.durationDays ?? 1, dueDate: params.dueDate }),
      useWorkingDays,
    },
    defaultStart,
    customHolidays
  );
  return { startDate: r.startDate, dueDate: r.dueDate, durationDays: r.durationDays, useWorkingDays: r.useWorkingDays };
}

/**
 * Due Date 기준 오전 09:00 자동 알림(NoteReminder) 객체 생성
 * - 미래의 09:00이면 활성 알람(dismissed: false)으로 등록
 * - 이미 완료(done/drop)되었거나 현재 시각이 해당 날짜 09:00을 지난 경우 즉시 알람 모달이 뜨지 않도록 dismissed: true로 스마트 설정
 * - Google Calendar 자동 동기화(syncToCalendar: true) 기본 활성화 및 기존 calendarEventId 유지
 */
export function buildDueDateMorningReminder(
  dueDateStr: string,
  existingReminder?: NoteReminder | null,
  status?: TodoStatus
): NoteReminder {
  const parsed = parseIsoDateLocal(dueDateStr);
  const targetDate = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
    9,
    0,
    0,
    0
  );
  const targetAt = targetDate.getTime();
  const isCompleted = status === 'done' || status === 'drop';
  const isPast = targetAt <= Date.now();

  return {
    targetAt,
    repeat: existingReminder?.repeat || 'none',
    dismissed: isCompleted || isPast,
    snoozedUntil: null,
    syncToCalendar: existingReminder?.syncToCalendar !== false,
    calendarEventId: existingReminder?.calendarEventId ?? null,
    calendarHtmlLink: existingReminder?.calendarHtmlLink ?? null,
    calendarSyncError: null,
  };
}

export interface EffectiveTaskSchedule {
  noteId: string;
  startDate: string;
  dueDate: string;
  durationDays: number;
  calendarSpanDays: number;
  useWorkingDays: boolean;
  progress: number;
  status: TodoStatus;
  /** 하위 작업들의 일정으로부터 자동 요약(Roll-up)되었는지 여부 */
  isRollup: boolean;
  /** 사용자가 명시적으로 일정을 지정했는지 여부 (false면 생성일 기준 1일 기본값) */
  isExplicit: boolean;
  weekendCount: number;
  holidays: Array<{ date: string; name: string }>;
}

/**
 * 할일관리(TODO_PROJECT_ID) 내 모든 작업의 유효 일정 및 상위-하위 Roll-up 요약 계산
 */
export function computeEffectivePlannerMap(
  allNotes: Note[],
  customHolidays?: CustomHoliday[]
): Map<string, EffectiveTaskSchedule> {
  const todoNotes = allNotes.filter(
    (n) => n.projectId === TODO_PROJECT_ID && !isSystemGroupNote(n)
  );
  const byParent = new Map<string, Note[]>();
  for (const n of todoNotes) {
    if (!n.parentId || isSystemGroupNote(n.parentId)) continue;
    const arr = byParent.get(n.parentId) ?? [];
    arr.push(n);
    byParent.set(n.parentId, arr);
  }

  const result = new Map<string, EffectiveTaskSchedule>();
  const visiting = new Set<string>();

  const computeForNote = (note: Note): EffectiveTaskSchedule => {
    if (result.has(note.id)) return result.get(note.id)!;
    if (visiting.has(note.id)) {
      // 순환 참조 방어용 기본값
      const fallback = toIsoDateLocal(new Date(note.createdAt || Date.now()));
      return {
        noteId: note.id,
        startDate: fallback,
        dueDate: fallback,
        durationDays: 1,
        calendarSpanDays: 1,
        useWorkingDays: true,
        progress: 0,
        status: getEffectiveTodoStatus(note, allNotes),
        isRollup: false,
        isExplicit: false,
        weekendCount: 0,
        holidays: [],
      };
    }
    visiting.add(note.id);

    const status = getEffectiveTodoStatus(note, allNotes);
    const meta = note.todoMeta;
    const children = byParent.get(note.id) ?? [];
    const useWorkingDays = meta?.useWorkingDays !== false;

    const defaultProgress =
      typeof meta?.progress === 'number'
        ? Math.min(100, Math.max(0, meta.progress))
        : status === 'done'
        ? 100
        : status === 'doing'
        ? 50
        : 0;

    // 하위 작업이 있는 상위 항목인 경우: 하위 작업들의 최소 시작일 ~ 최대 마감일로 자동 Roll-up
    // (단, 사용자가 상위 항목에 직접 하위보다 넓은 명시적 일정을 설정한 경우 이를 포괄)
    if (children.length > 0) {
      const childSchedules = children.map((c) => computeForNote(c));
      let minStart = childSchedules[0].startDate;
      let maxDue = childSchedules[0].dueDate;
      let totalWeight = 0;
      let weightedProgress = 0;

      for (const cs of childSchedules) {
        if (cs.startDate < minStart) minStart = cs.startDate;
        if (cs.dueDate > maxDue) maxDue = cs.dueDate;
        const w = Math.max(1, cs.durationDays);
        totalWeight += w;
        weightedProgress += cs.progress * w;
      }

      // 상위 작업 자체에 명시적 시작일/마감일이 있다면 하위 범위와 병합하거나 직접 수정값 반영
      if (meta?.startDate && meta.startDate < minStart) {
        minStart = meta.startDate;
      }
      if (meta?.dueDate && meta.dueDate > maxDue) {
        maxDue = meta.dueDate;
      }

      const durationDays = calculateDurationFromDates(
        minStart,
        maxDue,
        useWorkingDays,
        customHolidays
      );
      const calendarSpanDays = Math.max(1, diffCalendarDays(minStart, maxDue) + 1);
      const skipped = getSkippedHolidaysInRange(minStart, maxDue, customHolidays);
      const avgProgress =
        typeof meta?.progress === 'number'
          ? meta.progress
          : status === 'done'
          ? 100
          : totalWeight > 0
          ? Math.round(weightedProgress / totalWeight)
          : defaultProgress;

      const sched: EffectiveTaskSchedule = {
        noteId: note.id,
        startDate: minStart,
        dueDate: maxDue,
        durationDays,
        calendarSpanDays,
        useWorkingDays,
        progress: avgProgress,
        status,
        isRollup: true,
        isExplicit: Boolean(meta?.startDate || meta?.dueDate || childSchedules.some((c) => c.isExplicit)),
        weekendCount: skipped.weekendCount,
        holidays: skipped.holidays,
      };
      result.set(note.id, sched);
      visiting.delete(note.id);
      return sched;
    }

    // 단일(리프) 작업인 경우
    const createdDateStr = toIsoDateLocal(new Date(note.createdAt || Date.now()));
    const isExplicit = Boolean(meta?.startDate || meta?.dueDate || meta?.durationDays);
    const rawStart = meta?.startDate || createdDateStr;
    const startDate = isExplicit
      ? rawStart
      : snapToWorkingDay(rawStart, useWorkingDays, customHolidays, 1);

    let durationDays = Math.max(1, meta?.durationDays || 1);
    let dueDate = meta?.dueDate || '';

    if (dueDate && dueDate >= startDate) {
      if (!meta?.durationDays) {
        durationDays = calculateDurationFromDates(
          startDate,
          dueDate,
          useWorkingDays,
          customHolidays
        );
      }
    } else {
      dueDate = calculateDueDateFromDuration(
        startDate,
        durationDays,
        useWorkingDays,
        customHolidays
      );
    }

    const calendarSpanDays = Math.max(1, diffCalendarDays(startDate, dueDate) + 1);
    const skipped = getSkippedHolidaysInRange(startDate, dueDate, customHolidays);

    const sched: EffectiveTaskSchedule = {
      noteId: note.id,
      startDate,
      dueDate,
      durationDays,
      calendarSpanDays,
      useWorkingDays,
      progress: defaultProgress,
      status,
      isRollup: false,
      isExplicit,
      weekendCount: skipped.weekendCount,
      holidays: skipped.holidays,
    };
    result.set(note.id, sched);
    visiting.delete(note.id);
    return sched;
  };

  for (const n of todoNotes) {
    computeForNote(n);
  }

  return result;
}

export interface DueDateBadgeInfo {
  label: string;
  color: string;
  isOverdue: boolean;
  diffDays: number;
}

/**
 * 마감일(Due Date) 기준 D-Day 뱃지 정보 반환
 */
export function getDueDateBadgeInfo(
  dueDateStr?: string | null,
  status?: TodoStatus
): DueDateBadgeInfo | null {
  if (!dueDateStr) return null;
  const todayStr = getTodayIsoStr();
  const diff = diffCalendarDays(todayStr, dueDateStr);

  if (status === 'done') {
    return { label: `${dueDateStr.slice(5)} 완료`, color: 'teal', isOverdue: false, diffDays: diff };
  }
  if (status === 'drop') {
    return { label: `${dueDateStr.slice(5)} 중단`, color: 'gray', isOverdue: false, diffDays: diff };
  }
  if (diff < 0) {
    return {
      label: `D+${Math.abs(diff)} 지연`,
      color: 'red',
      isOverdue: true,
      diffDays: diff,
    };
  }
  if (diff === 0) {
    return { label: 'D-Day (오늘)', color: 'orange', isOverdue: false, diffDays: 0 };
  }
  if (diff <= 3) {
    return { label: `D-${diff}`, color: 'yellow', isOverdue: false, diffDays: diff };
  }
  return { label: `D-${diff}`, color: 'blue', isOverdue: false, diffDays: diff };
}

/**
 * 날짜를 첨부 이미지 스타일 또는 한국어 친화적 간결 포맷으로 표시
 * 예: '2026-01-16' -> '2026.01.16 (금)' 또는 'Jan 16, 2026'
 */
export function formatShortScheduleDate(dateStr: string): string {
  const d = parseIsoDateLocal(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}.${day} (${weekdays[d.getDay()]})`;
}

