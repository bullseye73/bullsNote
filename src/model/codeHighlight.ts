import {
  CustomBlockNoteSchema,
  SyntaxHighlightingExtension,
  createBlockSpec,
  createCodeBlockConfig,
  parsePreCode,
  parsePreCodeContent,
  createPreCode,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from '@blocknote/core';
import { createHighlighter } from 'shiki';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

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

// 블록별 접힘/라인넘버 상태를 보존하기 위한 캐시 (에디터 내 블록 업데이트 시에도 상태 보존)
const codeBlockStateCache = new Map<string, { isCollapsed: boolean; showLineNumbers: boolean }>();

/** 리치 코드 블록 렌더러 (접기/펼치기, 언어 선택, 라인 번호 ON/OFF, 복사 버튼 일체형) */
export function createRichCodeBlock(
  block: any,
  editor: any,
  options?: {
    selectedLanguage: string;
    supportedLanguages: Record<string, { name: string }>;
  }
) {
  const blockId: string = block.id;
  const savedState = codeBlockStateCache.get(blockId) || {
    isCollapsed: false,
    showLineNumbers: false,
  };

  let isCollapsed = savedState.isCollapsed;
  let showLineNumbers = savedState.showLineNumbers;

  const container = document.createElement('div');
  container.className = `bn-code-block-container${isCollapsed ? ' is-collapsed' : ''}${showLineNumbers ? ' show-line-numbers' : ''}`;

  // 1. 헤더 툴바 (contentEditable=false 로 에디터 커서 간섭 차단)
  const toolbar = document.createElement('div');
  toolbar.className = 'bn-code-toolbar';
  toolbar.contentEditable = 'false';

  // 좌측: 접기/펼치기 버튼 + 언어 선택 드롭다운
  const leftGroup = document.createElement('div');
  leftGroup.className = 'bn-code-toolbar-left';

  // 접기/펼치기 버튼
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.tabIndex = -1;
  collapseBtn.className = `bn-code-btn bn-code-collapse-btn${isCollapsed ? ' is-collapsed' : ''}`;
  collapseBtn.title = isCollapsed ? '코드 펼치기' : '코드 접기';
  collapseBtn.setAttribute('aria-label', '코드 접기/펼치기');
  collapseBtn.innerHTML = `
    <svg class="icon-down" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="${isCollapsed ? 'display: none;' : 'display: inline-block;'}">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
    <svg class="icon-right" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="${isCollapsed ? 'display: inline-block;' : 'display: none;'}">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
    <span class="collapsed-label" style="${isCollapsed ? 'display: inline-block;' : 'display: none;'}">코드 접힘</span>
  `;
  leftGroup.appendChild(collapseBtn);

  // 언어 선택기
  let handleLanguageChange: ((event: Event) => void) | undefined;
  let select: HTMLSelectElement | undefined;
  if (options && Object.keys(options.supportedLanguages).length > 1) {
    select = document.createElement('select');
    select.className = 'bn-code-lang-select';
    select.tabIndex = -1;
    Object.entries(options.supportedLanguages).forEach(([id, { name }]) => {
      const option = document.createElement('option');
      option.value = id;
      option.text = name;
      select!.appendChild(option);
    });
    select.value = options.selectedLanguage;

    handleLanguageChange = (event: Event) => {
      if (!editor.isEditable) return;
      const newLang = (event.target as HTMLSelectElement).value;
      editor.updateBlock(block.id, {
        props: { language: newLang },
      });
      // 언어 변경 즉시 prosemirror-highlight 플러그인이 새 언어로 재파싱하도록 트리거
      try {
        editor.transact((tr: any) => {
          tr.setMeta('prosemirror-highlight-refresh', true);
        });
      } catch {
        try {
          const view = (editor as any)._tiptapEditor?.view;
          if (view) {
            const tr = view.state.tr.setMeta('prosemirror-highlight-refresh', true);
            view.dispatch(tr);
          }
        } catch {}
      }
    };

    if (editor.isEditable) {
      select.addEventListener('change', handleLanguageChange);
    } else {
      select.disabled = true;
    }
    leftGroup.appendChild(select);
  }

  // 우측: 라인 번호 토글 버튼 + 복사 버튼
  const rightGroup = document.createElement('div');
  rightGroup.className = 'bn-code-toolbar-right';

  // 라인 번호 토글 버튼 (ON/OFF)
  const lineNumbersBtn = document.createElement('button');
  lineNumbersBtn.type = 'button';
  lineNumbersBtn.tabIndex = -1;
  lineNumbersBtn.className = `bn-code-btn bn-code-line-numbers-btn${showLineNumbers ? ' active' : ''}`;
  lineNumbersBtn.title = showLineNumbers ? '라인 번호 숨기기' : '라인 번호 표시 (ON/OFF)';
  lineNumbersBtn.setAttribute('aria-label', '라인 번호 토글');
  lineNumbersBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="4" y1="9" x2="20" y2="9"></line>
      <line x1="4" y1="15" x2="20" y2="15"></line>
      <line x1="10" y1="3" x2="8" y2="21"></line>
      <line x1="16" y1="3" x2="14" y2="21"></line>
    </svg>
    <span class="btn-text">라인</span>
  `;
  rightGroup.appendChild(lineNumbersBtn);

  // 복사 버튼
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.tabIndex = -1;
  copyBtn.className = 'bn-code-btn bn-code-copy-btn';
  copyBtn.title = '코드 복사';
  copyBtn.setAttribute('aria-label', '코드 복사');
  copyBtn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    <span class="copy-label">복사</span>
  `;
  rightGroup.appendChild(copyBtn);

  toolbar.appendChild(leftGroup);
  toolbar.appendChild(rightGroup);
  container.appendChild(toolbar);

  // 2. 본문 영역 (Gutter + pre > code)
  const bodyWrapper = document.createElement('div');
  bodyWrapper.className = 'bn-code-body';
  bodyWrapper.style.display = isCollapsed ? 'none' : 'flex';

  const gutter = document.createElement('div');
  gutter.className = 'bn-code-gutter';
  gutter.contentEditable = 'false';
  gutter.style.display = showLineNumbers ? 'block' : 'none';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  pre.appendChild(code);

  bodyWrapper.appendChild(gutter);
  bodyWrapper.appendChild(pre);
  container.appendChild(bodyWrapper);

  // 라인 수 계산 함수 (ProseMirror 내부 줄바꿈 및 브라우저 innerText 정확히 감지)
  const getLineCount = (): number => {
    const raw = code.textContent || '';
    const inner = code.innerText || '';
    const rawCount = (raw.match(/\n/g) || []).length + 1;
    const innerNormalized = inner.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const innerLines = innerNormalized.split('\n');
    let innerCount = innerLines.length;
    if (innerLines.length > 1 && innerLines[innerLines.length - 1] === '') {
      innerCount = innerLines.length - 1;
    }
    return Math.max(1, rawCount, innerCount);
  };

  // 라인 번호 갱신
  const updateLineNumbers = () => {
    if (!showLineNumbers) {
      gutter.style.display = 'none';
      return;
    }
    gutter.style.display = 'block';
    const count = getLineCount();
    let spans = '';
    for (let i = 1; i <= count; i++) {
      spans += `<span>${i}</span>`;
    }
    gutter.innerHTML = spans;
  };

  // 라벨 업데이트 (접힌 상태일 때 줄 수 안내)
  const updateCollapsedLabel = () => {
    const collapsedLabel = collapseBtn.querySelector<HTMLElement>('.collapsed-label');
    if (collapsedLabel) {
      const count = getLineCount();
      collapsedLabel.textContent = `코드 접힘 (${count}줄)`;
    }
  };

  // 기능 1: 접기/펼치기 핸들러
  const toggleCollapse = (e?: Event) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    isCollapsed = !isCollapsed;
    codeBlockStateCache.set(blockId, { isCollapsed, showLineNumbers });

    const iconDown = collapseBtn.querySelector<HTMLElement>('.icon-down');
    const iconRight = collapseBtn.querySelector<HTMLElement>('.icon-right');
    const collapsedLabel = collapseBtn.querySelector<HTMLElement>('.collapsed-label');

    container.classList.toggle('is-collapsed', isCollapsed);
    collapseBtn.classList.toggle('is-collapsed', isCollapsed);
    bodyWrapper.style.display = isCollapsed ? 'none' : 'flex';

    if (iconDown) iconDown.style.display = isCollapsed ? 'none' : 'inline-block';
    if (iconRight) iconRight.style.display = isCollapsed ? 'inline-block' : 'none';
    if (collapsedLabel) {
      collapsedLabel.style.display = isCollapsed ? 'inline-block' : 'none';
      if (isCollapsed) updateCollapsedLabel();
    }
    collapseBtn.title = isCollapsed ? '코드 펼치기' : '코드 접기';
  };

  // 기능 2: 라인 번호 토글 핸들러
  const toggleLineNumbers = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    showLineNumbers = !showLineNumbers;
    codeBlockStateCache.set(blockId, { isCollapsed, showLineNumbers });

    container.classList.toggle('show-line-numbers', showLineNumbers);
    lineNumbersBtn.classList.toggle('active', showLineNumbers);
    lineNumbersBtn.title = showLineNumbers ? '라인 번호 숨기기' : '라인 번호 표시 (ON/OFF)';

    updateLineNumbers();
  };

  // 툴바 내부 클릭 시 ProseMirror 커서 가로챔 방지
  const handleToolbarMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'SELECT') {
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  toolbar.addEventListener('mousedown', handleToolbarMouseDown);
  collapseBtn.addEventListener('click', toggleCollapse);
  lineNumbersBtn.addEventListener('click', toggleLineNumbers);

  // 코드 변경 시 줄 번호 자동 갱신
  const handleInput = () => {
    if (showLineNumbers) {
      updateLineNumbers();
    }
    if (isCollapsed) {
      updateCollapsedLabel();
    }
  };
  code.addEventListener('input', handleInput);
  code.addEventListener('keyup', handleInput);

  const observer = new MutationObserver(() => {
    if (showLineNumbers) {
      updateLineNumbers();
    }
    if (isCollapsed) {
      updateCollapsedLabel();
    }
  });
  observer.observe(code, { childList: true, characterData: true, subtree: true });

  // 기능 3: 복사 버튼 핸들러
  const handleCopy = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const text = code.innerText || code.textContent || '';
    void navigator.clipboard.writeText(text).then(() => {
      copyBtn.classList.add('copied');
      const label = copyBtn.querySelector('.copy-label');
      if (label) label.textContent = '복사됨!';
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        if (label) label.textContent = '복사';
      }, 1500);
    });
  };
  copyBtn.addEventListener('click', handleCopy);

  // 초기 마운트 시 줄 번호 및 상태 초기화
  if (isCollapsed) {
    updateCollapsedLabel();
  }
  if (showLineNumbers) {
    requestAnimationFrame(() => {
      updateLineNumbers();
    });
  }

  return {
    dom: container,
    contentDOM: code,
    // TipTap / ProseMirror NodeView 인터페이스 필수 메서드 구현:
    // 1. update: 동일 타입의 블록 업데이트 시 NodeView 재생성 방지
    update: (updatedNode: any) => {
      if (updatedNode?.type?.name !== 'codeBlock') {
        return false;
      }
      const newLang = updatedNode.attrs?.language;
      if (select && newLang && select.value !== newLang) {
        select.value = newLang;
      }
      if (showLineNumbers) {
        requestAnimationFrame(() => updateLineNumbers());
      }
      return true;
    },
    // 2. stopEvent: 툴바 내부 이벤트는 ProseMirror가 가로채지 않도록 차단
    stopEvent: (event: Event) => {
      return toolbar.contains(event.target as Node);
    },
    // 3. ignoreMutation: 툴바와 gutter의 DOM 변경은 ProseMirror 문서 변경으로 간주하지 않음
    ignoreMutation: (mutation: any) => {
      return !code.contains(mutation.target);
    },
    destroy: () => {
      toolbar.removeEventListener('mousedown', handleToolbarMouseDown);
      collapseBtn.removeEventListener('click', toggleCollapse);
      lineNumbersBtn.removeEventListener('click', toggleLineNumbers);
      copyBtn.removeEventListener('click', handleCopy);
      code.removeEventListener('input', handleInput);
      code.removeEventListener('keyup', handleInput);
      observer.disconnect();
      if (select && handleLanguageChange) {
        select.removeEventListener('change', handleLanguageChange);
      }
    },
  };
}

/** 접기/펼치기, 라인번호, 복사 버튼이 통합된 코드 블록 스펙 */
export const createRichCodeBlockSpec = (createBlockSpec as any)(
  createCodeBlockConfig,
  (options: any) => ({
    meta: {
      code: true,
      defining: true,
      isolating: false,
      highlight: (block: any) => {
        if (typeof block?.props === 'string') return block.props;
        const lang = block?.props?.language ?? block?.attrs?.language;
        return lang || 'javascript';
      },
    },
    parse: (el: HTMLElement) => parsePreCode(el),
    parseContent: (opts: any) => parsePreCodeContent(opts, 'codeBlock'),
    render: (block: any, editor: any) =>
      createRichCodeBlock(
        block,
        editor,
        options?.supportedLanguages && {
          selectedLanguage: block.props.language,
          supportedLanguages: options.supportedLanguages,
        }
      ),
    toExternalHTML: (block: any) => createPreCode(block),
  })
);

let schemaCache: CustomBlockNoteSchema<any, any, any> | null = null;

/** 언어 선택기, 접기/펼치기, 라인 넘버 기능이 달린 코드 블록 스키마 (앱 전역 공유) */
export function getAppSchema() {
  if (!schemaCache) {
    schemaCache = new CustomBlockNoteSchema({
      blockSpecs: {
        ...defaultBlockSpecs,
        codeBlock: createRichCodeBlockSpec({
          defaultLanguage: 'javascript',
          supportedLanguages: CODE_LANGUAGES,
        }),
      },
      inlineContentSpecs: defaultInlineContentSpecs,
      styleSpecs: defaultStyleSpecs,
    });
  }
  return schemaCache;
}

type Highlighter = Awaited<ReturnType<typeof createHighlighter>>;
let highlighterCache: Promise<Highlighter> | null = null;

/** Shiki 하이라이터 싱글톤 (JS 정규식 엔진 사용으로 WASM 의존성 없이 안정적 구문 강조) */
export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterCache) {
    highlighterCache = createHighlighter({
      engine: createJavaScriptRegexEngine(),
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
