// MODEL: Google Tasks REST API 연동 서비스 (Google 할 일 목록 <-> 할일관리 양방향 동기화)
import { GoogleTaskLink, Note, TodoStatus, createEmptyNote } from './Note';
import { GoogleDriveService } from './GoogleDriveService';
import {
  CustomHoliday,
  resolveTaskSchedulePatch,
  toIsoDateLocal,
} from './PlannerService';
import {
  TODO_GROUPS,
  TODO_GROUP_TODO_ID,
  TODO_PROJECT_ID,
  getEffectiveTodoStatus,
  isSystemGroupNote,
  syncTodoStatusToSourceNote,
} from './TodoService';

const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';
const CURSORS_KEY = 'bullsnote.googletasks.cursors.v1';
const PENDING_DELETES_KEY = 'bullsnote.googletasks.pendingDeletes.v1';
/** 변경분 조회 시 시계 오차·지연 반영을 놓치지 않기 위한 겹침 구간 */
const CURSOR_OVERLAP_MS = 5 * 60 * 1000;
const UNTITLED = '제목 없음';

export interface GoogleTaskList {
  id: string;
  title: string;
}

export interface RemoteTask {
  id: string;
  title?: string;
  notes?: string;
  status?: 'needsAction' | 'completed';
  /** RFC 3339 (날짜 부분만 의미 있음) */
  due?: string;
  parent?: string;
  updated?: string;
  deleted?: boolean;
  hidden?: boolean;
}

interface PendingDelete {
  listId: string;
  taskId: string;
}

/** 동기화 결과로 로컬 할일 노트에 적용할 변경 */
export interface TaskLocalChange {
  noteId: string;
  title?: string;
  /** undefined: 변경 없음, null: 기한 제거 */
  due?: string | null;
  completed?: boolean;
  /** Google에서 삭제됨: 'drop'이면 Drop으로 옮기고 연결 해제, 'keep'이면 연결만 해제 */
  unlink?: 'drop' | 'keep';
  /** 동기화 기준값 갱신 */
  link?: GoogleTaskLink;
}

/** 동기화 결과로 Google에 반영할 변경 */
export interface TaskRemotePush {
  noteId: string;
  listId: string;
  taskId: string;
  body: Record<string, unknown>;
  /** 반영 성공 시 로컬에 기록할 기준값 */
  link: GoogleTaskLink;
}

export interface TaskSyncPlan {
  newNotes: Note[];
  locals: TaskLocalChange[];
  pushes: TaskRemotePush[];
}

export interface TaskSyncResult {
  success: boolean;
  error?: string;
  newNotes: Note[];
  locals: TaskLocalChange[];
  /** Google에 반영한 변경 건수 */
  pushedCount: number;
}

function normalizeTitle(title: string | undefined | null): string {
  return (title || '').trim() || UNTITLED;
}

function remoteDue(task: RemoteTask): string | null {
  return task.due && /^\d{4}-\d{2}-\d{2}/.test(task.due) ? task.due.slice(0, 10) : null;
}

/** Google 할일 ID로부터 결정적인 노트 ID 생성 (여러 기기가 동시에 가져와도 중복되지 않도록) */
export function noteIdForTask(taskId: string): string {
  return `gtask-${taskId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function isLinkedTodo(note: Note): boolean {
  return Boolean(
    note.projectId === TODO_PROJECT_ID && !isSystemGroupNote(note) && note.todoMeta?.gtask?.taskId,
  );
}

function isCompletedStatus(status: TodoStatus): boolean {
  // Drop(중단)도 Google에는 완료로 반영
  return status === 'done' || status === 'drop';
}

/** 연결된 할일 중 마지막 동기화 이후 앱에서 바뀐(제목·기한·완료) 항목이 있는지 여부 */
export function hasLocalTaskChanges(notes: Note[], listIds: string[]): boolean {
  return notes.some((note) => {
    if (!isLinkedTodo(note)) return false;
    const base = note.todoMeta!.gtask!;
    if (!listIds.includes(base.listId)) return false;
    return (
      normalizeTitle(note.title) !== base.title ||
      (note.todoMeta?.dueDate || null) !== base.due ||
      isCompletedStatus(getEffectiveTodoStatus(note, notes)) !== base.completed
    );
  });
}

function buildImportedContent(listTitle: string, notes: string | undefined): string {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `🔗 Google Tasks: ${listTitle}`,
          styles: { textColor: 'gray' },
        },
      ],
    },
  ];
  const lines = (notes || '').split('\n');
  for (const line of lines) {
    blocks.push({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line, styles: {} }] : [],
    });
  }
  return JSON.stringify(blocks);
}

/**
 * 로컬 할일과 Google 변경분을 비교해 양쪽에 적용할 변경을 계산 (순수 함수)
 * - 필드(제목·기한·완료)별 3-way 병합, 양쪽 모두 바뀐 경우 나중에 수정한 쪽 우선
 * - 연결되지 않은 미완료 Google 할일은 새 할일 노트로 가져옴
 */
export function planTaskSync(
  notes: Note[],
  remoteByList: Map<string, RemoteTask[]>,
  listTitles: Map<string, string>,
  pendingDeleteTaskIds: Set<string>,
  now: number,
  customHolidays?: CustomHoliday[],
): TaskSyncPlan {
  const plan: TaskSyncPlan = { newNotes: [], locals: [], pushes: [] };

  const remoteById = new Map<string, { task: RemoteTask; listId: string }>();
  for (const [listId, tasks] of remoteByList) {
    for (const task of tasks) {
      if (task?.id) remoteById.set(task.id, { task, listId });
    }
  }

  const noteIds = new Set(notes.map((n) => n.id));
  const noteIdByTaskId = new Map<string, string>();
  for (const n of notes) {
    const taskId = n.todoMeta?.gtask?.taskId;
    if (taskId) noteIdByTaskId.set(taskId, n.id);
  }

  // 1. 이미 연결된 할일: 필드별 3-way 병합
  for (const note of notes) {
    if (!isLinkedTodo(note)) continue;
    const base = note.todoMeta!.gtask!;
    if (!remoteByList.has(base.listId)) continue; // 선택 해제된 목록은 건드리지 않음

    const local = {
      title: normalizeTitle(note.title),
      due: note.todoMeta?.dueDate || null,
      completed: isCompletedStatus(getEffectiveTodoStatus(note, notes)),
    };
    const found = remoteById.get(base.taskId);

    if (found?.task.deleted) {
      plan.locals.push({ noteId: note.id, unlink: local.completed ? 'keep' : 'drop' });
      continue;
    }

    const remote = found
      ? {
          title: normalizeTitle(found.task.title),
          due: remoteDue(found.task),
          completed: found.task.status === 'completed',
        }
      : { title: base.title, due: base.due, completed: base.completed };
    const remoteTime = found?.task.updated ? Date.parse(found.task.updated) || 0 : 0;
    const localWins = note.updatedAt >= remoteTime;

    const pick = <T,>(l: T, r: T, b: T): T => {
      const localChanged = l !== b;
      const remoteChanged = r !== b;
      if (localChanged && remoteChanged) return localWins ? l : r;
      if (localChanged) return l;
      if (remoteChanged) return r;
      return b;
    };

    const merged = {
      title: pick(local.title, remote.title, base.title),
      due: pick(local.due, remote.due, base.due),
      completed: pick(local.completed, remote.completed, base.completed),
    };
    const link: GoogleTaskLink = { taskId: base.taskId, listId: base.listId, ...merged };

    const localChange: TaskLocalChange = { noteId: note.id };
    let hasLocalChange = false;
    if (merged.title !== local.title) {
      localChange.title = merged.title;
      hasLocalChange = true;
    }
    if (merged.due !== local.due) {
      localChange.due = merged.due;
      hasLocalChange = true;
    }
    if (merged.completed !== local.completed) {
      localChange.completed = merged.completed;
      hasLocalChange = true;
    }

    const body: Record<string, unknown> = {};
    if (merged.title !== remote.title) body.title = merged.title;
    if (merged.due !== remote.due) body.due = merged.due ? `${merged.due}T00:00:00.000Z` : null;
    if (merged.completed !== remote.completed) {
      body.status = merged.completed ? 'completed' : 'needsAction';
      if (!merged.completed) body.completed = null;
    }
    const hasPush = Object.keys(body).length > 0;

    const baseChanged =
      merged.title !== base.title || merged.due !== base.due || merged.completed !== base.completed;

    if (hasPush) {
      // 기준값은 Google 반영에 성공한 뒤에만 갱신 (실패 시 다음 동기화에서 재시도)
      plan.pushes.push({ noteId: note.id, listId: base.listId, taskId: base.taskId, body, link });
      if (hasLocalChange) plan.locals.push(localChange);
    } else if (hasLocalChange || baseChanged) {
      plan.locals.push({ ...localChange, link });
    }
  }

  // 2. 연결되지 않은 미완료 Google 할일: 새 할일 노트로 가져오기 (상위 할일 먼저)
  const candidates: Array<{ task: RemoteTask; listId: string }> = [];
  for (const entry of remoteById.values()) {
    const { task } = entry;
    if (task.deleted || task.hidden || task.status === 'completed') continue;
    if (noteIdByTaskId.has(task.id) || noteIds.has(noteIdForTask(task.id))) continue;
    if (pendingDeleteTaskIds.has(task.id)) continue;
    if (!(task.title || '').trim() && !(task.notes || '').trim()) continue; // 빈 할일은 건너뜀
    candidates.push(entry);
  }
  candidates.sort((a, b) => Number(Boolean(a.task.parent)) - Number(Boolean(b.task.parent)));

  const todoColor = TODO_GROUPS.find((g) => g.status === 'todo')?.color || 'blue';
  candidates.forEach(({ task, listId }, idx) => {
    const due = remoteDue(task);
    const title = normalizeTitle(task.title);
    const parentNoteId = task.parent
      ? noteIdByTaskId.get(task.parent) ||
        (plan.newNotes.some((n) => n.id === noteIdForTask(task.parent!))
          ? noteIdForTask(task.parent)
          : null)
      : null;

    const schedule = due
      ? resolveTaskSchedulePatch(undefined, { dueDate: due }, toIsoDateLocal(new Date(now)), customHolidays)
      : null;

    const note = createEmptyNote({
      id: noteIdForTask(task.id),
      title,
      projectId: TODO_PROJECT_ID,
      parentId: parentNoteId || TODO_GROUP_TODO_ID,
      color: todoColor,
      tags: ['할일', 'todo'],
      content: buildImportedContent(listTitles.get(listId) || 'Google Tasks', task.notes),
      todoMeta: {
        status: 'todo',
        completedAt: null,
        ...(schedule
          ? {
              startDate: schedule.startDate,
              dueDate: schedule.dueDate,
              durationDays: schedule.durationDays,
              useWorkingDays: schedule.useWorkingDays,
            }
          : {}),
        gtask: { taskId: task.id, listId, title, due, completed: false },
      },
      createdAt: now + idx,
      updatedAt: now + idx,
    });
    plan.newNotes.push(note);
  });

  return plan;
}

/**
 * 동기화 결과(새 노트 + 로컬 변경)를 노트 목록에 적용 (순수 함수)
 */
export function applyTaskSyncResult(
  notes: Note[],
  newNotes: Note[],
  locals: TaskLocalChange[],
  now: number,
  customHolidays?: CustomHoliday[],
): { notes: Note[]; changed: boolean } {
  let list = notes;
  let changed = false;

  const existingIds = new Set(list.map((n) => n.id));
  const toAdd = newNotes.filter((n) => !existingIds.has(n.id));
  if (toAdd.length > 0) {
    const addIds = new Set([...existingIds, ...toAdd.map((n) => n.id)]);
    // 상위 할일이 그 사이 사라졌으면 To Do 그룹으로 배치
    list = [
      ...toAdd.map((n) => (n.parentId && !addIds.has(n.parentId) ? { ...n, parentId: TODO_GROUP_TODO_ID } : n)),
      ...list,
    ];
    changed = true;
  }

  for (const change of locals) {
    const current = list.find((n) => n.id === change.noteId);
    if (!current || !current.todoMeta) continue;

    let next: Note = current;

    if (change.title !== undefined && change.title !== current.title) {
      next = { ...next, title: change.title };
    }

    if (change.due !== undefined) {
      if (change.due === null) {
        next = { ...next, todoMeta: { ...next.todoMeta!, dueDate: null } };
      } else {
        const resolved = resolveTaskSchedulePatch(
          next.todoMeta,
          { dueDate: change.due },
          toIsoDateLocal(new Date(next.createdAt || now)),
          customHolidays,
        );
        next = {
          ...next,
          todoMeta: {
            ...next.todoMeta!,
            startDate: resolved.startDate,
            dueDate: resolved.dueDate,
            durationDays: resolved.durationDays,
            useWorkingDays: resolved.useWorkingDays,
          },
        };
      }
    }

    if (change.unlink) {
      next = { ...next, todoMeta: { ...next.todoMeta!, gtask: null } };
    } else if (change.link) {
      next = { ...next, todoMeta: { ...next.todoMeta!, gtask: change.link } };
    }

    if (next !== current) {
      next = { ...next, updatedAt: now };
      list = list.map((n) => (n.id === next.id ? next : n));
      changed = true;
    }

    // 상태 변경은 기존 할일 상태 동기화 로직(그룹 이동·하위 할일·원본 노트 체크리스트)을 그대로 사용
    const targetStatus: TodoStatus | null =
      change.unlink === 'drop'
        ? 'drop'
        : change.completed === true
          ? 'done'
          : change.completed === false
            ? 'todo'
            : null;
    if (targetStatus && getEffectiveTodoStatus(next, list) !== targetStatus) {
      list = syncTodoStatusToSourceNote(next, targetStatus, list, { moveToGroupRoot: false }).updatedNotes;
      changed = true;
    }
  }

  return { notes: list, changed };
}

/** Google Tasks API 오류를 사용자 친화적인 한글 안내 메시지로 변환 */
function formatTasksApiError(status: number, rawText: string, context: string): string {
  let message = rawText;
  let reasons: string[] = [];
  try {
    const errObj = JSON.parse(rawText)?.error;
    message = errObj?.message || rawText;
    const details: any[] = Array.isArray(errObj?.details) ? errObj.details : [];
    const errors: any[] = Array.isArray(errObj?.errors) ? errObj.errors : [];
    reasons = [...details, ...errors].map((x) => String(x?.reason || ''));
  } catch {
    /* JSON이 아닌 응답은 원문 사용 */
  }

  if (
    message.includes('Tasks API has not been used') ||
    message.includes('it is disabled') ||
    reasons.includes('SERVICE_DISABLED') ||
    reasons.includes('accessNotConfigured')
  ) {
    return "Google Cloud 프로젝트에서 'Google Tasks API'를 활성화해주세요: https://console.cloud.google.com/apis/library/tasks.googleapis.com";
  }
  if (status === 403) {
    return 'Google Tasks 권한이 필요합니다. [연동 해제] 후 다시 로그인하여 할 일 목록(Tasks) 권한을 허용해주세요.';
  }
  if (status === 401) {
    return 'Google 인증 토큰이 만료되었습니다. Google 계정을 다시 연동해주세요.';
  }
  return `${context} (${status}): ${message}`;
}

class GoogleTasksServiceImpl {
  private isRunning = false;

  isEnabled(): boolean {
    const cfg = GoogleDriveService.getConfig();
    return Boolean(
      GoogleDriveService.isConnected() && cfg.tasksEnabled && (cfg.tasksListIds || []).length > 0,
    );
  }

  private readJson<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      /* ignore */
    }
    return fallback;
  }

  private writeJson(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }

  private getPendingDeletes(): PendingDelete[] {
    const list = this.readJson<PendingDelete[]>(PENDING_DELETES_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  /** 인증 헤더 포함 fetch (10초 타임아웃 + 401 만료 시 1회 자동 토큰 갱신 재시도) */
  private async fetchWithAuth(path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
    if (GoogleDriveService.isOffline()) {
      throw new Error('현재 오프라인 상태입니다. 인터넷 연결 후 Google Tasks와 동기화됩니다.');
    }
    const token = await GoogleDriveService.getValidAccessToken(false);
    if (!token) {
      throw new Error('Google 계정이 연동되어 있지 않거나 인증 토큰이 만료되었습니다.');
    }

    const makeRequest = async (accessToken: string) => {
      const headers = new Headers(init.headers || {});
      headers.set('Authorization', `Bearer ${accessToken}`);
      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(`${TASKS_API_BASE}${path}`, { ...init, headers, signal: controller.signal });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error('Google Tasks 서버 응답 시간이 초과되었습니다.');
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    };

    let res = await makeRequest(token);
    if (res.status === 401) {
      const refreshed = await GoogleDriveService.getValidAccessToken(true);
      if (refreshed) res = await makeRequest(refreshed);
    }
    return res;
  }

  /** 계정의 Google Tasks 목록 조회 */
  async listTaskLists(): Promise<{ lists: GoogleTaskList[]; error?: string }> {
    try {
      const lists: GoogleTaskList[] = [];
      let pageToken = '';
      do {
        const query = `?maxResults=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const res = await this.fetchWithAuth(`/users/@me/lists${query}`);
        if (!res.ok) {
          return { lists: [], error: formatTasksApiError(res.status, await res.text(), 'Google Tasks 목록 조회 실패') };
        }
        const data = (await res.json()) as { items?: GoogleTaskList[]; nextPageToken?: string };
        for (const item of data.items || []) {
          lists.push({ id: item.id, title: item.title || '(이름 없는 목록)' });
        }
        pageToken = data.nextPageToken || '';
      } while (pageToken);
      return { lists };
    } catch (err) {
      return { lists: [], error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * 목록의 할일 조회
   * - updatedMin이 있으면 그 이후 변경분(완료·숨김·삭제 포함)만, 없으면 미완료 할일 전체
   */
  private async fetchTasks(listId: string, updatedMin: string | null): Promise<RemoteTask[]> {
    const tasks: RemoteTask[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ maxResults: '100' });
      if (updatedMin) {
        params.set('updatedMin', updatedMin);
        params.set('showCompleted', 'true');
        params.set('showHidden', 'true');
        params.set('showDeleted', 'true');
      } else {
        params.set('showCompleted', 'false');
      }
      if (pageToken) params.set('pageToken', pageToken);
      const res = await this.fetchWithAuth(`/lists/${encodeURIComponent(listId)}/tasks?${params.toString()}`);
      if (!res.ok) {
        throw new Error(formatTasksApiError(res.status, await res.text(), 'Google 할일 조회 실패'));
      }
      const data = (await res.json()) as { items?: RemoteTask[]; nextPageToken?: string };
      tasks.push(...(data.items || []));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return tasks;
  }

  /** 단일 할일 조회 (없으면 삭제된 것으로 간주) */
  private async fetchTask(listId: string, taskId: string): Promise<RemoteTask> {
    const res = await this.fetchWithAuth(
      `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    );
    if (res.status === 404 || res.status === 410) return { id: taskId, deleted: true };
    if (!res.ok) {
      throw new Error(formatTasksApiError(res.status, await res.text(), 'Google 할일 조회 실패'));
    }
    return (await res.json()) as RemoteTask;
  }

  /** 앱에서 삭제한 할일을 Google 삭제 대기열에 추가 */
  queueDelete(listId: string, taskId: string): void {
    const pending = this.getPendingDeletes().filter((p) => p.taskId !== taskId);
    pending.push({ listId, taskId });
    this.writeJson(PENDING_DELETES_KEY, pending.slice(-500));
  }

  /** 삭제 대기열의 Google 할일 삭제 (실패한 항목은 다음 동기화 때 재시도) */
  async flushPendingDeletes(): Promise<void> {
    const pending = this.getPendingDeletes();
    if (pending.length === 0 || !GoogleDriveService.isConnected() || GoogleDriveService.isOffline()) return;

    const done = new Set<string>();
    for (const item of pending) {
      try {
        const res = await this.fetchWithAuth(
          `/lists/${encodeURIComponent(item.listId)}/tasks/${encodeURIComponent(item.taskId)}`,
          { method: 'DELETE' },
        );
        // 이미 삭제된 404/410도 완료로 처리
        if (res.ok || res.status === 404 || res.status === 410) done.add(item.taskId);
      } catch {
        break; // 네트워크 문제면 나머지도 다음에 재시도
      }
    }
    if (done.size > 0) {
      // 대기 중 새로 추가된 항목을 잃지 않도록 최신 대기열 기준으로 제거
      this.writeJson(
        PENDING_DELETES_KEY,
        this.getPendingDeletes().filter((p) => !done.has(p.taskId)),
      );
    }
  }

  /**
   * Google Tasks 양방향 동기화 1회 실행
   * - 반환된 newNotes / locals 를 applyTaskSyncResult 로 노트 목록에 적용해야 함
   * - 이미 실행 중이면 null 반환
   */
  async sync(getNotes: () => Note[], customHolidays?: CustomHoliday[]): Promise<TaskSyncResult | null> {
    if (this.isRunning) return null;
    const empty: TaskSyncResult = { success: true, newNotes: [], locals: [], pushedCount: 0 };
    if (!this.isEnabled()) return empty;
    if (GoogleDriveService.isOffline()) {
      return { ...empty, success: false, error: '현재 오프라인 상태입니다. 인터넷 연결 후 Google Tasks와 동기화됩니다.' };
    }

    this.isRunning = true;
    try {
      await this.flushPendingDeletes();

      const listIds = GoogleDriveService.getConfig().tasksListIds || [];
      const cursors = this.readJson<Record<string, string>>(CURSORS_KEY, {});
      const startedAt = Date.now();

      const listsRes = await this.listTaskLists();
      if (listsRes.error) return { ...empty, success: false, error: listsRes.error };
      const listTitles = new Map(listsRes.lists.map((l) => [l.id, l.title]));

      // 1. 목록별 변경분 조회 (삭제된 목록은 건너뜀)
      const remoteByList = new Map<string, RemoteTask[]>();
      for (const listId of listIds) {
        if (!listTitles.has(listId)) continue;
        const cursor = cursors[listId] || null;
        const tasks = await this.fetchTasks(listId, cursor);

        if (!cursor) {
          // 첫 동기화: 미완료만 조회했으므로, 조회되지 않은 연결 할일은 개별 조회로 완료·삭제 여부 확인
          const seen = new Set(tasks.map((t) => t.id));
          for (const note of getNotes()) {
            const link = note.todoMeta?.gtask;
            if (!isLinkedTodo(note) || !link || link.listId !== listId || seen.has(link.taskId)) continue;
            tasks.push(await this.fetchTask(listId, link.taskId));
          }
        }
        remoteByList.set(listId, tasks);
      }

      // 2. 최신 로컬 상태 기준으로 병합 계획 수립
      const pendingDeleteIds = new Set(this.getPendingDeletes().map((p) => p.taskId));
      const plan = planTaskSync(getNotes(), remoteByList, listTitles, pendingDeleteIds, Date.now(), customHolidays);

      // 3. Google에 반영
      const locals = [...plan.locals];
      let pushedCount = 0;
      let pushError: string | undefined;
      for (const push of plan.pushes) {
        try {
          const res = await this.fetchWithAuth(
            `/lists/${encodeURIComponent(push.listId)}/tasks/${encodeURIComponent(push.taskId)}`,
            { method: 'PATCH', body: JSON.stringify(push.body) },
          );
          if (res.ok) {
            locals.push({ noteId: push.noteId, link: push.link });
            pushedCount++;
          } else if (res.status === 404 || res.status === 410) {
            // 그 사이 Google에서 삭제됨
            locals.push({ noteId: push.noteId, unlink: push.link.completed ? 'keep' : 'drop' });
          } else {
            pushError = formatTasksApiError(res.status, await res.text(), 'Google 할일 반영 실패');
          }
        } catch (err) {
          pushError = err instanceof Error ? err.message : String(err);
          break;
        }
      }

      // 4. 조회에 성공한 목록의 커서 갱신 (겹침 구간을 두어 누락 방지, 재처리는 멱등)
      const nextCursors = { ...cursors };
      for (const listId of remoteByList.keys()) {
        nextCursors[listId] = new Date(startedAt - CURSOR_OVERLAP_MS).toISOString();
      }
      this.writeJson(CURSORS_KEY, nextCursors);

      return {
        success: !pushError,
        error: pushError,
        newNotes: plan.newNotes,
        locals,
        pushedCount,
      };
    } catch (err) {
      return { ...empty, success: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      this.isRunning = false;
    }
  }

  /** 연동 해제 시 로컬 동기화 상태 초기화 */
  reset(): void {
    try {
      localStorage.removeItem(CURSORS_KEY);
      localStorage.removeItem(PENDING_DELETES_KEY);
    } catch {
      /* ignore */
    }
  }
}

export const GoogleTasksService = new GoogleTasksServiceImpl();
