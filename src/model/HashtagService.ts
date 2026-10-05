// MODEL: 해시태그 추출/정규화 전담 서비스 (MVC의 M)
const HASHTAG_RE = /(^|\s)#([가-힣a-zA-Z0-9_][가-힣a-zA-Z0-9_\-/]*)/g;

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').toLowerCase();
}

/** HTML 태그 제거 후 텍스트만 추출 (레거시 HTML -> plain text) */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBlocksJson(s: string): boolean {
  const t = (s ?? '').trim();
  if (!t.startsWith('[')) return false;
  try {
    return Array.isArray(JSON.parse(t));
  } catch {
    return false;
  }
}

/** 블록 JSON 파싱 + 형태 검증. 빈 배열/비정상 구조면 undefined (에디터 크래시 방지) */
export function parseBlocks(content: string): Array<Record<string, unknown>> | undefined {
  try {
    const v = JSON.parse(content ?? '');
    if (!Array.isArray(v) || v.length === 0) return undefined;
    if (!v.every((b) => b && typeof b === 'object' && typeof (b as { type?: unknown }).type === 'string')) {
      return undefined;
    }
    return v as Array<Record<string, unknown>>;
  } catch {
    return undefined;
  }
}

type InlineContent = string | Array<{ text?: string }> | { rows?: Array<{ cells?: unknown[][] }> };

function inlineText(inline: unknown): string {
  if (typeof inline === 'string') return inline;
  if (Array.isArray(inline)) return inline.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join('');
  if (inline && typeof inline === 'object') {
    const rows = (inline as { rows?: Array<{ cells?: unknown[] }> }).rows;
    if (Array.isArray(rows)) {
      return rows
        .map((r) => (Array.isArray(r.cells) ? r.cells.map((cell) => inlineText(cell)).join(' | ') : ''))
        .join('\n');
    }
  }
  return '';
}

/** BlockNote 블록 JSON -> 순수 텍스트 (검색/요약/태그용) */
export function blocksToText(content: string): string {
  try {
    const blocks = JSON.parse(content);
    if (!Array.isArray(blocks)) return content;
    const parts: string[] = [];
    const walk = (list: Array<{ content?: unknown; children?: unknown[] }>) => {
      for (const b of list) {
        if (!b || typeof b !== 'object') continue;
        const t = inlineText((b as { content?: unknown }).content);
        if (t) parts.push(t);
        const ch = (b as { children?: unknown[] }).children;
        if (Array.isArray(ch)) walk(ch as Array<{ content?: unknown; children?: unknown[] }>);
      }
    };
    walk(blocks);
    return parts.join('\n');
  } catch {
    return content;
  }
}

/** 노트 본문(블록 JSON 또는 레거시 마크다운/HTML) -> 순수 텍스트 */
export function noteBodyText(content: string): string {
  const s = content ?? '';
  if (isBlocksJson(s)) return blocksToText(s);
  if (/<[a-z][\s\S]*>/i.test(s)) return stripHtml(s);
  return s.replace(/[>*`\-+|[\]()!~]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractHashtagsFromText(text: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  HASHTAG_RE.lastIndex = 0;
  while ((m = HASHTAG_RE.exec(text)) !== null) {
    const t = normalizeTag(m[2]);
    if (t) found.add(t);
  }
  return [...found].sort();
}

/** 제목 + 본문(블록 JSON/마크다운)에서 해시태그 추출 */
export function extractHashtags(title: string, bodyContent: string): string[] {
  const text = `${title} ${noteBodyText(bodyContent)}`;
  return extractHashtagsFromText(text);
}

/** 본문 내 #태그를 하이라이트용으로 파싱 (간단 렌더용) */
export function splitByHashtag(text: string): Array<{ text: string; tag?: string }> {
  const parts: Array<{ text: string; tag?: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = /(^|\s)(#[가-힣a-zA-Z0-9_][가-힣a-zA-Z0-9_\-/]*)/g;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[1].length;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: m[2], tag: normalizeTag(m[2]) });
    last = start + m[2].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
