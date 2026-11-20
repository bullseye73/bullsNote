// MODEL: 영속성 계층 (MVC의 M) - localStorage 기반 + 구버전 마이그레이션
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECTS, Note, NoteComment, NoteReminder, Project, TodoMeta, TodoStatus } from './Note';
import { GROUP_ID_TO_STATUS } from './TodoService';

const STORAGE_KEY = 'bullsnote.notes.v1';
const PROJECTS_STORAGE_KEY = 'bullsnote.projects.v1';
const IDB_NAME = 'bullsnote.db';
const IDB_VERSION = 1;
const IDB_STORE = 'kv';
const IDB_NOTES_KEY = 'notes';
const IDB_PROJECTS_KEY = 'projects';

let idbCachedNotes: Note[] | null = null;
let idbCachedProjects: Project[] | null = null;
let idbPersistenceRequested = false;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function requestPersistentStorageOnce(): void {
  if (idbPersistenceRequested) return;
  idbPersistenceRequested = true;
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.storage?.persist) {
      void nav.storage.persist().catch(() => {
        /* ignore */
      });
    }
  } catch {
    /* ignore */
  }
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 열기 실패'));
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openIdb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB 읽기 실패'));
    });
  } finally {
    db.close();
  }
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('IndexedDB 쓰기 실패'));
    });
  } finally {
    db.close();
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** 구버전 TipTap HTML -> 마크다운 근사 변환 (히스토리/검색 호환용) */
export function htmlToMarkdown(html: string): string {
  let s = html;
  s = s.replace(/<li[^>]*>\s*<p[^>]*>/gi, '\n- ');
  s = s.replace(/<\/(li|ul|ol)>/gi, '\n');
  s = s.replace(/<h1[^>]*>/gi, '\n\n# ');
  s = s.replace(/<h2[^>]*>/gi, '\n\n## ');
  s = s.replace(/<h3[^>]*>/gi, '\n\n### ');
  s = s.replace(/<h[4-6][^>]*>/gi, '\n\n#### ');
  s = s.replace(/<\/(h[1-6])>/gi, '\n');
  s = s.replace(/<blockquote[^>]*>\s*(<p[^>]*>)?/gi, '\n\n> ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/?p[^>]*>/gi, '\n\n');
  s = s.replace(/<pre[^>]*>\s*<code[^>]*>/gi, '\n\n```\n');
  s = s.replace(/<\/code>\s*<\/pre>/gi, '\n```\n');
  s = s.replace(/<code[^>]*>/gi, '`').replace(/<\/code>/gi, '`');
  s = s.replace(/<strong[^>]*>|<b[^>]*>/gi, '**').replace(/<\/(strong|b)>/gi, '**');
  s = s.replace(/<em[^>]*>|<i[^>]*>/gi, '_').replace(/<\/(em|i)>/gi, '_');
  s = s.replace(/<s[^>]*>/gi, '~~').replace(/<\/s>/gi, '~~');
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>/gi, '[$1]($1 "').replace(/<\/a>/gi, '")');
  s = s.replace(/<[^>]*>/g, '');
  s = decodeEntities(s);
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

function looksLikeHtml(s: string): boolean {
  return /<[a-z][\s\S]*>/i.test(s);
}

function migrate(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  return raw
    .filter((n) => n && typeof n.id === 'string')
    .map((n) => {
      const content = typeof n.content === 'string' ? n.content : '';
      const projectId = typeof n.projectId === 'string' && n.projectId.trim() ? n.projectId.trim() : DEFAULT_PROJECT_ID;
      return {
        id: n.id as string,
        title: typeof n.title === 'string' ? n.title : '제목 없음',
        projectId,
        color: typeof (n as { color?: unknown }).color === 'string' ? (n as { color: string }).color : 'blue',
        reminder:
          (n as { reminder?: unknown }).reminder &&
          typeof ((n as { reminder?: { targetAt?: unknown } }).reminder?.targetAt) === 'number'
            ? ((n as { reminder: NoteReminder }).reminder as NoteReminder)
            : null,
        content: looksLikeHtml(content) ? htmlToMarkdown(content) : content,
        tags: Array.isArray(n.tags) ? n.tags.filter((t: unknown) => typeof t === 'string') : [],
        pinned: !!n.pinned,
        favorite: !!n.favorite,
        parentId: typeof n.parentId === 'string' ? n.parentId : null,
        history: Array.isArray(n.history)
          ? n.history.filter(
              (h: unknown) =>
                h && typeof (h as { title?: unknown }).title === 'string' && typeof (h as { savedAt?: unknown }).savedAt === 'number',
            )
          : [],
        attachments: Array.isArray((n as { attachments?: unknown }).attachments)
          ? (n as { attachments: Note['attachments'] }).attachments
          : [],
        comments: Array.isArray((n as { comments?: unknown }).comments)
          ? ((n as { comments: unknown[] }).comments.filter(
              (c): c is NoteComment =>
                Boolean(c) &&
                typeof (c as { id?: unknown }).id === 'string' &&
                typeof (c as { content?: unknown }).content === 'string' &&
                typeof (c as { createdAt?: unknown }).createdAt === 'number' &&
                typeof (c as { updatedAt?: unknown }).updatedAt === 'number',
            ))
          : [],
        todoMeta:
          (n as { todoMeta?: unknown }).todoMeta &&
          typeof (n as { todoMeta?: unknown }).todoMeta === 'object'
            ? ((n as { todoMeta: TodoMeta }).todoMeta as TodoMeta)
            : undefined,
        systemGroupType:
          typeof (n as { systemGroupType?: unknown }).systemGroupType === 'string'
            ? ((n as { systemGroupType: TodoStatus }).systemGroupType as TodoStatus)
            : GROUP_ID_TO_STATUS[n.id as string],
        syncedAt:
          typeof (n as { syncedAt?: unknown }).syncedAt === 'number'
            ? (n as { syncedAt: number }).syncedAt
            : undefined,
        createdAt: typeof n.createdAt === 'number' ? n.createdAt : now,
        updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : now,
      } as Note;
    });
}

function safeParse(raw: string | null): Note[] {
  if (!raw) return [];
  try {
    return migrate(JSON.parse(raw));
  } catch {
    return [];
  }
}

function safeParseProjects(raw: string | null): Project[] {
  if (!raw) return DEFAULT_PROJECTS;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return DEFAULT_PROJECTS;
    const valid = data.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string');
    return valid.length > 0 ? valid : DEFAULT_PROJECTS;
  } catch {
    return DEFAULT_PROJECTS;
  }
}

export interface SaveResult {
  success: boolean;
  error?: string;
}

export const NoteRepository = {
  async initAsync(): Promise<{ notes: Note[]; projects: Project[]; migratedFromLocalStorage: boolean }> {
    requestPersistentStorageOnce();

    if (!hasIndexedDb()) {
      const notes = safeParse(localStorage.getItem(STORAGE_KEY));
      const projects = safeParseProjects(localStorage.getItem(PROJECTS_STORAGE_KEY));
      idbCachedNotes = notes;
      idbCachedProjects = projects;
      return { notes, projects, migratedFromLocalStorage: false };
    }

    try {
      const [rawIdbNotes, rawIdbProjects] = await Promise.all([
        idbGet<unknown>(IDB_NOTES_KEY),
        idbGet<unknown>(IDB_PROJECTS_KEY),
      ]);

      let migratedFromLocalStorage = false;
      let notes: Note[];
      if (Array.isArray(rawIdbNotes)) {
        notes = migrate(rawIdbNotes);
      } else {
        const lsRaw = localStorage.getItem(STORAGE_KEY);
        notes = safeParse(lsRaw);
        if (lsRaw !== null) {
          await idbSet(IDB_NOTES_KEY, notes);
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            /* ignore */
          }
          migratedFromLocalStorage = true;
        }
      }

      let projects: Project[];
      if (Array.isArray(rawIdbProjects)) {
        const valid = rawIdbProjects.filter(
          (p): p is Project => Boolean(p) && typeof p.id === 'string' && typeof p.name === 'string',
        );
        projects = valid.length > 0 ? valid : DEFAULT_PROJECTS;
      } else {
        const lsProjectsRaw = localStorage.getItem(PROJECTS_STORAGE_KEY);
        projects = safeParseProjects(lsProjectsRaw);
        if (lsProjectsRaw !== null) {
          await idbSet(IDB_PROJECTS_KEY, projects);
          try {
            localStorage.removeItem(PROJECTS_STORAGE_KEY);
          } catch {
            /* ignore */
          }
        }
      }

      idbCachedNotes = notes;
      idbCachedProjects = projects;
      return { notes, projects, migratedFromLocalStorage };
    } catch (e) {
      console.warn('IndexedDB 초기화 실패, localStorage로 폴백합니다:', e);
      const notes = safeParse(localStorage.getItem(STORAGE_KEY));
      const projects = safeParseProjects(localStorage.getItem(PROJECTS_STORAGE_KEY));
      idbCachedNotes = notes;
      idbCachedProjects = projects;
      return { notes, projects, migratedFromLocalStorage: false };
    }
  },
  load(): Note[] {
    if (idbCachedNotes !== null) return idbCachedNotes;
    return safeParse(localStorage.getItem(STORAGE_KEY));
  },
  save(notes: Note[]): SaveResult {
    idbCachedNotes = notes;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      return { success: true };
    } catch (e: unknown) {
      const isQuota =
        e instanceof DOMException &&
        (e.name === 'QuotaExceededError' ||
          e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
          e.code === 22 ||
          e.code === 1014);
      const msg = isQuota
        ? '저장 실패: 브라우저 저장소(localStorage) 용량이 초과되었습니다. 본문 내 이미지(dataURL) 누적이 원인일 수 있습니다. 이미지를 줄이거나 파일 볼트/클라우드 스토리지를 이용해주세요.'
        : `저장 실패: ${e instanceof Error ? e.message : String(e)}`;
      console.error(msg, e);
      return { success: false, error: msg };
    }
  },
  async saveAsync(notes: Note[]): Promise<SaveResult> {
    idbCachedNotes = notes;
    if (!hasIndexedDb()) {
      return this.save(notes);
    }
    try {
      await idbSet(IDB_NOTES_KEY, notes);
      // IndexedDB 저장이 성공하면 구버전 localStorage 캐시는 비워 5MB 한도를 확보
      try {
        if (localStorage.getItem(STORAGE_KEY) !== null) {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        /* ignore */
      }
      return { success: true };
    } catch (e: unknown) {
      const isQuota =
        e instanceof DOMException &&
        (e.name === 'QuotaExceededError' ||
          e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
          e.code === 22 ||
          e.code === 1014);
      const msg = isQuota
        ? '저장 실패: 브라우저 저장소(IndexedDB) 용량이 부족합니다. 기기 저장 공간을 확보하거나 불필요한 이미지를 정리해주세요.'
        : `저장 실패: ${e instanceof Error ? e.message : String(e)}`;
      console.error(msg, e);
      return { success: false, error: msg };
    }
  },
  loadProjects(): Project[] {
    if (idbCachedProjects !== null) return idbCachedProjects;
    return safeParseProjects(localStorage.getItem(PROJECTS_STORAGE_KEY));
  },
  saveProjects(projects: Project[]): void {
    idbCachedProjects = projects;
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  },
  async saveProjectsAsync(projects: Project[]): Promise<void> {
    idbCachedProjects = projects;
    if (!hasIndexedDb()) {
      this.saveProjects(projects);
      return;
    }
    try {
      await idbSet(IDB_PROJECTS_KEY, projects);
      try {
        if (localStorage.getItem(PROJECTS_STORAGE_KEY) !== null) {
          localStorage.removeItem(PROJECTS_STORAGE_KEY);
        }
      } catch {
        /* ignore */
      }
    } catch (e) {
      console.warn('IndexedDB 프로젝트 저장 실패, localStorage로 폴백합니다:', e);
      try {
        this.saveProjects(projects);
      } catch {
        /* ignore */
      }
    }
  },
  exportJson(notes: Note[], projects: Project[] = DEFAULT_PROJECTS): string {
    return JSON.stringify({ app: 'BullsNote', version: 3, projects, notes }, null, 2);
  },
  importJson(json: string): { notes: Note[]; projects?: Project[] } {
    const data = JSON.parse(json);
    const notesRaw: unknown = Array.isArray(data) ? data : data.notes;
    const migrated = migrate(notesRaw);
    if (migrated.length === 0) throw new Error('가져올 노트가 없습니다.');
    const projectsRaw: unknown = data.projects;
    const projects = Array.isArray(projectsRaw)
      ? projectsRaw.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
      : undefined;
    return { notes: migrated, projects };
  },
};

export function seedNotes(): Note[] {
  const now = 1700000000000;
  return [
    {
      id: 'seed-1',
      title: 'BullsNote 시작하기 #환영',
      projectId: DEFAULT_PROJECT_ID,
      color: 'blue',
      content: [
        '## 노션처럼 메모하세요',
        '',
        '왼쪽 트리에서 노트를 선택하고, 마크다운으로 작성하세요.',
        '본문에 `#태그`를 쓰면 자동으로 태그가 추출됩니다. 예: #회의록 #아이디어',
        '',
        '- 제목/본문 검색 지원',
        '- 태그 클릭으로 필터링',
        '- 핀/즐겨찾기로 정렬',
        '- 우측 상단 시계 아이콘으로 **히스토리 복원**',
      ].join('\n'),
      tags: ['환영'],
      pinned: true,
      favorite: true,
      parentId: null,
      history: [],
      createdAt: now - 1000 * 60 * 60,
      updatedAt: now - 1000 * 60 * 30,
    },
    {
      id: 'seed-1-1',
      title: '마크다운 치트시트',
      projectId: DEFAULT_PROJECT_ID,
      color: 'mint',
      content: [
        '# 제목 1',
        '## 제목 2',
        '',
        '**굵게**, _기울임_, `코드`, ~~취소선~~',
        '',
        '> 인용문',
        '',
        '- 불릿 1',
        '- 불릿 2',
        '',
        '1. 순서 1',
        '2. 순서 2',
        '',
        '| 표 | 지원 |',
        '|---|---|',
        '| GFM | 표 | 렌더 |',
      ].join('\n'),
      tags: [],
      pinned: false,
      favorite: false,
      parentId: 'seed-1',
      history: [],
      createdAt: now - 1000 * 60 * 25,
      updatedAt: now - 1000 * 60 * 20,
    },
    {
      id: 'seed-2',
      title: '주간 회의록 #회의록',
      projectId: DEFAULT_PROJECT_ID,
      color: 'peach',
      content: ['참석: 팀 전원', '', '- 안건 1: 릴리즈 일정 #프로젝트', '- 안건 2: 버그 트리아지 #버그'].join('\n'),
      tags: ['회의록', '프로젝트', '버그'],
      pinned: false,
      favorite: false,
      parentId: null,
      history: [],
      createdAt: now - 1000 * 60 * 20,
      updatedAt: now - 1000 * 60 * 10,
    },
  ];
}
