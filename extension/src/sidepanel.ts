import { extractKeywordTags, summarizePageAsMarkdown } from './aiHelper';
import {
  ClipMode,
  ClipPayload,
  checkHealth,
  flushPendingClips,
  getRecentClips,
  parseTagsInput,
  queueClip,
  sendClip,
} from './clipperClient';
import {
  ClipperDraft,
  ClipperStatus,
  getSuccessSaveMessage,
  getTargetLocationBadge,
  loadDraft,
  loadStatus,
  onClipperStorageChange,
  saveDraft,
  setStatus,
} from './clipperState';

const statusBadge = document.getElementById('statusBadge') as HTMLDivElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;
const targetLocationBadge = document.getElementById('targetLocationBadge') as HTMLSpanElement;
const updateExistingInput = document.getElementById('updateExistingInput') as HTMLInputElement;
const aiSummaryBtn = document.getElementById('aiSummaryBtn') as HTMLButtonElement;
const aiMeta = document.getElementById('aiMeta') as HTMLDivElement;
const titleInput = document.getElementById('titleInput') as HTMLInputElement;
const urlInput = document.getElementById('urlInput') as HTMLInputElement;
const tagsInput = document.getElementById('tagsInput') as HTMLInputElement;
const previewInput = document.getElementById('previewInput') as HTMLTextAreaElement;
const previewModeEditBtn = document.getElementById('previewModeEditBtn') as HTMLButtonElement;
const previewModeViewBtn = document.getElementById('previewModeViewBtn') as HTMLButtonElement;
const markdownPreview = document.getElementById('markdownPreview') as HTMLDivElement;
const savePrimaryBtn = document.getElementById('savePrimaryBtn') as HTMLButtonElement;
const statusBanner = document.getElementById('statusBanner') as HTMLDivElement;
const recentList = document.getElementById('recentList') as HTMLDivElement;
const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'));

let currentMode: ClipMode = 'note';
let previewMode: 'edit' | 'view' = 'edit';
let rawExtractedText = '';

function isSafeHttpUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/');
}

function appendInlineMarkdown(parent: HTMLElement, text: string): void {
  const tokenRe = /(\*\*[^*\n]+?\*\*|`[^`\n]+?`|\[[^\]\n]+\]\([^)\s]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = token.slice(2, -2);
      parent.appendChild(strong);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      const code = document.createElement('code');
      code.textContent = token.slice(1, -1);
      parent.appendChild(code);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)$/);
      if (linkMatch && isSafeHttpUrl(linkMatch[2])) {
        const a = document.createElement('a');
        a.textContent = linkMatch[1];
        a.href = linkMatch[2];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        parent.appendChild(a);
      } else {
        parent.appendChild(document.createTextNode(token));
      }
    }
    lastIndex = tokenRe.lastIndex;
  }

  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function renderMarkdownToElement(container: HTMLElement, markdown: string): void {
  container.replaceChildren();
  const trimmed = (markdown || '').trim();
  if (!trimmed) {
    const empty = document.createElement('div');
    empty.className = 'markdown-preview-empty';
    empty.textContent = '미리볼 내용이 없습니다.';
    container.appendChild(empty);
    return;
  }

  const lines = trimmed.replace(/\r\n/g, '\n').split('\n');
  let currentList: HTMLUListElement | null = null;

  const flushList = () => {
    if (currentList) {
      container.appendChild(currentList);
      currentList = null;
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
      const heading = document.createElement(tag);
      appendInlineMarkdown(heading, headingMatch[2].trim());
      container.appendChild(heading);
      continue;
    }

    const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (listMatch) {
      if (!currentList) {
        currentList = document.createElement('ul');
      }
      const li = document.createElement('li');
      appendInlineMarkdown(li, listMatch[1].trim());
      currentList.appendChild(li);
      continue;
    }

    if (!line.trim()) {
      flushList();
      continue;
    }

    flushList();
    const p = document.createElement('p');
    appendInlineMarkdown(p, line);
    container.appendChild(p);
  }

  flushList();
}

function setPreviewMode(mode: 'edit' | 'view'): void {
  previewMode = mode;
  const isView = mode === 'view';
  previewModeEditBtn.classList.toggle('active', !isView);
  previewModeViewBtn.classList.toggle('active', isView);
  previewInput.hidden = isView;
  markdownPreview.hidden = !isView;
  if (isView) {
    renderMarkdownToElement(markdownPreview, previewInput.value);
  }
}

function formatTagsString(tags: string[]): string {
  return tags
    .map((t) => t.trim().replace(/^#+/, ''))
    .filter(Boolean)
    .map((t) => `#${t}`)
    .join(' ');
}

function applyModeUi(mode: ClipMode): void {
  currentMode = mode;
  for (const b of tabButtons) {
    b.classList.toggle('active', b.dataset.mode === mode);
  }
  targetLocationBadge.textContent = getTargetLocationBadge(mode);
}

function applyDraftToUi(draft: ClipperDraft, fromRemote = false): void {
  applyModeUi(draft.mode);
  if (!fromRemote || document.activeElement !== titleInput) {
    if (titleInput.value !== draft.title) titleInput.value = draft.title;
  }
  if (!fromRemote || document.activeElement !== urlInput) {
    if (urlInput.value !== draft.url) urlInput.value = draft.url;
  }
  if (!fromRemote || document.activeElement !== tagsInput) {
    if (tagsInput.value !== draft.tags) tagsInput.value = draft.tags;
  }
  if (!fromRemote || document.activeElement !== previewInput) {
    if (previewInput.value !== draft.content) {
      previewInput.value = draft.content;
      if (previewMode === 'view') {
        renderMarkdownToElement(markdownPreview, previewInput.value);
      }
    }
  }
  updateExistingInput.checked = draft.updateExisting !== false;
}

function applyStatusToUi(status: ClipperStatus): void {
  if (!status.message || status.kind === 'idle') {
    statusBanner.className = 'status-banner';
    statusBanner.textContent = '';
    return;
  }
  statusBanner.textContent = status.message;
  statusBanner.className = `status-banner visible ${status.kind}`;
}

async function refreshHealth(): Promise<void> {
  const health = await checkHealth();
  if (health.ok) {
    statusBadge.classList.add('online');
    statusText.textContent = `● BullsNote 실행 중${health.version ? ` v${health.version}` : ''}`;
  } else {
    statusBadge.classList.remove('online');
    statusText.textContent = '○ 앱 미실행 (로컬 큐 저장)';
  }
}

async function renderRecentClips(): Promise<void> {
  const recent = await getRecentClips();
  recentList.replaceChildren();

  if (recent.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ai-meta';
    empty.textContent = '아직 저장한 클립이 없습니다.';
    recentList.appendChild(empty);
    return;
  }

  for (const item of recent.slice(0, 8)) {
    const card = document.createElement('div');
    card.className = 'recent-item';

    const titleEl = document.createElement('div');
    titleEl.className = 'recent-item-title';
    titleEl.textContent = item.title || item.url || '제목 없음';

    const metaEl = document.createElement('div');
    metaEl.className = 'recent-item-meta';
    const modeLabel = item.mode === 'todo' ? '할일' : item.mode === 'daily' ? '오늘 메모' : '노트';
    metaEl.textContent = `${modeLabel} · ${new Date(item.savedAt).toLocaleString('ko-KR')}`;

    card.appendChild(titleEl);
    card.appendChild(metaEl);

    card.addEventListener('click', () => {
      const nextTags = (item.tags || []).map((t) => `#${t}`).join(' ');
      const nextMode: ClipMode = item.mode === 'todo' || item.mode === 'daily' ? item.mode : 'note';
      titleInput.value = item.title || '';
      urlInput.value = item.url || '';
      tagsInput.value = nextTags;
      previewInput.value = item.content || '';
      if (previewMode === 'view') {
        renderMarkdownToElement(markdownPreview, previewInput.value);
      }
      applyModeUi(nextMode);
      void saveDraft({
        mode: nextMode,
        title: titleInput.value,
        url: urlInput.value,
        tags: nextTags,
        content: previewInput.value,
      });
    });

    recentList.appendChild(card);
  }
}

async function extractActiveTabContent(): Promise<{ title: string; url: string; text: string } | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;

  let nextTitle = tab.title || '';
  let nextUrl = tab.url || '';
  let nextText = '';

  if (tab.id && tab.id >= 0) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selection = window.getSelection()?.toString().trim() || '';
        const article = document.querySelector('article, main');
        const text = selection || (article ? (article as HTMLElement).innerText : document.body?.innerText || '');
        return {
          title: document.title || '',
          url: location.href,
          text: text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 12000),
        };
      },
    });
    if (result) {
      nextTitle = result.title || nextTitle;
      nextUrl = result.url || nextUrl;
      nextText = result.text || '';
    }
  }

  return { title: nextTitle, url: nextUrl, text: nextText };
}

async function extractCurrentPage(forceOverwrite = true): Promise<void> {
  if (forceOverwrite) {
    applyStatusToUi(await setStatus({ kind: 'saving', message: '페이지 본문을 추출하는 중...' }));
  }
  try {
    const extracted = await extractActiveTabContent();
    if (!extracted) {
      if (forceOverwrite) {
        applyStatusToUi(await setStatus({ kind: 'error', message: '활성 탭을 찾을 수 없습니다.' }));
      }
      return;
    }

    rawExtractedText = extracted.text;
    const currentDraft = await loadDraft();
    const shouldAutoTag = !currentDraft.tags.trim();
    const autoTags = shouldAutoTag
      ? formatTagsString(extractKeywordTags(extracted.title, extracted.text))
      : currentDraft.tags;

    titleInput.value = extracted.title;
    urlInput.value = extracted.url;
    previewInput.value = extracted.text;
    if (shouldAutoTag) {
      tagsInput.value = autoTags;
    }
    if (previewMode === 'view') {
      renderMarkdownToElement(markdownPreview, previewInput.value);
    }

    await saveDraft({
      title: extracted.title,
      url: extracted.url,
      content: extracted.text,
      ...(shouldAutoTag ? { tags: autoTags } : {}),
    });
    if (forceOverwrite) {
      applyStatusToUi(await setStatus({ kind: 'success', message: '✓ 페이지 본문을 불러왔습니다.' }));
    }
  } catch {
    if (forceOverwrite) {
      applyStatusToUi(await setStatus({ kind: 'error', message: '이 페이지에서는 본문을 직접 추출할 수 없습니다.' }));
    }
  }
}

async function initializeFromDraft(): Promise<void> {
  const [draft, status] = await Promise.all([loadDraft(), loadStatus()]);
  applyDraftToUi(draft, false);
  applyStatusToUi(status);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabUrl = tab?.url || '';
    const sameTabAsDraft = Boolean(draft.url && tabUrl && draft.url === tabUrl);
    const hasDraftContent = Boolean(draft.title || draft.content);
    if (sameTabAsDraft && hasDraftContent) {
      rawExtractedText = draft.content;
      return;
    }
  } catch {
    // fallthrough
  }
  await extractCurrentPage(false);
}

async function runAiPageSummary(): Promise<void> {
  aiSummaryBtn.disabled = true;
  aiMeta.textContent = '페이지 추출 및 AI 요약 중...';

  try {
    let targetTitle = titleInput.value.trim();
    let targetUrl = urlInput.value.trim();
    let targetText = rawExtractedText || previewInput.value.trim();

    try {
      const extracted = await extractActiveTabContent();
      if (extracted) {
        if (extracted.title) targetTitle = extracted.title;
        if (extracted.url) targetUrl = extracted.url;
        if (extracted.text) {
          rawExtractedText = extracted.text;
          targetText = extracted.text;
        }
      }
    } catch {
      // chrome:// 등 스크립트 주입 불가 페이지면 기존 입력/추출 본문 사용
    }

    if (!targetTitle && !targetText) {
      aiMeta.textContent = '';
      applyStatusToUi(
        await setStatus({ kind: 'error', message: '이 페이지에서 요약할 본문을 추출할 수 없습니다.' }),
      );
      return;
    }

    const result = await summarizePageAsMarkdown(targetTitle, targetText);
    const nextTags = result.tags.length > 0 ? formatTagsString(result.tags) : tagsInput.value;

    titleInput.value = targetTitle;
    urlInput.value = targetUrl;
    previewInput.value = result.markdown;
    if (result.tags.length > 0) {
      tagsInput.value = nextTags;
    }
    if (previewMode === 'view') {
      renderMarkdownToElement(markdownPreview, result.markdown);
    }

    await saveDraft({
      title: targetTitle,
      url: targetUrl,
      content: result.markdown,
      ...(result.tags.length > 0 ? { tags: nextTags } : {}),
    });

    aiMeta.textContent =
      result.engine === 'chrome-ai'
        ? '엔진: Chrome Built-in AI'
        : '엔진: 로컬 마크다운 요약 · 키워드 태그 자동 생성';
  } finally {
    aiSummaryBtn.disabled = false;
  }
}

async function saveCurrentClip(): Promise<void> {
  savePrimaryBtn.disabled = true;
  applyStatusToUi(await setStatus({ kind: 'saving', message: '저장 중...' }));

  try {
    const title = titleInput.value.trim() || '웹 클립';
    const url = urlInput.value.trim();
    const content = previewInput.value.trim();
    const tags = parseTagsInput(tagsInput.value);
    const updateExisting = updateExistingInput.checked;

    const payload: ClipPayload = {
      mode: currentMode,
      title,
      url,
      content,
      tags,
      updateExisting,
      ...(currentMode === 'todo' ? { quickCaptureText: title || content || '웹 할일' } : {}),
    };

    const res = await sendClip(payload);
    if (res.ok) {
      applyStatusToUi(
        await setStatus({
          kind: 'success',
          message: getSuccessSaveMessage(currentMode, res.delivered),
        }),
      );
      await flushPendingClips();
    } else {
      const count = await queueClip(payload);
      applyStatusToUi(
        await setStatus({
          kind: 'queued',
          message: `⏳ 앱 미실행 — 대기열에 저장됨 (${count}건)`,
        }),
      );
      void chrome.runtime.sendMessage({ type: 'clipper:updateBadge' }).catch(() => {});
    }
  } catch (err) {
    applyStatusToUi(
      await setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.',
      }),
    );
  } finally {
    await Promise.all([refreshHealth(), renderRecentClips()]);
    savePrimaryBtn.disabled = false;
  }
}

for (const btn of tabButtons) {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode as ClipMode | undefined;
    if (!mode) return;
    applyModeUi(mode);
    void saveDraft({ mode });
  });
}

titleInput.addEventListener('input', () => {
  void saveDraft({ title: titleInput.value });
});

urlInput.addEventListener('input', () => {
  void saveDraft({ url: urlInput.value });
});

tagsInput.addEventListener('input', () => {
  void saveDraft({ tags: tagsInput.value });
});

previewInput.addEventListener('input', () => {
  void saveDraft({ content: previewInput.value });
});

updateExistingInput.addEventListener('change', () => {
  void saveDraft({ updateExisting: updateExistingInput.checked });
});

previewModeEditBtn.addEventListener('click', () => setPreviewMode('edit'));
previewModeViewBtn.addEventListener('click', () => setPreviewMode('view'));
aiSummaryBtn.addEventListener('click', () => void runAiPageSummary());
savePrimaryBtn.addEventListener('click', () => void saveCurrentClip());

onClipperStorageChange((changes) => {
  if (changes.draft) {
    applyDraftToUi(changes.draft, true);
  }
  if (changes.status) {
    applyStatusToUi(changes.status);
  }
});

void Promise.all([refreshHealth(), initializeFromDraft(), renderRecentClips()]);
