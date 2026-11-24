import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPrintableFallbackHtml,
  exportToHtmlDocument,
  exportToPdf,
  printNote,
} from '../exportUtils';

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
  it('Electron에서는 전달된 HTML과 제목으로 PDF 인쇄 미리보기 창을 연다', async () => {
    const preview = vi.fn().mockResolvedValue({ success: true });
    const print = stubWindow({ print: { preview } });

    const res = await printNote('회의록', '<html><body>회의록 내용</body></html>');

    expect(preview).toHaveBeenCalledWith('회의록', '<html><body>회의록 내용</body></html>');
    expect(print).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  it('html 인자 없이 호출해도 preview(title, undefined)를 호출한다', async () => {
    const preview = vi.fn().mockResolvedValue({ success: true });
    const print = stubWindow({ print: { preview } });

    const res = await printNote('회의록');

    expect(preview).toHaveBeenCalledWith('회의록', undefined);
    expect(print).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  it('미리보기 창 생성이 실패하면 window.print()로 대체한다', async () => {
    const preview = vi.fn().mockResolvedValue({ success: false, error: 'x' });
    const print = stubWindow({ print: { preview } });

    await printNote('회의록', '<html></html>');

    expect(print).toHaveBeenCalledTimes(1);
  });

  it('브라우저(PWA)에서는 브라우저 인쇄창(미리보기 내장)을 그대로 쓴다', async () => {
    const print = stubWindow(undefined);

    const res = await printNote('회의록');

    expect(print).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
  });
});

describe('exportToPdf', () => {
  it('Electron에서는 전달된 HTML과 제목을 exportPdf에 넘긴다', async () => {
    const exportPdf = vi.fn().mockResolvedValue({ success: true, filePath: '/tmp/a.pdf' });
    const print = stubWindow({ print: { exportPdf } });

    const res = await exportToPdf('주간보고', '<html><body>보고 내용</body></html>');

    expect(exportPdf).toHaveBeenCalledWith('주간보고', '<html><body>보고 내용</body></html>');
    expect(print).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  it('사용자가 저장 대화상자를 취소하면 canceled: true를 반환하고 window.print()를 호출하지 않는다', async () => {
    const exportPdf = vi.fn().mockResolvedValue({ success: false, canceled: true });
    const print = stubWindow({ print: { exportPdf } });

    const res = await exportToPdf('주간보고', '<html></html>');

    expect(res).toEqual({ success: false, canceled: true });
    expect(print).not.toHaveBeenCalled();
  });
});

describe('exportToHtmlDocument & buildPrintableFallbackHtml', () => {
  it('exportToHtmlDocument는 제목, 메타데이터, 본문을 포함하고 @page 규칙과 목록 배제 구조를 가진다', () => {
    const fakeEditor = {
      document: [],
      blocksToHTMLLossy: () => '<p>본문 단락입니다.</p>',
    } as any;

    const html = exportToHtmlDocument(fakeEditor, '설계 문서', {
      createdAt: 1700000000000,
      updatedAt: 1700003600000,
      tags: ['아키텍처', '#PDF'],
    });

    expect(html).toContain('<h1 class="note-title">설계 문서</h1>');
    expect(html).toContain('class="note-meta"');
    expect(html).toContain('생성:');
    expect(html).toContain('수정:');
    expect(html).toContain('#아키텍처 #PDF');
    expect(html).toContain('<p>본문 단락입니다.</p>');
    expect(html).toContain('@page {');
    expect(html).toContain('size: A4 portrait;');
    expect(html).not.toContain('ListPanel');
    expect(html).not.toContain('mantine-AppShell');
  });

  it('exportToHtmlDocument는 meta 없이 호출해도 기존과 호환된다', () => {
    const fakeEditor = {
      document: [],
      blocksToHTMLLossy: () => '<p>간단 메모</p>',
    } as any;

    const html = exportToHtmlDocument(fakeEditor, '메모');

    expect(html).toContain('<h1 class="note-title">메모</h1>');
    expect(html).not.toContain('class="note-meta"');
    expect(html).toContain('<p>간단 메모</p>');
  });

  it('buildPrintableFallbackHtml은 에디터가 없을 때 제목, 메타데이터, 이스케이프된 본문을 출력한다', () => {
    const html = buildPrintableFallbackHtml(
      '폴백 <노트>',
      '첫 줄\n둘째 줄 & <스크립트>',
      {
        createdAt: 1700000000000,
        tags: ['테스트'],
      }
    );

    expect(html).toContain('<h1 class="note-title">폴백 &lt;노트&gt;</h1>');
    expect(html).toContain('class="note-meta"');
    expect(html).toContain('#테스트');
    expect(html).toContain('첫 줄\n둘째 줄 &amp; &lt;스크립트&gt;');
    expect(html).not.toContain('<스크립트>');
    expect(html).toContain('@page {');
  });
});
