// MCP 서버용 노트 파일·할일 규칙 (순수 함수, 의존성 없음)
// 앱의 TypeScript 모델을 가져올 수 없어 필요한 규칙만 같은 기준으로 옮겨 둔다.
// - 파일 형식: src/model/FileVault.ts (serializeNoteFile / parseNoteFile)
// - 오늘 할 일 기준: src/model/TaskQueryService.ts (getTodayBoard) — electron/mcp/__tests__/todos.test.ts 가 같은 결과인지 확인
'use strict';

const TODO_PROJECT_ID = 'todo-project';
const STATUS_TO_GROUP_ID = {
  todo: 'todo-group-todo',
  doing: 'todo-group-doing',
  done: 'todo-group-done',
  drop: 'todo-group-drop',
};
const GROUP_ID_TO_STATUS = Object.fromEntries(Object.entries(STATUS_TO_GROUP_ID).map(([s, id]) => [id, s]));

const pad = (n) => String(n).padStart(2, '0');
const toIsoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIsoDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (iso, n) => {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};

// ---------------------------------------------------------------------------
// 파일 형식
// ---------------------------------------------------------------------------

/** 노트 -> .md 텍스트 (FileVault.serializeNoteFile 과 같은 필드·순서) */
function serializeNoteFile(note, body) {
  const esc = (v) => JSON.stringify(v);
  return [
    '---',
    `id: ${esc(note.id)}`,
    `title: ${esc(note.title)}`,
    `projectId: ${esc(note.projectId)}`,
    `color: ${esc(note.color || 'blue')}`,
    `reminder: ${esc(note.reminder || null)}`,
    `parentId: ${esc(note.parentId ?? null)}`,
    `pinned: ${esc(false)}`,
    `favorite: ${esc(false)}`,
    `tags: ${esc(note.tags || [])}`,
    `attachments: ${esc([])}`,
    `todoMeta: ${esc(note.todoMeta || null)}`,
    `systemGroupType: ${esc(note.systemGroupType || null)}`,
    `createdAt: ${esc(note.createdAt)}`,
    `updatedAt: ${esc(note.updatedAt)}`,
    '---',
    '',
    String(body || '').replace(/\s+$/, ''),
    '',
  ].join('\n');
}

/** .md 텍스트 -> { meta, body } (frontmatter 가 없으면 null) */
function parseNoteMeta(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const raw = line.slice(idx + 1).trim();
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
    meta[line.slice(0, idx).trim()] = value;
  }
  return { meta, body: m[2].trim() };
}

// ---------------------------------------------------------------------------
// 할일 만들기
// ---------------------------------------------------------------------------

const RELATIVE = { 오늘: 0, 내일: 1, 모레: 2, today: 0, tomorrow: 1 };

/** "오늘"·"내일"·"모레"·YYYY-MM-DD -> YYYY-MM-DD, 비어 있으면 null, 그 밖은 오류 */
function resolveDueDate(input, todayIso) {
  if (input === undefined || input === null) return null;
  const text = String(input).trim();
  if (!text) return null;
  if (Object.prototype.hasOwnProperty.call(RELATIVE, text.toLowerCase())) return addDays(todayIso, RELATIVE[text.toLowerCase()]);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && toIsoDate(parseIsoDate(text)) === text) return text;
  throw new Error(`dueDate "${text}" 를 읽을 수 없습니다. YYYY-MM-DD 또는 오늘/내일/모레로 보내주세요 (오늘: ${todayIso}).`);
}

/** HH:mm -> [시, 분], 형식이 틀리면 오류 */
function parseTime(input) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(input).trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`time "${input}" 은 HH:mm 형식이어야 합니다 (예: 15:30).`);
  return [Number(m[1]), Number(m[2])];
}

/**
 * 새 할일 노트 (앱의 createPlannerTask 와 같은 모양)
 * - time 이 있으면 그 시각 알림, 마감일만 있으면 마감일 09:00 알림, 날짜가 없으면 일정 없는 할일
 */
function buildTodoNote({ title, dueDate, time, memo }, now, id) {
  const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim();
  if (!cleanTitle) throw new Error('title 은 비어 있을 수 없습니다.');
  const todayIso = toIsoDate(now);
  const due = resolveDueDate(dueDate, todayIso);
  const hasTime = time !== undefined && time !== null && String(time).trim() !== '';
  if (hasTime && !due) throw new Error('time 을 쓰려면 dueDate 도 함께 보내주세요.');

  let reminder = null;
  if (due) {
    const [h, mi] = hasTime ? parseTime(time) : [9, 0];
    const d = parseIsoDate(due);
    const targetAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi).getTime();
    reminder = { targetAt, repeat: 'none', dismissed: targetAt <= now.getTime(), snoozedUntil: null, syncToCalendar: true };
  }
  const ts = now.getTime();
  return {
    note: {
      id,
      title: cleanTitle,
      projectId: TODO_PROJECT_ID,
      parentId: STATUS_TO_GROUP_ID.todo,
      color: 'orange',
      reminder,
      tags: [],
      todoMeta: due
        ? { status: 'todo', startDate: due, dueDate: due, durationDays: 1, useWorkingDays: false, progress: 0 }
        : { status: 'todo', progress: 0 },
      createdAt: ts,
      updatedAt: ts,
    },
    body: typeof memo === 'string' ? memo.replace(/\r\n/g, '\n').trim() : '',
  };
}

// ---------------------------------------------------------------------------
// 오늘 할 일 (getTodayBoard 와 같은 기준)
// ---------------------------------------------------------------------------

/** 부모를 따라 올라가 처음 만나는 시스템 그룹의 상태, 없으면 todoMeta.status */
function effectiveStatus(note, byId) {
  let cur = note;
  for (let i = 0; cur && i < 50; i++) {
    if (cur.parentId && GROUP_ID_TO_STATUS[cur.parentId]) return GROUP_ID_TO_STATUS[cur.parentId];
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return (note.todoMeta && note.todoMeta.status) || 'todo';
}

/**
 * notes: { id, title, projectId, parentId, reminder, todoMeta }[]
 * -> { tasks: {title,status,dueDate,overdue}[], schedule: {time,title}[] }
 */
function todayBoard(notes, todayIso) {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const isGroup = (n) => Boolean(GROUP_ID_TO_STATUS[n.id]);
  const rank = (t) => (t.dueDate && t.dueDate < todayIso ? 0 : t.dueDate === todayIso ? 1 : 2);

  const tasks = notes
    .filter((n) => n.projectId === TODO_PROJECT_ID && !isGroup(n))
    .map((n) => ({
      title: n.title || '제목 없음',
      status: effectiveStatus(n, byId),
      dueDate: (n.todoMeta && n.todoMeta.dueDate) || null,
    }))
    .filter((t) => (t.status === 'todo' || t.status === 'doing') && ((t.dueDate !== null && t.dueDate <= todayIso) || t.status === 'doing'))
    .sort((a, b) => rank(a) - rank(b) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    .map((t) => ({ ...t, overdue: rank(t) === 0 }));

  const schedule = notes
    .filter((n) => !isGroup(n) && n.reminder && typeof n.reminder.targetAt === 'number' && toIsoDate(new Date(n.reminder.targetAt)) === todayIso)
    .sort((a, b) => a.reminder.targetAt - b.reminder.targetAt)
    .map((n) => {
      const d = new Date(n.reminder.targetAt);
      return { time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, title: n.title || '제목 없음' };
    });

  return { tasks, schedule };
}

/** list_today 응답 문장 */
function formatTodayBoard(board, todayIso) {
  const label = { todo: '할 일', doing: '진행 중' };
  const lines = [`오늘: ${todayIso}`, '', `오늘 할 일 (${board.tasks.length}개)`];
  if (board.tasks.length === 0) lines.push('- 없음');
  for (const t of board.tasks) {
    const when = t.overdue ? `지연, ${t.dueDate} 마감` : t.dueDate === todayIso ? '오늘 마감' : t.dueDate ? `${t.dueDate} 마감` : '마감일 없음';
    lines.push(`- ${t.title} (${label[t.status]}, ${when})`);
  }
  lines.push('', `오늘 일정 (${board.schedule.length}개)`);
  if (board.schedule.length === 0) lines.push('- 없음');
  for (const s of board.schedule) lines.push(`- ${s.time} ${s.title}`);
  return lines.join('\n');
}

module.exports = {
  TODO_PROJECT_ID,
  toIsoDate,
  serializeNoteFile,
  parseNoteMeta,
  resolveDueDate,
  buildTodoNote,
  todayBoard,
  formatTodayBoard,
};
