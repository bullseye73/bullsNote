// 파일 볼트 IPC (main + 테스트 공용)
const { dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const ID_RE = /^[A-Za-z0-9_-]+$/;
const ASSET_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

function settingsPath(app) {
  return path.join(app.getPath('userData'), 'vault.json');
}

async function readSettings(app) {
  try {
    const raw = await fs.readFile(settingsPath(app), 'utf8');
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function writeSettings(app, patch) {
  const cur = await readSettings(app);
  await fs.mkdir(path.dirname(settingsPath(app)), { recursive: true });
  await fs.writeFile(settingsPath(app), JSON.stringify({ ...cur, ...patch }, null, 2));
}

function defaultVaultPath(app) {
  return path.join(app.getPath('documents'), 'BullsNote');
}

function validateVaultPath(p) {
  if (typeof p !== 'string' || !p.trim()) {
    throw new Error('올바른 경로를 입력해야 합니다.');
  }
  const resolved = path.resolve(p);
  if (!path.isAbsolute(resolved)) {
    throw new Error('절대 경로를 지정해야 합니다.');
  }
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) {
    throw new Error('시스템 최상위 루트 디렉토리는 볼트로 지정할 수 없습니다.');
  }
  return resolved;
}

async function resolveVault(app) {
  const s = await readSettings(app);
  return s.vaultPath || defaultVaultPath(app);
}

async function ensureVault(root) {
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });
}

function noteFile(root, id) {
  if (!ID_RE.test(id)) throw new Error(`invalid note id: ${id}`);
  return path.join(root, `${id}.md`);
}

function assetFile(root, name) {
  if (!ASSET_RE.test(name)) throw new Error(`invalid asset name: ${name}`);
  return path.join(root, 'assets', name);
}

function registerVaultIpc(app) {
  ipcMain.handle('vault:getPath', async () => resolveVault(app));
  ipcMain.handle('vault:setPath', async (_e, p) => {
    const validPath = validateVaultPath(p);
    await writeSettings(app, { vaultPath: validPath });
    await ensureVault(validPath);
    return validPath;
  });
  ipcMain.handle('vault:pickDir', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || r.filePaths.length === 0) return null;
    const p = validateVaultPath(r.filePaths[0]);
    await writeSettings(app, { vaultPath: p });
    await ensureVault(p);
    return p;
  });
  ipcMain.handle('vault:list', async () => {
    const root = await resolveVault(app);
    await ensureVault(root);
    const entries = await fs.readdir(root, { withFileTypes: true });
    const out = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue;
      const id = e.name.slice(0, -3);
      if (!ID_RE.test(id)) continue;
      const st = await fs.stat(path.join(root, e.name));
      out.push({ id, mtimeMs: st.mtimeMs });
    }
    return { root, files: out };
  });
  ipcMain.handle('vault:read', async (_e, id) => {
    const root = await resolveVault(app);
    try {
      return await fs.readFile(noteFile(root, id), 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    }
  });
  ipcMain.handle('vault:write', async (_e, id, text) => {
    const root = await resolveVault(app);
    await ensureVault(root);
    await fs.writeFile(noteFile(root, id), text, 'utf8');
    return true;
  });
  ipcMain.handle('vault:delete', async (_e, id) => {
    const root = await resolveVault(app);
    try {
      await fs.unlink(noteFile(root, id));
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
    return true;
  });
  ipcMain.handle('vault:writeAsset', async (_e, name, base64) => {
    if (typeof base64 !== 'string' || base64.length > 50 * 1024 * 1024) {
      throw new Error('에셋 크기가 제한(50MB)을 초과했습니다.');
    }
    const root = await resolveVault(app);
    await ensureVault(root);
    await fs.writeFile(assetFile(root, name), Buffer.from(base64, 'base64'));
    return `assets/${name}`;
  });
  ipcMain.handle('vault:readAsset', async (_e, name) => {
    const root = await resolveVault(app);
    try {
      const buf = await fs.readFile(assetFile(root, name));
      const ext = (name.split('.').pop() || '').toLowerCase();
      const mime =
        ext === 'png' ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'gif' ? 'image/gif'
        : ext === 'webp' ? 'image/webp'
        : ext === 'svg' ? 'image/svg+xml'
        : ext === 'bmp' ? 'image/bmp'
        : 'application/octet-stream';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    }
  });
  ipcMain.handle('vault:readSidecar', async () => {
    const root = await resolveVault(app);
    try {
      return JSON.parse(await fs.readFile(path.join(root, '.bullsnote.json'), 'utf8'));
    } catch {
      return {};
    }
  });
  ipcMain.handle('vault:writeSidecar', async (_e, data) => {
    if (!data || typeof data !== 'object') {
      throw new Error('사이드카 데이터 형식이 올바르지 않습니다.');
    }
    const serialized = JSON.stringify(data, null, 2);
    if (serialized.length > 10 * 1024 * 1024) {
      throw new Error('사이드카 데이터 크기가 제한(10MB)을 초과했습니다.');
    }
    const root = await resolveVault(app);
    await ensureVault(root);
    await fs.writeFile(path.join(root, '.bullsnote.json'), serialized, 'utf8');
    return true;
  });
}

module.exports = { registerVaultIpc };
