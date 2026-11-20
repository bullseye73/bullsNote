import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { encodeIco, encodeIcns, ICNS_TYPES } from '../lib/icon-formats.cjs';

const fakePng = (n: number) => Buffer.from(Array.from({ length: n }, (_, i) => i % 256));

describe('encodeIco', () => {
  it('PNG 이미지들을 ICO 디렉터리 헤더와 함께 순서대로 담는다', () => {
    const a = fakePng(10);
    const b = fakePng(20);
    const ico = encodeIco([
      { size: 16, png: a },
      { size: 256, png: b },
    ]);

    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(2); // count

    const first = 6;
    expect(ico.readUInt8(first)).toBe(16);
    expect(ico.readUInt16LE(first + 6)).toBe(32); // bpp
    expect(ico.readUInt32LE(first + 8)).toBe(10);
    const firstOffset = ico.readUInt32LE(first + 12);
    expect(firstOffset).toBe(6 + 16 * 2);
    expect(ico.subarray(firstOffset, firstOffset + 10).equals(a)).toBe(true);

    const second = 6 + 16;
    expect(ico.readUInt8(second)).toBe(0); // 256 은 0 으로 기록
    const secondOffset = ico.readUInt32LE(second + 12);
    expect(secondOffset).toBe(firstOffset + 10);
    expect(ico.length).toBe(secondOffset + 20);
  });
});

describe('encodeIcns', () => {
  it('icns 매직과 전체 길이, 타입별 PNG 청크를 기록한다', () => {
    const a = fakePng(7);
    const b = fakePng(9);
    const icns = encodeIcns([
      { type: 'ic07', png: a },
      { type: 'ic10', png: b },
    ]);

    expect(icns.toString('ascii', 0, 4)).toBe('icns');
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    expect(icns.toString('ascii', 8, 12)).toBe('ic07');
    expect(icns.readUInt32BE(12)).toBe(8 + 7);
    expect(icns.subarray(16, 23).equals(a)).toBe(true);
    expect(icns.toString('ascii', 23, 27)).toBe('ic10');
    expect(icns.length).toBe(8 + 15 + 17);
  });

  it('알 수 없는 타입은 거부한다', () => {
    expect(() => encodeIcns([{ type: 'zzzz', png: fakePng(1) }])).toThrow();
  });

  it('표준 타입별 픽셀 크기 매핑을 제공한다', () => {
    expect(ICNS_TYPES.ic10).toBe(1024);
    expect(ICNS_TYPES.ic14).toBe(512);
    expect(ICNS_TYPES.icp4).toBe(16);
  });
});
