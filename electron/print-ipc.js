// 인쇄·PDF IPC: PDF 저장과 인쇄 미리보기가 같은 PDF 생성 로직을 공유한다
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { secureHandle } = require('./ipc-guard');

// 여백 색은 index.css의 @page 배경(흰색)이 정한다. 지정하지 않으면 Chromium이 창 backgroundColor(다크: #121214)로 칠한다.
const PDF_OPTIONS = {
  pageSize: 'A4',
  printBackground: true,
  margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
};

function safeTitle(title) {
  return String(title || '노트').slice(0, 120).replace(/[/\\?%*:|"<>]/g, '_').trim() || '노트';
}

/** 요청한 창의 현재 화면을 인쇄용(@media print) PDF로 렌더링 */
function renderPdf(webContents) {
  return webContents.printToPDF(PDF_OPTIONS);
}

let previewWin = null;

/** 생성한 PDF를 Chromium 내장 PDF 뷰어 창으로 열어 미리보기 + 인쇄 버튼 제공 */
async function openPdfPreview(parent, pdfData, title) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bullsnote-print-'));
  const filePath = path.join(dir, `${safeTitle(title)}.pdf`);
  await fs.promises.writeFile(filePath, pdfData);

  if (previewWin && !previewWin.isDestroyed()) previewWin.close();

  const win = new BrowserWindow({
    parent,
    width: 900,
    height: Math.min(1100, parent.getBounds().height),
    title: `인쇄 미리보기 - ${safeTitle(title)}`,
    autoHideMenuBar: true,
    webPreferences: {
      plugins: true, // 내장 PDF 뷰어 사용
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  previewWin = win;
  // PDF 메타데이터 제목(앱 창 제목)으로 덮어쓰지 않도록 유지
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('closed', () => {
    if (previewWin === win) previewWin = null;
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  });
  await win.loadFile(filePath);
}

function registerPrintIpc() {
  secureHandle('print:exportPdf', async (event, { title } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: '창을 찾을 수 없습니다.' };

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'PDF로 내보내기',
      defaultPath: `${safeTitle(title)}.pdf`,
      filters: [{ name: 'PDF 문서', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { success: false, canceled: true };

    try {
      await fs.promises.writeFile(filePath, await renderPdf(event.sender));
      return { success: true, filePath };
    } catch (err) {
      console.error('PDF 내보내기 실패:', err);
      return { success: false, error: err.message };
    }
  });

  secureHandle('print:preview', async (event, { title } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: '창을 찾을 수 없습니다.' };
    try {
      await openPdfPreview(win, await renderPdf(event.sender), title);
      return { success: true };
    } catch (err) {
      console.error('인쇄 미리보기 실패:', err);
      return { success: false, error: err.message };
    }
  });
}

app.on('will-quit', () => {
  if (previewWin && !previewWin.isDestroyed()) previewWin.destroy();
});

module.exports = { registerPrintIpc, renderPdf, PDF_OPTIONS };
