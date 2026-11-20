// PNG 버퍼들을 Windows ICO / macOS ICNS 컨테이너로 묶는 순수 인코더 (외부 의존성 없음)

/** ICNS PNG 청크 타입 → 픽셀 크기 */
const ICNS_TYPES = Object.freeze({
  icp4: 16,
  icp5: 32,
  icp6: 64,
  ic07: 128,
  ic08: 256,
  ic09: 512,
  ic10: 1024, // 512@2x
  ic11: 32, // 16@2x
  ic12: 64, // 32@2x
  ic13: 256, // 128@2x
  ic14: 512, // 256@2x
});

/**
 * @param {{ size: number, png: Buffer }[]} images PNG 인코딩된 정사각형 이미지들 (최대 256px)
 * @returns {Buffer}
 */
function encodeIco(images) {
  const headerSize = 6 + 16 * images.length;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = headerSize;
  images.forEach(({ size, png }, i) => {
    if (size < 1 || size > 256) throw new Error(`ICO 크기 범위 초과: ${size}`);
    const entry = 6 + 16 * i;
    const dim = size === 256 ? 0 : size;
    header.writeUInt8(dim, entry);
    header.writeUInt8(dim, entry + 1);
    header.writeUInt8(0, entry + 2); // palette
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // planes
    header.writeUInt16LE(32, entry + 6); // bpp
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });

  return Buffer.concat([header, ...images.map((img) => img.png)]);
}

/**
 * @param {{ type: keyof typeof ICNS_TYPES, png: Buffer }[]} chunks
 * @returns {Buffer}
 */
function encodeIcns(chunks) {
  const parts = chunks.map(({ type, png }) => {
    if (!(type in ICNS_TYPES)) throw new Error(`알 수 없는 ICNS 타입: ${type}`);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(8 + png.length, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([head, body]);
}

module.exports = { ICNS_TYPES, encodeIco, encodeIcns };
