import fs from 'fs';
import http from 'http';
import { createRequire } from 'module';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatClipMarkdown, parseTagsInput } from '../../../extension/src/clipperClient';
import { extractKeywordTags, summarizePageAsMarkdown } from '../../../extension/src/aiHelper';

const require = createRequire(import.meta.url);
const bridge = require('../../../electron/clipper-bridge.js') as {
  MAX_BODY_BYTES: number;
  startClipperBridge: (
    getMainWindow: () => { isDestroyed: () => boolean; webContents: { send: (ch: string, data: unknown) => void } } | null,
    options?: { port?: number; token?: string; version?: string },
  ) => Promise<{ running: boolean; port: number | null; url: string | null; token: string | null; version: string }>;
  stopClipperBridge: () => Promise<void>;
  getClipperInfo: () => { running: boolean; port: number | null; url: string | null; token: string | null; version: string };
  validateClipPayload: (raw: unknown) => { ok: boolean; error?: string; payload?: Record<string, unknown> };
};

function httpRequest(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

describe('clipperClient helpers', () => {
  it('formatClipMarkdown은 제목, URL, 본문, 태그를 마크다운으로 포맷한다', () => {
    const md = formatClipMarkdown({
      mode: 'note',
      title: 'BullsNote 문서',
      url: 'https://example.com/docs',
      content: '핵심 내용 요약입니다.',
      tags: ['web-clip', '#참고', 'web-clip'],
    });

    expect(md).toContain('### [BullsNote 문서](https://example.com/docs)');
    expect(md).toContain('출처: https://example.com/docs');
    expect(md).toContain('핵심 내용 요약입니다.');
    expect(md).toContain('#web-clip #참고');
  });

  it('parseTagsInput은 공백과 쉼표, # 접두사를 정규화한다', () => {
    expect(parseTagsInput('#개발, 리액트  #개발  notes')).toEqual(['개발', '리액트', 'notes']);
  });
});

describe('aiHelper (extractKeywordTags & summarizePageAsMarkdown)', () => {
  it('extractKeywordTags는 불용어/조사를 제외하고 제목·본문 핵심 키워드 태그를 추출한다', () => {
    const tags = extractKeywordTags(
      'React 상태관리와 TypeScript 성능 최적화 가이드',
      'React 애플리케이션에서 TypeScript 타입 안정성과 상태관리 성능 최적화는 매우 중요합니다. React와 TypeScript를 함께 사용하면 유지보수가 쉬워집니다.',
      5,
    );
    expect(tags.length).toBeGreaterThanOrEqual(3);
    expect(tags.length).toBeLessThanOrEqual(5);
    expect(tags).toContain('React');
    expect(tags).toContain('TypeScript');
    for (const tag of tags) {
      expect(tag).not.toMatch(/\s/);
      expect(tag).not.toMatch(/^#/);
    }
  });

  it('summarizePageAsMarkdown은 Chrome AI가 없을 때 로컬 마크다운 요약과 키워드 태그를 반환한다', async () => {
    const result = await summarizePageAsMarkdown(
      'BullsNote 웹 클리퍼 업데이트',
      'BullsNote 웹 클리퍼는 브라우저에서 웹 문서를 마크다운으로 빠르게 저장할 수 있는 확장 프로그램입니다. 사이드패널에서 핵심 요약과 키워드 태그를 자동으로 생성합니다. 로컬 큐 기능을 통해 앱이 꺼져 있어도 안전하게 보관됩니다.',
    );

    expect(result.engine).toBe('fallback');
    expect(result.markdown).toContain('## 핵심 요약');
    expect(result.markdown).toContain('- ');
    expect(result.tags.length).toBeGreaterThanOrEqual(3);
    expect(result.tags.length).toBeLessThanOrEqual(5);
    expect(result.tags).toContain('BullsNote');
  });

  it('summarizePageAsMarkdown은 customInstructions를 Summarizer context 및 LanguageModel system 프롬프트에 전달하고 지침 에코를 거부한다', async () => {
    const g = globalThis as Record<string, unknown>;
    const origSummarizer = g.Summarizer;
    const origLanguageModel = g.LanguageModel;

    const customInstructions = '- 수치와 실행 포인트를 우선으로 3줄 요약하세요.';

    try {
      const summarizeMock = vi.fn().mockResolvedValue('- 핵심 수치 42% 개선\n- 즉시 배포 가능');
      g.Summarizer = {
        availability: vi.fn().mockResolvedValue('available'),
        create: vi.fn().mockResolvedValue({
          summarize: summarizeMock,
          destroy: vi.fn(),
        }),
      };

      const sumRes = await summarizePageAsMarkdown(
        '성능 개선 보고서',
        '이번 릴리스에서는 렌더링 속도가 42% 개선되었습니다. 바로 배포를 진행할 수 있습니다.',
        customInstructions,
      );
      expect(sumRes.engine).toBe('chrome-ai');
      expect(summarizeMock).toHaveBeenCalledWith(expect.any(String), {
        context: customInstructions,
      });

      delete g.Summarizer;
      const lmCreateMock = vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue('- 수치와 실행 포인트를 우선으로 3줄 요약하세요.'),
        destroy: vi.fn(),
      });
      g.LanguageModel = {
        availability: vi.fn().mockResolvedValue('available'),
        create: lmCreateMock,
      };

      const echoRes = await summarizePageAsMarkdown(
        '성능 개선 보고서',
        '이번 릴리스에서는 렌더링 속도가 42% 개선되었습니다. 바로 배포를 진행할 수 있습니다.',
        customInstructions,
      );

      expect(lmCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          initialPrompts: [
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining(customInstructions),
            }),
          ],
        }),
      );
      expect(echoRes.engine).toBe('fallback');
      expect(echoRes.markdown).toContain('## 핵심 요약');
    } finally {
      if (origSummarizer === undefined) delete g.Summarizer;
      else g.Summarizer = origSummarizer;
      if (origLanguageModel === undefined) delete g.LanguageModel;
      else g.LanguageModel = origLanguageModel;
    }
  });
});

describe('extension version sync', () => {
  it('extension/package.json과 extension/manifest.json의 버전이 0.2.0으로 일치한다', () => {
    const extDir = path.resolve(__dirname, '../../../extension');
    const pkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8')) as { version: string };
    const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8')) as { version: string };

    expect(pkg.version).toBe('0.2.0');
    expect(manifest.version).toBe(pkg.version);
  });
});

describe('electron/clipper-bridge.js', () => {
  afterEach(async () => {
    await bridge.stopClipperBridge();
  });

  it('validateClipPayload는 유효한 mode만 허용하고 태그를 정규화한다', () => {
    expect(bridge.validateClipPayload({ mode: 'invalid' }).ok).toBe(false);
    const valid = bridge.validateClipPayload({
      mode: 'todo',
      title: '  할일 제목  ',
      tags: ['#업무', '업무', '  중요 '],
      quickCaptureText: '내일 3시 회의',
    });
    expect(valid.ok).toBe(true);
    expect(valid.payload?.title).toBe('할일 제목');
    expect(valid.payload?.tags).toEqual(['업무', '중요']);
  });

  it('GET /health는 Origin/Token 없이도 200을 반환하고 POST /clip은 Origin 또는 X-BullsNote-Token이 없으면 403으로 차단한다', async () => {
    const info = await bridge.startClipperBridge(() => null, { port: 0, token: 'secret-token-1234', version: '2.0.3' });
    expect(info.running).toBe(true);
    const port = info.port!;

    const noHeadersHealth = await httpRequest(port, 'GET', '/health');
    expect(noHeadersHealth.status).toBe(200);
    expect(JSON.parse(noHeadersHealth.body)).toEqual({
      ok: true,
      app: 'BullsNote',
      version: '2.0.3',
      port,
    });
    expect(noHeadersHealth.headers['access-control-allow-origin']).toBeUndefined();

    const evilOriginHealth = await httpRequest(port, 'GET', '/health', { Origin: 'https://evil.example.com' });
    expect(evilOriginHealth.status).toBe(403);

    const noHeadersClip = await httpRequest(
      port,
      'POST',
      '/clip',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ mode: 'note', title: '무단 요청' }),
    );
    expect(noHeadersClip.status).toBe(403);

    const evilOriginClip = await httpRequest(
      port,
      'POST',
      '/clip',
      { Origin: 'https://evil.example.com', 'Content-Type': 'application/json' },
      JSON.stringify({ mode: 'note', title: '무단 요청' }),
    );
    expect(evilOriginClip.status).toBe(403);

    const optionsForbidden = await httpRequest(port, 'OPTIONS', '/clip', { Origin: 'https://evil.example.com' });
    expect(optionsForbidden.status).toBe(403);
  });

  it('chrome-extension:// Origin 및 유효한 토큰 요청을 허용하고 /health와 OPTIONS를 처리한다', async () => {
    const info = await bridge.startClipperBridge(() => null, { port: 0, token: 'secret-token-1234', version: '2.0.3' });
    const port = info.port!;

    const preflight = await httpRequest(port, 'OPTIONS', '/clip', {
      Origin: 'chrome-extension://abcdefg',
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('chrome-extension://abcdefg');

    const health = await httpRequest(port, 'GET', '/health', {
      Origin: 'chrome-extension://abcdefg',
    });
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toEqual({
      ok: true,
      app: 'BullsNote',
      version: '2.0.3',
      port,
    });

    const tokenHealth = await httpRequest(port, 'GET', '/health', {
      'X-BullsNote-Token': 'secret-token-1234',
    });
    expect(tokenHealth.status).toBe(200);
  });

  it('POST /clip은 mainWindow로 clipper:incoming IPC를 전달하고 창이 없으면 delivered: false를 반환한다', async () => {
    const sendMock = vi.fn();
    let currentWin: { isDestroyed: () => boolean; webContents: { send: (ch: string, data: unknown) => void } } | null = {
      isDestroyed: () => false,
      webContents: { send: sendMock },
    };

    const info = await bridge.startClipperBridge(() => currentWin, { port: 0, token: 'secret-token-1234' });
    const port = info.port!;

    const res = await httpRequest(
      port,
      'POST',
      '/clip',
      {
        Origin: 'chrome-extension://abcdefg',
        'Content-Type': 'application/json',
      },
      JSON.stringify({
        mode: 'note',
        title: '테스트 클립',
        url: 'https://example.com',
        content: '본문 내용',
        tags: ['clip'],
      }),
    );

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, delivered: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toBe('clipper:incoming');
    expect((sendMock.mock.calls[0][1] as Record<string, unknown>).title).toBe('테스트 클립');

    currentWin = null;
    const resNoWin = await httpRequest(
      port,
      'POST',
      '/clip',
      {
        'X-BullsNote-Token': 'secret-token-1234',
        'Content-Type': 'application/json',
      },
      JSON.stringify({ mode: 'daily', title: '데일리 메모' }),
    );
    expect(resNoWin.status).toBe(200);
    expect(JSON.parse(resNoWin.body)).toEqual({ ok: true, delivered: false });
  });

  it('잘못된 mode와 512KB 초과 본문을 거부한다', async () => {
    const info = await bridge.startClipperBridge(() => null, { port: 0, token: 'secret-token-1234' });
    const port = info.port!;

    const badMode = await httpRequest(
      port,
      'POST',
      '/clip',
      {
        Origin: 'chrome-extension://abcdefg',
        'Content-Type': 'application/json',
      },
      JSON.stringify({ mode: 'unknown', title: 'x' }),
    );
    expect(badMode.status).toBe(400);

    const oversized = JSON.stringify({
      mode: 'note',
      content: 'a'.repeat(bridge.MAX_BODY_BYTES + 1024),
    });
    const tooLarge = await httpRequest(
      port,
      'POST',
      '/clip',
      {
        Origin: 'chrome-extension://abcdefg',
        'Content-Type': 'application/json',
      },
      oversized,
    );
    expect(tooLarge.status).toBe(413);
  });

  it('지정 포트가 이미 사용 중(EADDRINUSE)이면 포트 0으로 폴백한다', async () => {
    const blocker = http.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', () => resolve()));
    const blockerPort = (blocker.address() as { port: number }).port;

    try {
      const info = await bridge.startClipperBridge(() => null, { port: blockerPort, token: 'tok' });
      expect(info.running).toBe(true);
      expect(info.port).not.toBe(blockerPort);
      expect(info.port).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
