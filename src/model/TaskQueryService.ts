// MODEL: 할일 조회 규칙 (오늘 대시보드 포함 기준, 할일 필터, 본문 미리보기) — 화면과 분리된 순수 함수
import type { Note, TodoStatus } from './Note';
import { parseBlocks, noteBodyText } from './HashtagService';
import { addCalendarDays, parseIsoDateLocal, toIsoDateLocal, type EffectiveTaskSchedule } from './PlannerService';
import { TODO_PROJECT_ID, getEffectiveTodoStatus, isSystemGroupNote, resolveSourceNoteId } from './TodoService';

export interface TaskItem {
  note: Note;
  status: TodoStatus;
  /** 사용자가 지정(또는 하위 작업에서 요약)한 일정만 날짜로 인정, 없으면 null */
  startDate: string | null;
  dueDate: string | null;
  sourceNoteId: string | null;
  /** 출처 노트의 폴더(프로젝트) — 할일 자체는 모두 할일 프로젝트에 있으므로 분류 기준은 출처 노트 */
  sourceProjectId: string | null;
  sourceTags: string[];
}

export function buildTaskItems(notes: Note[], scheduleMap: Map<string, EffectiveTaskSchedule>): TaskItem[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  return notes
    .filter((n) => n.projectId === TODO_PROJECT_ID && !isSystemGroupNote(n))
    .map((note) => {
      const s = scheduleMap.get(note.id);
      const hasDate = Boolean(s && (s.isExplicit || s.isRollup));
      const sourceNoteId = resolveSourceNoteId(note) ?? null;
      const source = sourceNoteId ? byId.get(sourceNoteId) : undefined;
      return {
        note,
        status: s?.status ?? getEffectiveTodoStatus(note, notes),
        startDate: hasDate ? s!.startDate : null,
        dueDate: hasDate ? s!.dueDate : null,
        sourceNoteId,
        sourceProjectId: source?.projectId ?? null,
        sourceTags: source?.tags ?? [],
      };
    });
}

const isActive = (t: TaskItem) => t.status === 'todo' || t.status === 'doing';

export interface TodayScheduleEntry {
  at: number;
  note: Note;
  label: string;
}

export interface TodayBoard {
  tasks: TaskItem[];
  schedule: TodayScheduleEntry[];
  ongoing: TaskItem[];
  counts: { tasks: number; doing: number; overdue: number };
}

/** 오늘 대시보드: 지연·오늘 마감·진행 중 할일, 오늘 알림 일정(이미 확인한 알림 포함), 오늘을 포함하는 기간 작업 */
export function getTodayBoard(items: TaskItem[], notes: Note[], todayIso: string): TodayBoard {
  const rank = (t: TaskItem) => (t.dueDate && t.dueDate < todayIso ? 0 : t.dueDate === todayIso ? 1 : 2);
  const tasks = items
    .filter((t) => isActive(t) && ((t.dueDate !== null && t.dueDate <= todayIso) || t.status === 'doing'))
    .sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));

  const schedule = notes
    .filter(
      (n) =>
        !isSystemGroupNote(n) &&
        n.reminder &&
        toIsoDateLocal(new Date(n.reminder.targetAt)) === todayIso
    )
    .map((n) => ({ at: n.reminder!.targetAt, note: n, label: n.title || '제목 없음' }))
    .sort((a, b) => a.at - b.at);

  const ongoing = items.filter(
    (t) =>
      isActive(t) &&
      t.startDate !== null &&
      t.dueDate !== null &&
      t.startDate < t.dueDate &&
      t.startDate <= todayIso &&
      todayIso <= t.dueDate
  );

  return {
    tasks,
    schedule,
    ongoing,
    counts: {
      tasks: tasks.length,
      doing: tasks.filter((t) => t.status === 'doing').length,
      overdue: tasks.filter((t) => rank(t) === 0).length,
    },
  };
}

export type PeriodFilter = 'all' | 'overdue' | 'thisWeek' | 'noDate';

export interface TaskFilter {
  /** 비어 있으면 모든 상태 */
  statuses: TodoStatus[];
  period: PeriodFilter;
  projectId: string | null;
  tag: string | null;
}

export const DEFAULT_TASK_FILTER: TaskFilter = { statuses: [], period: 'all', projectId: null, tag: null };

/** 오늘이 속한 주(월~일)의 시작·끝 날짜 */
export function getWeekRange(todayIso: string): { start: string; end: string } {
  const dow = parseIsoDateLocal(todayIso).getDay(); // 0=일
  const start = addCalendarDays(todayIso, dow === 0 ? -6 : 1 - dow);
  return { start, end: addCalendarDays(start, 6) };
}

export function filterTasks(items: TaskItem[], f: TaskFilter, todayIso: string): TaskItem[] {
  const week = getWeekRange(todayIso);
  return items.filter((t) => {
    if (f.statuses.length > 0 && !f.statuses.includes(t.status)) return false;
    if (f.period === 'overdue' && !(isActive(t) && t.dueDate !== null && t.dueDate < todayIso)) return false;
    if (f.period === 'thisWeek' && !(t.dueDate !== null && t.dueDate >= week.start && t.dueDate <= week.end))
      return false;
    if (f.period === 'noDate' && t.dueDate !== null) return false;
    if (f.projectId && t.sourceProjectId !== f.projectId) return false;
    if (f.tag && !t.note.tags.includes(f.tag) && !t.sourceTags.includes(f.tag)) return false;
    return true;
  });
}

/** 목록 보기 순서: 미완료 → 완료·중단, 그 안에서 마감일 빠른 순(날짜 없음은 뒤), 같으면 최근 수정순 */
export function sortTasksForList(items: TaskItem[]): TaskItem[] {
  return [...items].sort(
    (a, b) =>
      Number(!isActive(a)) - Number(!isActive(b)) ||
      (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') ||
      b.note.updatedAt - a.note.updatedAt
  );
}

/** 노트의 체크리스트 블록 ID → 그 블록에서 만든 할일 (노트 안 "할일 · M/D" 배지용) */
export function getLinkedTodosByBlock(sourceNoteId: string, items: TaskItem[]): Map<string, TaskItem> {
  const map = new Map<string, TaskItem>();
  for (const item of items) {
    const blockId = item.note.todoMeta?.sourceBlockId;
    if (blockId && item.sourceNoteId === sourceNoteId) map.set(blockId, item);
  }
  return map;
}

type Block = Record<string, unknown>;

function inlineText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (!c || typeof c !== 'object') return '';
        const o = c as { text?: unknown; content?: unknown };
        return typeof o.text === 'string' ? o.text : inlineText(o.content);
      })
      .join('');
  }
  return '';
}

function walkBlocks(blocks: Block[], visit: (b: Block) => void): void {
  for (const b of blocks) {
    visit(b);
    if (Array.isArray(b.children)) walkBlocks(b.children as Block[], visit);
  }
}

/** 체크리스트에서 만든 할일 본문 첫 줄 (TodoService.buildTodoNoteContent) */
const SOURCE_LINK_PREFIX = '📌 원본 노트';

/** 본문 첫 번째 비어있지 않은 줄 (카드 미리보기용) */
export function getBodyPreview(content: string, maxLen = 80): string {
  let first = '';
  const blocks = parseBlocks(content);
  if (blocks) {
    walkBlocks(blocks, (b) => {
      if (first) return;
      const text = inlineText(b.content).trim();
      // 할일 본문 첫 줄의 원본 노트 링크는 카드 아래 출처 표시와 겹치므로 건너뜀
      if (!text.startsWith(SOURCE_LINK_PREFIX)) first = text;
    });
  } else {
    first = noteBodyText(content).split('\n').map((s) => s.trim()).find(Boolean) ?? '';
  }
  return first.length > maxLen ? `${first.slice(0, maxLen)}…` : first;
}

/** 본문 체크리스트 진행률 (체크리스트가 없으면 null) */
export function getChecklistProgress(content: string): { done: number; total: number } | null {
  const blocks = parseBlocks(content);
  if (!blocks) return null;
  let done = 0;
  let total = 0;
  walkBlocks(blocks, (b) => {
    if (b.type !== 'checkListItem') return;
    total++;
    if ((b.props as { checked?: boolean } | undefined)?.checked) done++;
  });
  return total > 0 ? { done, total } : null;
}
