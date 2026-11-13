import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from '../dateUtils';

describe('formatRelativeTime', () => {
  const now = new Date(2026, 10, 12, 12, 0).getTime();
  it('1분 미만은 방금', () => expect(formatRelativeTime(now - 30_000, now)).toBe('방금'));
  it('분 단위', () => expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5분 전'));
  it('시간 단위', () => expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3시간 전'));
  it('일 단위', () => expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2일 전'));
});
