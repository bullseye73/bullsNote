import { afterEach, describe, expect, it, vi } from 'vitest';
import { printNote } from '../exportUtils';

const g = globalThis as unknown as { window?: unknown };

function stubWindow(bullsNote?: unknown) {
  const print = vi.fn();
  g.window = { print, bullsNote };
  return print;
}

afterEach(() => {
  delete g.window;
});

describe('printNote', () => {
  it('Electron에서는 PDF 인쇄 미리보기 창을 연다 (시스템 인쇄창은 미리보기가 없음)', async () => {
    const preview = vi.fn().mockResolvedValue({ success: true });
    const print = stubWindow({ print: { preview } });

    const res = await printNote('회의록');

    expect(preview).toHaveBeenCalledWith('회의록');
    expect(print).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  it('미리보기 창 생성이 실패하면 window.print()로 대체한다', async () => {
    const preview = vi.fn().mockResolvedValue({ success: false, error: 'x' });
    const print = stubWindow({ print: { preview } });

    await printNote('회의록');

    expect(print).toHaveBeenCalledTimes(1);
  });

  it('브라우저(PWA)에서는 브라우저 인쇄창(미리보기 내장)을 그대로 쓴다', async () => {
    const print = stubWindow(undefined);

    const res = await printNote('회의록');

    expect(print).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
  });
});
