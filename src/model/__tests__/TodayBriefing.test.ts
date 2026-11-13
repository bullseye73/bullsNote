import { describe, expect, it } from 'vitest';
import {
  buildBriefingPrompt,
  cleanBriefingText,
  hasBriefingMaterial,
  readStoredBriefing,
  serializeBriefing,
  type BriefingInput,
} from '../TodayBriefing';

const input: BriefingInput = {
  todayIso: '2026-11-13',
  dateLabel: '11월 13일 금요일',
  nowTime: '09:10',
  tasks: [
    { title: '견적서 회신', dueDate: '2026-11-11', status: 'todo', overdue: true },
    { title: '디자인 리뷰', dueDate: '2026-11-13', status: 'doing', overdue: false },
  ],
  schedule: [{ time: '15:00', title: '주간 회의' }],
  dailyNote: '## 주의할 점\n- 오후엔 외근',
};

describe('buildBriefingPrompt', () => {
  it('할 일·일정·오늘 노트를 모두 담는다', () => {
    const p = buildBriefingPrompt(input);
    expect(p).toContain('11월 13일 금요일');
    expect(p).toContain('견적서 회신 (지연, 2026-11-11 마감)');
    expect(p).toContain('디자인 리뷰 (진행 중, 오늘 마감)');
    expect(p).toContain('15:00 주간 회의');
    expect(p).toContain('오후엔 외근');
  });
  it('오늘 노트가 너무 길면 잘라서 넣는다', () => {
    const p = buildBriefingPrompt({ ...input, dailyNote: 'a'.repeat(5000) });
    expect(p.length).toBeLessThan(3500);
  });
});

describe('hasBriefingMaterial', () => {
  it('할 일·일정·노트가 모두 비면 false', () => {
    expect(hasBriefingMaterial({ ...input, tasks: [], schedule: [], dailyNote: '  ' })).toBe(false);
    expect(hasBriefingMaterial(input)).toBe(true);
  });
});

describe('cleanBriefingText', () => {
  it('마크다운 장식을 걷어내고 최대 4줄만 남긴다', () => {
    const raw = '```\n# 오늘 브리핑\n\n**지연** 1건부터 처리하세요.\n- 15시 회의 전 리뷰 마무리\n* 외근 고려\n다섯째\n여섯째\n```';
    expect(cleanBriefingText(raw)).toBe('지연 1건부터 처리하세요.\n15시 회의 전 리뷰 마무리\n외근 고려\n다섯째');
  });
});

describe('저장된 브리핑', () => {
  it('같은 날짜면 읽고, 다른 날짜·깨진 값이면 null', () => {
    const raw = serializeBriefing('2026-11-13', '요약', 1000);
    expect(readStoredBriefing(raw, '2026-11-13')).toEqual({ text: '요약', at: 1000 });
    expect(readStoredBriefing(raw, '2026-11-14')).toBeNull();
    expect(readStoredBriefing('{깨짐', '2026-11-13')).toBeNull();
    expect(readStoredBriefing(null, '2026-11-13')).toBeNull();
  });
});
