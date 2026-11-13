#!/usr/bin/env node
// BullsNote MCP 서버 (stdio, 의존성 없음)
// AI 클라이언트(Claude Desktop, Gemini CLI 등)가 자식 프로세스로 실행하며,
// 볼트 폴더에 frontmatter + Markdown 노트 파일을 직접 기록한다.
// 실행 중인 앱은 외부 변경 폴링으로 새 파일을 인식하고, Google Drive 동기화는 앱이 처리한다.
'use strict';

const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const readline = require('readline');
const todos = require('./todos');
const { serializeNoteFile } = todos;

const SERVER_NAME = 'bullsnote';
const SERVER_VERSION = '1.1.0';
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

/** 프로젝트를 지정하지 않았을 때 저장되는 전용 프로젝트 (앱에서 이름을 바꿔도 id로 찾는다) */
const AI_PROJECT_ID = 'proj-ai-notes';
const AI_PROJECT_NAME = 'AI 노트';
const AI_PROJECT_ICON = '🤖';
/** 할일관리 프로젝트는 todoMeta 가 필요한 시스템 프로젝트라 저장 대상에서 제외 (src/model/TodoService.ts 와 동일) */
const TODO_PROJECT_ID = todos.TODO_PROJECT_ID;

const MAX_TITLE_LEN = 200;
const MAX_CONTENT_LEN = 1024 * 1024;
const MAX_TAGS = 12;

// ---------------------------------------------------------------------------
// 볼트 경로
// ---------------------------------------------------------------------------

function userDataDir() {
  if (process.env.BULLSNOTE_USER_DATA) return process.env.BULLSNOTE_USER_DATA;
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'BullsNote');
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'BullsNote');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'BullsNote');
}

/** 호출할 때마다 다시 읽는다 (앱에서 저장 폴더를 바꾸면 바로 따라가도록) */
async function resolveVault() {
  if (process.env.BULLSNOTE_VAULT) return path.resolve(process.env.BULLSNOTE_VAULT);
  try {
    const raw = await fs.readFile(path.join(userDataDir(), 'vault.json'), 'utf8');
    const settings = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    if (typeof settings.vaultPath === 'string' && path.isAbsolute(settings.vaultPath.trim())) {
      return path.resolve(settings.vaultPath.trim());
    }
  } catch {
    /* 설정 없음 -> 기본 경로 */
  }
  return process.env.BULLSNOTE_DEFAULT_VAULT || path.join(os.homedir(), 'Documents', 'BullsNote');
}

function sidecarPath(root) {
  return path.join(root, '.bullsnote.json');
}

async function readSidecar(root) {
  let raw;
  try {
    raw = await fs.readFile(sidecarPath(root), 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(
        `BullsNote 저장 폴더가 아직 초기화되지 않았습니다 (${root}). BullsNote 앱을 한 번 실행한 뒤 다시 시도해주세요.`,
      );
    }
    throw err;
  }
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object') throw new Error('.bullsnote.json 형식이 올바르지 않습니다.');
  return data;
}

async function writeFileAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try {
    await fs.writeFile(tmp, data, 'utf8');
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 노트 직렬화 (src/model/FileVault.ts 의 serializeNoteFile 과 동일한 형식)
// ---------------------------------------------------------------------------

function createNoteId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 앱의 해시태그 규칙(src/model/HashtagService.ts)에 맞게 정규화. 쓸 수 없는 태그는 빈 문자열 */
function normalizeTag(raw) {
  return String(raw)
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^가-힣a-zA-Z0-9_\-/]/g, '')
    .replace(/^[-/]+/, '')
    .toLowerCase();
}

function existingTags(text) {
  const out = new Set();
  const re = /(^|\s)#([가-힣a-zA-Z0-9_][가-힣a-zA-Z0-9_\-/]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[2].toLowerCase());
  return out;
}

// ---------------------------------------------------------------------------
// 도구 구현
// ---------------------------------------------------------------------------

function savableProjects(sidecar) {
  const list = Array.isArray(sidecar.projects) ? sidecar.projects : [];
  return list.filter(
    (p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.id !== TODO_PROJECT_ID,
  );
}

async function listProjects() {
  const root = await resolveVault();
  const projects = savableProjects(await readSidecar(root));
  const names = projects.map((p) => `- ${p.name}`);
  if (!projects.some((p) => p.id === AI_PROJECT_ID)) {
    names.push(`- ${AI_PROJECT_NAME} (기본 저장 위치, 첫 저장 시 자동 생성)`);
  }
  return `저장 폴더: ${root}\n프로젝트:\n${names.join('\n')}`;
}

async function saveNote(args) {
  const title = typeof args.title === 'string' ? args.title.replace(/\s+/g, ' ').trim() : '';
  if (!title) throw new Error('title 은 비어 있을 수 없습니다.');
  if (title.length > MAX_TITLE_LEN) throw new Error(`title 은 ${MAX_TITLE_LEN}자 이하여야 합니다.`);
  const content = typeof args.content === 'string' ? args.content.replace(/\r\n/g, '\n').trim() : '';
  if (!content) throw new Error('content 는 비어 있을 수 없습니다.');
  if (content.length > MAX_CONTENT_LEN) throw new Error('content 가 너무 깁니다 (최대 1MB).');

  const root = await resolveVault();
  const sidecar = await readSidecar(root);
  const projects = savableProjects(sidecar);

  let project;
  const wanted = typeof args.project === 'string' ? args.project.trim() : '';
  if (wanted) {
    project = projects.find((p) => p.name.trim().toLowerCase() === wanted.toLowerCase());
    if (!project && wanted.toLowerCase() !== AI_PROJECT_NAME.toLowerCase()) {
      const names = projects.map((p) => `"${p.name}"`).join(', ');
      throw new Error(
        `"${wanted}" 프로젝트를 찾을 수 없습니다. 사용 가능한 프로젝트: ${names || '(없음)'}. project 를 생략하면 "${AI_PROJECT_NAME}"에 저장됩니다.`,
      );
    }
  }
  if (!project) project = projects.find((p) => p.id === AI_PROJECT_ID);
  if (!project) {
    const now = Date.now();
    project = { id: AI_PROJECT_ID, name: AI_PROJECT_NAME, icon: AI_PROJECT_ICON, parentId: null, createdAt: now, updatedAt: now };
    // 직전에 다시 읽어 병합 (앱이 그 사이에 기록한 내용을 덮어쓰지 않도록)
    const latest = await readSidecar(root);
    const latestProjects = Array.isArray(latest.projects) ? latest.projects : [];
    if (!latestProjects.some((p) => p && p.id === AI_PROJECT_ID)) {
      await writeFileAtomic(
        sidecarPath(root),
        JSON.stringify({ ...latest, projects: [...latestProjects, project] }, null, 2),
      );
    }
  }

  // 태그는 앱이 본문의 #해시태그에서 추출하므로 본문 끝에 덧붙인다
  const requested = [];
  for (const t of [...(Array.isArray(args.tags) ? args.tags : []), args.source]) {
    if (typeof t !== 'string') continue;
    const tag = normalizeTag(t);
    if (tag && !requested.includes(tag)) requested.push(tag);
  }
  const present = existingTags(`${title}\n${content}`);
  const missing = requested.slice(0, MAX_TAGS).filter((t) => !present.has(t));
  const body = missing.length > 0 ? `${content}\n\n${missing.map((t) => `#${t}`).join(' ')}` : content;

  const now = Date.now();
  const { id, file } = await newNoteFile(root);
  const tags = [...existingTags(`${title}\n${body}`)].sort();
  await writeFileAtomic(
    file,
    serializeNoteFile({ id, title, projectId: project.id, color: 'blue', tags, createdAt: now, updatedAt: now }, body),
  );
  return `노트를 저장했습니다.\n- 제목: ${title}\n- 프로젝트: ${project.name}\n- 태그: ${tags.map((t) => `#${t}`).join(' ') || '(없음)'}\n- 파일: ${file}\nBullsNote 앱이 실행 중이면 몇 초 안에 목록에 나타나고, Google Drive 동기화는 앱이 처리합니다.`;
}


/** 겹치지 않는 새 노트 id 와 파일 경로 */
async function newNoteFile(root) {
  let id = createNoteId();
  let file = path.join(root, `${id}.md`);
  for (let i = 0; i < 5; i++) {
    try {
      await fs.access(file);
      id = createNoteId();
      file = path.join(root, `${id}.md`);
    } catch {
      break;
    }
  }
  return { id, file };
}

/** 저장 폴더의 모든 노트 frontmatter (본문 제외) */
async function readAllNoteMeta(root) {
  const names = (await fs.readdir(root)).filter((n) => n.endsWith('.md'));
  const out = [];
  for (const name of names) {
    try {
      const parsed = todos.parseNoteMeta(await fs.readFile(path.join(root, name), 'utf8'));
      if (parsed && typeof parsed.meta.id === 'string') out.push(parsed.meta);
    } catch {
      /* 읽을 수 없는 파일은 건너뛴다 */
    }
  }
  return out;
}

async function addTodo(args) {
  const root = await resolveVault();
  await readSidecar(root); // 초기화되지 않은 폴더면 안내 오류
  const { id, file } = await newNoteFile(root);
  const { note, body } = todos.buildTodoNote(
    { title: args.title, dueDate: args.dueDate, time: args.time, memo: args.memo },
    new Date(),
    id,
  );
  await writeFileAtomic(file, serializeNoteFile(note, body));
  const due = note.todoMeta.dueDate;
  const at = note.reminder ? new Date(note.reminder.targetAt) : null;
  const pad = (n) => String(n).padStart(2, '0');
  return [
    '할일을 추가했습니다.',
    `- 제목: ${note.title}`,
    `- 마감일: ${due || '없음'}`,
    `- 알림: ${at ? `${todos.toIsoDate(at)} ${pad(at.getHours())}:${pad(at.getMinutes())}` : '없음'}`,
    'BullsNote 앱이 실행 중이면 몇 초 안에 할일 목록에 나타납니다.',
  ].join('\n');
}

async function listToday() {
  const root = await resolveVault();
  await readSidecar(root);
  const todayIso = todos.toIsoDate(new Date());
  return todos.formatTodayBoard(todos.todayBoard(await readAllNoteMeta(root), todayIso), todayIso);
}

const TOOLS = [
  {
    name: 'save_note',
    description:
      'BullsNote(사용자의 노트 앱)에 새 노트를 저장한다. 사용자가 대화 내용을 노트로 남기거나 저장해 달라고 요청할 때 사용한다. ' +
      'content 는 대화 맥락 없이도 이해되도록 정리한 Markdown 으로 작성하고, 코드·명령어·수치·링크 같은 원문은 요약하지 말고 그대로 포함한다. ' +
      '기존 노트를 수정하지 않고 항상 새 노트를 만든다.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '노트 제목. 내용을 구체적으로 드러내는 한 줄 (최대 200자).' },
        content: {
          type: 'string',
          description: '노트 본문 (Markdown). 제목은 title 로 따로 전달하므로 본문을 # 제목으로 시작하지 않는다.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '태그 목록 (# 없이, 2~5개 권장). 본문 끝에 #해시태그로 추가된다.',
        },
        project: {
          type: 'string',
          description:
            '저장할 프로젝트(폴더) 이름. 사용자가 지정했을 때만 넣는다. 생략하면 "AI 노트" 프로젝트에 저장된다. 이름은 list_projects 로 확인한다.',
        },
        source: {
          type: 'string',
          description: '노트를 만든 AI 이름 (예: "claude", "gemini"). 태그로 함께 기록된다.',
        },
      },
      required: ['title', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_projects',
    description: 'BullsNote 의 프로젝트(폴더) 목록과 저장 폴더 경로를 조회한다. 사용자가 특정 프로젝트에 저장해 달라고 할 때 이름을 확인하는 용도.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'add_todo',
    description:
      'BullsNote 의 할일관리(To Do)에 새 할일을 추가한다. 사용자가 할 일·해야 할 것·리마인드를 남겨 달라고 할 때 사용한다. ' +
      '날짜가 "다음 주 화요일"처럼 상대적이면 오늘 날짜(list_today 로 확인 가능)를 기준으로 YYYY-MM-DD 로 바꿔 보낸다.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '할일 제목 (한 줄).' },
        dueDate: { type: 'string', description: '마감일. YYYY-MM-DD 또는 "오늘"/"내일"/"모레". 없으면 일정 없는 할일.' },
        time: { type: 'string', description: '알림 시각 HH:mm (24시간). dueDate 와 함께만 쓴다. 생략하면 마감일 09:00 알림.' },
        memo: { type: 'string', description: '할일 본문 메모 (Markdown, 선택).' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_today',
    description:
      'BullsNote 의 오늘 날짜, 오늘 할 일(지연·오늘 마감·진행 중)과 오늘 알림 일정을 조회한다. 사용자가 오늘 할 일이나 일정을 물을 때 사용한다.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

async function callTool(name, args) {
  if (name === 'save_note') return saveNote(args || {});
  if (name === 'list_projects') return listProjects();
  if (name === 'add_todo') return addTodo(args || {});
  if (name === 'list_today') return listToday();
  throw new Error(`알 수 없는 도구입니다: ${name}`);
}

// ---------------------------------------------------------------------------
// JSON-RPC (stdio, 줄 단위 JSON)
// ---------------------------------------------------------------------------

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

async function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;
  if (typeof method !== 'string') return;
  try {
    if (method === 'initialize') {
      const asked = params && params.protocolVersion;
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions:
            '사용자가 대화 내용을 노트로 저장해 달라고 하면 save_note 를 사용한다. 저장 후에는 제목과 저장된 프로젝트를 한 줄로 알려준다. ' +
            '할 일을 남겨 달라고 하면 add_todo, 오늘 할 일·일정을 물으면 list_today 를 사용한다.',
        },
      });
    } else if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} });
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      let text;
      let isError = false;
      try {
        text = await callTool(params && params.name, params && params.arguments);
      } catch (err) {
        isError = true;
        text = err && err.message ? err.message : String(err);
      }
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError } });
    } else if (isRequest) {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (err) {
    if (isRequest) {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: err && err.message ? err.message : String(err) } });
    }
  }
}

function main() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let chain = Promise.resolve();
  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    // 요청을 순서대로 처리 (동시 저장으로 인한 사이드카 경합 방지)
    for (const m of Array.isArray(msg) ? msg : [msg]) {
      if (m && typeof m === 'object') chain = chain.then(() => handle(m));
    }
  });
  rl.on('close', () => {
    void chain.then(() => process.exit(0));
  });
}

if (require.main === module) main();

module.exports = { saveNote, listProjects, addTodo, listToday, resolveVault, normalizeTag, AI_PROJECT_ID };
