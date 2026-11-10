// 파일 볼트 IPC (main + 테스트 공용)
const { dialog } = require('electron');
const { secureHandle } = require('./ipc-guard');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');

const ID_RE = /^[A-Za-z0-9_-]+$/;
const ASSET_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];
const ASSET_RE = new RegExp(`^[A-Za-z0-9_-]+\\.(${ASSET_EXTS.join('|')})$`, 'i');

/** 원자적 쓰기: 임시 파일에 기록 후 rename (쓰기 도중 크래시 시 파일 손상 방지) */
async function writeFileAtomic(file, data, encoding) {
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try {
    await fs.writeFile(tmp, data, encoding);
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

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
  await writeFileAtomic(settingsPath(app), JSON.stringify({ ...cur, ...patch }, null, 2), 'utf8');
}

function defaultVaultPath(app) {
  return path.join(app.getPath('documents'), 'BullsNote');
}

/** 볼트로 지정하면 안 되는 시스템/설정 디렉토리 목록 (해당 경로 자체 및 하위 전체 금지) */
function forbiddenRoots(app) {
  const home = os.homedir();
  const list = [app.getPath('userData'), app.getPath('appData')];
  if (process.platform === 'darwin') {
    list.push('/System', '/Library', '/usr', '/bin', '/sbin', '/etc', '/private', '/var', '/opt', '/Applications');
    list.push(path.join(home, 'Library'));
  } else if (process.platform === 'win32') {
    const env = process.env;
    for (const v of [env.SystemRoot, env.windir, env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramData, env.APPDATA, env.LOCALAPPDATA]) {
      if (v) list.push(v);
    }
  } else {
    list.push('/bin', '/boot', '/dev', '/etc', '/lib', '/lib64', '/proc', '/root', '/run', '/sbin', '/sys', '/usr', '/var', '/opt');
    list.push(path.join(home, '.config'), path.join(home, '.local'));
  }
  return list.filter(Boolean).map((p) => path.resolve(p));
}

function isSameOrInside(child, parent) {
  const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const rel = path.relative(norm(parent), norm(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** 심볼릭 링크를 해소한 실제 경로 (존재하지 않는 하위 경로는 가장 가까운 상위 실경로 기준) */
async function realpathLoose(p) {
  const rest = [];
  let cur = p;
  for (;;) {
    try {
      const real = await fs.realpath(cur);
      return path.join(real, ...rest.reverse());
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return p;
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
}

async function validateVaultPath(app, p) {
  if (typeof p !== 'string' || !p.trim() || p.length > 1024 || p.includes('\0')) {
    throw new Error('올바른 경로를 입력해야 합니다.');
  }
  if (!path.isAbsolute(p.trim())) {
    throw new Error('절대 경로를 지정해야 합니다.');
  }
  const resolved = await realpathLoose(path.resolve(p.trim()));
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) {
    throw new Error('시스템 최상위 루트 디렉토리는 볼트로 지정할 수 없습니다.');
  }
  const home = await realpathLoose(os.homedir());
  if (resolved === home) {
    throw new Error('홈 디렉토리 자체는 볼트로 지정할 수 없습니다. 하위 폴더를 선택해주세요.');
  }
  // 숨김 디렉토리(.ssh, .config, .git 등) 하위 금지
  const segments = path.relative(parsed.root, resolved).split(path.sep);
  if (segments.some((seg) => seg.startsWith('.'))) {
    throw new Error('숨김 폴더(.으로 시작하는 폴더)는 볼트로 지정할 수 없습니다.');
  }
  // macOS iCloud Drive / 클라우드 동기화 폴더(Dropbox, Google Drive 등)는 ~/Library 하위지만 허용
  const cloudAllowed =
    process.platform === 'darwin' &&
    [path.join(home, 'Library', 'Mobile Documents'), path.join(home, 'Library', 'CloudStorage')].some(
      (allowed) => isSameOrInside(resolved, allowed) && resolved !== allowed,
    );
  for (const forbidden of cloudAllowed ? [] : forbiddenRoots(app)) {
    // 홈 하위의 일반 폴더(예: ~/Documents)는 /var, /private 등 시스템 경로 규칙과 무관하게 허용
    if (isSameOrInside(resolved, forbidden) && !(isSameOrInside(resolved, home) && !isSameOrInside(forbidden, home))) {
      throw new Error('시스템 또는 애플리케이션 설정 디렉토리는 볼트로 지정할 수 없습니다.');
    }
  }
  return resolved;
}

async function resolveVault(app) {
  const s = await readSettings(app);
  if (s.vaultPath) {
    try {
      return await validateVaultPath(app, s.vaultPath);
    } catch (err) {
      console.warn('[BullsNote] 저장된 볼트 경로가 허용되지 않아 기본 경로를 사용합니다:', err.message);
    }
  }
  return defaultVaultPath(app);
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
  secureHandle('vault:getPath', async () => resolveVault(app));
  secureHandle('vault:setPath', async (_e, p) => {
    const validPath = await validateVaultPath(app, p);
    await writeSettings(app, { vaultPath: validPath });
    await ensureVault(validPath);
    return validPath;
  });
  secureHandle('vault:pickDir', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || r.filePaths.length === 0) return null;
    const p = await validateVaultPath(app, r.filePaths[0]);
    await writeSettings(app, { vaultPath: p });
    await ensureVault(p);
    return p;
  });
  secureHandle('vault:list', async () => {
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
  secureHandle('vault:read', async (_e, id) => {
    const root = await resolveVault(app);
    try {
      return await fs.readFile(noteFile(root, id), 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    }
  });
  secureHandle('vault:write', async (_e, id, text) => {
    const root = await resolveVault(app);
    await ensureVault(root);
    if (typeof text !== 'string' || text.length > 50 * 1024 * 1024) {
      throw new Error('노트 데이터 형식이 올바르지 않거나 크기 제한(50MB)을 초과했습니다.');
    }
    const file = noteFile(root, id);
    await writeFileAtomic(file, text, 'utf8');
    // 저장 직후 mtime 반환 (렌더러가 매번 vault:list 로 전체 디렉토리를 다시 스캔하지 않도록)
    const st = await fs.stat(file);
    return st.mtimeMs;
  });
  secureHandle('vault:delete', async (_e, id) => {
    const root = await resolveVault(app);
    try {
      await fs.unlink(noteFile(root, id));
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
    return true;
  });
  secureHandle('vault:writeAsset', async (_e, name, base64) => {
    if (typeof base64 !== 'string' || base64.length > 50 * 1024 * 1024) {
      throw new Error('에셋 크기가 제한(50MB)을 초과했습니다.');
    }
    const root = await resolveVault(app);
    await ensureVault(root);
    const file = assetFile(root, name);
    // 콘텐츠 해시 기반 파일명이면 이미 존재하는 경우 재기록 생략
    try {
      await fs.access(file);
      return `assets/${name}`;
    } catch {
      /* not exists */
    }
    await writeFileAtomic(file, Buffer.from(base64, 'base64'));
    return `assets/${name}`;
  });
  secureHandle('vault:readAsset', async (_e, name) => {
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
        : ext === 'avif' ? 'image/avif'
        : 'application/octet-stream';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    }
  });
  secureHandle('vault:readSidecar', async () => {
    const root = await resolveVault(app);
    try {
      return JSON.parse(await fs.readFile(path.join(root, '.bullsnote.json'), 'utf8'));
    } catch {
      return {};
    }
  });
  secureHandle('vault:writeSidecar', async (_e, data) => {
    if (!data || typeof data !== 'object') {
      throw new Error('사이드카 데이터 형식이 올바르지 않습니다.');
    }
    const serialized = JSON.stringify(data, null, 2);
    if (serialized.length > 10 * 1024 * 1024) {
      throw new Error('사이드카 데이터 크기가 제한(10MB)을 초과했습니다.');
    }
    const root = await resolveVault(app);
    await ensureVault(root);
    await writeFileAtomic(path.join(root, '.bullsnote.json'), serialized, 'utf8');
    return true;
  });
}

module.exports = { registerVaultIpc, validateVaultPath };
