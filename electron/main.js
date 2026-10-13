const { app, BrowserWindow, nativeImage, shell, ipcMain, Notification, Menu, MenuItem, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerVaultIpc } = require('./vault-ipc');
const { setupTray } = require('./tray');

const isDev = !app.isPackaged;

let mainWindow = null;
let trayCtl = { tray: null, requestQuit: () => app.quit(), isQuitting: () => true };

function setupAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: 'BullsNote 정보' },
              { type: 'separator' },
              { role: 'services', label: '서비스' },
              { type: 'separator' },
              { role: 'hide', label: 'BullsNote 숨기기' },
              { role: 'hideOthers', label: '기타 숨기기' },
              { role: 'unhide', label: '모두 보기' },
              { type: 'separator' },
              { role: 'quit', label: 'BullsNote 종료' },
            ],
          },
        ]
      : []),
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소', accelerator: 'CmdOrCtrl+Z' },
        { role: 'redo', label: '다시 실행', accelerator: isMac ? 'Shift+CmdOrCtrl+Z' : 'Ctrl+Y' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기', accelerator: 'CmdOrCtrl+X' },
        { role: 'copy', label: '복사', accelerator: 'CmdOrCtrl+C' },
        { role: 'paste', label: '붙여넣기', accelerator: 'CmdOrCtrl+V' },
        { role: 'pasteAndMatchStyle', label: '서식 없이 붙여넣기', accelerator: 'Shift+CmdOrCtrl+V' },
        { role: 'delete', label: '삭제' },
        { role: 'selectAll', label: '모두 선택', accelerator: 'CmdOrCtrl+A' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { role: 'reload', label: '새로고침', accelerator: 'CmdOrCtrl+R' },
        { role: 'forceReload', label: '강제 새로고침', accelerator: 'Shift+CmdOrCtrl+R' },
        { role: 'toggleDevTools', label: '개발자 도구', accelerator: 'F12' },
        { type: 'separator' },
        { role: 'resetZoom', label: '실제 크기', accelerator: 'CmdOrCtrl+0' },
        { role: 'zoomIn', label: '확대', accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomOut', label: '축소', accelerator: 'CmdOrCtrl+-' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체 화면', accelerator: 'F11' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#ffffff',
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
    autoHideMenuBar: true,
  });
  mainWindow = win;

  // 마우스 우클릭 컨텍스트 메뉴 등록 (잘라내기, 복사, 붙여넣기, 모두 선택 등)
  win.webContents.on('context-menu', (_event, params) => {
    const contextMenu = new Menu();

    const hasSelection = params.selectionText && params.selectionText.trim().length > 0;

    // 편집 가능한 영역 (BlockNote 에디터, input, textarea 등)
    if (params.isEditable) {
      contextMenu.append(new MenuItem({ role: 'undo', label: '실행 취소 (Undo)', accelerator: 'CmdOrCtrl+Z' }));
      contextMenu.append(new MenuItem({ role: 'redo', label: '다시 실행 (Redo)', accelerator: 'CmdOrCtrl+Y' }));
      contextMenu.append(new MenuItem({ type: 'separator' }));
      contextMenu.append(new MenuItem({ role: 'cut', label: '잘라내기 (Cut)', accelerator: 'CmdOrCtrl+X', enabled: hasSelection }));
      contextMenu.append(new MenuItem({ role: 'copy', label: '복사 (Copy)', accelerator: 'CmdOrCtrl+C', enabled: hasSelection }));
      contextMenu.append(new MenuItem({ role: 'paste', label: '붙여넣기 (Paste)', accelerator: 'CmdOrCtrl+V' }));
      contextMenu.append(new MenuItem({ role: 'pasteAndMatchStyle', label: '텍스트만 붙여넣기', accelerator: 'Shift+CmdOrCtrl+V' }));
      contextMenu.append(new MenuItem({ role: 'delete', label: '삭제 (Delete)' }));
      contextMenu.append(new MenuItem({ type: 'separator' }));
      contextMenu.append(new MenuItem({ role: 'selectAll', label: '모두 선택 (Select All)', accelerator: 'CmdOrCtrl+A' }));
    } else {
      if (hasSelection) {
        contextMenu.append(new MenuItem({ role: 'copy', label: '복사 (Copy)', accelerator: 'CmdOrCtrl+C' }));
        contextMenu.append(new MenuItem({ type: 'separator' }));
      }
      contextMenu.append(new MenuItem({ role: 'selectAll', label: '모두 선택 (Select All)', accelerator: 'CmdOrCtrl+A' }));
    }

    contextMenu.popup({ window: win });
  });

  // 외부 링크 클릭 시 새 Electron 창 대신 시스템 기본 브라우저로 오픈
  win.webContents.setWindowOpenHandler(({ url }) => {
    // 내부 URL 또는 노트 내부 링크(#note-, note://)인 경우 외부 브라우저 오픈 차단
    const isDevUrl = isDev && url.startsWith('http://localhost:5190');
    const isInternalNote = url.includes('#note-') || url.startsWith('note:');
    if (isDevUrl || isInternalNote || url.startsWith('file://')) {
      const noteMatch = url.match(/#note-([a-zA-Z0-9_-]+)/) || url.match(/^note:\/\/([a-zA-Z0-9_-]+)/);
      if (noteMatch && noteMatch[1]) {
        win.webContents.send('alarm:openNote', noteMatch[1]);
      }
      return { action: 'deny' };
    }

    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 본문 내 외부 URL 탐색 방지 (개발 서버 또는 로컬 빌드 파일 외 외부 URL 이동 차단)
  win.webContents.on('will-navigate', (event, url) => {
    const isDevUrl = isDev && url.startsWith('http://localhost:5190');
    const isProdUrl = !isDev && url.startsWith('file://');
    const isInternalNote = url.includes('#note-') || url.startsWith('note:');

    if (isInternalNote) {
      event.preventDefault();
      const noteMatch = url.match(/#note-([a-zA-Z0-9_-]+)/) || url.match(/^note:\/\/([a-zA-Z0-9_-]+)/);
      if (noteMatch && noteMatch[1]) {
        win.webContents.send('alarm:openNote', noteMatch[1]);
      }
      return;
    }

    if (!isDevUrl && !isProdUrl) {
      event.preventDefault();
      if (url.startsWith('http:') || url.startsWith('https:')) {
        shell.openExternal(url);
      }
    }
  });

  // 닫기 버튼 -> 종료 대신 트레이로 숨김
  win.on('close', (e) => {
    if (!trayCtl.isQuitting()) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (isDev) {
    win.loadURL('http://localhost:5190');
    // win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  return win;
}

app.whenReady().then(() => {
  setupAppMenu();
  registerVaultIpc(app);

  ipcMain.handle('notification:show', (event, { title, body, noteId }) => {
    if (!Notification.isSupported()) return false;
    try {
      const notif = new Notification({
        title: title || 'BullsNote 알람',
        body: body || '',
        icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
        silent: false,
      });
      notif.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('alarm:openNote', noteId);
        }
      });
      notif.show();
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('print:exportPdf', async (event, { title }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: '창을 찾을 수 없습니다.' };

    const safeTitle = (title || '노트').replace(/[/\\?%*:|"<>]/g, '_').trim() || '노트';
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'PDF로 내보내기',
      defaultPath: `${safeTitle}.pdf`,
      filters: [{ name: 'PDF 문서', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    try {
      const pdfData = await event.sender.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: {
          top: 0.4,
          bottom: 0.4,
          left: 0.4,
          right: 0.4,
        },
      });
      await fs.promises.writeFile(filePath, pdfData);
      return { success: true, filePath };
    } catch (err) {
      console.error('PDF 내보내기 실패:', err);
      return { success: false, error: err.message };
    }
  });

  trayCtl = setupTray({ app }, () => mainWindow);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 트레이 상주를 위해 창이 모두 닫혀도 종료하지 않음 (종료는 트레이 메뉴)
app.on('window-all-closed', () => {
  /* keep running in tray */
});
