// 트레이 상주 + 닫기→숨김 + 우클릭 종료 메뉴
const { Menu, Tray, nativeImage } = require('electron');
const path = require('path');

function loadTrayIcon() {
  const p = path.join(__dirname, 'assets', 'icon.png');
  const img = nativeImage.createFromPath(p);
  if (img.isEmpty()) {
    console.error(`[tray] 아이콘 로드 실패: ${p}`);
    return null;
  }
  return img;
}

/**
 * @param {{ app: import('electron').App }} deps
 * @param {() => import('electron').BrowserWindow | null} getWindow
 * @returns {{ tray: import('electron').Tray | null, requestQuit(): void, isQuitting(): boolean }}
 */
function setupTray(deps, getWindow) {
  const { app } = deps;
  let quitting = false;
  const img = loadTrayIcon();
  if (!img) return { tray: null, requestQuit: () => app.quit(), isQuitting: () => true };

  const tray = new Tray(img);
  tray.setToolTip('BullsNote (실행 중)');
  tray.setTitle('BullsNote');

  const showWindow = () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };

  const menu = Menu.buildFromTemplate([
    {
      label: 'BullsNote 열기',
      click: showWindow,
    },
    { type: 'separator' },
    {
      label: '완전히 종료',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);

  console.log('[tray] 트레이 아이콘 등록됨 (우클릭: 완전히 종료)');

  return {
    tray,
    requestQuit: () => {
      quitting = true;
      app.quit();
    },
    isQuitting: () => quitting,
  };
}

module.exports = { setupTray, loadTrayIcon };
