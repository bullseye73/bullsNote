// MODEL: 빠른 입력 문장을 AI로 해석 — 요청문 만들기와 응답 검증 (순수 함수)
// 규칙 해석(QuickCaptureParser)이 못 읽는 표현("다음 주 화요일 오전까지")을 보조한다.
// 응답이 형식에 맞지 않거나 지난 날짜면 null → 화면은 규칙 해석 결과를 그대로 쓴다.
import { WEEKDAYS } from './dateUtils';
import { parseIsoDateLocal, toIsoDateLocal } from './PlannerService';
import type { QuickCaptureResult } from './QuickCaptureParser';

export function buildCaptureParsePrompt(text: string, now: Date): string {
  const todayIso = toIsoDateLocal(now);
  return [
    '사용자가 할일/메모 앱에 한 줄을 입력했다. 아래 JSON 하나만 출력하라. 설명 금지.',
    '{"title": string, "dueDate": "YYYY-MM-DD" | null, "time": "HH:mm" | null, "tags": string[]}',
    '- title: 날짜·시각·태그 표현을 뺀 할 일 내용.',
    '- dueDate: 문장에 날짜·기한이 있을 때만. "까지"는 그 날을 마감일로. 없으면 null.',
    '- time: 시각이 있을 때만 24시간 형식. "오전"만 있으면 09:00, "오후"만 있으면 14:00, "저녁"은 19:00. 없으면 null.',
    '- tags: #으로 시작하는 단어만, # 없이.',
    `오늘: ${todayIso} (${WEEKDAYS[now.getDay()]}요일), 지금 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    `입력: ${text.trim()}`,
  ].join('\n');
}

/** 앱 해시태그 규칙에 맞춘 태그 (공백 → _, # 제거) */
const normalizeTag = (t: string) => t.trim().replace(/^#+/, '').replace(/\s+/g, '_');

function extractJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(raw.slice(start, end + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseAiCaptureResponse(raw: string, now: Date): QuickCaptureResult | null {
  const v = extractJson(raw);
  if (!v) return null;

  const title = typeof v.title === 'string' ? v.title.replace(/\s+/g, ' ').trim() : '';
  if (!title) return null;

  const todayIso = toIsoDateLocal(now);
  let dueDate: string | null = null;
  if (v.dueDate !== null && v.dueDate !== undefined) {
    if (typeof v.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.dueDate)) return null;
    // 2월 30일처럼 없는 날짜는 다른 날로 넘어가므로 되돌려 비교
    if (toIsoDateLocal(parseIsoDateLocal(v.dueDate)) !== v.dueDate) return null;
    if (v.dueDate < todayIso) return null;
    dueDate = v.dueDate;
  }

  let time: string | null = null;
  if (v.time !== null && v.time !== undefined) {
    const m = typeof v.time === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(v.time) : null;
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    time = `${m[1].padStart(2, '0')}:${m[2]}`;
  }
  if (time && !dueDate) dueDate = todayIso;

  const tags = Array.isArray(v.tags)
    ? v.tags.filter((t): t is string => typeof t === 'string').map(normalizeTag).filter(Boolean)
    : [];

  return { title, dueDate, time, tags, kind: dueDate ? 'todo' : 'note' };
}
