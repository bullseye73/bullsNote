// MODEL: 에디터 확장 (해시태그 실시간 강조, 태그 자동완성, ``` 코드 블록/인라인 단축키)
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { createExtension } from '@blocknote/core';
import type { BlockNoteEditor } from '@blocknote/core';
import type { DefaultReactSuggestionItem } from '@blocknote/react';
import React from 'react';
import { IconHash, IconPlus } from '@tabler/icons-react';
import { Note } from './Note';
import { CODE_LANGUAGES } from './codeHighlight';
import { findMatchRanges } from './SearchService';

type AnyEditor = BlockNoteEditor<any, any, any>;

// 해시태그 정규식: 단어 경계 또는 공백 뒤의 #태그
export const HASHTAG_REGEX = /(?:^|\s)(#([가-힣a-zA-Z0-9_][가-힣a-zA-Z0-9_\-/]*))/g;

// 프로그래밍 언어 별칭(alias) 매핑 테이블
const LANGUAGE_ALIASES: Record<string, string> = {};
for (const [key, lang] of Object.entries(CODE_LANGUAGES)) {
  LANGUAGE_ALIASES[key.toLowerCase()] = key;
  if (lang.aliases) {
    for (const alias of lang.aliases) {
      LANGUAGE_ALIASES[alias.toLowerCase()] = key;
    }
  }
}

/** 언어 식별자 정규화 (예: js -> javascript, py -> python) */
export function resolveCodeLanguage(input: string): string {
  const clean = input.trim().toLowerCase();
  return LANGUAGE_ALIASES[clean] || (CODE_LANGUAGES[clean] ? clean : 'text');
}

export const hashtagPluginKey = new PluginKey('bullsnote-hashtag-highlighter');

/**
 * 1. 본문 내 해시태그(#태그) 실시간 데코레이션 하이라이트 플러그인
 * 코드 블록이나 인라인 코드 내부의 # 기호는 제외하고 일반 텍스트의 해시태그만 배지 형태로 스타일링
 */
export function createHashtagProseMirrorPlugin() {
  return new Plugin({
    key: hashtagPluginKey,
    props: {
      decorations(state) {
        try {
          const decorations: Decoration[] = [];
          const { doc } = state;
          // 로컬 정규식 생성으로 동시성 및 lastIndex 상태 오염 방지
          const hashtagRegex = /(?:^|\s)(#([가-힣a-zA-Z0-9_][가-힣a-zA-Z0-9_\-/]*))/g;

          doc.descendants((node, pos, parent) => {
            // 코드 블록 내부의 내용은 태그 데코레이션에서 제외
            if (parent && parent.type.name.toLowerCase().includes('code')) {
              return false;
            }
            if (!node.isText || !node.text) return;
            // 인라인 코드 mark가 붙은 텍스트 제외
            if (node.marks && node.marks.some((m) => m.type.name === 'code')) return;

            const text = node.text;
            let match: RegExpExecArray | null;
            hashtagRegex.lastIndex = 0;

            while ((match = hashtagRegex.exec(text)) !== null) {
              const fullMatch = match[0];
              const hashtagWithHash = match[1];
              const tagWithoutHash = match[2];

              const leadingSpaceLength = fullMatch.length - hashtagWithHash.length;
              const start = pos + match.index + leadingSpaceLength;
              const end = start + hashtagWithHash.length;

              // 문서 범위 유효성 검증
              if (start >= 0 && end <= doc.content.size && start < end) {
                decorations.push(
                  Decoration.inline(start, end, {
                    class: 'bn-hashtag-badge',
                    'data-tag': tagWithoutHash,
                    title: `#${tagWithoutHash} (클릭하여 태그 필터링)`,
                  })
                );
              }

              // 루프 무한 진행 방지
              if (match.index === hashtagRegex.lastIndex) {
                hashtagRegex.lastIndex++;
              }
            }
          });

          // ProseMirror 규격: decorations는 반드시 start 위치 오름차순으로 정렬되어야 함!
          decorations.sort((a, b) => a.from - b.from);

          return DecorationSet.create(doc, decorations);
        } catch {
          return DecorationSet.empty;
        }
      },
    },
  });
}

/**
 * 2. 해시태그 확장 (BlockNote용)
 */
export const HashtagExtension = createExtension(() => {
  return {
    key: 'bullsNoteHashtagExtension',
    prosemirrorPlugins: [createHashtagProseMirrorPlugin()],
  };
});

/**
 * 3. 코드 입력 단축키 확장
 * - ``` 또는 ```lang 입력 후 Enter/Space -> 즉시 멀티라인 codeBlock으로 변환
 * - Ctrl+Alt+C (Mac: Cmd+Alt+C) -> 현재 블록을 코드 블록으로 전환
 * - Ctrl+E (Mac: Cmd+E) -> 싱글라인(인라인) 코드 토글
 */
export const CodeShortcutsExtension = createExtension(({ editor }) => {
  return {
    key: 'bullsNoteCodeShortcuts',
    keyboardShortcuts: {
      Enter: () => {
        try {
          const cursor = editor.getTextCursorPosition();
          const block = cursor.block;
          if (block.type === 'codeBlock') {
            // 코드 블록 내부에서는 블록을 빠져나가지 않고 줄바꿈(\n)만 수행
            return editor.transact((tr) => {
              tr.insertText('\n');
              return true;
            });
          }

          // 현재 블록의 텍스트 확인
          const text = Array.isArray(block.content)
            ? block.content.map((c: any) => c.text || '').join('')
            : typeof block.content === 'string'
              ? block.content
              : '';

          // ``` 또는 ```lang 형태인지 검사
          const match = text.trim().match(/^```([a-zA-Z0-9_\-+#]*)$/);
          if (match) {
            const rawLang = match[1];
            const language = rawLang ? resolveCodeLanguage(rawLang) : 'javascript';

            editor.updateBlock(block, {
              type: 'codeBlock',
              props: { language },
              content: [],
            } as never);
            return true;
          }
        } catch {
          // 예외 발생 시 기본 동작 유지
        }
        return false;
      },
      // Shift+Enter도 코드 블록 내에서는 줄바꿈 유지
      'Shift-Enter': () => {
        try {
          const cursor = editor.getTextCursorPosition();
          const block = cursor.block;
          if (block.type === 'codeBlock') {
            return editor.transact((tr) => {
              tr.insertText('\n');
              return true;
            });
          }
        } catch {}
        return false;
      },
      // Ctrl + Enter (Mac: Cmd + Enter)로 코드 블록 빠져나오기
      'Mod-Enter': () => {
        try {
          const cursor = editor.getTextCursorPosition();
          const block = cursor.block;
          if (block.type === 'codeBlock') {
            const nextBlock = cursor.nextBlock;
            if (nextBlock) {
              editor.setTextCursorPosition(nextBlock, 'start');
              return true;
            }
            // 다음 블록이 없으면 새 문단 생성 후 이동
            const [newBlock] = editor.insertBlocks(
              [{ type: 'paragraph' }],
              block,
              'after'
            );
            editor.setTextCursorPosition(newBlock, 'start');
            return true;
          }
        } catch {}
        return false;
      },
      // 코드 블록 내 Tab 들여쓰기 지원 (2공백)
      Tab: () => {
        try {
          const cursor = editor.getTextCursorPosition();
          const block = cursor.block;
          if (block.type === 'codeBlock') {
            return editor.transact((tr) => {
              tr.insertText('  ');
              return true;
            });
          }
        } catch {}
        return false;
      },
      Space: () => {
        try {
          const cursor = editor.getTextCursorPosition();
          const block = cursor.block;
          if (block.type === 'codeBlock') {
            return false;
          }

          const text = Array.isArray(block.content)
            ? block.content.map((c: any) => c.text || '').join('')
            : typeof block.content === 'string'
              ? block.content
              : '';

          // ``` 또는 ```lang 뒤에 스페이스 입력 시
          const match = text.trim().match(/^```([a-zA-Z0-9_\-+#]*)$/);
          if (match) {
            const rawLang = match[1];
            const language = rawLang ? resolveCodeLanguage(rawLang) : 'javascript';

            editor.updateBlock(block, {
              type: 'codeBlock',
              props: { language },
              content: [],
            } as never);
            return true;
          }
        } catch {
          // 예외 발생 시 기본 동작 유지
        }
        return false;
      },
      // 멀티라인 코드 블록 토글 단축키: Ctrl + Alt + C (Mac: Cmd + Alt + C)
      'Mod-Alt-c': () => {
        try {
          const cursor = editor.getTextCursorPosition();
          const block = cursor.block;
          if (block.type === 'codeBlock') {
            editor.updateBlock(block, { type: 'paragraph' } as never);
          } else {
            editor.updateBlock(block, {
              type: 'codeBlock',
              props: { language: 'javascript' },
            } as never);
          }
          return true;
        } catch {
          return false;
        }
      },
      // 싱글라인 인라인 코드 토글 단축키: Ctrl + E (Mac: Cmd + E)
      'Mod-e': () => {
        try {
          editor.toggleStyles({ code: true });
          return true;
        } catch {
          return false;
        }
      },
      // 싱글라인 인라인 코드 토글 단축키: Ctrl + ` (Mac: Cmd + `)
      'Mod-`': () => {
        try {
          editor.toggleStyles({ code: true });
          return true;
        } catch {
          return false;
        }
      },
    },
  };
});

/**
 * 4. # 입력 시 나타나는 태그 추천/자동완성 아이템 목록 생성
 */
export function getHashtagSuggestions(
  query: string,
  editor: AnyEditor,
  notes: Note[],
  currentNote: Note
): DefaultReactSuggestionItem[] {
  const trimmed = query.trim().replace(/^#+/, '').toLowerCase();

  // 모든 노트에서 태그 수집 및 사용 횟수 집계
  const tagCountMap = new Map<string, number>();
  for (const n of notes) {
    if (Array.isArray(n.tags)) {
      for (const t of n.tags) {
        if (!t) continue;
        const norm = t.toLowerCase();
        tagCountMap.set(norm, (tagCountMap.get(norm) || 0) + 1);
      }
    }
  }

  // 사용 빈도순 정렬
  const sortedTags = Array.from(tagCountMap.entries()).sort((a, b) => b[1] - a[1]);

  const items: DefaultReactSuggestionItem[] = [];

  // 1. 사용자가 검색어를 입력 중인 경우 새 태그 생성 옵션 표시
  if (trimmed) {
    items.push({
      title: `#${trimmed}`,
      subtext: '새 태그 생성 (본문에 삽입)',
      badge: '새 태그',
      group: '태그 생성',
      icon: <IconPlus size={16} color="var(--mantine-color-blue-6)" />,
      onItemClick: () => {
        editor.insertInlineContent(`#${trimmed} `);
      },
    });
  }

  // 2. 기존 등록된 태그 목록 (검색어 필터링)
  const filtered = sortedTags.filter(([t]) => !trimmed || t.includes(trimmed));

  for (const [tag, count] of filtered) {
    // 만약 새 태그와 동일하면 중복 방지
    if (tag === trimmed && items.length > 0) continue;

    const isCurrent = currentNote.tags.some((t) => t.toLowerCase() === tag);

    items.push({
      title: `#${tag}`,
      subtext: `${count}개 노트에서 사용 중${isCurrent ? ' · 현재 노트에 이미 포함됨' : ''}`,
      badge: `${count}회`,
      aliases: [tag, `#${tag}`],
      group: '기존 태그',
      icon: <IconHash size={16} color="var(--mantine-color-teal-6)" />,
      onItemClick: () => {
        editor.insertInlineContent(`#${tag} `);
      },
    });
  }

  return items;
}

export const searchHighlightPluginKey = new PluginKey<{
  tokens: string[];
  decorations: DecorationSet;
  matchCount: number;
}>('bullsnote-search-highlighter');

let globalSearchTokens: string[] = [];

/**
 * 전역 또는 활성 검색 토큰 설정 (새로 생성되는 에디터 인스턴스 초기화에 사용)
 */
export function setGlobalSearchTokens(tokens: string[]) {
  globalSearchTokens = Array.isArray(tokens)
    ? tokens.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean)
    : [];
}

/**
 * 전역 검색 토큰 조회
 */
export function getGlobalSearchTokens(): string[] {
  return globalSearchTokens;
}

/**
 * ProseMirror Node 트리를 순회하여 검색어(일반 단어 및 초성)와 일치하는 텍스트 위치에 데코레이션 생성
 */
export function buildSearchDecorations(
  doc: any,
  tokens: string[]
): { decorations: DecorationSet; matchCount: number } {
  if (!tokens || tokens.length === 0) {
    return { decorations: DecorationSet.empty, matchCount: 0 };
  }

  const cleanTokens = tokens.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (cleanTokens.length === 0) {
    return { decorations: DecorationSet.empty, matchCount: 0 };
  }

  const decorations: Decoration[] = [];
  let matchCount = 0;

  try {
    doc.descendants((node: any, pos: number) => {
      if (!node.isText || !node.text) return;

      const ranges = findMatchRanges(node.text, cleanTokens);
      for (const [startOffset, endOffset] of ranges) {
        const from = pos + startOffset;
        const to = pos + endOffset;
        if (from >= 0 && to <= doc.content.size && from < to) {
          matchCount++;
          decorations.push(
            Decoration.inline(from, to, {
              class: 'bn-search-highlight',
              'data-search-token': node.text.slice(startOffset, endOffset),
            })
          );
        }
      }
    });

    decorations.sort((a, b) => a.from - b.from);
    return {
      decorations: DecorationSet.create(doc, decorations),
      matchCount,
    };
  } catch (err) {
    console.warn('검색 데코레이션 생성 실패:', err);
    return { decorations: DecorationSet.empty, matchCount: 0 };
  }
}

/**
 * 5. 본문 내 검색어(및 초성) 실시간 인라인 데코레이션 하이라이트 플러그인
 */
export function createSearchHighlightPlugin() {
  return new Plugin({
    key: searchHighlightPluginKey,
    state: {
      init(_, instance) {
        const initialTokens = getGlobalSearchTokens();
        const { decorations, matchCount } = buildSearchDecorations(instance.doc, initialTokens);
        return {
          tokens: initialTokens,
          decorations,
          matchCount,
        };
      },
      apply(tr, oldPluginState, _oldEditorState, newEditorState) {
        const meta = tr.getMeta(searchHighlightPluginKey);
        let tokens = oldPluginState?.tokens ?? [];
        let tokensChanged = false;

        if (meta && Array.isArray(meta.tokens)) {
          tokens = meta.tokens.map((t: string) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean);
          tokensChanged = true;
        }

        // 검색 토큰이 변경되었거나 문서 내용이 변경된 경우 데코레이션 재연산
        if (tokensChanged || tr.docChanged) {
          if (!tokens || tokens.length === 0) {
            return {
              tokens: [],
              decorations: DecorationSet.empty,
              matchCount: 0,
            };
          }
          const { decorations, matchCount } = buildSearchDecorations(newEditorState.doc, tokens);
          return {
            tokens,
            decorations,
            matchCount,
          };
        }

        return oldPluginState;
      },
    },
    props: {
      decorations(state) {
        return searchHighlightPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}

/**
 * 6. 본문 검색어 하이라이트 확장 (BlockNote용)
 */
export const SearchHighlightExtension = createExtension(() => {
  return {
    key: 'bullsNoteSearchHighlight',
    prosemirrorPlugins: [createSearchHighlightPlugin()],
  };
});
