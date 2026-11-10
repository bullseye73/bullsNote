// MODEL: 파일 볼트 포맷 (frontmatter + Markdown) - 순수 함수만
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECTS, Note, NoteAttachment, NoteReminder, NoteSnapshot, Project, TodoMeta, TodoStatus } from './Note';

export interface ParsedNoteFile {
  id: string;
  title: string;
  projectId: string;
  color?: string;
  reminder?: NoteReminder | null;
  parentId: string | null;
  pinned: boolean;
  favorite: boolean;
  tags: string[];
  attachments?: NoteAttachment[];
  todoMeta?: TodoMeta;
  systemGroupType?: TodoStatus;
  createdAt: number;
  updatedAt: number;
  body: string;
}

function esc(value: unknown): string {
  return JSON.stringify(value);
}

function parseVal(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** 노트 -> .md 텍스트 (frontmatter + markdown 본문) */
export function serializeNoteFile(note: Note, body: string): string {
  const lines = [
    '---',
    `id: ${esc(note.id)}`,
    `title: ${esc(note.title)}`,
    `projectId: ${esc(note.projectId || DEFAULT_PROJECT_ID)}`,
    `color: ${esc(note.color || 'blue')}`,
    `reminder: ${esc(note.reminder || null)}`,
    `parentId: ${esc(note.parentId)}`,
    `pinned: ${esc(note.pinned)}`,
    `favorite: ${esc(note.favorite)}`,
    `tags: ${esc(note.tags)}`,
    `attachments: ${esc(note.attachments || [])}`,
    `todoMeta: ${esc(note.todoMeta || null)}`,
    `systemGroupType: ${esc(note.systemGroupType || null)}`,
    `createdAt: ${esc(note.createdAt)}`,
    `updatedAt: ${esc(note.updatedAt)}`,
    '---',
    '',
    body.replace(/\s+$/, ''),
    '',
  ];
  return lines.join('\n');
}

/** .md 텍스트 -> 파싱 (실패 시 null) */
export function parseNoteFile(id: string, text: string): ParsedNoteFile | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  const meta: Record<string, unknown> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    meta[line.slice(0, idx).trim()] = parseVal(line.slice(idx + 1).trim());
  }
  if (meta.id !== id) return null;
  const now = Date.now();
  const str = (v: unknown, fb: string) => (typeof v === 'string' && v.trim() ? v.trim() : fb);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : now);
  const rem =
    typeof meta.reminder === 'object' &&
    meta.reminder !== null &&
    typeof (meta.reminder as Record<string, unknown>).targetAt === 'number'
      ? (meta.reminder as NoteReminder)
      : null;
  const attachments = Array.isArray(meta.attachments)
    ? (meta.attachments as NoteAttachment[])
    : [];
  const todoMeta =
    typeof meta.todoMeta === 'object' && meta.todoMeta !== null
      ? (meta.todoMeta as TodoMeta)
      : undefined;
  const systemGroupType =
    typeof meta.systemGroupType === 'string'
      ? (meta.systemGroupType as TodoStatus)
      : undefined;
  return {
    id,
    title: str(meta.title, '제목 없음'),
    projectId: str(meta.projectId, DEFAULT_PROJECT_ID),
    color: str(meta.color, 'blue'),
    reminder: rem,
    parentId: typeof meta.parentId === 'string' ? meta.parentId : null,
    pinned: meta.pinned === true,
    favorite: meta.favorite === true,
    tags: Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === 'string') : [],
    attachments,
    todoMeta,
    systemGroupType,
    createdAt: num(meta.createdAt),
    updatedAt: num(meta.updatedAt),
    body: m[2].replace(/\s+$/, ''),
  };
}

const DATA_URL_IMG_RE = /!\[([^\]]*)\]\(data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)\)/g;
const ASSET_IMG_RE = /!\[([^\]]*)\]\(assets\/([A-Za-z0-9_-]+\.[A-Za-z0-9]+)\)/g;

/** electron/vault-ipc.js 의 ASSET_EXTS 와 동일하게 유지 */
const ASSET_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);

function extOf(mime: string): string {
  const sub = mime.split('/')[1] || 'png';
  if (sub === 'jpeg') return 'jpg';
  if (sub === 'svg+xml') return 'svg';
  return sub.replace(/[^A-Za-z0-9]/g, '') || 'png';
}

/** 이미지 데이터 콘텐츠 해시 (동일 이미지 = 동일 파일명 → 저장마다 새 에셋 파일이 생기지 않도록) */
async function contentHash(b64: string): Promise<string> {
  try {
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(b64));
      return Array.from(new Uint8Array(digest).slice(0, 12))
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    /* fallback below */
  }
  // FNV-1a 64bit 근사 (subtle 미지원 환경 폴백)
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < b64.length; i++) {
    const c = b64.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x811c9dc5);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/** 저장용: dataURL 이미지 -> assets/ 파일로 분리 */
export async function swapDataUrlsToAssets(
  md: string,
  noteId: string,
  writeAsset: (name: string, base64: string) => Promise<string>,
): Promise<string> {
  const jobs: Array<Promise<{ from: string; to: string }>> = [];
  let m: RegExpExecArray | null;
  DATA_URL_IMG_RE.lastIndex = 0;
  while ((m = DATA_URL_IMG_RE.exec(md)) !== null) {
    const [full, alt, mime, b64] = m;
    const ext = extOf(mime);
    // 메인 프로세스 허용 확장자 외(예: tiff, x-icon)는 파일로 분리하지 않고 본문 dataURL 유지
    if (!ASSET_EXTS.has(ext.toLowerCase())) continue;
    jobs.push(
      contentHash(b64)
        .then((hash) => writeAsset(`${noteId}-${hash}.${ext}`, b64))
        .then((rel) => ({ from: full, to: `![${alt}](${rel})` })),
    );
  }
  if (jobs.length === 0) return md;
  const reps = await Promise.all(jobs);
  let out = md;
  for (const r of reps) out = out.replace(r.from, r.to);
  return out;
}

/** 표시용: assets/ 경로 -> dataURL로 복원 */
export async function swapAssetsToDataUrls(
  md: string,
  readAsset: (name: string) => Promise<string | null>,
): Promise<string> {
  const jobs: Array<Promise<{ from: string; to: string } | null>> = [];
  let m: RegExpExecArray | null;
  ASSET_IMG_RE.lastIndex = 0;
  while ((m = ASSET_IMG_RE.exec(md)) !== null) {
    const [full, alt, name] = m;
    jobs.push(
      readAsset(name).then((url) => (url ? { from: full, to: `![${alt}](${url})` } : null)),
    );
  }
  if (jobs.length === 0) return md;
  const reps = await Promise.all(jobs);
  let out = md;
  for (const r of reps) {
    if (r) out = out.replace(r.from, r.to);
  }
  return out;
}

export function sidecarHistories(sidecar: Record<string, unknown>): Record<string, NoteSnapshot[]> {
  const h = sidecar.histories;
  if (!h || typeof h !== 'object') return {};
  const out: Record<string, NoteSnapshot[]> = {};
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      out[k] = v.filter(
        (s): s is NoteSnapshot =>
          !!s && typeof (s as NoteSnapshot).title === 'string' && typeof (s as NoteSnapshot).savedAt === 'number',
      );
    }
  }
  return out;
}

export function sidecarProjects(sidecar: Record<string, unknown>): Project[] {
  const p = sidecar.projects;
  if (!Array.isArray(p)) return DEFAULT_PROJECTS;
  const list = p.filter(
    (x): x is Project =>
      !!x &&
      typeof x === 'object' &&
      typeof (x as Project).id === 'string' &&
      typeof (x as Project).name === 'string',
  );
  return list.length > 0 ? list : DEFAULT_PROJECTS;
}
