// MODEL: 빠른 입력 한 줄에서 마감일·시각·#태그를 읽어내는 규칙 기반 파서
import { addCalendarDays, toIsoDateLocal } from './PlannerService';

export interface QuickCaptureResult {
  title: string;
  /** YYYY-MM-DD, 없으면 null */
  dueDate: string | null;
  /** HH:mm, 없으면 null */
  time: string | null;
  tags: string[];
  /** 날짜가 있으면 할일, 없으면 노트 */
  kind: 'todo' | 'note';
}

const RELATIVE_DAYS: Record<string, number> = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 };
const WEEKDAY_INDEX: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const pad = (n: number) => String(n).padStart(2, '0');

// 모든 패턴은 줄 시작 또는 공백 뒤에서만 인식 (단어 중간 오인식 방지)
const B = '(^|\\s)';
const END = '(?=\\s|$)';

export function parseQuickCapture(text: string, now: Date): QuickCaptureResult {
  const original = text.trim();
  let rest = ` ${original} `;
  const todayIso = toIsoDateLocal(now);
  let dueDate: string | null = null;
  let time: string | null = null;
  const tags: string[] = [];

  const take = (re: RegExp, onMatch: (m: RegExpMatchArray) => boolean) => {
    const m = rest.match(re);
    if (m && onMatch(m)) rest = rest.replace(m[0], m[1] ?? ' ');
  };

  // 1) #태그
  for (const m of [...rest.matchAll(new RegExp(`${B}#([^\\s#]+)`, 'g'))]) {
    tags.push(m[2]);
    rest = rest.replace(m[0], m[1]);
  }

  // 2) 날짜
  take(new RegExp(`${B}(오늘|내일|모레|글피)${END}`), (m) => {
    dueDate = addCalendarDays(todayIso, RELATIVE_DAYS[m[2]]);
    return true;
  });
  if (!dueDate) {
    take(new RegExp(`${B}(\\d{1,2})(?:/|월\\s*)(\\d{1,2})일?${END}`), (m) => {
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
      let candidate = toIsoDateLocal(new Date(now.getFullYear(), mo - 1, d));
      if (candidate < todayIso) candidate = toIsoDateLocal(new Date(now.getFullYear() + 1, mo - 1, d));
      dueDate = candidate;
      return true;
    });
  }
  if (!dueDate) {
    take(new RegExp(`${B}([일월화수목금토])요일${END}`), (m) => {
      const diff = (WEEKDAY_INDEX[m[2]] - now.getDay() + 7) % 7 || 7;
      dueDate = addCalendarDays(todayIso, diff);
      return true;
    });
  }
  if (!dueDate) {
    take(new RegExp(`${B}(\\d{1,3})일\\s*(?:후|뒤)${END}`), (m) => {
      dueDate = addCalendarDays(todayIso, Number(m[2]));
      return true;
    });
  }

  // 3) 시각
  take(new RegExp(`${B}(?:(오전|오후)\\s*)?(\\d{1,2})시(?:\\s*(\\d{1,2})분|\\s*(반))?${END}`), (m) => {
    let h = Number(m[3]);
    if (h > 24) return false;
    const min = m[5] ? 30 : m[4] ? Number(m[4]) : 0;
    if (m[2] === '오후' && h < 12) h += 12;
    else if (m[2] === '오전' && h === 12) h = 0;
    else if (!m[2] && h >= 1 && h <= 7) h += 12; // 업무 맥락: "3시"는 오후 3시
    time = `${pad(h % 24)}:${pad(min)}`;
    return true;
  });
  if (!time) {
    take(new RegExp(`${B}(\\d{1,2}):(\\d{2})${END}`), (m) => {
      const h = Number(m[2]);
      const min = Number(m[3]);
      if (h > 23 || min > 59) return false;
      time = `${pad(h)}:${pad(min)}`;
      return true;
    });
  }
  if (time && !dueDate) dueDate = todayIso;

  const title = rest.replace(/\s+/g, ' ').trim() || original;
  return { title, dueDate, time, tags, kind: dueDate ? 'todo' : 'note' };
}
