// MODEL: Mermaid 다이어그램 템플릿, 뷰 모드, 테마/모양 프리셋, 지연 로딩 SVG 렌더러 및 슬래시 메뉴 스펙
export type MermaidViewMode = 'split' | 'preview' | 'code';

export const DEFAULT_MERMAID_VIEW_MODE: MermaidViewMode = 'split';

export type MermaidThemePreset = 'redux-color' | 'redux' | 'neo' | 'default' | 'forest' | 'neutral';
export type MermaidLook = 'neo' | 'classic' | 'handDrawn';

export const DEFAULT_MERMAID_THEME: MermaidThemePreset = 'redux-color';
export const DEFAULT_MERMAID_LOOK: MermaidLook = 'neo';
export const MERMAID_PREFS_STORAGE_KEY = 'bullsnote.mermaidPrefs.v1';

export const MERMAID_THEME_OPTIONS: Array<{ value: MermaidThemePreset; label: string }> = [
  { value: 'redux-color', label: 'Redux Color' },
  { value: 'redux', label: 'Redux' },
  { value: 'neo', label: 'Neo' },
  { value: 'default', label: '기본' },
  { value: 'forest', label: 'Forest' },
  { value: 'neutral', label: 'Neutral' },
];

export const MERMAID_LOOK_OPTIONS: Array<{ value: MermaidLook; label: string }> = [
  { value: 'neo', label: 'Neo' },
  { value: 'classic', label: 'Classic' },
  { value: 'handDrawn', label: 'Hand Drawn' },
];

export function resolveMermaidTheme(
  preset: MermaidThemePreset,
  isDark: boolean
): 'redux-color' | 'redux-dark-color' | 'redux' | 'redux-dark' | 'neo' | 'neo-dark' | 'default' | 'dark' | 'forest' | 'neutral' {
  switch (preset) {
    case 'redux-color':
      return isDark ? 'redux-dark-color' : 'redux-color';
    case 'redux':
      return isDark ? 'redux-dark' : 'redux';
    case 'neo':
      return isDark ? 'neo-dark' : 'neo';
    case 'default':
      return isDark ? 'dark' : 'default';
    case 'forest':
      return 'forest';
    case 'neutral':
      return 'neutral';
    default:
      return isDark ? 'redux-dark-color' : 'redux-color';
  }
}

export interface MermaidPrefs {
  theme: MermaidThemePreset;
  look: MermaidLook;
}

const VALID_THEMES = new Set<string>(MERMAID_THEME_OPTIONS.map((o) => o.value));
const VALID_LOOKS = new Set<string>(MERMAID_LOOK_OPTIONS.map((o) => o.value));

export function normalizeMermaidPrefs(raw: unknown): MermaidPrefs {
  if (!raw || typeof raw !== 'object') {
    return { theme: DEFAULT_MERMAID_THEME, look: DEFAULT_MERMAID_LOOK };
  }
  const obj = raw as Record<string, unknown>;
  const theme =
    typeof obj.theme === 'string' && VALID_THEMES.has(obj.theme)
      ? (obj.theme as MermaidThemePreset)
      : DEFAULT_MERMAID_THEME;
  const look =
    typeof obj.look === 'string' && VALID_LOOKS.has(obj.look)
      ? (obj.look as MermaidLook)
      : DEFAULT_MERMAID_LOOK;
  return { theme, look };
}

export function loadMermaidPrefs(): MermaidPrefs {
  try {
    if (typeof localStorage === 'undefined') {
      return { theme: DEFAULT_MERMAID_THEME, look: DEFAULT_MERMAID_LOOK };
    }
    const raw = localStorage.getItem(MERMAID_PREFS_STORAGE_KEY);
    if (!raw) return { theme: DEFAULT_MERMAID_THEME, look: DEFAULT_MERMAID_LOOK };
    return normalizeMermaidPrefs(JSON.parse(raw));
  } catch {
    return { theme: DEFAULT_MERMAID_THEME, look: DEFAULT_MERMAID_LOOK };
  }
}

export function saveMermaidPrefs(prefs: MermaidPrefs): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(MERMAID_PREFS_STORAGE_KEY, JSON.stringify(normalizeMermaidPrefs(prefs)));
  } catch {
    /* ignore */
  }
}

export type MermaidTemplateKey = 'flowchart' | 'sequence' | 'er' | 'gantt' | 'mindmap';

export interface MermaidTemplate {
  key: MermaidTemplateKey;
  label: string;
  code: string;
}

export const MERMAID_TEMPLATES: Record<MermaidTemplateKey, MermaidTemplate> = {
  flowchart: {
    key: 'flowchart',
    label: '플로우차트 (Flowchart)',
    code: `flowchart TD
    A[시작] --> B{조건 확인}
    B -->|예| C[처리 실행]
    B -->|아니오| D[종료]`,
  },
  sequence: {
    key: 'sequence',
    label: '시퀀스 다이어그램 (Sequence)',
    code: `sequenceDiagram
    participant U as 사용자
    participant A as 앱
    participant S as 서버
    U->>A: 요청 전송
    A->>S: API 호출
    S-->>A: 응답 반환
    A-->>U: 결과 표시`,
  },
  er: {
    key: 'er',
    label: 'ER 다이어그램 (ERD)',
    code: `erDiagram
    USER ||--o{ NOTE : writes
    NOTE ||--o{ TAG : has
    USER {
        string id
        string name
    }
    NOTE {
        string id
        string title
    }`,
  },
  gantt: {
    key: 'gantt',
    label: '간트 차트 (Gantt)',
    code: `gantt
    title 프로젝트 일정
    dateFormat YYYY-MM-DD
    section 기획
    요구사항 분석 :a1, 2026-11-01, 3d
    설계 문서 작성 :after a1, 4d
    section 개발
    핵심 기능 구현 :2026-11-08, 5d`,
  },
  mindmap: {
    key: 'mindmap',
    label: '마인드맵 (Mindmap)',
    code: `mindmap
  root((핵심 주제))
    아이디어 A
      세부 항목 1
      세부 항목 2
    아이디어 B
      세부 항목 3
      세부 항목 4`,
  },
};

export const DEFAULT_MERMAID_CODE: string = MERMAID_TEMPLATES.flowchart.code;

export function isMermaidLanguage(lang?: string): boolean {
  const clean = (lang || '').trim().toLowerCase();
  return clean === 'mermaid' || clean === 'mmd';
}

export interface MermaidSlashSpec {
  id: string;
  title: string;
  subtext: string;
  badge: string;
  aliases: string[];
  group: string;
  language: 'mermaid';
  defaultCode: string;
  defaultViewMode: MermaidViewMode;
}

export function buildMermaidSlashSpecs(): MermaidSlashSpec[] {
  return [
    {
      id: 'mermaid-diagram',
      title: 'Mermaid 다이어그램',
      subtext: '코드와 실시간 Drawing 분할 에디터로 플로우차트·시퀀스·ERD 등을 작성합니다',
      badge: 'Mermaid',
      aliases: ['mermaid', '다이어그램', '플로우차트', 'flowchart', '차트', 'diagram', 'mmd'],
      group: '다이어그램',
      language: 'mermaid',
      defaultCode: DEFAULT_MERMAID_CODE,
      defaultViewMode: DEFAULT_MERMAID_VIEW_MODE,
    },
  ];
}

let renderSeq = 0;

export type MermaidLintResult =
  | { valid: true; diagramType?: string }
  | { valid: false; error: string; line?: number };

export function parseMermaidErrorLine(message: string): number | undefined {
  const m = /(?:on\s+line|line)\s+(\d+)/i.exec(message);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function lintMermaidCode(code: string): Promise<MermaidLintResult> {
  const trimmed = (code || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Mermaid 다이어그램 코드를 입력해주세요.' };
  }
  try {
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
    });
    const parsed = await mermaid.parse(trimmed);
    const diagramType =
      parsed && typeof parsed === 'object' && 'diagramType' in parsed
        ? String((parsed as { diagramType?: string }).diagramType || '')
        : undefined;
    return { valid: true, ...(diagramType ? { diagramType } : {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      error: message || 'Mermaid 문법 오류가 발생했습니다.',
      line: parseMermaidErrorLine(message),
    };
  }
}

export async function renderMermaidSvg(
  id: string,
  code: string,
  isDark: boolean,
  options?: { theme?: MermaidThemePreset; look?: MermaidLook }
): Promise<{ svg: string } | { error: string }> {
  const trimmed = (code || '').trim();
  if (!trimmed) {
    return { error: 'Mermaid 다이어그램 코드를 입력해주세요.' };
  }

  try {
    const mermaid = (await import('mermaid')).default;
    const theme = resolveMermaidTheme(options?.theme ?? DEFAULT_MERMAID_THEME, isDark);
    const look = options?.look ?? DEFAULT_MERMAID_LOOK;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme,
      look,
    });

    const sanitizedId = (id || 'diagram').replace(/[^a-zA-Z0-9_-]/g, '') || 'diagram';
    const safeId = `bn-mermaid-${sanitizedId}-${++renderSeq}`;
    const result = await mermaid.render(safeId, trimmed);
    return { svg: result.svg };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message || 'Mermaid 문법 오류가 발생했습니다.' };
  }
}
