// MODEL: Daily Note(하루 계획표) 규칙 — 템플릿 생성, 메모 칸에 한 줄 붙이기, 날짜 노트 찾기, 날짜 문구
import type { Note, Project } from './Note';
import { WEEKDAYS } from './dateUtils';
import { parseBlocks } from './HashtagService';
import { addCalendarDays, parseIsoDateLocal } from './PlannerService';

type Block = Record<string, unknown>;

/** 계획표 섹션 제목 (나중에 회의록 등 다른 템플릿도 같은 블록 생성 방식으로 추가) */
export const DAILY_SECTION = { order: '오늘 순서', caution: '주의할 점', memo: '메모', briefing: '브리핑' } as const;

const inline = (text: string) => (text ? [{ type: 'text', text, styles: {} }] : []);
const heading = (text: string): Block => ({ type: 'heading', props: { level: 2 }, content: inline(text) });
const block = (type: string, text = ''): Block => ({ type, content: inline(text) });

const blockText = (b: Block): string => {
  const c = b.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c.map((x) => (x && typeof x === 'object' && typeof (x as { text?: unknown }).text === 'string' ? (x as { text: string }).text : '')).join('');
};
const isHeading = (b: Block) => b.type === 'heading';

export function isDailyNoteProject(p: Project): boolean {
  const name = p.name.trim().toLowerCase();
  return name === 'daily note' || name === 'daily notes' || p.name.trim() === '데일리 노트';
}

export function findDailyNote(notes: Note[], projects: Project[], dateIso: string): Note | undefined {
  const dailyIds = new Set(projects.filter(isDailyNoteProject).map((p) => p.id));
  return notes.find((n) => dailyIds.has(n.projectId) && n.title.trim() === dateIso);
}

/** 하루 계획표 템플릿: 오늘 순서(번호 목록) · 주의할 점 · 메모 */
export function buildDailyNoteBlocks(taskTitles: string[]): Block[] {
  const order = taskTitles.length > 0 ? taskTitles.map((t) => block('numberedListItem', t)) : [block('numberedListItem')];
  return [
    heading(DAILY_SECTION.order),
    ...order,
    heading(DAILY_SECTION.caution),
    block('bulletListItem'),
    heading(DAILY_SECTION.memo),
    block('paragraph'),
  ];
}

/** 노트 본문 → 블록 배열 (블록 JSON이 아니면 한 문단으로) */
function toBlocks(content: string): Block[] {
  return [...(parseBlocks(content) ?? (content.trim() ? [block('paragraph', content.trim())] : []))];
}

const bulletItems = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean).map((l) => block('bulletListItem', l));

/** 제목이 title 인 섹션: 제목 위치와 섹션 끝(다음 제목 앞, 없으면 문서 끝). 없으면 null */
function findSection(blocks: Block[], title: string): { heading: number; end: number } | null {
  const heading = blocks.findIndex((b) => isHeading(b) && blockText(b).trim() === title);
  if (heading === -1) return null;
  const next = blocks.findIndex((b, i) => i > heading && isHeading(b));
  return { heading, end: next === -1 ? blocks.length : next };
}

/** 메모 섹션 끝에 글머리 항목으로 줄들을 붙인다 (메모 제목이 없으면 끝에 새로 만든다) */
export function appendToDailyMemo(content: string, lines: string[]): string {
  const blocks = toBlocks(content);
  const items = bulletItems(lines);
  if (items.length === 0) return JSON.stringify(blocks);

  const memo = findSection(blocks, DAILY_SECTION.memo);
  if (!memo) {
    blocks.push(heading(DAILY_SECTION.memo), ...items);
    return JSON.stringify(blocks);
  }
  // 섹션 마지막이 빈 문단(템플릿 자리표시)이면 그 자리를 대신 쓴다
  const last = blocks[memo.end - 1];
  if (memo.end - 1 > memo.heading && last.type === 'paragraph' && !blockText(last).trim()) {
    blocks.splice(memo.end - 1, 1, ...items);
  } else {
    blocks.splice(memo.end, 0, ...items);
  }
  return JSON.stringify(blocks);
}

/** 브리핑 섹션을 lines 로 바꾼다 (없으면 맨 위에 만든다) */
export function writeDailyBriefing(content: string, lines: string[]): string {
  const blocks = toBlocks(content);
  const items = bulletItems(lines);
  const section = findSection(blocks, DAILY_SECTION.briefing);
  if (section) blocks.splice(section.heading + 1, section.end - section.heading - 1, ...items);
  else blocks.unshift(heading(DAILY_SECTION.briefing), ...items);
  return JSON.stringify(blocks);
}

/** 브리핑 섹션을 뺀 본문 (브리핑을 다시 만들 때 이전 브리핑이 입력에 섞이지 않도록) */
export function removeDailyBriefing(content: string): string {
  const blocks = parseBlocks(content) as Block[] | null;
  if (!blocks) return content;
  const section = findSection(blocks, DAILY_SECTION.briefing);
  if (!section) return content;
  return JSON.stringify([...blocks.slice(0, section.heading), ...blocks.slice(section.end)]);
}

/** 브리핑 섹션의 줄들 (없으면 빈 배열) */
export function readDailyBriefing(content: string): string[] {
  const blocks = parseBlocks(content);
  if (!blocks) return [];
  const section = findSection(blocks as Block[], DAILY_SECTION.briefing);
  if (!section) return [];
  return (blocks as Block[]).slice(section.heading + 1, section.end).map((b) => blockText(b).trim()).filter(Boolean);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 빠른 입력으로 붙일 한 줄: "HH:MM 내용" */
export function formatDailyCaptureLine(text: string, now: Date): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())} ${text.trim()}`;
}

/** 오늘 화면 헤더: "11월 13일 금요일", 어제·내일이면 뒤에 표시 */
export function formatDashboardDateLabel(dateIso: string, todayIso: string): string {
  const d = parseIsoDateLocal(dateIso);
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
  if (dateIso === addCalendarDays(todayIso, -1)) return `${base} (어제)`;
  if (dateIso === addCalendarDays(todayIso, 1)) return `${base} (내일)`;
  return base;
}
