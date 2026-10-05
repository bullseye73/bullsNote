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

/** 언어 선택기가 달린 코드 블록 스키마 (앱 전역 공유) */
export function getAppSchema() {
  if (!schemaCache) {
    schemaCache = new CustomBlockNoteSchema({
      blockSpecs: {
        ...defaultBlockSpecs,
        codeBlock: createCodeBlockSpec({ supportedLanguages: CODE_LANGUAGES }),
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
