// AI 클라이언트(Claude Desktop, Gemini CLI)에 BullsNote MCP 서버를 등록/해제하는 IPC
const { secureHandle } = require('./ipc-guard');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');

const SERVER_KEY = 'bullsnote';

function clientDefs() {
  const home = os.homedir();
  const claudeDir =
    process.platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support', 'Claude')
      : process.platform === 'win32'
        ? path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude')
        : path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Claude');
  return [
    { id: 'claude-desktop', name: 'Claude Desktop', configPath: path.join(claudeDir, 'claude_desktop_config.json') },
    { id: 'gemini-cli', name: 'Gemini CLI', configPath: path.join(home, '.gemini', 'settings.json') },
  ];
}

/** AI 클라이언트 설정에 기록할 실행 항목. 앱 실행 파일을 Node 모드로 띄우므로 사용자 PC에 Node 가 없어도 된다 */
function serverEntry(app) {
  // 패키징 시 asarUnpack 으로 풀린 실제 파일 경로를 가리켜야 외부 프로세스가 실행할 수 있다
  const script = path.join(__dirname, 'mcp', 'server.js').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  return {
    command: process.execPath,
    args: [script],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      BULLSNOTE_USER_DATA: app.getPath('userData'),
      BULLSNOTE_DEFAULT_VAULT: path.join(app.getPath('documents'), 'BullsNote'),
    },
  };
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** 설정 파일을 읽는다. 파일이 없으면 빈 객체, JSON 이 깨져 있으면 덮어쓰지 않도록 예외 */
async function readConfig(file) {
  let raw;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    throw err;
  }
  const text = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).trim();
  if (!text) return {};
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`설정 파일을 해석할 수 없어 변경하지 않았습니다: ${file}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`설정 파일 형식이 올바르지 않아 변경하지 않았습니다: ${file}`);
  }
  return data;
}

async function writeConfig(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try {
    await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

function sameEntry(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function clientStatus(def, entry) {
  const installed = await exists(path.dirname(def.configPath));
  let connected = false;
  let upToDate = false;
  let error;
  if (installed) {
    try {
      const cur = (await readConfig(def.configPath)).mcpServers;
      const mine = cur && typeof cur === 'object' ? cur[SERVER_KEY] : undefined;
      connected = !!mine;
      upToDate = connected && sameEntry(mine, entry);
    } catch (err) {
      error = err.message;
    }
  }
  return { id: def.id, name: def.name, configPath: def.configPath, installed, connected, upToDate, error };
}

async function getStatus(app) {
  const entry = serverEntry(app);
  const clients = [];
  for (const def of clientDefs()) clients.push(await clientStatus(def, entry));
  return { entry, clients };
}

function findClient(id) {
  const def = clientDefs().find((c) => c.id === id);
  if (!def) throw new Error('지원하지 않는 AI 클라이언트입니다.');
  return def;
}

async function connect(app, id) {
  const def = findClient(id);
  if (!(await exists(path.dirname(def.configPath)))) {
    throw new Error(`${def.name} 설정 폴더를 찾을 수 없습니다. 먼저 ${def.name}을(를) 설치하고 한 번 실행해주세요.`);
  }
  const cfg = await readConfig(def.configPath);
  const servers = cfg.mcpServers && typeof cfg.mcpServers === 'object' ? cfg.mcpServers : {};
  await writeConfig(def.configPath, { ...cfg, mcpServers: { ...servers, [SERVER_KEY]: serverEntry(app) } });
}

async function disconnect(id) {
  const def = findClient(id);
  const cfg = await readConfig(def.configPath);
  if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object' || !(SERVER_KEY in cfg.mcpServers)) return;
  const servers = { ...cfg.mcpServers };
  delete servers[SERVER_KEY];
  await writeConfig(def.configPath, { ...cfg, mcpServers: servers });
}

/** 이미 연결된 클라이언트의 실행 경로를 현재 설치 위치로 갱신 (앱 업데이트·이동 대응). 연결한 적 없는 클라이언트는 건드리지 않는다 */
async function refreshConnected(app) {
  const entry = serverEntry(app);
  for (const def of clientDefs()) {
    try {
      const st = await clientStatus(def, entry);
      if (st.connected && !st.upToDate) await connect(app, def.id);
    } catch (err) {
      console.warn(`[BullsNote] MCP 연결 갱신 실패 (${def.name}):`, err.message);
    }
  }
}

function registerMcpIpc(app) {
  secureHandle('mcp:status', () => getStatus(app));
  secureHandle('mcp:connect', async (_e, id) => {
    await connect(app, id);
    return getStatus(app);
  });
  secureHandle('mcp:disconnect', async (_e, id) => {
    await disconnect(id);
    return getStatus(app);
  });
  // 개발 실행(electron .)이 설치본의 연결 설정을 덮어쓰지 않도록 패키징된 앱에서만 자동 갱신
  if (app.isPackaged) void refreshConnected(app);
}

module.exports = { registerMcpIpc };
