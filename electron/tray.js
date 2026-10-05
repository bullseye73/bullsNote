// 트레이 상주 + 닫기→숨김 + 플랫폼별(macOS/Windows/Linux) 아이콘 및 클릭 이벤트 최적화
const { Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

function loadTrayIcon() {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  const macTrayPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const winTrayPath = path.join(__dirname, 'assets', 'tray-icon-win.png');
  const defaultPath = path.join(__dirname, 'assets', 'icon.png');

  let targetPath = defaultPath;
  if (isMac && fs.existsSync(macTrayPath)) {
    targetPath = macTrayPath;
  } else if (isWin && fs.existsSync(winTrayPath)) {
    targetPath = winTrayPath;
  }

  let img = nativeImage.createFromPath(targetPath);
  if (img.isEmpty()) {
    console.error(`[tray] 아이콘 로드 실패: ${targetPath}`);
    return null;
  }

  // 플랫폼별 최적 크기 보정 (macOS: 18x18, Windows: 16x16)
  if (isMac) {
    const size = img.getSize();
    // 256x256 등 원본이 큰 경우 메뉴바에 맞춰 18x18로 리사이즈
    if (size.width > 22 || size.height > 22) {
      img = img.resize({ width: 18, height: 18, quality: 'best' });
    }
  } else if (isWin) {
    const size = img.getSize();
    if (size.width > 32 || size.height > 32) {
      img = img.resize({ width: 16, height: 16, quality: 'best' });
    }
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
  // 주의: macOS에서 tray.setTitle(...)을 호출하면 메뉴바에 텍스트 라벨이 노출되므로 호출하지 않음.

  const showWindow = () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };

  const toggleWindow = () => {
    const win = getWindow();
    if (!win) return;
    if (win.isVisible() && win.isFocused()) {
      win.hide();
    } else {
      showWindow();
    }
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

  if (process.platform === 'darwin') {
    // macOS: setContextMenu를 등록하면 좌클릭 시 항상 메뉴가 열려 창 표시(click)가 무시됨.
    // 따라서 좌클릭은 창 토글로, 우클릭은 popUpContextMenu로 메뉴를 띄우도록 분리.
    tray.on('click', () => {
      toggleWindow();
    });
    tray.on('right-click', () => {
      tray.popUpContextMenu(menu);
    });
  } else {
    // Windows / Linux: setContextMenu를 등록하면 우클릭 시 메뉴가 뜨고, 좌클릭/더블클릭 이벤트도 정상 수신됨.
    tray.setContextMenu(menu);
    tray.on('click', toggleWindow);
    tray.on('double-click', showWindow);
  }

  console.log('[tray] 트레이 아이콘 등록 완료 (좌클릭: 열기/숨김, 우클릭: 메뉴)');

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
