import { describe, expect, it } from 'vitest';
import { createEmptyNote, type Note, type TodoStatus } from '../Note';
import { TODO_PROJECT_ID, STATUS_TO_GROUP_ID } from '../TodoService';
import { computeEffectivePlannerMap } from '../PlannerService';
import {
  buildTaskItems,
  DEFAULT_TASK_FILTER,
  filterTasks,
  getBodyPreview,
  getChecklistProgress,
  getTodayBoard,
} from '../TaskQueryService';

const TODAY = '2026-11-12'; // 목요일

function todo(
  id: string,
  opts: { status?: TodoStatus; start?: string; due?: string; tags?: string[]; sourceNoteId?: string } = {}
): Note {
  const status = opts.status ?? 'todo';
  return createEmptyNote({
    id,
    title: id,
    projectId: TODO_PROJECT_ID,
    parentId: STATUS_TO_GROUP_ID[status],
    tags: opts.tags ?? [],
    createdAt: new Date(2026, 10, 1).getTime(),
    todoMeta: {
      status,
      startDate: opts.start ?? opts.due ?? null,
      dueDate: opts.due ?? null,
      sourceNoteId: opts.sourceNoteId,
    },
  });
}

function itemsOf(notes: Note[]) {
  return buildTaskItems(notes, computeEffectivePlannerMap(notes));
}

const ids = (xs: Array<{ note: Note }>) => xs.map((x) => x.note.id);

describe('getTodayBoard', () => {
  it('지연된 미완료 할일을 맨 앞에 두고 지연 개수를 센다', () => {
    const notes = [todo('due-today', { due: TODAY }), todo('late', { due: '2026-11-11' })];
    const board = getTodayBoard(itemsOf(notes), notes, TODAY);
    expect(ids(board.tasks)[0]).toBe('late');
    expect(board.counts.overdue).toBe(1);
  });

  it('오늘 마감과 진행 중 할일은 포함하고 완료·날짜 없음은 제외한다', () => {
    const notes = [
      todo('due-today', { due: TODAY }),
      todo('doing-later', { status: 'doing', due: '2026-11-20' }),
      todo('done-today', { status: 'done', due: TODAY }),
      todo('no-date'),
    ];
    const board = getTodayBoard(itemsOf(notes), notes, TODAY);
    expect(ids(board.tasks).sort()).toEqual(['doing-later', 'due-today']);
    expect(board.counts.doing).toBe(1);
  });

  it('오늘이 기간 안에 있는 여러 날 할일을 진행 중 기간 작업에 넣는다', () => {
    const notes = [todo('span', { start: '2026-11-10', due: '2026-11-20' }), todo('one-day', { due: TODAY })];
    const board = getTodayBoard(itemsOf(notes), notes, TODAY);
    expect(ids(board.ongoing)).toEqual(['span']);
  });

  it('오늘 시각의 알림만 시간순 일정으로 모은다', () => {
    const at = (d: number, h: number) => new Date(2026, 10, d, h, 0).getTime();
    const withReminder = (id: string, targetAt: number, dismissed = false) =>
      createEmptyNote({ id, title: id, reminder: { targetAt, repeat: 'none', dismissed } });
    const notes = [
      withReminder('afternoon', at(12, 14)),
      withReminder('morning', at(12, 9)),
      withReminder('yesterday', at(11, 9)),
      withReminder('dismissed', at(12, 10), true),
    ];
    const board = getTodayBoard(itemsOf(notes), notes, TODAY);
    expect(board.schedule.map((s) => s.note.id)).toEqual(['morning', 'afternoon']);
  });

  it('할일이 없으면 모든 영역이 비어 있다', () => {
    const board = getTodayBoard([], [], TODAY);
    expect(board).toEqual({ tasks: [], schedule: [], ongoing: [], counts: { tasks: 0, doing: 0, overdue: 0 } });
  });
});

describe('filterTasks', () => {
  const notes = [
    todo('late', { due: '2026-11-11' }),
    todo('late-done', { status: 'done', due: '2026-11-11' }),
    todo('sun', { due: '2026-11-15' }),
    todo('next-mon', { due: '2026-11-16' }),
    todo('mon', { due: '2026-11-09' }),
    todo('no-date', { tags: ['업무'] }),
  ];
  const items = itemsOf(notes);

  it('지연은 마감이 지난 미완료만', () => {
    expect(ids(filterTasks(items, { ...DEFAULT_TASK_FILTER, period: 'overdue' }, TODAY)).sort()).toEqual([
      'late',
      'mon',
    ]);
  });

  it('이번 주는 월요일부터 일요일까지', () => {
    expect(ids(filterTasks(items, { ...DEFAULT_TASK_FILTER, period: 'thisWeek' }, TODAY)).sort()).toEqual([
      'late',
      'late-done',
      'mon',
      'sun',
    ]);
  });

  it('날짜 없음과 상태·태그 필터', () => {
    expect(ids(filterTasks(items, { ...DEFAULT_TASK_FILTER, period: 'noDate' }, TODAY))).toEqual(['no-date']);
    expect(ids(filterTasks(items, { ...DEFAULT_TASK_FILTER, statuses: ['done'] }, TODAY))).toEqual(['late-done']);
    expect(ids(filterTasks(items, { ...DEFAULT_TASK_FILTER, tag: '업무' }, TODAY))).toEqual(['no-date']);
  });

  it('출처 노트의 폴더와 태그로도 거른다', () => {
    const source = createEmptyNote({ id: 'src', projectId: 'work', tags: ['회의'] });
    const linked = todo('linked', { sourceNoteId: 'src' });
    const all = [source, linked, todo('other')];
    const its = itemsOf(all);
    expect(ids(filterTasks(its, { ...DEFAULT_TASK_FILTER, projectId: 'work' }, TODAY))).toEqual(['linked']);
    expect(ids(filterTasks(its, { ...DEFAULT_TASK_FILTER, tag: '회의' }, TODAY))).toEqual(['linked']);
  });
});

const blocks = (...bs: Array<Record<string, unknown>>) => JSON.stringify(bs);
const para = (text: string) => ({ id: text, type: 'paragraph', props: {}, content: [{ type: 'text', text }], children: [] });
const check = (text: string, checked: boolean) => ({
  id: text,
  type: 'checkListItem',
  props: { checked },
  content: [{ type: 'text', text }],
  children: [],
});

describe('getBodyPreview', () => {
  it('첫 번째 비어있지 않은 문단을 돌려준다', () => {
    expect(getBodyPreview(blocks(para(''), para('A사 단가 조정안 반영'), para('둘째 줄')))).toBe('A사 단가 조정안 반영');
  });
  it('길면 잘라서 말줄임표를 붙인다', () => {
    expect(getBodyPreview(blocks(para('가'.repeat(100))), 80)).toBe(`${'가'.repeat(80)}…`);
  });
  it('빈 본문은 빈 문자열', () => {
    expect(getBodyPreview('')).toBe('');
  });
});

describe('getChecklistProgress', () => {
  it('체크된 개수와 전체 개수', () => {
    expect(getChecklistProgress(blocks(check('a', true), check('b', false), para('x'), check('c', false)))).toEqual({
      done: 1,
      total: 3,
    });
  });
  it('체크리스트가 없으면 null', () => {
    expect(getChecklistProgress(blocks(para('x')))).toBeNull();
  });
});
