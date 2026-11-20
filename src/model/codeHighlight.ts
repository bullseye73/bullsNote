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
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import {
  DEFAULT_MERMAID_VIEW_MODE,
  MERMAID_LOOK_OPTIONS,
  MERMAID_TEMPLATES,
  MERMAID_THEME_OPTIONS,
  MermaidLook,
  MermaidTemplateKey,
  MermaidThemePreset,
  MermaidViewMode,
  isMermaidLanguage,
  lintMermaidCode,
  loadMermaidPrefs,
  renderMermaidSvg,
  saveMermaidPrefs,
} from './mermaidService';

/** 코드 블록 언어 선택 목록 (키는 Shiki 언어 id와 일치) */
export const CODE_LANGUAGES: Record<string, { name: string; aliases?: string[] }> = {
  text: { name: 'Text' },
  mermaid: { name: 'Mermaid', aliases: ['mmd'] },
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

const SHIKI_THEMES = [
  () => import('shiki/themes/github-light.mjs'),
  () => import('shiki/themes/github-dark.mjs'),
];

const SHIKI_LANG_IMPORTS = [
  () => import('shiki/langs/javascript.mjs'),
  () => import('shiki/langs/typescript.mjs'),
  () => import('shiki/langs/json.mjs'),
  () => import('shiki/langs/bash.mjs'),
  () => import('shiki/langs/python.mjs'),
  () => import('shiki/langs/html.mjs'),
  () => import('shiki/langs/css.mjs'),
  () => import('shiki/langs/markdown.mjs'),
  () => import('shiki/langs/yaml.mjs'),
  () => import('shiki/langs/sql.mjs'),
  () => import('shiki/langs/java.mjs'),
  () => import('shiki/langs/c.mjs'),
  () => import('shiki/langs/cpp.mjs'),
  () => import('shiki/langs/csharp.mjs'),
  () => import('shiki/langs/go.mjs'),
  () => import('shiki/langs/rust.mjs'),
  () => import('shiki/langs/xml.mjs'),
  () => import('shiki/langs/diff.mjs'),
  () => import('shiki/langs/mermaid.mjs'),
];

// 블록별 접힘/라인넘버/Mermaid 뷰 모드 상태를 보존하기 위한 캐시 (에디터 내 블록 업데이트 시에도 상태 보존)
const codeBlockStateCache = new Map<
  string,
  {
    isCollapsed: boolean;
    showLineNumbers: boolean;
    mermaidMode?: MermaidViewMode;
    mermaidTheme?: MermaidThemePreset;
    mermaidLook?: MermaidLook;
  }
>();

/** 리치 코드 블록 렌더러 (접기/펼치기, 언어 선택, 라인 번호 ON/OFF, 복사 버튼 + Mermaid 에디터 일체형) */
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
    mermaidMode: DEFAULT_MERMAID_VIEW_MODE,
  };
  const defaultPrefs = loadMermaidPrefs();

  let isCollapsed = savedState.isCollapsed;
  let showLineNumbers = savedState.showLineNumbers;
  let mermaidMode: MermaidViewMode = savedState.mermaidMode ?? DEFAULT_MERMAID_VIEW_MODE;
  let mermaidTheme: MermaidThemePreset = savedState.mermaidTheme ?? defaultPrefs.theme;
  let mermaidLook: MermaidLook = savedState.mermaidLook ?? defaultPrefs.look;
  const selectedLang = options?.selectedLanguage ?? block?.props?.language ?? 'javascript';
  const isMermaid = isMermaidLanguage(selectedLang);

  const persistState = () => {
    codeBlockStateCache.set(blockId, {
      isCollapsed,
      showLineNumbers,
      mermaidMode,
      mermaidTheme,
      mermaidLook,
    });
  };

  const container = document.createElement('div');
  container.className = `bn-code-block-container${isCollapsed ? ' is-collapsed' : ''}${showLineNumbers ? ' show-line-numbers' : ''}${isMermaid ? ` is-mermaid mermaid-mode-${mermaidMode}` : ''}`;

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
      // 클릭 이벤트가 상위 에디터 컨테이너로 전파되어 editor.focus()를 호출하고 네이티브 select 팝업을 닫는 현상 원천 차단
      select.addEventListener('click', (e) => e.stopPropagation());
    } else {
      select.disabled = true;
    }
    leftGroup.appendChild(select);
  }

  // Mermaid 전용 툴바 컨트롤 (모드 전환, 템플릿 선택, SVG 복사, 확대)
  const mermaidModeButtons: Array<{ mode: MermaidViewMode; btn: HTMLButtonElement; handler: (e: Event) => void }> = [];
  let templateSelect: HTMLSelectElement | undefined;
  let handleTemplateChange: ((event: Event) => void) | undefined;
  let svgCopyBtn: HTMLButtonElement | undefined;
  let handleSvgCopy: ((event: Event) => void) | undefined;
  let expandBtn: HTMLButtonElement | undefined;
  let handleExpand: ((event: Event) => void) | undefined;

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

  // 2. 본문 영역 (Gutter + pre > code, Mermaid일 경우 .bn-mermaid-body로 코드+미리보기 분할)
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

  let mermaidBody: HTMLDivElement | undefined;
  let mermaidPreview: HTMLDivElement | undefined;
  let mermaidViewport: HTMLDivElement | undefined;
  let mermaidSvgWrap: HTMLDivElement | undefined;
  let mermaidErrorEl: HTMLDivElement | undefined;
  let mermaidLintBadge: HTMLSpanElement | undefined;
  let lintErrorLine: number | undefined;
  let previewZoom = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let panMoved = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;
  let zoomResetBtn: HTMLButtonElement | undefined;
  let zoomInBtn: HTMLButtonElement | undefined;
  let zoomOutBtn: HTMLButtonElement | undefined;
  let mermaidThemeSelect: HTMLSelectElement | undefined;
  let mermaidLookSelect: HTMLSelectElement | undefined;
  let handleMermaidThemeChange: ((e: Event) => void) | undefined;
  let handleMermaidLookChange: ((e: Event) => void) | undefined;
  let handleZoomIn: ((e: Event) => void) | undefined;
  let handleZoomOut: ((e: Event) => void) | undefined;
  let handleZoomReset: ((e: Event) => void) | undefined;
  let handleViewportPointerDown: ((e: PointerEvent) => void) | undefined;
  let handleViewportPointerMove: ((e: PointerEvent) => void) | undefined;
  let handleViewportPointerUp: ((e: PointerEvent) => void) | undefined;
  let handleViewportWheel: ((e: WheelEvent) => void) | undefined;
  let lastValidSvg = '';
  let mermaidRenderTimer: ReturnType<typeof setTimeout> | null = null;
  let mermaidRenderToken = 0;
  let isDestroyed = false;
  let activeModalOverlay: HTMLDivElement | null = null;
  let activeModalKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  const setMermaidMode = (nextMode: MermaidViewMode) => {
    mermaidMode = nextMode;
    persistState();
    container.classList.remove('mermaid-mode-split', 'mermaid-mode-preview', 'mermaid-mode-code');
    container.classList.add(`mermaid-mode-${mermaidMode}`);
    mermaidModeButtons.forEach(({ mode, btn }) => {
      btn.classList.toggle('active', mode === mermaidMode);
    });
  };

  if (isMermaid) {
    // 모드 전환 버튼 그룹 (에디터 / 다이어그램 / 코드)
    const modeGroup = document.createElement('div');
    modeGroup.className = 'bn-mermaid-mode-group';
    const modeDefs: Array<{ mode: MermaidViewMode; label: string; title: string }> = [
      { mode: 'split', label: '에디터', title: '코드 + 실시간 Drawing 분할 보기' },
      { mode: 'preview', label: '다이어그램', title: '다이어그램만 보기' },
      { mode: 'code', label: '코드', title: 'Mermaid 코드만 보기' },
    ];
    modeDefs.forEach(({ mode, label, title }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.tabIndex = -1;
      btn.className = `bn-code-btn bn-mermaid-mode-btn${mermaidMode === mode ? ' active' : ''}`;
      btn.textContent = label;
      btn.title = title;
      const handler = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        setMermaidMode(mode);
      };
      btn.addEventListener('click', handler);
      mermaidModeButtons.push({ mode, btn, handler });
      modeGroup.appendChild(btn);
    });
    leftGroup.appendChild(modeGroup);

    // 템플릿 선택 드롭다운
    templateSelect = document.createElement('select');
    templateSelect.className = 'bn-code-lang-select bn-mermaid-template-select';
    templateSelect.tabIndex = -1;
    templateSelect.title = 'Mermaid 다이어그램 템플릿 삽입';
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.text = '템플릿';
    placeholderOpt.disabled = true;
    placeholderOpt.selected = true;
    templateSelect.appendChild(placeholderOpt);

    (Object.keys(MERMAID_TEMPLATES) as MermaidTemplateKey[]).forEach((key) => {
      const tpl = MERMAID_TEMPLATES[key];
      const opt = document.createElement('option');
      opt.value = tpl.key;
      opt.text = tpl.label;
      templateSelect!.appendChild(opt);
    });

    handleTemplateChange = (event: Event) => {
      if (!editor.isEditable) return;
      const sel = event.target as HTMLSelectElement;
      const key = sel.value as MermaidTemplateKey;
      const tpl = MERMAID_TEMPLATES[key];
      if (tpl) {
        editor.updateBlock(block.id, {
          content: [{ type: 'text', text: tpl.code, styles: {} }],
        });
      }
      sel.value = '';
    };

    if (editor.isEditable) {
      templateSelect.addEventListener('change', handleTemplateChange);
      templateSelect.addEventListener('click', (e) => e.stopPropagation());
    } else {
      templateSelect.disabled = true;
    }
    leftGroup.appendChild(templateSelect);

    // SVG 복사 버튼
    svgCopyBtn = document.createElement('button');
    svgCopyBtn.type = 'button';
    svgCopyBtn.tabIndex = -1;
    svgCopyBtn.className = 'bn-code-btn bn-mermaid-svg-copy-btn';
    svgCopyBtn.title = '렌더링된 SVG 복사';
    svgCopyBtn.textContent = 'SVG 복사';
    handleSvgCopy = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (!lastValidSvg) return;
      void navigator.clipboard.writeText(lastValidSvg).then(() => {
        if (!svgCopyBtn) return;
        svgCopyBtn.classList.add('copied');
        svgCopyBtn.textContent = '복사됨!';
        setTimeout(() => {
          if (!svgCopyBtn) return;
          svgCopyBtn.classList.remove('copied');
          svgCopyBtn.textContent = 'SVG 복사';
        }, 1500);
      });
    };
    svgCopyBtn.addEventListener('click', handleSvgCopy);

    // 확대(모달) 버튼 (미리보기 화면 컨트롤에 배치)
    expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.tabIndex = -1;
    expandBtn.className = 'bn-code-btn bn-mermaid-expand-btn';
    expandBtn.title = '다이어그램 크게 보기 / 확대 / 다운로드';
    expandBtn.textContent = '확대';
    handleExpand = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (!lastValidSvg) return;
      if (activeModalOverlay) return;

      let zoom = 1;
      const overlay = document.createElement('div');
      overlay.className = 'bn-mermaid-modal-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'bn-mermaid-modal-dialog';

      const modalHeader = document.createElement('div');
      modalHeader.className = 'bn-mermaid-modal-header';

      const modalTitle = document.createElement('span');
      modalTitle.className = 'bn-mermaid-modal-title';
      modalTitle.textContent = 'Mermaid 다이어그램 미리보기';

      const modalActions = document.createElement('div');
      modalActions.className = 'bn-mermaid-modal-actions';

      const zoomOutBtn = document.createElement('button');
      zoomOutBtn.type = 'button';
      zoomOutBtn.className = 'bn-code-btn';
      zoomOutBtn.textContent = '-';
      zoomOutBtn.title = '축소';

      const zoomLabel = document.createElement('span');
      zoomLabel.className = 'bn-mermaid-zoom-label';
      zoomLabel.textContent = '100%';

      const zoomInBtn = document.createElement('button');
      zoomInBtn.type = 'button';
      zoomInBtn.className = 'bn-code-btn';
      zoomInBtn.textContent = '+';
      zoomInBtn.title = '확대';

      const zoomResetBtn = document.createElement('button');
      zoomResetBtn.type = 'button';
      zoomResetBtn.className = 'bn-code-btn';
      zoomResetBtn.textContent = '리셋';

      const downloadBtn = document.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.className = 'bn-code-btn';
      downloadBtn.textContent = 'SVG 다운로드';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'bn-code-btn';
      closeBtn.textContent = '닫기';

      const modalBody = document.createElement('div');
      modalBody.className = 'bn-mermaid-modal-body';

      const modalSvgStage = document.createElement('div');
      modalSvgStage.className = 'bn-mermaid-modal-stage';
      modalSvgStage.innerHTML = lastValidSvg;

      const applyZoom = () => {
        zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
        modalSvgStage.style.transform = `scale(${zoom})`;
      };

      zoomOutBtn.addEventListener('click', () => {
        zoom = Math.max(0.25, +(zoom - 0.2).toFixed(2));
        applyZoom();
      });
      zoomInBtn.addEventListener('click', () => {
        zoom = Math.min(3, +(zoom + 0.2).toFixed(2));
        applyZoom();
      });
      zoomResetBtn.addEventListener('click', () => {
        zoom = 1;
        applyZoom();
      });
      downloadBtn.addEventListener('click', () => {
        const blob = new Blob([lastValidSvg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mermaid-${blockId.slice(0, 8)}.svg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });

      const closeModal = () => {
        if (activeModalKeyHandler) {
          window.removeEventListener('keydown', activeModalKeyHandler);
          activeModalKeyHandler = null;
        }
        if (activeModalOverlay) {
          activeModalOverlay.remove();
          activeModalOverlay = null;
        }
      };

      closeBtn.addEventListener('click', closeModal);
      overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) closeModal();
      });
      activeModalKeyHandler = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') closeModal();
      };
      window.addEventListener('keydown', activeModalKeyHandler);

      modalActions.append(zoomOutBtn, zoomLabel, zoomInBtn, zoomResetBtn, downloadBtn, closeBtn);
      modalHeader.append(modalTitle, modalActions);
      modalBody.appendChild(modalSvgStage);
      dialog.append(modalHeader, modalBody);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      activeModalOverlay = overlay;
    };
    expandBtn.addEventListener('click', handleExpand);

    // 코드 문법 Lint 상태 배지 (툴바 우측)
    mermaidLintBadge = document.createElement('span');
    mermaidLintBadge.className = 'bn-mermaid-lint-badge';
    mermaidLintBadge.textContent = '구문 확인 중';
    rightGroup.insertBefore(mermaidLintBadge, lineNumbersBtn);

    // Mermaid 본문 래퍼: .bn-mermaid-body > (.bn-mermaid-code-pane(gutter + pre) + .bn-mermaid-preview)
    mermaidBody = document.createElement('div');
    mermaidBody.className = 'bn-mermaid-body';

    const codePane = document.createElement('div');
    codePane.className = 'bn-mermaid-code-pane';
    codePane.appendChild(gutter);
    codePane.appendChild(pre);

    mermaidPreview = document.createElement('div');
    mermaidPreview.className = 'bn-mermaid-preview';
    mermaidPreview.contentEditable = 'false';

    // 인라인 테마 / 모양 / 확대·축소 / 100% 리셋 / SVG 복사 / 확대 모달 컨트롤
    const previewControls = document.createElement('div');
    previewControls.className = 'bn-mermaid-preview-controls';

    mermaidThemeSelect = document.createElement('select');
    mermaidThemeSelect.className = 'bn-code-lang-select';
    mermaidThemeSelect.tabIndex = -1;
    mermaidThemeSelect.title = '다이어그램 테마 선택';
    MERMAID_THEME_OPTIONS.forEach((opt) => {
      const el = document.createElement('option');
      el.value = opt.value;
      el.text = opt.label;
      mermaidThemeSelect!.appendChild(el);
    });
    mermaidThemeSelect.value = mermaidTheme;
    handleMermaidThemeChange = (e: Event) => {
      mermaidTheme = (e.target as HTMLSelectElement).value as MermaidThemePreset;
      persistState();
      saveMermaidPrefs({ theme: mermaidTheme, look: mermaidLook });
      void renderCurrentMermaid();
    };
    mermaidThemeSelect.addEventListener('change', handleMermaidThemeChange);
    mermaidThemeSelect.addEventListener('click', (e) => e.stopPropagation());

    mermaidLookSelect = document.createElement('select');
    mermaidLookSelect.className = 'bn-code-lang-select';
    mermaidLookSelect.tabIndex = -1;
    mermaidLookSelect.title = '다이어그램 모양(Look) 선택';
    MERMAID_LOOK_OPTIONS.forEach((opt) => {
      const el = document.createElement('option');
      el.value = opt.value;
      el.text = opt.label;
      mermaidLookSelect!.appendChild(el);
    });
    mermaidLookSelect.value = mermaidLook;
    handleMermaidLookChange = (e: Event) => {
      mermaidLook = (e.target as HTMLSelectElement).value as MermaidLook;
      persistState();
      saveMermaidPrefs({ theme: mermaidTheme, look: mermaidLook });
      void renderCurrentMermaid();
    };
    mermaidLookSelect.addEventListener('change', handleMermaidLookChange);
    mermaidLookSelect.addEventListener('click', (e) => e.stopPropagation());

    zoomOutBtn = document.createElement('button');
    zoomOutBtn.type = 'button';
    zoomOutBtn.tabIndex = -1;
    zoomOutBtn.className = 'bn-code-btn';
    zoomOutBtn.title = '축소 (Ctrl/⌘ + 휠)';
    zoomOutBtn.textContent = '−';

    zoomResetBtn = document.createElement('button');
    zoomResetBtn.type = 'button';
    zoomResetBtn.tabIndex = -1;
    zoomResetBtn.className = 'bn-code-btn';
    zoomResetBtn.title = '100% 기본 배율 및 위치 초기화';
    zoomResetBtn.textContent = '100%';

    zoomInBtn = document.createElement('button');
    zoomInBtn.type = 'button';
    zoomInBtn.tabIndex = -1;
    zoomInBtn.className = 'bn-code-btn';
    zoomInBtn.title = '확대 (Ctrl/⌘ + 휠)';
    zoomInBtn.textContent = '+';

    previewControls.appendChild(mermaidThemeSelect);
    previewControls.appendChild(mermaidLookSelect);
    previewControls.appendChild(zoomOutBtn);
    previewControls.appendChild(zoomResetBtn);
    previewControls.appendChild(zoomInBtn);
    if (svgCopyBtn) previewControls.appendChild(svgCopyBtn);
    if (expandBtn) previewControls.appendChild(expandBtn);

    mermaidViewport = document.createElement('div');
    mermaidViewport.className = 'bn-mermaid-viewport';
    mermaidViewport.title = '드래그하여 이동 · Ctrl/⌘ + 휠로 확대/축소';

    mermaidSvgWrap = document.createElement('div');
    mermaidSvgWrap.className = 'bn-mermaid-svg';

    mermaidErrorEl = document.createElement('div');
    mermaidErrorEl.className = 'bn-mermaid-error';
    mermaidErrorEl.style.display = 'none';

    mermaidViewport.appendChild(mermaidSvgWrap);
    mermaidPreview.appendChild(previewControls);
    mermaidPreview.appendChild(mermaidViewport);
    mermaidPreview.appendChild(mermaidErrorEl);

    mermaidBody.appendChild(codePane);
    mermaidBody.appendChild(mermaidPreview);
    bodyWrapper.appendChild(mermaidBody);
  } else {
    bodyWrapper.appendChild(gutter);
    bodyWrapper.appendChild(pre);
  }
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
      const errCls = lintErrorLine === i ? ' class="is-error-line"' : '';
      spans += `<span${errCls}>${i}</span>`;
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
    persistState();

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
    persistState();

    container.classList.toggle('show-line-numbers', showLineNumbers);
    lineNumbersBtn.classList.toggle('active', showLineNumbers);
    lineNumbersBtn.title = showLineNumbers ? '라인 번호 숨기기' : '라인 번호 표시 (ON/OFF)';

    updateLineNumbers();
  };

  // 툴바 내부 클릭 시 ProseMirror 커서 가로챔 및 상위 컨테이너 버블링 방지
  const handleToolbarMouseDown = (e: MouseEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'SELECT' || tag === 'OPTION') {
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const handleToolbarClick = (e: MouseEvent) => {
    e.stopPropagation();
  };

  toolbar.addEventListener('mousedown', handleToolbarMouseDown);
  toolbar.addEventListener('click', handleToolbarClick);
  collapseBtn.addEventListener('click', toggleCollapse);
  lineNumbersBtn.addEventListener('click', toggleLineNumbers);

  const applyPreviewTransform = () => {
    if (!mermaidSvgWrap) return;
    mermaidSvgWrap.style.transform = `translate(${panX}px, ${panY}px) scale(${previewZoom})`;
    if (zoomResetBtn) {
      zoomResetBtn.textContent = `${Math.round(previewZoom * 100)}%`;
    }
  };

  if (isMermaid && mermaidViewport && zoomInBtn && zoomOutBtn && zoomResetBtn) {
    handleZoomIn = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      previewZoom = Math.min(3, Math.round((previewZoom + 0.25) * 100) / 100);
      applyPreviewTransform();
    };
    handleZoomOut = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      previewZoom = Math.max(0.25, Math.round((previewZoom - 0.25) * 100) / 100);
      applyPreviewTransform();
    };
    handleZoomReset = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      previewZoom = 1;
      panX = 0;
      panY = 0;
      applyPreviewTransform();
    };
    zoomInBtn.addEventListener('click', handleZoomIn);
    zoomOutBtn.addEventListener('click', handleZoomOut);
    zoomResetBtn.addEventListener('click', handleZoomReset);

    handleViewportPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      isPanning = true;
      panMoved = false;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panOriginX = panX;
      panOriginY = panY;
      mermaidViewport?.classList.add('is-panning');
      try {
        mermaidViewport?.setPointerCapture(e.pointerId);
      } catch {}
    };
    handleViewportPointerMove = (e: PointerEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        panMoved = true;
      }
      panX = panOriginX + dx;
      panY = panOriginY + dy;
      applyPreviewTransform();
    };
    handleViewportPointerUp = (e: PointerEvent) => {
      if (!isPanning) return;
      isPanning = false;
      mermaidViewport?.classList.remove('is-panning');
      try {
        mermaidViewport?.releasePointerCapture(e.pointerId);
      } catch {}
    };
    handleViewportWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      previewZoom = Math.min(3, Math.max(0.25, Math.round((previewZoom + delta) * 100) / 100));
      applyPreviewTransform();
    };

    mermaidViewport.addEventListener('pointerdown', handleViewportPointerDown);
    mermaidViewport.addEventListener('pointermove', handleViewportPointerMove);
    mermaidViewport.addEventListener('pointerup', handleViewportPointerUp);
    mermaidViewport.addEventListener('pointercancel', handleViewportPointerUp);
    mermaidViewport.addEventListener('wheel', handleViewportWheel, { passive: false });
  }

  // Mermaid 실시간 문법 Lint + SVG 렌더링 (250ms 디바운스 + 마지막 유효 SVG 보존 + 100% 원본 크기 고정)
  const renderCurrentMermaid = async () => {
    if (!isMermaid || isDestroyed || !mermaidSvgWrap || !mermaidErrorEl) return;
    const rawCode = code.innerText || code.textContent || '';
    const isDark =
      typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-mantine-color-scheme') === 'dark';
    const token = ++mermaidRenderToken;

    const lintRes = await lintMermaidCode(rawCode);
    if (isDestroyed || token !== mermaidRenderToken) return;

    if (!lintRes.valid) {
      lintErrorLine = lintRes.line;
      if (showLineNumbers) updateLineNumbers();
      if (mermaidLintBadge) {
        mermaidLintBadge.className = 'bn-mermaid-lint-badge is-error';
        mermaidLintBadge.textContent = lintRes.line ? `⚠ ${lintRes.line}행 오류` : '⚠ 구문 오류';
        mermaidLintBadge.title = lintRes.error;
      }
      mermaidErrorEl.textContent = lintRes.line ? `[${lintRes.line}행] ${lintRes.error}` : lintRes.error;
      mermaidErrorEl.style.display = 'block';
      return;
    }

    lintErrorLine = undefined;
    if (showLineNumbers) updateLineNumbers();
    if (mermaidLintBadge) {
      mermaidLintBadge.className = 'bn-mermaid-lint-badge is-valid';
      mermaidLintBadge.textContent = '✓ 구문 정상';
      mermaidLintBadge.title = lintRes.diagramType ? `감지된 다이어그램: ${lintRes.diagramType}` : 'Mermaid 문법 정상';
    }

    const res = await renderMermaidSvg(blockId, rawCode, isDark, {
      theme: mermaidTheme,
      look: mermaidLook,
    });
    if (isDestroyed || token !== mermaidRenderToken) return;

    if ('svg' in res) {
      lastValidSvg = res.svg;
      mermaidSvgWrap.innerHTML = res.svg;
      // 화면 너비에 비례해 강제 확대되지 않도록 viewBox 기준 100% 실제 픽셀 크기로 고정
      const svgEl = mermaidSvgWrap.querySelector('svg');
      if (svgEl) {
        const vb = svgEl
          .getAttribute('viewBox')
          ?.trim()
          .split(/[\s,]+/)
          .map(Number);
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');
        svgEl.style.maxWidth = 'none';
        if (vb && vb.length === 4 && Number.isFinite(vb[2]) && Number.isFinite(vb[3]) && vb[2] > 0 && vb[3] > 0) {
          svgEl.style.width = `${Math.round(vb[2])}px`;
          svgEl.style.height = `${Math.round(vb[3])}px`;
        }
      }
      applyPreviewTransform();
      mermaidErrorEl.style.display = 'none';
      mermaidErrorEl.textContent = '';
    } else {
      // 문법 오류 시 마지막 유효 SVG는 보존하고 하단에 오류 안내 표시
      mermaidErrorEl.textContent = res.error;
      mermaidErrorEl.style.display = 'block';
    }
  };

  const scheduleMermaidRender = () => {
    if (!isMermaid) return;
    if (mermaidRenderTimer) {
      clearTimeout(mermaidRenderTimer);
    }
    mermaidRenderTimer = setTimeout(() => {
      mermaidRenderTimer = null;
      void renderCurrentMermaid();
    }, 250);
  };

  // 코드 변경 시 줄 번호 및 Mermaid 다이어그램 자동 갱신
  const handleInput = () => {
    if (showLineNumbers) {
      updateLineNumbers();
    }
    if (isCollapsed) {
      updateCollapsedLabel();
    }
    if (isMermaid) {
      scheduleMermaidRender();
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
    if (isMermaid) {
      scheduleMermaidRender();
    }
  });
  observer.observe(code, { childList: true, characterData: true, subtree: true });

  // 다크/라이트 테마 변경 시 Mermaid SVG 자동 재렌더링
  let themeObserver: MutationObserver | null = null;
  if (isMermaid && typeof document !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      void renderCurrentMermaid();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mantine-color-scheme'],
    });
  }

  // 'preview' 모드에서 다이어그램 더블클릭 시 'split' 에디터 모드로 전환 (드래그 직후 오작동 방지)
  const handlePreviewDblClick = (e: MouseEvent) => {
    if (!isMermaid || mermaidMode !== 'preview' || panMoved) return;
    e.preventDefault();
    e.stopPropagation();
    setMermaidMode('split');
    requestAnimationFrame(() => {
      try {
        editor.focus();
      } catch {}
    });
  };
  if (mermaidViewport) {
    mermaidViewport.addEventListener('dblclick', handlePreviewDblClick);
  }

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

  // 초기 마운트 시 줄 번호, Mermaid 렌더링 및 상태 초기화
  if (isCollapsed) {
    updateCollapsedLabel();
  }
  if (showLineNumbers) {
    requestAnimationFrame(() => {
      updateLineNumbers();
    });
  }
  if (isMermaid) {
    requestAnimationFrame(() => {
      void renderCurrentMermaid();
    });
  }

  return {
    dom: container,
    contentDOM: code,
    // TipTap / ProseMirror NodeView 인터페이스 필수 메서드 구현:
    // 1. update: 동일 타입의 블록 업데이트 시 NodeView 재생성 방지 (단, Mermaid <-> 일반 코드 전환 시 재생성)
    update: (updatedNode: any) => {
      if (updatedNode?.type?.name !== 'codeBlock') {
        return false;
      }
      const newLang = updatedNode.attrs?.language;
      if (isMermaidLanguage(newLang) !== isMermaid) {
        return false;
      }
      if (select && newLang && select.value !== newLang) {
        select.value = newLang;
      }
      if (showLineNumbers) {
        requestAnimationFrame(() => updateLineNumbers());
      }
      if (isMermaid) {
        scheduleMermaidRender();
      }
      return true;
    },
    // 2. stopEvent: 툴바 및 Mermaid 미리보기 내부 이벤트는 ProseMirror가 가로채지 않도록 차단
    stopEvent: (event: Event) => {
      const target = event.target as Node;
      return toolbar.contains(target) || (mermaidPreview ? mermaidPreview.contains(target) : false);
    },
    // 3. ignoreMutation: 툴바와 gutter의 DOM 변경은 ProseMirror 문서 변경으로 간주하지 않음
    ignoreMutation: (mutation: any) => {
      return !code.contains(mutation.target);
    },
    destroy: () => {
      isDestroyed = true;
      if (mermaidRenderTimer) {
        clearTimeout(mermaidRenderTimer);
        mermaidRenderTimer = null;
      }
      if (activeModalKeyHandler) {
        window.removeEventListener('keydown', activeModalKeyHandler);
        activeModalKeyHandler = null;
      }
      if (activeModalOverlay) {
        activeModalOverlay.remove();
        activeModalOverlay = null;
      }
      toolbar.removeEventListener('mousedown', handleToolbarMouseDown);
      toolbar.removeEventListener('click', handleToolbarClick);
      collapseBtn.removeEventListener('click', toggleCollapse);
      lineNumbersBtn.removeEventListener('click', toggleLineNumbers);
      copyBtn.removeEventListener('click', handleCopy);
      code.removeEventListener('input', handleInput);
      code.removeEventListener('keyup', handleInput);
      observer.disconnect();
      if (themeObserver) {
        themeObserver.disconnect();
      }
      if (mermaidViewport) {
        mermaidViewport.removeEventListener('dblclick', handlePreviewDblClick);
        if (handleViewportPointerDown) mermaidViewport.removeEventListener('pointerdown', handleViewportPointerDown);
        if (handleViewportPointerMove) mermaidViewport.removeEventListener('pointermove', handleViewportPointerMove);
        if (handleViewportPointerUp) {
          mermaidViewport.removeEventListener('pointerup', handleViewportPointerUp);
          mermaidViewport.removeEventListener('pointercancel', handleViewportPointerUp);
        }
        if (handleViewportWheel) mermaidViewport.removeEventListener('wheel', handleViewportWheel);
      }
      if (mermaidThemeSelect && handleMermaidThemeChange) {
        mermaidThemeSelect.removeEventListener('change', handleMermaidThemeChange);
      }
      if (mermaidLookSelect && handleMermaidLookChange) {
        mermaidLookSelect.removeEventListener('change', handleMermaidLookChange);
      }
      if (zoomInBtn && handleZoomIn) zoomInBtn.removeEventListener('click', handleZoomIn);
      if (zoomOutBtn && handleZoomOut) zoomOutBtn.removeEventListener('click', handleZoomOut);
      if (zoomResetBtn && handleZoomReset) zoomResetBtn.removeEventListener('click', handleZoomReset);
      mermaidModeButtons.forEach(({ btn, handler }) => {
        btn.removeEventListener('click', handler);
      });
      if (templateSelect && handleTemplateChange) {
        templateSelect.removeEventListener('change', handleTemplateChange);
      }
      if (svgCopyBtn && handleSvgCopy) {
        svgCopyBtn.removeEventListener('click', handleSvgCopy);
      }
      if (expandBtn && handleExpand) {
        expandBtn.removeEventListener('click', handleExpand);
      }
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
        const raw =
          typeof block?.props === 'string'
            ? block.props
            : block?.props?.language ?? block?.attrs?.language;
        if (isMermaidLanguage(raw)) return 'mermaid';
        return raw || 'javascript';
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

type Highlighter = Awaited<ReturnType<typeof createHighlighterCore>>;
let highlighterCache: Promise<Highlighter> | null = null;

/** Shiki 하이라이터 싱글톤 (필요한 18개 언어 및 2개 테마만 선택 임포트 + JS 정규식 엔진으로 번들 용량 75% 절감) */
export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterCache) {
    highlighterCache = createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      themes: SHIKI_THEMES,
      langs: SHIKI_LANG_IMPORTS,
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
