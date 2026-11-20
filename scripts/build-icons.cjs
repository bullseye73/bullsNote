// BullsNote 아이콘 에셋 생성기 — brand/*.svg 마스터에서 전 플랫폼 아이콘을 만든다.
// 실행: npm run icons   (Electron 으로 실행되어 Chromium 렌더러로 SVG 를 래스터화하므로 OS 무관)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { encodeIco, encodeIcns, ICNS_TYPES } = require('./lib/icon-formats.cjs');

const ROOT = path.join(__dirname, '..');
const BRAND = path.join(ROOT, 'brand');
const ELECTRON_ASSETS = path.join(ROOT, 'electron', 'assets');
const PUBLIC = path.join(ROOT, 'public');

/** 캔버스 대비 아이콘 배치 비율 */
const LAYOUT = {
  /** 둥근 타일이 캔버스를 꽉 채움 (Windows / PWA / favicon / maskable) */
  full: { scale: 1 },
  /** macOS 아이콘 그리드: 1024 캔버스에 824 타일 */
  mac: { scale: 824 / 1024 },
};

const read = (name) => fs.readFileSync(path.join(BRAND, name), 'utf8');

/** maskable 용: 둥근 모서리 제거 + 글리프를 안전영역으로 축소 */
function toMaskableSvg(svg) {
  return svg
    .replace(/<rect([^>]*?)rx="[^"]*"/, '<rect$1')
    .replace(/(<rect[^>]*\/>)([\s\S]*)<\/svg>/, '$1<g transform="translate(60 60) scale(0.8) translate(-60 -60)">$2</g></svg>');
}

async function createRenderer() {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<!doctype html><canvas></canvas>');
  /** @returns {Promise<Buffer>} */
  return async function render(svg, size, layoutKey = 'full') {
    const layout = LAYOUT[layoutKey];
    const dataUrl = await win.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = c.height = ${size};
          const g = c.getContext('2d');
          g.imageSmoothingQuality = 'high';
          const inner = ${size} * ${layout.scale};
          const off = (${size} - inner) / 2;
          g.drawImage(img, off, off, inner, inner);
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
      })`);
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  };
}

function write(file, buf) {
  fs.writeFileSync(file, buf);
  console.log(`  ✓ ${path.relative(ROOT, file)} (${buf.length.toLocaleString()} B)`);
}

async function main() {
  const render = await createRenderer();
  const icon = read('icon.svg');
  const maskable = toMaskableSvg(icon);
  const tray = read('tray.svg');

  // macOS: .icns + Dock/About/Linux 용 PNG
  const icnsChunks = [];
  for (const [type, px] of Object.entries(ICNS_TYPES)) {
    icnsChunks.push({ type, png: await render(icon, px, 'mac') });
  }
  write(path.join(ELECTRON_ASSETS, 'icon.icns'), encodeIcns(icnsChunks));
  write(path.join(ELECTRON_ASSETS, 'icon.png'), await render(icon, 512, 'mac'));

  // Windows: .ico
  const icoImages = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    icoImages.push({ size, png: await render(icon, size, 'full') });
  }
  write(path.join(ELECTRON_ASSETS, 'icon.ico'), encodeIco(icoImages));

  // 트레이: macOS 템플릿(단색) 1x/2x, Windows 컬러 32px
  write(path.join(ELECTRON_ASSETS, 'tray-icon.png'), await render(tray, 22));
  write(path.join(ELECTRON_ASSETS, 'tray-icon@2x.png'), await render(tray, 44));
  write(path.join(ELECTRON_ASSETS, 'tray-icon-win.png'), await render(icon, 32));

  // PWA / 웹
  write(path.join(PUBLIC, 'icon.png'), await render(icon, 512));
  write(path.join(PUBLIC, 'icon-192.png'), await render(icon, 192));
  write(path.join(PUBLIC, 'icon-maskable-512.png'), await render(maskable, 512));
  write(path.join(PUBLIC, 'apple-touch-icon.png'), await render(maskable, 180));
  fs.copyFileSync(path.join(BRAND, 'icon.svg'), path.join(PUBLIC, 'favicon.svg'));
  console.log('  ✓ public/favicon.svg');
}

app.dock?.hide();
app
  .whenReady()
  .then(main)
  .then(() => app.exit(0))
  .catch((err) => {
    console.error('아이콘 생성 실패:', err);
    app.exit(1);
  });
