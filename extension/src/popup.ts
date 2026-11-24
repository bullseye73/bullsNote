import { extractKeywordTags } from './aiHelper';
import {
  ClipMode,
  ClipPayload,
  checkHealth,
  flushPendingClips,
  getPendingClips,
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

let currentMode: ClipMode = 'note';
let currentUrl = '';
let currentWindowId: number | undefined;

const statusBadge = document.getElementById('statusBadge') as HTMLDivElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;
const versionBadge = document.getElementById('versionBadge') as HTMLSpanElement;
const targetLocationBadge = document.getElementById('targetLocationBadge') as HTMLSpanElement;
const updateExistingInput = document.getElementById('updateExistingInput') as HTMLInputElement;
const titleInput = document.getElementById('titleInput') as HTMLInputElement;
const tagsInput = document.getElementById('tagsInput') as HTMLInputElement;
const contentInput = document.getElementById('contentInput') as HTMLTextAreaElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const sidePanelBtn = document.getElementById('sidePanelBtn') as HTMLButtonElement;
const queueBar = document.getElementById('queueBar') as HTMLDivElement;
const queueText = document.getElementById('queueText') as HTMLSpanElement;
const flushBtn = document.getElementById('flushBtn') as HTMLButtonElement;
const statusBanner = document.getElementById('statusBanner') as HTMLDivElement;
const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'));

function applyModeUi(mode: ClipMode): void {
  currentMode = mode;
  for (const b of tabButtons) {
    b.classList.toggle('active', b.dataset.mode === mode);
  }
  targetLocationBadge.textContent = getTargetLocationBadge(mode);
}

function applyDraftToUi(draft: ClipperDraft, fromRemote = false): void {
  applyModeUi(draft.mode);
  currentUrl = draft.url || currentUrl;
  if (!fromRemote || document.activeElement !== titleInput) {
    if (titleInput.value !== draft.title) titleInput.value = draft.title;
  }
  if (!fromRemote || document.activeElement !== tagsInput) {
    if (tagsInput.value !== draft.tags) tagsInput.value = draft.tags;
  }
  if (!fromRemote || document.activeElement !== contentInput) {
    if (contentInput.value !== draft.content) contentInput.value = draft.content;
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

async function refreshConnectionAndQueue(): Promise<boolean> {
  const health = await checkHealth();
  if (health.ok) {
    statusBadge.classList.add('online');
    statusText.textContent = `● BullsNote 실행 중${health.version ? ` v${health.version}` : ''}`;
  } else {
    statusBadge.classList.remove('online');
    statusText.textContent = '○ 앱 미실행 (로컬 큐 저장)';
  }

  const pending = await getPendingClips();
  if (pending.length > 0) {
    queueBar.classList.add('visible');
    queueText.textContent = `대기 중인 클립 ${pending.length}건`;
    flushBtn.disabled = !health.ok;
  } else {
    queueBar.classList.remove('visible');
  }

  void chrome.runtime.sendMessage({ type: 'clipper:updateBadge' }).catch(() => {});
  return health.ok;
}

async function initializeFromDraftAndTab(): Promise<void> {
  const [draft, status] = await Promise.all([loadDraft(), loadStatus()]);
  applyDraftToUi(draft, false);
  applyStatusToUi(status);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    currentWindowId = tab.windowId;
    const tabUrl = tab.url || '';
    const sameTabAsDraft = Boolean(draft.url && tabUrl && draft.url === tabUrl);
    const hasDraftContent = Boolean(draft.title || draft.content);

    if (sameTabAsDraft && hasDraftContent) {
      currentUrl = draft.url;
      return;
    }

    let nextTitle = tab.title || '';
    let nextUrl = tabUrl;
    let nextContent = '';

    if (tab.id && tab.id >= 0) {
      try {
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const selection = window.getSelection()?.toString().trim() || '';
            const metaDesc =
              document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ||
              document.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
              '';
            const excerpt = (document.body?.innerText || '').trim().slice(0, 1200);
            return {
              title: document.title || '',
              url: location.href,
              content: selection || metaDesc || excerpt,
            };
          },
        });
        if (result) {
          if (result.title) nextTitle = result.title;
          if (result.url) nextUrl = result.url;
          if (result.content) nextContent = result.content;
        }
      } catch {
        // chrome:// 등 스크립트 주입 불가 페이지
      }
    }

    const shouldAutoTag = !draft.tags.trim();
    const autoTags = shouldAutoTag
      ? extractKeywordTags(nextTitle, nextContent)
          .map((t) => `#${t}`)
          .join(' ')
      : draft.tags;

    currentUrl = nextUrl;
    titleInput.value = nextTitle;
    contentInput.value = nextContent;
    if (shouldAutoTag) {
      tagsInput.value = autoTags;
    }
    await saveDraft({
      url: nextUrl,
      title: nextTitle,
      content: nextContent,
      ...(shouldAutoTag ? { tags: autoTags } : {}),
    });
  } catch {
    // ignore
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

tagsInput.addEventListener('input', () => {
  void saveDraft({ tags: tagsInput.value });
});

contentInput.addEventListener('input', () => {
  void saveDraft({ content: contentInput.value });
});

updateExistingInput.addEventListener('change', () => {
  void saveDraft({ updateExisting: updateExistingInput.checked });
});

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  const savingStatus = await setStatus({ kind: 'saving', message: '저장 중...' });
  applyStatusToUi(savingStatus);

  try {
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const tags = parseTagsInput(tagsInput.value);
    const updateExisting = updateExistingInput.checked;

    const payload: ClipPayload = {
      mode: currentMode,
      title: title || '웹 클립',
      content,
      url: currentUrl,
      tags,
      updateExisting,
      ...(currentMode === 'todo' ? { quickCaptureText: title || content || '웹 할일' } : {}),
    };

    const res = await sendClip(payload);
    if (res.ok) {
      const doneStatus = await setStatus({
        kind: 'success',
        message: getSuccessSaveMessage(currentMode, res.delivered),
      });
      applyStatusToUi(doneStatus);
      await flushPendingClips();
    } else {
      const count = await queueClip(payload);
      const queuedStatus = await setStatus({
        kind: 'queued',
        message: `⏳ 앱 미실행 — 대기열에 저장됨 (${count}건)`,
      });
      applyStatusToUi(queuedStatus);
    }
  } catch (err) {
    const errStatus = await setStatus({
      kind: 'error',
      message: err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.',
    });
    applyStatusToUi(errStatus);
  } finally {
    await refreshConnectionAndQueue();
    saveBtn.disabled = false;
  }
});

flushBtn.addEventListener('click', async () => {
  flushBtn.disabled = true;
  const { flushed, remaining } = await flushPendingClips();
  if (flushed > 0) {
    const doneStatus = await setStatus({
      kind: 'success',
      message: `✓ 대기열 ${flushed}건을 BullsNote로 전송했습니다.`,
    });
    applyStatusToUi(doneStatus);
  } else if (remaining > 0) {
    const warnStatus = await setStatus({
      kind: 'queued',
      message: '⏳ BullsNote 연결 후 다시 시도해 주세요.',
    });
    applyStatusToUi(warnStatus);
  }
  await refreshConnectionAndQueue();
});

sidePanelBtn.addEventListener('click', async () => {
  try {
    await saveDraft({
      url: currentUrl,
      title: titleInput.value,
      tags: tagsInput.value,
      content: contentInput.value,
      mode: currentMode,
      updateExisting: updateExistingInput.checked,
    });
    if (currentWindowId !== undefined && chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ windowId: currentWindowId });
      window.close();
    } else {
      const errStatus = await setStatus({
        kind: 'error',
        message: '이 브라우저에서는 사이드 패널 열기를 지원하지 않습니다.',
      });
      applyStatusToUi(errStatus);
    }
  } catch (err) {
    const errStatus = await setStatus({
      kind: 'error',
      message: err instanceof Error ? err.message : '사이드 패널 열기 실패',
    });
    applyStatusToUi(errStatus);
  }
});

onClipperStorageChange((changes) => {
  if (changes.draft) {
    applyDraftToUi(changes.draft, true);
  }
  if (changes.status) {
    applyStatusToUi(changes.status);
  }
});

const extensionVersion = chrome.runtime?.getManifest?.().version ?? '0.2.0';
if (versionBadge) {
  versionBadge.textContent = `v${extensionVersion}`;
}

void Promise.all([initializeFromDraftAndTab(), refreshConnectionAndQueue()]);
