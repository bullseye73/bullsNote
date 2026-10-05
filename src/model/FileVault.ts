// MODEL: 파일 볼트 포맷 (frontmatter + Markdown) - 순수 함수만
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECTS, Note, NoteSnapshot, Project } from './Note';

export interface ParsedNoteFile {
  id: string;
  title: string;
  projectId: string;
  color?: string;
  parentId: string | null;
  pinned: boolean;
  favorite: boolean;
  tags: string[];
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
    `parentId: ${esc(note.parentId)}`,
    `pinned: ${esc(note.pinned)}`,
    `favorite: ${esc(note.favorite)}`,
    `tags: ${esc(note.tags)}`,
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
  return {
    id,
    title: str(meta.title, '제목 없음'),
    projectId: str(meta.projectId, DEFAULT_PROJECT_ID),
    color: str(meta.color, 'blue'),
    parentId: typeof meta.parentId === 'string' ? meta.parentId : null,
    pinned: meta.pinned === true,
    favorite: meta.favorite === true,
    tags: Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === 'string') : [],
    createdAt: num(meta.createdAt),
    updatedAt: num(meta.updatedAt),
    body: m[2].replace(/\s+$/, ''),
  };
}

const DATA_URL_IMG_RE = /!\[([^\]]*)\]\(data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)\)/g;
const ASSET_IMG_RE = /!\[([^\]]*)\]\(assets\/([A-Za-z0-9_-]+\.[A-Za-z0-9]+)\)/g;

function extOf(mime: string): string {
  const sub = mime.split('/')[1] || 'png';
  if (sub === 'jpeg') return 'jpg';
  if (sub === 'svg+xml') return 'svg';
  return sub.replace(/[^A-Za-z0-9]/g, '') || 'png';
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
  let i = 0;
  while ((m = DATA_URL_IMG_RE.exec(md)) !== null) {
    const [full, alt, mime, b64] = m;
    const name = `${noteId}-${Date.now().toString(36)}-${i++}.${extOf(mime)}`;
    jobs.push(writeAsset(name, b64).then((rel) => ({ from: full, to: `![${alt}](${rel})` })));
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
