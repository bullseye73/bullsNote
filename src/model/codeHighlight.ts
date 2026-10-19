// MODEL: 코드 블록 문법강조 (Shiki + 커스텀 스키마) - 싱글톤 공유
import {
  CustomBlockNoteSchema,
  SyntaxHighlightingExtension,
  createCodeBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from '@blocknote/core';
import { createHighlighter } from 'shiki';

/** 코드 블록 언어 선택 목록 (키는 Shiki 언어 id와 일치) */
export const CODE_LANGUAGES: Record<string, { name: string; aliases?: string[] }> = {
  text: { name: 'Text' },
  javascript: { name: 'JavaScript', aliases: ['js'] },
  typescript: { name: 'TypeScript', aliases: ['ts'] },
  json: { name: 'JSON' },
  bash: { name: 'Bash / Shell', aliases: ['sh', 'shell'] },
  python: { name: 'Python', aliases: ['py'] },
  html: { name: 'HTML' },
  css: { name: 'CSS' },
  markdown: { name: 'Markdown', aliases: ['md'] },
  yaml: { name: 'YAML', aliases: ['yml'] },
  sql: { name: 'SQL' },
  java: { name: 'Java' },
  c: { name: 'C' },
  cpp: { name: 'C++' },
  csharp: { name: 'C#' },
  go: { name: 'Go' },
  rust: { name: 'Rust' },
  xml: { name: 'XML' },
  diff: { name: 'Diff' },
};

const SHIKI_LANGS = [
  'plaintext',
  'javascript',
  'typescript',
  'json',
  'bash',
  'python',
  'html',
  'css',
  'markdown',
  'yaml',
  'sql',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'xml',
  'diff',
];

let schemaCache: CustomBlockNoteSchema<any, any, any> | null = null;

/** 접기/펼치기 아이콘 버튼이 포함된 코드 블록 스펙 생성 */
export function createCollapsibleCodeBlockSpec() {
  const spec = createCodeBlockSpec({ supportedLanguages: CODE_LANGUAGES }) as any;
  const originalRender = spec.implementation.render;

  spec.implementation.render = (block: any, editor: any) => {
    const result = originalRender(block, editor);

    // 접기/펼치기 버튼 생성 (chevron 아이콘)
    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'bn-code-collapse-btn';
    collapseBtn.setAttribute('aria-label', '코드 접기/펼치기');
    collapseBtn.title = '코드 접기';
    collapseBtn.innerHTML = `
      <svg class="chevron-down" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
      <svg class="chevron-right" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
      <span class="collapsed-badge" style="display: none;">접힘 (펼치려면 클릭)</span>
    `;

    let isCollapsed = false;
    const handleToggle = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isCollapsed = !isCollapsed;

      const parentBlock = collapseBtn.closest('[data-content-type="codeBlock"]');
      const downIcon = collapseBtn.querySelector<HTMLElement>('.chevron-down');
      const rightIcon = collapseBtn.querySelector<HTMLElement>('.chevron-right');
      const badge = collapseBtn.querySelector<HTMLElement>('.collapsed-badge');

      if (isCollapsed) {
        parentBlock?.setAttribute('data-collapsed', 'true');
        collapseBtn.classList.add('is-collapsed');
        collapseBtn.title = '코드 펼치기';
        if (downIcon) downIcon.style.display = 'none';
        if (rightIcon) rightIcon.style.display = 'inline-block';
        if (badge) badge.style.display = 'inline-block';
      } else {
        parentBlock?.removeAttribute('data-collapsed');
        collapseBtn.classList.remove('is-collapsed');
        collapseBtn.title = '코드 접기';
        if (downIcon) downIcon.style.display = 'inline-block';
        if (rightIcon) rightIcon.style.display = 'none';
        if (badge) badge.style.display = 'none';
      }
    };

    collapseBtn.addEventListener('click', handleToggle);
    result.dom.appendChild(collapseBtn);

    const origDestroy = result.destroy;
    result.destroy = () => {
      collapseBtn.removeEventListener('click', handleToggle);
      origDestroy?.();
    };

    return result;
  };

  return spec;
}

/** 언어 선택기 및 접기/펼치기 버튼이 달린 코드 블록 스키마 (앱 전역 공유) */
export function getAppSchema() {
  if (!schemaCache) {
    schemaCache = new CustomBlockNoteSchema({
      blockSpecs: {
        ...defaultBlockSpecs,
        codeBlock: createCollapsibleCodeBlockSpec(),
      },
      inlineContentSpecs: defaultInlineContentSpecs,
      styleSpecs: defaultStyleSpecs,
    });
  }
  return schemaCache;
}

type Highlighter = Awaited<ReturnType<typeof createHighlighter>>;
let highlighterCache: Promise<Highlighter> | null = null;

/** Shiki 하이라이터 싱글톤 (라이트/다크 테마 동시 로드) */
export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterCache) {
    highlighterCache = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: SHIKI_LANGS,
    });
  }
  return highlighterCache;
}

/** 에디터용 SyntaxHighlighting 확장 */
export function createSyntaxExtension() {
  return SyntaxHighlightingExtension({
    createHighlighter: () => getHighlighter() as never,
  });
}
