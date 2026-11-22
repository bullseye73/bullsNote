// 로컬 Chrome 확장프로그램(BullsNote Clipper)과 통신하는 127.0.0.1 HTTP 브리지 서버
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = 41905;
const MAX_BODY_BYTES = 512 * 1024; // 512 KB
const VALID_MODES = new Set(['note', 'todo', 'daily']);

let serverInstance = null;
let boundPort = null;
let bridgeToken = null;
let cachedVersion = null;

function resolveAppVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    const pkg = require('../package.json');
    cachedVersion = pkg && pkg.version ? String(pkg.version) : '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }
  return cachedVersion;
}

function resolveOrCreateToken(customToken) {
  if (typeof customToken === 'string' && customToken.trim()) {
    return customToken.trim();
  }
  try {
    const electron = require('electron');
    const app = electron && electron.app;
    if (app && typeof app.getPath === 'function') {
      const userDataDir = app.getPath('userData');
      const tokenPath = path.join(userDataDir, 'clipper-token');
      try {
        const existing = fs.readFileSync(tokenPath, 'utf8').trim();
        if (existing.length >= 16) return existing;
      } catch {
        // 토큰 파일이 없으면 새로 생성
      }
      const generated = crypto.randomBytes(24).toString('hex');
      try {
        fs.mkdirSync(userDataDir, { recursive: true });
        fs.writeFileSync(tokenPath, generated, { mode: 0o600 });
      } catch {
        // 쓰기 실패 시 메모리 토큰으로 동작
      }
      return generated;
    }
  } catch {
    // Electron 외부(예: Vitest 단위 테스트) 환경
  }
  return crypto.randomBytes(24).toString('hex');
}

function getCorsOrigin(req) {
  const origin = req && req.headers ? req.headers.origin : undefined;
  if (typeof origin === 'string' && origin.startsWith('chrome-extension://')) {
    return origin;
  }
  return null;
}

function isAuthorizedRequest(req, token) {
  const corsOrigin = getCorsOrigin(req);
  if (corsOrigin) return true;
  const headerToken = req && req.headers ? req.headers['x-bullsnote-token'] : undefined;
  if (typeof headerToken === 'string' && token && headerToken === token) {
    return true;
  }
  return false;
}

function validateClipPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid JSON payload' };
  }
  const mode = typeof raw.mode === 'string' ? raw.mode.trim() : '';
  if (!VALID_MODES.has(mode)) {
    return { ok: false, error: "Invalid mode: expected 'note' | 'todo' | 'daily'" };
  }

  const normalizeStr = (val, maxLen) =>
    typeof val === 'string' ? val.trim().slice(0, maxLen) : '';

  const tags = Array.isArray(raw.tags)
    ? Array.from(
        new Set(
          raw.tags
            .filter((t) => typeof t === 'string')
            .map((t) => t.trim().replace(/^#/, ''))
            .filter(Boolean),
        ),
      ).slice(0, 30)
    : [];

  return {
    ok: true,
    payload: {
      mode,
      title: normalizeStr(raw.title, 500),
      content: typeof raw.content === 'string' ? raw.content.slice(0, 200000) : '',
      url: normalizeStr(raw.url, 4096),
      tags,
      quickCaptureText: normalizeStr(raw.quickCaptureText, 1000),
      updateExisting: raw.updateExisting !== false,
      projectId: normalizeStr(raw.projectId, 128),
      clippedAt: Date.now(),
    },
  };
}

function sendJson(res, statusCode, body, corsOrigin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  if (corsOrigin) {
    headers['Access-Control-Allow-Origin'] = corsOrigin;
    headers['Vary'] = 'Origin';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, X-BullsNote-Token';
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(body));
}

function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        settled = true;
        const err = new Error('Payload too large');
        err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      const rawText = Buffer.concat(chunks).toString('utf8');
      if (!rawText.trim()) {
        const err = new Error('Empty request body');
        err.statusCode = 400;
        reject(err);
        return;
      }
      try {
        resolve(JSON.parse(rawText));
      } catch {
        const err = new Error('Malformed JSON');
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

function createClipperRequestHandler(getMainWindow, token, version) {
  return async (req, res) => {
    const corsOrigin = getCorsOrigin(req);
    const reqPath = (req.url || '/').split('?')[0];

    if (req.method === 'GET' && reqPath === '/health') {
      const origin = req && req.headers ? req.headers.origin : undefined;
      if (origin && !isAuthorizedRequest(req, token)) {
        sendJson(res, 403, { ok: false, error: 'Forbidden' }, null);
        return;
      }
      const address = serverInstance && typeof serverInstance.address === 'function' ? serverInstance.address() : null;
      const activePort = boundPort || (address && typeof address === 'object' ? address.port : DEFAULT_PORT);
      sendJson(
        res,
        200,
        {
          ok: true,
          app: 'BullsNote',
          version,
          port: activePort,
        },
        corsOrigin,
      );
      return;
    }

    if (!isAuthorizedRequest(req, token)) {
      sendJson(res, 403, { ok: false, error: 'Forbidden' }, null);
      return;
    }

    if (req.method === 'OPTIONS') {
      const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-BullsNote-Token',
        'Access-Control-Max-Age': '86400',
      };
      if (corsOrigin) {
        headers['Access-Control-Allow-Origin'] = corsOrigin;
        headers['Vary'] = 'Origin';
      }
      res.writeHead(204, headers);
      res.end();
      return;
    }

    if (req.method === 'POST' && reqPath === '/clip') {
      let body;
      try {
        body = await readJsonBody(req, MAX_BODY_BYTES);
      } catch (err) {
        const status = err && err.statusCode ? err.statusCode : 400;
        sendJson(res, status, { ok: false, error: err.message || 'Bad Request' }, corsOrigin);
        return;
      }

      const validated = validateClipPayload(body);
      if (!validated.ok) {
        sendJson(res, 400, { ok: false, error: validated.error }, corsOrigin);
        return;
      }

      const win = typeof getMainWindow === 'function' ? getMainWindow() : null;
      let delivered = false;
      if (win && typeof win.isDestroyed === 'function' && !win.isDestroyed() && win.webContents) {
        win.webContents.send('clipper:incoming', validated.payload);
        delivered = true;
      }

      sendJson(res, 200, { ok: true, delivered }, corsOrigin);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' }, corsOrigin);
  };
}

function listenOnPort(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      const addr = server.address();
      resolve(addr && typeof addr === 'object' ? addr.port : port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function startClipperBridge(getMainWindow, options = {}) {
  if (serverInstance) {
    return getClipperInfo();
  }

  const version = options.version || resolveAppVersion();
  bridgeToken = resolveOrCreateToken(options.token);
  const preferredPort = typeof options.port === 'number' ? options.port : DEFAULT_PORT;

  const server = http.createServer(createClipperRequestHandler(getMainWindow, bridgeToken, version));
  serverInstance = server;

  try {
    boundPort = await listenOnPort(server, preferredPort);
  } catch (err) {
    if (err && err.code === 'EADDRINUSE' && preferredPort !== 0) {
      boundPort = await listenOnPort(server, 0);
    } else {
      serverInstance = null;
      boundPort = null;
      throw err;
    }
  }

  return getClipperInfo();
}

function stopClipperBridge() {
  return new Promise((resolve) => {
    if (!serverInstance) {
      boundPort = null;
      resolve();
      return;
    }
    const srv = serverInstance;
    serverInstance = null;
    boundPort = null;
    srv.close(() => resolve());
  });
}

function getClipperInfo() {
  return {
    running: Boolean(serverInstance && boundPort),
    port: boundPort,
    url: boundPort ? `http://127.0.0.1:${boundPort}` : null,
    token: bridgeToken,
    version: resolveAppVersion(),
  };
}

module.exports = {
  DEFAULT_PORT,
  MAX_BODY_BYTES,
  startClipperBridge,
  stopClipperBridge,
  getClipperInfo,
  validateClipPayload,
  isAuthorizedRequest,
  getCorsOrigin,
};
