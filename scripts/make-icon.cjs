// 일회성 아이콘 생성기: node scripts/make-icon.cjs
// 출력: electron/assets/icon.png, icon.ico, tray-icon.png, tray-icon@2x.png, tray-icon-win.png
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 5x7 블록 B
const GLYPH_B = ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.'];

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function render(size, radius, scale) {
  const px = Buffer.alloc(size * size * 4);
  // Mantine blue 그라데이션 배경 + 둥근 모서리
  const top = [77, 171, 247];
  const bottom = [25, 113, 194];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      const inside =
        cx >= 0 &&
        cy >= 0 &&
        (cx >= radius || cy >= radius || (cx - radius) ** 2 + (cy - radius) ** 2 <= radius ** 2);
      const i = (y * size + x) * 4;
      if (!inside) {
        px[i + 3] = 0;
        continue;
      }
      const t = y / (size - 1);
      px[i] = lerp(top[0], bottom[0], t);
      px[i + 1] = lerp(top[1], bottom[1], t);
      px[i + 2] = lerp(top[2], bottom[2], t);
      px[i + 3] = 255;
    }
  }
  // 흰색 B (5x7 -> 스케일 확대, 중앙 배치)
  const gw = 5 * scale;
  const gh = 7 * scale;
  const ox = Math.floor((size - gw) / 2);
  const oy = Math.floor((size - gh) / 2);
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      if (GLYPH_B[row][col] !== 'X') continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = ox + col * scale + dx;
          const y = oy + row * scale + dy;
          const i = (y * size + x) * 4;
          px[i] = 255;
          px[i + 1] = 255;
          px[i + 2] = 255;
          px[i + 3] = 255;
        }
      }
    }
  }
  return px;
}

function toPng(px, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter 0
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function toIco(png) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0; // 256
  entry[1] = 0; // 256
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([head, entry, png]);
}

const dir = path.join(__dirname, '..', 'electron', 'assets');
fs.mkdirSync(dir, { recursive: true });

// 1. 앱 메인 아이콘 (256x256)
const png256 = toPng(render(256, 56, 24), 256);
fs.writeFileSync(path.join(dir, 'icon.png'), png256);
fs.writeFileSync(path.join(dir, 'icon.ico'), toIco(png256));

// 2. macOS 및 고해상도 트레이 아이콘 (18x18, 36x36 @2x)
const png18 = toPng(render(18, 4, 2), 18);
const png36 = toPng(render(36, 8, 4), 36);
fs.writeFileSync(path.join(dir, 'tray-icon.png'), png18);
fs.writeFileSync(path.join(dir, 'tray-icon@2x.png'), png36);

// 3. Windows 트레이 아이콘 (16x16)
const png16 = toPng(render(16, 3, 2), 16);
fs.writeFileSync(path.join(dir, 'tray-icon-win.png'), png16);

console.log('wrote icon.png, icon.ico, tray-icon.png, tray-icon@2x.png, tray-icon-win.png');
