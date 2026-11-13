import { describe, expect, it } from 'vitest';
import { buildNewTaskSchedule } from '../PlannerService';

describe('buildNewTaskSchedule', () => {
  it('마감일만 주면 그 마감일을 지키고 소요일을 계산한다', () => {
    const r = buildNewTaskSchedule({ startDate: '2026-11-12', dueDate: '2026-11-17', useWorkingDays: false }, '2026-11-12');
    expect(r).toMatchObject({ startDate: '2026-11-12', dueDate: '2026-11-17', durationDays: 6 });
  });

  it('소요일만 주면 마감일을 계산한다', () => {
    const r = buildNewTaskSchedule({ startDate: '2026-11-12', durationDays: 3, useWorkingDays: false }, '2026-11-12');
    expect(r).toMatchObject({ dueDate: '2026-11-14', durationDays: 3 });
  });

  it('아무것도 없으면 시작일 하루짜리', () => {
    const r = buildNewTaskSchedule({ useWorkingDays: false }, '2026-11-12');
    expect(r).toMatchObject({ startDate: '2026-11-12', dueDate: '2026-11-12', durationDays: 1 });
  });
});
