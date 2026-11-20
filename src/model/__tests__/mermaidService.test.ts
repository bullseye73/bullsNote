import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MERMAID_CODE,
  DEFAULT_MERMAID_VIEW_MODE,
  MERMAID_TEMPLATES,
  buildMermaidSlashSpecs,
  isMermaidLanguage,
  renderMermaidSvg,
} from '../mermaidService';
import { CODE_LANGUAGES, getHighlighter } from '../codeHighlight';
import { resolveCodeLanguage } from '../editorExtensions';

describe('mermaidService', () => {
  it('기본 뷰 모드는 split(Mermaid 에디터)이고 기본 코드는 flowchart로 시작한다', () => {
    expect(DEFAULT_MERMAID_VIEW_MODE).toBe('split');
    expect(DEFAULT_MERMAID_CODE).toBe(MERMAID_TEMPLATES.flowchart.code);
    expect(DEFAULT_MERMAID_CODE.trim().startsWith('flowchart')).toBe(true);
  });

  it('5가지 기본 템플릿(flowchart, sequence, er, gantt, mindmap)을 모두 제공한다', () => {
    expect(Object.keys(MERMAID_TEMPLATES)).toEqual([
      'flowchart',
      'sequence',
      'er',
      'gantt',
      'mindmap',
    ]);
    for (const tpl of Object.values(MERMAID_TEMPLATES)) {
      expect(tpl.label.length).toBeGreaterThan(0);
      expect(tpl.code.trim().length).toBeGreaterThan(0);
    }
  });

  it('isMermaidLanguage는 mermaid 및 mmd 별칭만 true를 반환한다', () => {
    expect(isMermaidLanguage('mermaid')).toBe(true);
    expect(isMermaidLanguage('MERMAID')).toBe(true);
    expect(isMermaidLanguage('mmd')).toBe(true);
    expect(isMermaidLanguage(' mmd ')).toBe(true);
    expect(isMermaidLanguage('javascript')).toBe(false);
    expect(isMermaidLanguage('')).toBe(false);
    expect(isMermaidLanguage(undefined)).toBe(false);
  });

  it('CODE_LANGUAGES와 resolveCodeLanguage가 mermaid 및 mmd를 지원한다', () => {
    expect(CODE_LANGUAGES.mermaid).toEqual({ name: 'Mermaid', aliases: ['mmd'] });
    expect(resolveCodeLanguage('mermaid')).toBe('mermaid');
    expect(resolveCodeLanguage('mmd')).toBe('mermaid');
    expect(resolveCodeLanguage('MMD')).toBe('mermaid');
  });

  it('buildMermaidSlashSpecs는 슬래시 메뉴 메타데이터를 올바르게 생성한다', () => {
    const specs = buildMermaidSlashSpecs();
    expect(specs).toHaveLength(1);
    const spec = specs[0];
    expect(spec.language).toBe('mermaid');
    expect(spec.defaultViewMode).toBe('split');
    expect(spec.defaultCode.startsWith('flowchart')).toBe(true);
    expect(spec.aliases).toEqual(
      expect.arrayContaining(['mermaid', '다이어그램', '플로우차트', 'flowchart'])
    );
  });

  it('renderMermaidSvg는 빈 입력 시 오류 객체를 반환한다', async () => {
    const emptyRes = await renderMermaidSvg('test-1', '', false);
    expect('error' in emptyRes).toBe(true);

    const blankRes = await renderMermaidSvg('test-2', '   \n  ', true);
    expect('error' in blankRes).toBe(true);
  });

  it('getHighlighter는 mermaid 블록용 text 폴백 하이라이팅을 정상 초기화한다', async () => {
    const highlighter = await getHighlighter();
    expect(highlighter).toBeDefined();
    const tokens = highlighter.codeToTokens(DEFAULT_MERMAID_CODE, {
      lang: 'text',
      themes: { light: 'github-light', dark: 'github-dark' },
    });
    expect(tokens.tokens.length).toBeGreaterThan(0);
  });
});
