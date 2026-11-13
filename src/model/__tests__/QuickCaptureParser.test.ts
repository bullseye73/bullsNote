import { describe, expect, it } from 'vitest';
import { parseQuickCapture } from '../QuickCaptureParser';

const NOW = new Date(2026, 10, 12, 10, 0); // 2026-11-12 목요일 10:00

describe('parseQuickCapture', () => {
  it('날짜·오전오후 없는 시각·태그를 함께 읽는다', () => {
    expect(parseQuickCapture('내일 3시 견적서 회신 #업무', NOW)).toEqual({
      title: '견적서 회신',
      dueDate: '2026-11-13',
      time: '15:00',
      tags: ['업무'],
      kind: 'todo',
    });
  });

  it('오전 시각만 있으면 오늘 마감', () => {
    const r = parseQuickCapture('오전 9시 보고', NOW);
    expect(r).toMatchObject({ title: '보고', dueDate: '2026-11-12', time: '09:00', kind: 'todo' });
  });

  it('M/D 날짜', () => {
    expect(parseQuickCapture('11/20 발표', NOW)).toMatchObject({ title: '발표', dueDate: '2026-11-20', time: null });
  });

  it('요일은 다음에 오는 그 요일', () => {
    expect(parseQuickCapture('금요일 정리', NOW).dueDate).toBe('2026-11-13');
    expect(parseQuickCapture('목요일 정리', NOW).dueDate).toBe('2026-11-19');
  });

  it('HH:MM 시각', () => {
    expect(parseQuickCapture('14:30 회의', NOW)).toMatchObject({ title: '회의', time: '14:30', dueDate: '2026-11-12' });
  });

  it('오후 N시 반', () => {
    expect(parseQuickCapture('모레 오후 2시 반 통화', NOW)).toMatchObject({
      title: '통화',
      dueDate: '2026-11-14',
      time: '14:30',
    });
  });

  it('날짜가 없으면 노트', () => {
    expect(parseQuickCapture('아이디어 메모', NOW)).toEqual({
      title: '아이디어 메모',
      dueDate: null,
      time: null,
      tags: [],
      kind: 'note',
    });
  });

  it('빈 # 는 태그가 아니고 원문을 지킨다', () => {
    expect(parseQuickCapture('# 제목', NOW)).toMatchObject({ title: '# 제목', tags: [] });
  });
});

import { toTaskParams } from '../QuickCaptureParser';

describe('toTaskParams', () => {
  it('마감일·시각·태그를 할일 생성 값으로 바꾼다', () => {
    const r = toTaskParams({ title: '견적서 회신', dueDate: '2026-11-13', time: '15:00', tags: ['업무'], kind: 'todo' });
    expect(r).toEqual({
      title: '견적서 회신',
      startDate: '2026-11-13',
      dueDate: '2026-11-13',
      useWorkingDays: false,
      reminderAt: new Date(2026, 10, 13, 15, 0).getTime(),
      tags: ['업무'],
      memo: '#업무',
      withoutSchedule: false,
    });
  });

  it('날짜가 없으면 일정 없는 할일', () => {
    const r = toTaskParams({ title: '아이디어', dueDate: null, time: null, tags: [], kind: 'note' });
    expect(r).toMatchObject({ title: '아이디어', withoutSchedule: true, reminderAt: null, memo: '' });
    expect(r.dueDate).toBeUndefined();
  });
});
