import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyNote, DEFAULT_PROJECTS } from '../Note';
import { NoteRepository, SEED_NOTE_IDS, dedupeSeedTodos } from '../NoteRepository';

function createMockIndexedDb() {
  const dbStore = new Map<string, unknown>();

  const makeReq = <T>(getResult: () => T) => {
    const req: any = {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };
    queueMicrotask(() => {
      try {
        req.result = getResult();
        req.onsuccess?.({ target: req });
      } catch (err) {
        req.error = err;
        req.onerror?.({ target: req });
      }
    });
    return req;
  };

  const mockDb = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => ({}),
    close: () => {},
    transaction: () => ({
      objectStore: () => ({
        get: (key: string) => makeReq(() => dbStore.get(key)),
        put: (value: unknown, key: string) =>
          makeReq(() => {
            dbStore.set(key, value);
            return key;
          }),
      }),
    }),
  };

  const fakeIndexedDb = {
    open: () => makeReq(() => mockDb),
  };

  return { dbStore, fakeIndexedDb };
}

describe('NoteRepository IndexedDB 마이그레이션 및 저장', () => {
  let lsStore: Map<string, string>;

  beforeEach(() => {
    lsStore = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => lsStore.get(k) ?? null,
        setItem: (k: string, v: string) => {
          lsStore.set(k, v);
        },
        removeItem: (k: string) => {
          lsStore.delete(k);
        },
      },
      configurable: true,
    });
  });

  it('initAsync는 기존 localStorage 데이터를 IndexedDB로 이관하고 localStorage 키를 정리한다', async () => {
    const { dbStore, fakeIndexedDb } = createMockIndexedDb();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: fakeIndexedDb,
      configurable: true,
    });

    const note = createEmptyNote({ id: 'n-migrate-1', title: '마이그레이션 테스트' });
    lsStore.set('bullsnote.notes.v1', JSON.stringify([note]));
    lsStore.set('bullsnote.projects.v1', JSON.stringify(DEFAULT_PROJECTS));

    const res = await NoteRepository.initAsync();
    expect(res.migratedFromLocalStorage).toBe(true);
    expect(res.notes).toHaveLength(1);
    expect(res.notes[0].id).toBe('n-migrate-1');

    expect(lsStore.has('bullsnote.notes.v1')).toBe(false);
    expect(lsStore.has('bullsnote.projects.v1')).toBe(false);
    expect(Array.isArray(dbStore.get('notes'))).toBe(true);
    expect(Array.isArray(dbStore.get('projects'))).toBe(true);
  });

  it('saveAsync는 IndexedDB에 노트를 저장하고 성공을 반환한다', async () => {
    const { dbStore, fakeIndexedDb } = createMockIndexedDb();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: fakeIndexedDb,
      configurable: true,
    });

    const note = createEmptyNote({ id: 'n-save-1', title: '저장 테스트' });
    const res = await NoteRepository.saveAsync([note]);
    expect(res.success).toBe(true);
    const saved = dbStore.get('notes') as Array<{ id: string }>;
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('n-save-1');
  });

  it('SEED_NOTE_IDS는 초기 샘플 할일 ID를 포함하고 dedupeSeedTodos는 중복 샘플 할일을 1개만 남긴다', () => {
    expect(SEED_NOTE_IDS.has('seed-todo-1')).toBe(true);
    expect(SEED_NOTE_IDS.has('seed-todo-2')).toBe(true);
    expect(SEED_NOTE_IDS.has('seed-todo-3')).toBe(true);

    const dupA = createEmptyNote({
      id: 'rand-1',
      title: '빠른 입력(⌘N)으로 할일 하나 추가해 보기',
      createdAt: 1000,
    });
    const dupB = createEmptyNote({
      id: 'seed-todo-1',
      title: '빠른 입력(⌘N)으로 할일 하나 추가해 보기',
      createdAt: 2000,
    });
    const userNote = createEmptyNote({ id: 'user-1', title: '일반 사용자 노트' });

    const res = dedupeSeedTodos([dupA, dupB, userNote]);
    expect(res.removedIds).toEqual(['rand-1']);
    expect(res.notes.map((n) => n.id)).toEqual(['seed-todo-1', 'user-1']);
  });
});
