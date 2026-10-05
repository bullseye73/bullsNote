// 일회성 아이콘 생성기: node scripts/make-icon.cjs (출력: electron/assets/icon.png, icon.ico)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const RADIUS = 56;
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

function render() {
  const px = Buffer.alloc(SIZE * SIZE * 4);
  // Mantine blue 그라데이션 배경 + 둥근 모서리
  const top = [77, 171, 247];
  const bottom = [25, 113, 194];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cx = Math.min(x, SIZE - 1 - x);
      const cy = Math.min(y, SIZE - 1 - y);
      const inside = cx >= 0 && cy >= 0 && (cx >= RADIUS || cy >= RADIUS || (cx - RADIUS) ** 2 + (cy - RADIUS) ** 2 <= RADIUS ** 2);
      const i = (y * SIZE + x) * 4;
      if (!inside) {
        px[i + 3] = 0;
        continue;
      }
      const t = y / (SIZE - 1);
      px[i] = lerp(top[0], bottom[0], t);
      px[i + 1] = lerp(top[1], bottom[1], t);
      px[i + 2] = lerp(top[2], bottom[2], t);
      px[i + 3] = 255;
    }
  }
  // 흰색 B (5x7 -> 스케일 확대, 중앙 배치)
  const scale = 24;
  const gw = 5 * scale;
  const gh = 7 * scale;
  const ox = Math.floor((SIZE - gw) / 2);
  const oy = Math.floor((SIZE - gh) / 2);
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      if (GLYPH_B[row][col] !== 'X') continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = ox + col * scale + dx;
          const y = oy + row * scale + dy;
          const i = (y * SIZE + x) * 4;
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

function toPng(px) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0; // filter 0
    px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
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
const png = toPng(render());
fs.writeFileSync(path.join(dir, 'icon.png'), png);
fs.writeFileSync(path.join(dir, 'icon.ico'), toIco(png));
console.log('wrote icon.png + icon.ico', png.length, 'bytes');
