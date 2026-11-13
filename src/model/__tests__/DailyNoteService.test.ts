import { describe, expect, it } from 'vitest';
import { createEmptyNote, type Project } from '../Note';
import {
  appendToDailyMemo,
  readDailyBriefing,
  removeDailyBriefing,
  writeDailyBriefing,
  buildDailyNoteBlocks,
  findDailyNote,
  formatDailyCaptureLine,
  formatDashboardDateLabel,
} from '../DailyNoteService';

type B = { type: string; props?: { level?: number }; content?: Array<{ text?: string }> };
const text = (b: B) => (b.content ?? []).map((c) => c.text ?? '').join('');
const shape = (blocks: B[]) => blocks.map((b) => `${b.type}:${text(b)}`);
const parse = (json: string) => JSON.parse(json) as B[];

describe('buildDailyNoteBlocks', () => {
  it('오늘 순서(번호 목록) · 주의할 점 · 메모 순서의 계획표', () => {
    const blocks = buildDailyNoteBlocks(['견적서 회신', '보고서']) as B[];
    expect(shape(blocks)).toEqual([
      'heading:오늘 순서',
      'numberedListItem:견적서 회신',
      'numberedListItem:보고서',
      'heading:주의할 점',
      'bulletListItem:',
      'heading:메모',
      'paragraph:',
    ]);
    expect(blocks.filter((b) => b.type === 'heading').every((b) => b.props?.level === 2)).toBe(true);
  });

  it('할 일이 없으면 빈 번호 항목 하나', () => {
    expect(shape(buildDailyNoteBlocks([]) as B[]).slice(0, 2)).toEqual(['heading:오늘 순서', 'numberedListItem:']);
  });
});

describe('appendToDailyMemo', () => {
  const template = JSON.stringify(buildDailyNoteBlocks(['a']));

  it('메모 아래 빈 문단을 첫 항목으로 바꾸고, 다음 항목은 그 아래에 붙인다', () => {
    const once = appendToDailyMemo(template, ['14:30 통화']);
    expect(shape(parse(once)).slice(-2)).toEqual(['heading:메모', 'bulletListItem:14:30 통화']);
    const twice = appendToDailyMemo(once, ['15:00 메일', '세부 내용']);
    expect(shape(parse(twice)).slice(-4)).toEqual([
      'heading:메모',
      'bulletListItem:14:30 통화',
      'bulletListItem:15:00 메일',
      'bulletListItem:세부 내용',
    ]);
  });

  it('메모 뒤에 다른 제목이 있으면 그 앞(메모 섹션 끝)에 붙인다', () => {
    const blocks = parse(template);
    blocks.push({ type: 'heading', props: { level: 2 }, content: [{ text: '회고' }] });
    const out = shape(parse(appendToDailyMemo(JSON.stringify(blocks), ['메모 줄'])));
    expect(out.slice(-3)).toEqual(['heading:메모', 'bulletListItem:메모 줄', 'heading:회고']);
  });

  it('메모 제목이 없으면 끝에 새로 만든다', () => {
    const noMemo = JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: '기존', styles: {} }] }]);
    expect(shape(parse(appendToDailyMemo(noMemo, ['줄'])))).toEqual(['paragraph:기존', 'heading:메모', 'bulletListItem:줄']);
  });

  it('빈 본문이나 블록 JSON이 아닌 본문도 예외 없이 메모를 만든다', () => {
    expect(shape(parse(appendToDailyMemo('', ['줄'])))).toEqual(['heading:메모', 'bulletListItem:줄']);
    expect(shape(parse(appendToDailyMemo('옛 마크다운 본문', ['줄'])))).toEqual([
      'paragraph:옛 마크다운 본문',
      'heading:메모',
      'bulletListItem:줄',
    ]);
  });
});

describe('formatDailyCaptureLine', () => {
  it('시각과 다듬은 내용', () => {
    expect(formatDailyCaptureLine(' 고객 통화 ', new Date(2026, 10, 13, 14, 5))).toBe('14:05 고객 통화');
  });
});

describe('formatDashboardDateLabel', () => {
  const today = '2026-11-13';
  it('오늘·어제·내일·그 외', () => {
    expect(formatDashboardDateLabel('2026-11-13', today)).toBe('11월 13일 금요일');
    expect(formatDashboardDateLabel('2026-11-12', today)).toBe('11월 12일 목요일 (어제)');
    expect(formatDashboardDateLabel('2026-11-14', today)).toBe('11월 14일 토요일 (내일)');
    expect(formatDashboardDateLabel('2026-11-20', today)).toBe('11월 20일 금요일');
  });
});

describe('findDailyNote', () => {
  const daily: Project = { id: 'dp', name: 'Daily Note', icon: '📅', createdAt: 0, updatedAt: 0 };
  const work: Project = { id: 'w', name: '업무', icon: '📁', createdAt: 0, updatedAt: 0 };
  it('Daily Note 폴더 안의 날짜 제목 노트만 찾는다', () => {
    const inDaily = createEmptyNote({ id: 'd1', title: '2026-11-13', projectId: 'dp' });
    const elsewhere = createEmptyNote({ id: 'x', title: '2026-11-13', projectId: 'w' });
    expect(findDailyNote([elsewhere, inDaily], [work, daily], '2026-11-13')?.id).toBe('d1');
    expect(findDailyNote([elsewhere], [work, daily], '2026-11-13')).toBeUndefined();
  });
});

describe('writeDailyBriefing / readDailyBriefing', () => {
  const template = JSON.stringify(buildDailyNoteBlocks(['a']));

  it('브리핑 섹션이 없으면 맨 위에 만들고, 다시 쓰면 그 섹션만 바꾼다', () => {
    const once = writeDailyBriefing(template, ['첫 줄', '둘째 줄']);
    expect(shape(parse(once)).slice(0, 4)).toEqual([
      'heading:브리핑',
      'bulletListItem:첫 줄',
      'bulletListItem:둘째 줄',
      'heading:오늘 순서',
    ]);
    const twice = writeDailyBriefing(once, ['새 줄']);
    expect(shape(parse(twice)).slice(0, 3)).toEqual(['heading:브리핑', 'bulletListItem:새 줄', 'heading:오늘 순서']);
    expect(shape(parse(twice)).filter((x) => x === 'heading:브리핑')).toHaveLength(1);
    expect(readDailyBriefing(twice)).toEqual(['새 줄']);
  });

  it('브리핑이 섹션 중간에 있어도 그 섹션만 바꾸고 나머지는 그대로 둔다', () => {
    const blocks = parse(template);
    blocks.push(
      { type: 'heading', props: { level: 2 }, content: [{ text: '브리핑' }] },
      { type: 'bulletListItem', content: [{ text: '옛 줄' }] },
    );
    const out = shape(parse(writeDailyBriefing(JSON.stringify(blocks), ['새 줄'])));
    expect(out.slice(-3)).toEqual(['paragraph:', 'heading:브리핑', 'bulletListItem:새 줄']);
  });

  it('빈 본문·마크다운 본문에서도 동작하고, 섹션이 없으면 빈 목록을 읽는다', () => {
    expect(shape(parse(writeDailyBriefing('', ['줄'])))).toEqual(['heading:브리핑', 'bulletListItem:줄']);
    expect(readDailyBriefing(template)).toEqual([]);
    expect(readDailyBriefing('옛 마크다운')).toEqual([]);
  });
});

describe('removeDailyBriefing', () => {
  it('브리핑 섹션(제목 포함)만 빼고 나머지는 그대로 둔다', () => {
    const template = JSON.stringify(buildDailyNoteBlocks(['a']));
    const withBriefing = writeDailyBriefing(template, ['요약']);
    expect(removeDailyBriefing(withBriefing)).toBe(template);
    expect(removeDailyBriefing(template)).toBe(template);
  });
});
