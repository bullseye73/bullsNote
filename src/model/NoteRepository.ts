// MODEL: 영속성 계층 (MVC의 M) - localStorage 기반 + 구버전 마이그레이션
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECTS, Note, Project } from './Note';

const STORAGE_KEY = 'bullsnote.notes.v1';
const PROJECTS_STORAGE_KEY = 'bullsnote.projects.v1';

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

export const NoteRepository = {
  load(): Note[] {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  },
  save(notes: Note[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  },
  loadProjects(): Project[] {
    return safeParseProjects(localStorage.getItem(PROJECTS_STORAGE_KEY));
  },
  saveProjects(projects: Project[]): void {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
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
  const now = Date.now();
  return [
    {
      id: 'seed-1',
      title: 'BullsNote 시작하기 #환영',
      projectId: DEFAULT_PROJECT_ID,
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
