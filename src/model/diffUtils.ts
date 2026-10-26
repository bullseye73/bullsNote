// MODEL: Git 스타일 라인 단위 텍스트 비교(Diff) 유틸리티 (LCS 알고리즘 기반)
import { noteBodyText } from './HashtagService';

export type DiffType = 'added' | 'removed' | 'unchanged';

export interface DiffLine {
  type: DiffType;
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffResult {
  lines: DiffLine[];
  additions: number;
  deletions: number;
  hasChanges: boolean;
}

/**
 * 노트 내용(블록 JSON 또는 마크다운)을 비교용 일반 텍스트 라인 배열로 정규화
 */
export function normalizeContentForDiff(content: string): string {
  if (!content) return '';
  const text = noteBodyText(content);
  return text.replace(/\r\n/g, '\n').trimEnd();
}

/**
 * 두 텍스트 사이의 줄 단위 Diff 계산 (LCS 기반 Myers Diff 유사 알고리즘)
 */
export function computeLineDiff(oldContent: string, newContent: string): DiffResult {
  const oldNorm = normalizeContentForDiff(oldContent);
  const newNorm = normalizeContentForDiff(newContent);

  const oldLines = oldNorm === '' ? [] : oldNorm.split('\n');
  const newLines = newNorm === '' ? [] : newNorm.split('\n');

  const m = oldLines.length;
  const n = newLines.length;

  // 두 텍스트가 완전히 동일한 경우 빠른 반환
  if (oldNorm === newNorm) {
    const lines: DiffLine[] = oldLines.map((line, idx) => ({
      type: 'unchanged',
      text: line,
      oldLineNumber: idx + 1,
      newLineNumber: idx + 1,
    }));
    return {
      lines,
      additions: 0,
      deletions: 0,
      hasChanges: false,
    };
  }

  // 1. LCS (최장 공통 부분 수열) 동적 프로그래밍 테이블 계산
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // 2. 역추적으로 Diff 라인 생성
  const resultReversed: DiffLine[] = [];
  let i = m;
  let j = n;
  let additions = 0;
  let deletions = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      resultReversed.push({
        type: 'unchanged',
        text: oldLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      resultReversed.push({
        type: 'added',
        text: newLines[j - 1],
        newLineNumber: j,
      });
      additions++;
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      resultReversed.push({
        type: 'removed',
        text: oldLines[i - 1],
        oldLineNumber: i,
      });
      deletions++;
      i--;
    }
  }

  const lines = resultReversed.reverse();

  return {
    lines,
    additions,
    deletions,
    hasChanges: additions > 0 || deletions > 0,
  };
}
