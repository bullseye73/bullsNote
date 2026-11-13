import { describe, expect, it } from 'vitest';
import { buildCaptureParsePrompt, parseAiCaptureResponse } from '../AiCaptureParser';

const NOW = new Date(2026, 10, 13, 10, 0); // 2026-11-13 금 10:00

describe('buildCaptureParsePrompt', () => {
  it('오늘 날짜·요일과 입력 문장을 담는다', () => {
    const p = buildCaptureParsePrompt('다음 주 화요일 오전까지 팀장님께 보고', NOW);
    expect(p).toContain('2026-11-13');
    expect(p).toContain('금요일');
    expect(p).toContain('다음 주 화요일 오전까지 팀장님께 보고');
  });
});

describe('parseAiCaptureResponse', () => {
  it('코드 울타리 안의 JSON을 읽어 할일 결과로 만든다', () => {
    const raw = '```json\n{"title":"팀장님께 보고","dueDate":"2026-11-17","time":"10:00","tags":["#업무"]}\n```';
    expect(parseAiCaptureResponse(raw, NOW)).toEqual({
      title: '팀장님께 보고',
      dueDate: '2026-11-17',
      time: '10:00',
      tags: ['업무'],
      kind: 'todo',
    });
  });

  it('날짜가 없으면 노트, 시각만 있으면 오늘로 본다', () => {
    expect(parseAiCaptureResponse('{"title":"아이디어","dueDate":null,"time":null,"tags":[]}', NOW)?.kind).toBe('note');
    expect(parseAiCaptureResponse('{"title":"전화","dueDate":null,"time":"16:00","tags":[]}', NOW)?.dueDate).toBe('2026-11-13');
  });

  it('지난 날짜·없는 날짜·잘못된 시각·빈 제목·JSON 아님은 null', () => {
    expect(parseAiCaptureResponse('{"title":"a","dueDate":"2026-11-12","time":null,"tags":[]}', NOW)).toBeNull();
    expect(parseAiCaptureResponse('{"title":"a","dueDate":"2026-02-30","time":null,"tags":[]}', NOW)).toBeNull();
    expect(parseAiCaptureResponse('{"title":"a","dueDate":"2026-11-20","time":"25:00","tags":[]}', NOW)).toBeNull();
    expect(parseAiCaptureResponse('{"title":"  ","dueDate":null,"time":null,"tags":[]}', NOW)).toBeNull();
    expect(parseAiCaptureResponse('죄송합니다, 이해하지 못했어요', NOW)).toBeNull();
  });

  it('태그가 배열이 아니거나 이상한 값이면 걸러낸다', () => {
    const r = parseAiCaptureResponse('{"title":"a","dueDate":null,"time":null,"tags":["좋은 태그", 3, ""]}', NOW);
    expect(r?.tags).toEqual(['좋은_태그']);
    expect(parseAiCaptureResponse('{"title":"a","dueDate":null,"time":null,"tags":"x"}', NOW)?.tags).toEqual([]);
  });
});
