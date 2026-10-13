import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 내부 노트 링크(#note-, note://) 클릭 시 외부 웹브라우저 창이 열리지 않도록 전역 가로채기
const originalWindowOpen = window.open;
window.open = function (url?: string | URL, target?: string, features?: string) {
  const urlStr = typeof url === 'string' ? url : url?.toString() || '';
  if (urlStr.includes('#note-') || urlStr.startsWith('note://')) {
    const match = urlStr.match(/#note-([a-zA-Z0-9_-]+)/) || urlStr.match(/^note:\/\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      window.dispatchEvent(
        new CustomEvent('bullsnote:navigate-note', { detail: { noteId: match[1] } })
      );
      return null;
    }
  }
  return originalWindowOpen.call(window, url, target, features);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

