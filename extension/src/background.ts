import {
  ClipPayload,
  flushPendingClips,
  getPendingClips,
  queueClip,
  sendClip,
} from './clipperClient';

const MENU_SAVE_NOTE = 'bullsnote-save-note';
const MENU_SAVE_TODO = 'bullsnote-save-todo';

async function updatePendingBadge(): Promise<void> {
  try {
    const pending = await getPendingClips();
    const count = pending.length;
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    if (count > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    }
  } catch {
    // ignore badge errors
  }
}

async function extractTabClipData(tabId: number): Promise<{ title: string; url: string; content: string }> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const selection = window.getSelection()?.toString().trim() || '';
      const metaDesc =
        document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ||
        document.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
        '';
      const bodyText = (document.body?.innerText || '').trim().slice(0, 4000);
      return {
        title: document.title || '',
        url: location.href,
        content: selection || metaDesc || bodyText,
      };
    },
  });
  return result || { title: '', url: '', content: '' };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_SAVE_NOTE,
      title: 'BullsNote 노트로 저장',
      contexts: ['page', 'selection', 'link'],
    });
    chrome.contextMenus.create({
      id: MENU_SAVE_TODO,
      title: 'BullsNote 할일로 추가',
      contexts: ['page', 'selection', 'link'],
    });
  });
  void updatePendingBadge();
});

chrome.runtime.onStartup.addListener(() => {
  void updatePendingBadge();
  void flushPendingClips().then(() => updatePendingBadge());
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const mode = info.menuItemId === MENU_SAVE_TODO ? 'todo' : 'note';
  const fallbackTitle = tab?.title || '웹 클립';
  const fallbackUrl = info.linkUrl || info.pageUrl || tab?.url || '';
  const fallbackContent = info.selectionText?.trim() || '';

  let extracted = { title: fallbackTitle, url: fallbackUrl, content: fallbackContent };

  if (tab?.id && tab.id >= 0) {
    try {
      const fromPage = await extractTabClipData(tab.id);
      extracted = {
        title: fromPage.title || fallbackTitle,
        url: fromPage.url || fallbackUrl,
        content: fallbackContent || fromPage.content,
      };
    } catch {
      // chrome:// 등 스크립트 실행 불가 페이지는 기본 메타정보 사용
    }
  }

  const payload: ClipPayload =
    mode === 'todo'
      ? {
          mode: 'todo',
          title: extracted.title,
          url: extracted.url,
          content: extracted.content,
          quickCaptureText: fallbackContent || extracted.title,
          tags: ['web-clip'],
        }
      : {
          mode: 'note',
          title: extracted.title,
          url: extracted.url,
          content: extracted.content,
          tags: ['web-clip'],
        };

  const result = await sendClip(payload);
  if (!result.ok) {
    await queueClip(payload);
    await updatePendingBadge();
  } else {
    // 연결된 경우 기존 대기열도 함께 플러시
    await flushPendingClips();
    await updatePendingBadge();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'clipper:updateBadge') {
    void updatePendingBadge().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
