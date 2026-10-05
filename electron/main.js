const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const { registerVaultIpc } = require('./vault-ipc');
const { setupTray } = require('./tray');

const isDev = !app.isPackaged;

let mainWindow = null;
let trayCtl = { tray: null, requestQuit: () => app.quit(), isQuitting: () => true };

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
    },
    autoHideMenuBar: true,
  });
  mainWindow = win;

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
  registerVaultIpc(app);
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
