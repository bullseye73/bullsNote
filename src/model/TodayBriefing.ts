// MODEL: 오늘 브리핑 — AI에 보낼 요청문 만들기, 응답 다듬기, 날짜별 저장 형식 (순수 함수)
import type { TodoStatus } from './Note';

export interface BriefingTask {
  title: string;
  dueDate: string | null;
  status: TodoStatus;
  overdue: boolean;
}

export interface BriefingInput {
  /** YYYY-MM-DD */
  todayIso: string;
  /** "11월 13일 금요일" */
  dateLabel: string;
  /** 지금 시각 HH:mm (이미 지난 일정 구분용) */
  nowTime: string;
  tasks: BriefingTask[];
  schedule: { time: string; title: string }[];
  /** 오늘 노트(계획표) 본문 텍스트 */
  dailyNote: string;
}

/** 요청문에 넣는 오늘 노트 최대 길이 */
const DAILY_NOTE_LIMIT = 1500;
const MAX_LINES = 4;

export function hasBriefingMaterial(input: BriefingInput): boolean {
  return input.tasks.length > 0 || input.schedule.length > 0 || input.dailyNote.trim().length > 0;
}

function describeTask(t: BriefingTask, todayIso: string): string {
  const state = t.overdue ? '지연' : t.status === 'doing' ? '진행 중' : '할 일';
  const when = t.dueDate ? (t.dueDate === todayIso ? '오늘 마감' : `${t.dueDate} 마감`) : '마감일 없음';
  return `- ${t.title} (${state}, ${when})`;
}

export function buildBriefingPrompt(input: BriefingInput): string {
  const note = input.dailyNote.trim();
  const clipped = note.length > DAILY_NOTE_LIMIT ? `${note.slice(0, DAILY_NOTE_LIMIT)}…` : note;

  return [
    '너는 사용자의 하루를 정리해 주는 비서다. 아래 자료만 근거로 오늘 브리핑을 한국어로 써라.',
    `- ${MAX_LINES}줄 이하, 각 줄은 한 문장. 제목·글머리표·마크다운 없이 문장만.`,
    '- 첫 줄은 가장 먼저 할 일(지연 항목이 있으면 그것)과 이유.',
    '- 일정 시각과 겹치는 할 일, 오늘 노트의 주의할 점이 있으면 짚어라.',
    '- 자료에 없는 일을 지어내지 마라.',
    '',
    `날짜: ${input.dateLabel}, 지금 ${input.nowTime}`,
    '',
    `할 일 (${input.tasks.length}개)`,
    ...(input.tasks.length > 0 ? input.tasks.map((t) => describeTask(t, input.todayIso)) : ['- 없음']),
    '',
    `일정 (${input.schedule.length}개)`,
    ...(input.schedule.length > 0 ? input.schedule.map((s) => `- ${s.time} ${s.title}`) : ['- 없음']),
    '',
    '오늘 노트',
    clipped || '(비어 있음)',
  ].join('\n');
}

/** 응답에서 코드 울타리·제목·글머리표·강조 표시를 걷어내고 최대 4줄 */
export function cleanBriefingText(raw: string): string {
  return raw
    .split('\n')
    .map((l) =>
      l
        .trim()
        .replace(/^```.*$/, '')
        .replace(/^#{1,6}\s+.*$/, '')
        .replace(/^([-*•]|\d+[.)])\s+/, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .trim()
    )
    .filter(Boolean)
    .slice(0, MAX_LINES)
    .join('\n');
}

export const BRIEFING_STORAGE_KEY = 'bullsnote.today.briefing';

export function serializeBriefing(dateIso: string, text: string, at: number): string {
  return JSON.stringify({ date: dateIso, text, at });
}

/** 같은 날짜의 저장값만 돌려준다 */
export function readStoredBriefing(raw: string | null, dateIso: string): { text: string; at: number } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { date?: unknown; text?: unknown; at?: unknown };
    if (v.date !== dateIso || typeof v.text !== 'string' || typeof v.at !== 'number') return null;
    return { text: v.text, at: v.at };
  } catch {
    return null;
  }
}
