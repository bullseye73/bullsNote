import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyNote } from '../Note';
import {
  CUSTOM_TODO_STATUSES_STORAGE_KEY,
  DEFAULT_TODO_STATUS_LABELS,
  TODO_GROUP_TODO_ID,
  TODO_PROJECT_ID,
  TODO_STATUS_LABELS_STORAGE_KEY,
  getEffectiveTodoStatus,
  isBuiltinTodoStatus,
  loadCustomTodoStatuses,
  loadTodoStatusLabels,
  normalizeCustomTodoStatuses,
  normalizeTodoStatusLabels,
  saveCustomTodoStatuses,
  saveTodoStatusLabels,
  syncTodoStatusToSourceNote,
} from '../TodoService';

describe('TodoStatusLabels', () => {
  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', mockLocalStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('normalizeTodoStatusLabels', () => {
    it('returns defaults when input is null, undefined, or non-object', () => {
      expect(normalizeTodoStatusLabels(null)).toEqual(DEFAULT_TODO_STATUS_LABELS);
      expect(normalizeTodoStatusLabels(undefined)).toEqual(DEFAULT_TODO_STATUS_LABELS);
      expect(normalizeTodoStatusLabels('invalid')).toEqual(DEFAULT_TODO_STATUS_LABELS);
      expect(normalizeTodoStatusLabels(123)).toEqual(DEFAULT_TODO_STATUS_LABELS);
    });

    it('merges valid trimmed overrides over defaults', () => {
      expect(
        normalizeTodoStatusLabels({
          todo: '  백로그  ',
          doing: '작업 중',
        })
      ).toEqual({
        todo: '백로그',
        doing: '작업 중',
        done: DEFAULT_TODO_STATUS_LABELS.done,
        drop: DEFAULT_TODO_STATUS_LABELS.drop,
      });
    });

    it('falls back to default for empty or whitespace-only strings and non-strings', () => {
      expect(
        normalizeTodoStatusLabels({
          todo: '   ',
          doing: '',
          done: 42,
          drop: null,
        })
      ).toEqual(DEFAULT_TODO_STATUS_LABELS);
    });

    it('truncates labels longer than 24 characters after trimming', () => {
      const longLabel = '  123456789012345678901234567890  ';
      const normalized = normalizeTodoStatusLabels({ todo: longLabel });
      expect(normalized.todo).toBe('123456789012345678901234');
      expect(normalized.todo.length).toBe(24);
    });
  });

  describe('loadTodoStatusLabels & saveTodoStatusLabels', () => {
    it('returns defaults when localStorage is empty', () => {
      expect(loadTodoStatusLabels()).toEqual(DEFAULT_TODO_STATUS_LABELS);
    });

    it('persists and loads normalized labels via localStorage', () => {
      saveTodoStatusLabels({
        todo: '할 일',
        doing: '진행',
        done: '끝',
        drop: '보류',
      });
      const raw = store.get(TODO_STATUS_LABELS_STORAGE_KEY);
      expect(raw).toBeTruthy();
      expect(loadTodoStatusLabels()).toEqual({
        todo: '할 일',
        doing: '진행',
        done: '끝',
        drop: '보류',
      });
    });

    it('falls back to defaults on malformed JSON in localStorage', () => {
      store.set(TODO_STATUS_LABELS_STORAGE_KEY, '{not-valid-json');
      expect(loadTodoStatusLabels()).toEqual(DEFAULT_TODO_STATUS_LABELS);
    });

    it('handles localStorage errors gracefully without throwing', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('storage disabled');
        },
        setItem: () => {
          throw new Error('quota exceeded');
        },
      });
      expect(loadTodoStatusLabels()).toEqual(DEFAULT_TODO_STATUS_LABELS);
      expect(() =>
        saveTodoStatusLabels({ ...DEFAULT_TODO_STATUS_LABELS, todo: '테스트' })
      ).not.toThrow();
    });

    it('preserves custom status label overrides in normalizeTodoStatusLabels', () => {
      const normalized = normalizeTodoStatusLabels({
        todo: '대기',
        'custom-1': '  검토 중  ',
        'custom-empty': '   ',
      });
      expect(normalized['custom-1']).toBe('검토 중');
      expect(normalized['custom-empty']).toBeUndefined();
    });
  });

  describe('isBuiltinTodoStatus', () => {
    it('returns true for built-in statuses and false for custom ones', () => {
      expect(isBuiltinTodoStatus('todo')).toBe(true);
      expect(isBuiltinTodoStatus('doing')).toBe(true);
      expect(isBuiltinTodoStatus('done')).toBe(true);
      expect(isBuiltinTodoStatus('drop')).toBe(true);
      expect(isBuiltinTodoStatus('custom-abc')).toBe(false);
      expect(isBuiltinTodoStatus('')).toBe(false);
    });
  });

  describe('normalizeCustomTodoStatuses', () => {
    it('returns empty array for non-array inputs', () => {
      expect(normalizeCustomTodoStatuses(null)).toEqual([]);
      expect(normalizeCustomTodoStatuses(undefined)).toEqual([]);
      expect(normalizeCustomTodoStatuses({})).toEqual([]);
    });

    it('filters invalid entries, built-in IDs, duplicates, and truncates labels to 24 chars', () => {
      const input = [
        null,
        { id: 'todo', label: '중복 불가' },
        { id: '   ', label: '빈 ID' },
        { id: 'custom-1', label: '   ' },
        { id: 'custom-1', label: '  보류  ', color: 'violet' },
        { id: 'custom-1', label: '중복 ID' },
        { id: 'custom-2', label: '123456789012345678901234567890' },
      ];
      expect(normalizeCustomTodoStatuses(input)).toEqual([
        { id: 'custom-1', label: '보류', color: 'violet' },
        { id: 'custom-2', label: '123456789012345678901234' },
      ]);
    });
  });

  describe('loadCustomTodoStatuses & saveCustomTodoStatuses', () => {
    it('returns empty array when localStorage is empty or malformed', () => {
      expect(loadCustomTodoStatuses()).toEqual([]);
      store.set(CUSTOM_TODO_STATUSES_STORAGE_KEY, '{bad-json');
      expect(loadCustomTodoStatuses()).toEqual([]);
    });

    it('persists and loads normalized custom statuses via localStorage', () => {
      saveCustomTodoStatuses([
        { id: 'custom-hold', label: '  보류  ', color: 'violet' },
        { id: 'done', label: '무시됨' },
      ]);
      expect(store.get(CUSTOM_TODO_STATUSES_STORAGE_KEY)).toBeTruthy();
      expect(loadCustomTodoStatuses()).toEqual([
        { id: 'custom-hold', label: '보류', color: 'violet' },
      ]);
    });
  });

  describe('syncTodoStatusToSourceNote with custom status', () => {
    it('anchors under TODO_GROUP_TODO_ID, preserves todoMeta.status, and swaps status tags cleanly', () => {
      const todoNote = createEmptyNote({
        id: 'todo-1',
        title: '검토할 작업',
        projectId: TODO_PROJECT_ID,
        parentId: TODO_GROUP_TODO_ID,
        tags: ['할일', 'todo', '중요'],
        todoMeta: { status: 'todo' },
      });

      const { updatedNotes } = syncTodoStatusToSourceNote(
        todoNote,
        'custom-review',
        [todoNote],
        { moveToGroupRoot: true }
      );
      const afterCustom = updatedNotes.find((n) => n.id === 'todo-1')!;
      expect(afterCustom.parentId).toBe(TODO_GROUP_TODO_ID);
      expect(afterCustom.todoMeta?.status).toBe('custom-review');
      expect(getEffectiveTodoStatus(afterCustom, updatedNotes)).toBe('custom-review');
      expect(afterCustom.tags).toContain('custom-review');
      expect(afterCustom.tags).toContain('중요');
      expect(afterCustom.tags).not.toContain('todo');

      const { updatedNotes: backToDoing } = syncTodoStatusToSourceNote(
        afterCustom,
        'doing',
        updatedNotes,
        { moveToGroupRoot: true }
      );
      const afterDoing = backToDoing.find((n) => n.id === 'todo-1')!;
      expect(afterDoing.todoMeta?.status).toBe('doing');
      expect(afterDoing.tags).toContain('doing');
      expect(afterDoing.tags).toContain('중요');
      expect(afterDoing.tags).not.toContain('custom-review');
    });
  });
});
