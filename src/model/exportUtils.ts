// MODEL / UTILS: 노트 내보내기, 클립보드 복사, PDF/인쇄, 시스템 공유 유틸리티
import type { BlockNoteEditor } from '@blocknote/core';

type AnyEditor = BlockNoteEditor<any, any, any>;

/** 특수문자를 파일명에 안전한 문자로 변환 */
export function sanitizeFileName(name: string): string {
  return (name || '제목없는노트').replace(/[/\\?%*:|"<>]/g, '_').trim() || '노트';
}

/** BlockNote 문서를 마크다운 문자열로 변환 (제목 포함) */
export function exportToMarkdown(editor: AnyEditor, title: string): string {
  const bodyMarkdown = editor.blocksToMarkdownLossy(editor.document);
  const trimmedTitle = title.trim();
  if (trimmedTitle) {
    return `# ${trimmedTitle}\n\n${bodyMarkdown}`;
  }
  return bodyMarkdown;
}

/** BlockNote 문서를 단독 열람 가능한 깔끔한 스타일의 HTML 문서로 변환 */
export function exportToHtmlDocument(editor: AnyEditor, title: string): string {
  const bodyHtml = editor.blocksToHTMLLossy(editor.document);
  const displayTitle = title.trim() || '제목 없는 노트';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(displayTitle)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background: #ffffff;
      max-width: 820px;
      margin: 40px auto;
      padding: 0 24px;
    }
    h1.note-title {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 24px;
      border-bottom: 2px solid #eaeaea;
      padding-bottom: 12px;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
    }
    pre {
      background: #f4f4f5;
      padding: 14px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.9em;
    }
    code {
      background: #f4f4f5;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }
    blockquote {
      border-left: 4px solid #3b82f6;
      padding-left: 14px;
      color: #4b5563;
      margin: 16px 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background-color: #f3f4f6;
    }
    @media print {
      body {
        max-width: 100%;
        margin: 0;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <h1 class="note-title">${escapeHtml(displayTitle)}</h1>
  <div class="note-content">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** 파일 다운로드 (브라우저 및 Electron 지원) */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 클립보드에 순수 텍스트/마크다운 복사 */
export async function copyPlainTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('클립보드 복사 실패:', err);
    return false;
  }
}

/** 클립보드에 서식 있는 텍스트(HTML)와 대체 텍스트(Plain) 동시 복사 */
export async function copyHtmlToClipboard(html: string, plainText: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
    // ClipboardItem 미지원 시 텍스트 복사로 fallback
    await navigator.clipboard.writeText(plainText);
    return true;
  } catch (err) {
    console.error('HTML 클립보드 복사 실패, 텍스트 복사 시도:', err);
    return copyPlainTextToClipboard(plainText);
  }
}

/** OS 네이티브 공유 API 지원 여부 확인 */
export function canNativeShare(): boolean {
  return typeof navigator.share === 'function';
}

/** OS 네이티브 공유 창 열기 */
export async function shareNative(title: string, text: string): Promise<boolean> {
  if (!canNativeShare()) return false;
  try {
    await navigator.share({
      title: title || 'BullsNote',
      text,
    });
    return true;
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error('시스템 공유 실패:', err);
    }
    return false;
  }
}

/** PDF 내보내기 (Electron 네이티브 PDF 저장 또는 브라우저 인쇄 fallback) */
export async function exportToPdf(title: string): Promise<{ success: boolean; canceled?: boolean }> {
  // Electron 환경인 경우 네이티브 showSaveDialog + printToPDF 실행
  if (window.bullsNote?.print?.exportPdf) {
    try {
      const res = await window.bullsNote.print.exportPdf(title);
      if (res.canceled) return { success: false, canceled: true };
      if (res.success) return { success: true };
    } catch (err) {
      console.warn('Electron PDF 내보내기 실패, window.print()로 fallback:', err);
    }
  }

  // 브라우저 환경이거나 Electron IPC 실패 시 인쇄 창 호출 (사용자가 PDF로 저장 선택 가능)
  window.print();
  return { success: true };
}
