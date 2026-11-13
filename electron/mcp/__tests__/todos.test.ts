import { describe, expect, it } from 'vitest';
// @ts-expect-error — 의존성 없는 CommonJS 모듈 (MCP 서버 전용)
import todos from '../todos.js';
import { createEmptyNote, type Note, type TodoStatus } from '../../../src/model/Note';
import { STATUS_TO_GROUP_ID, TODO_PROJECT_ID } from '../../../src/model/TodoService';
import { computeEffectivePlannerMap } from '../../../src/model/PlannerService';
import { buildTaskItems, getTodayBoard } from '../../../src/model/TaskQueryService';

const { parseNoteMeta, resolveDueDate, buildTodoNote, todayBoard } = todos;
const TODAY = '2026-11-12';

function todo(id: string, status: TodoStatus, due?: string, reminderAt?: number): Note {
  return createEmptyNote({
    id,
    title: id,
    projectId: TODO_PROJECT_ID,
    parentId: STATUS_TO_GROUP_ID[status],
    reminder: reminderAt ? { targetAt: reminderAt, repeat: 'none', dismissed: false } : null,
    todoMeta: { status, startDate: due ?? null, dueDate: due ?? null, durationDays: 1, useWorkingDays: false },
  });
}

describe('todayBoard (MCP) — 앱의 getTodayBoard와 같은 기준', () => {
  const notes: Note[] = [
    createEmptyNote({ id: 'todo-group-todo', title: 'To Do', projectId: TODO_PROJECT_ID, systemGroupType: 'todo' }),
    createEmptyNote({ id: 'todo-group-doing', title: 'Doing', projectId: TODO_PROJECT_ID, systemGroupType: 'doing' }),
    createEmptyNote({ id: 'todo-group-done', title: 'Done', projectId: TODO_PROJECT_ID, systemGroupType: 'done' }),
    todo('지연', 'todo', '2026-11-10'),
    todo('오늘마감', 'todo', TODAY, new Date(2026, 10, 12, 15, 0).getTime()),
    todo('진행중', 'doing', '2026-11-20'),
    todo('미래', 'todo', '2026-11-30'),
    todo('완료', 'done', TODAY),
    todo('날짜없음', 'todo'),
  ];

  it('오늘 할 일 집합과 순서가 앱과 같다', () => {
    const app = getTodayBoard(buildTaskItems(notes, computeEffectivePlannerMap(notes)), notes, TODAY);
    const mcp = todayBoard(notes, TODAY);
    expect(mcp.tasks.map((t: { title: string }) => t.title)).toEqual(app.tasks.map((t) => t.note.title));
    expect(mcp.tasks[0].overdue).toBe(true);
  });

  it('오늘 알림이 있는 항목을 시각과 함께 일정으로 돌려준다', () => {
    expect(todayBoard(notes, TODAY).schedule).toEqual([{ time: '15:00', title: '오늘마감' }]);
  });
});

describe('resolveDueDate', () => {
  it('오늘/내일/모레와 YYYY-MM-DD를 받는다', () => {
    expect(resolveDueDate('오늘', TODAY)).toBe(TODAY);
    expect(resolveDueDate('내일', TODAY)).toBe('2026-11-13');
    expect(resolveDueDate('2026-12-01', TODAY)).toBe('2026-12-01');
    expect(resolveDueDate(undefined, TODAY)).toBeNull();
  });
  it('형식이 틀리거나 없는 날짜는 거절한다', () => {
    expect(() => resolveDueDate('다음주', TODAY)).toThrow();
    expect(() => resolveDueDate('2026-02-30', TODAY)).toThrow();
  });
});

describe('buildTodoNote', () => {
  const now = new Date(2026, 10, 12, 10, 0);
  it('시각이 있으면 그 시각 알림, To Do 그룹 아래 할일로 만든다', () => {
    const { note, body } = buildTodoNote({ title: '보고서', dueDate: TODAY, time: '15:30', memo: '초안' }, now, 'x1');
    expect(note.projectId).toBe('todo-project');
    expect(note.parentId).toBe('todo-group-todo');
    expect(note.todoMeta).toMatchObject({ status: 'todo', startDate: TODAY, dueDate: TODAY });
    expect(note.reminder.targetAt).toBe(new Date(2026, 10, 12, 15, 30).getTime());
    expect(body).toBe('초안');
  });
  it('마감일만 있으면 마감일 09:00 알림', () => {
    const { note } = buildTodoNote({ title: 'a', dueDate: '2026-11-13' }, now, 'x2');
    expect(note.reminder.targetAt).toBe(new Date(2026, 10, 13, 9, 0).getTime());
  });
  it('날짜가 없으면 일정 없는 할일', () => {
    const { note } = buildTodoNote({ title: 'a' }, now, 'x3');
    expect(note.reminder).toBeNull();
    expect(note.todoMeta).toEqual({ status: 'todo', progress: 0 });
  });
  it('잘못된 시각은 거절한다', () => {
    expect(() => buildTodoNote({ title: 'a', dueDate: TODAY, time: '25:00' }, now, 'x4')).toThrow();
  });
});

describe('parseNoteMeta', () => {
  it('frontmatter의 JSON 값을 읽는다', () => {
    const r = parseNoteMeta('---\nid: "a"\ntodoMeta: {"status":"todo"}\nparentId: null\n---\n\n본문');
    expect(r.meta).toMatchObject({ id: 'a', todoMeta: { status: 'todo' }, parentId: null });
    expect(r.body).toBe('본문');
  });
});
