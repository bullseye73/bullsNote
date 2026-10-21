import React from 'react';
import { findMatchRanges } from '../model/SearchService';

interface HighlightTextProps {
  text: string;
  tokens?: string[];
  style?: React.CSSProperties;
  className?: string;
}

interface TextSpan {
  text: string;
  isMatch: boolean;
}

/** 텍스트 내에서 일반 키워드 및 초성 매칭 구간을 찾아 분할 */
function splitByMatches(text: string, tokens: string[]): TextSpan[] {
  if (!text || !tokens || tokens.length === 0) {
    return [{ text, isMatch: false }];
  }

  const merged = findMatchRanges(text, tokens);
  if (merged.length === 0) {
    return [{ text, isMatch: false }];
  }

  // 병합된 구간을 바탕으로 텍스트 조각 분할
  const spans: TextSpan[] = [];
  let lastIdx = 0;

  for (const [start, end] of merged) {
    if (start > lastIdx) {
      spans.push({ text: text.slice(lastIdx, start), isMatch: false });
    }
    spans.push({ text: text.slice(start, end), isMatch: true });
    lastIdx = end;
  }

  if (lastIdx < text.length) {
    spans.push({ text: text.slice(lastIdx), isMatch: false });
  }

  return spans;
}

export function HighlightText({ text, tokens = [], style, className }: HighlightTextProps) {
  const spans = splitByMatches(text, tokens);

  return (
    <span style={style} className={className}>
      {spans.map((span, idx) =>
        span.isMatch ? (
          <mark
            key={idx}
            style={{
              backgroundColor: 'rgba(255, 212, 59, 0.4)',
              color: 'inherit',
              padding: '0 2px',
              borderRadius: 3,
              fontWeight: 600,
            }}
          >
            {span.text}
          </mark>
        ) : (
          <React.Fragment key={idx}>{span.text}</React.Fragment>
        )
      )}
    </span>
  );
}
