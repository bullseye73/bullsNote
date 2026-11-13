// VIEW: 노트 본문 헤딩(H1/H2/H3) 기반 우측 상단 고정 목차(TOC) 컴포넌트
import { Paper, ScrollArea, Text, UnstyledButton } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BlockNoteEditor } from '@blocknote/core';

type AnyEditor = BlockNoteEditor<any, any, any>;

export interface HeadingItem {
  id: string;
  level: number;
  text: string;
}

/** BlockNote 문서에서 헤딩 블록 추출 */
export function extractHeadings(editor: AnyEditor | null): HeadingItem[] {
  if (!editor || !editor.document) return [];
  const items: HeadingItem[] = [];

  const walk = (blocks: any[]) => {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'heading') {
        const level = typeof b.props?.level === 'number' ? b.props.level : 1;
        let text = '';
        if (Array.isArray(b.content)) {
          text = b.content.map((c: any) => c?.text || '').join('');
        } else if (typeof b.content === 'string') {
          text = b.content;
        }
        items.push({
          id: b.id,
          level,
          text: text.trim() || `제목 ${level}`,
        });
      }
      if (Array.isArray(b.children)) {
        walk(b.children);
      }
    }
  };

  walk(editor.document);
  return items;
}

interface NoteTableOfContentsProps {
  editor: AnyEditor | null;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

/** 에디터 헤딩 목록·현재 위치 헤딩·이동 함수를 제공하는 재사용 훅 (플로팅 목차·모바일 목차 시트 공용) */
export function useNoteHeadings(
  editor: AnyEditor | null,
  scrollContainerRef: React.RefObject<HTMLElement | null>
) {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // 헤딩 목록 업데이트
  const updateHeadings = useCallback(() => {
    setHeadings(editor ? extractHeadings(editor) : []);
  }, [editor]);

  // 에디터 변경 감지
  useEffect(() => {
    updateHeadings();
    if (!editor) return;
    const unsubscribe = editor.onChange(() => {
      updateHeadings();
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [editor, updateHeadings]);

  // 스크롤 시 현재 뷰포트에 있는 헤딩 하이라이트 감지
  const container = scrollContainerRef.current;
  useEffect(() => {
    if (!container || headings.length === 0) return;

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      let currentActive = headings[0]?.id || null;
      for (const h of headings) {
        const el = document.querySelector(`[data-id="${h.id}"]`);
        if (el) {
          if (el.getBoundingClientRect().top <= containerRect.top + 100) {
            currentActive = h.id;
          } else {
            break;
          }
        }
      }
      setActiveId(currentActive);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // 초기 위치 반영
    return () => container.removeEventListener('scroll', handleScroll);
  }, [headings, container]);

  const scrollToHeading = useCallback((id: string) => {
    setActiveId(id);
    document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return { headings, activeId, scrollToHeading };
}

/** 목차 막대의 선 길이: 제목 수준이 깊을수록 짧게 (노션식 미니맵) */
const RAIL_WIDTH_BY_LEVEL: Record<number, number> = { 1: 16, 2: 12, 3: 8 };

/**
 * 데스크톱 목차: 평소에는 오른쪽 가장자리의 얇은 선 막대(본문을 가리지 않음),
 * 마우스를 올리면 제목 목록이 펼쳐지고 누르면 그 위치로 이동
 */
export function NoteTableOfContents({ editor, scrollContainerRef }: NoteTableOfContentsProps) {
  const { headings, activeId, scrollToHeading } = useNoteHeadings(editor, scrollContainerRef);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  if (headings.length === 0) return null;

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // 막대와 목록 사이를 지나는 동안 닫히지 않도록 약간 늦게 닫음
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div
      className="no-print"
      onMouseEnter={show}
      onMouseLeave={hide}
      style={{ position: 'absolute', top: 16, right: 6, zIndex: 10, display: 'flex', alignItems: 'flex-start' }}
    >
      {open && (
        <Paper
          shadow="md"
          radius="md"
          p={6}
          style={{
            width: 260,
            marginRight: 6,
            backgroundColor: 'var(--mantine-color-body)',
            border: '1px solid var(--bn-border-subtle)',
          }}
        >
          <ScrollArea.Autosize mah="60vh" type="auto">
            <nav aria-label="목차" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {headings.map((h) => {
                const isActive = activeId === h.id;
                return (
                  <UnstyledButton
                    key={h.id}
                    onClick={() => scrollToHeading(h.id)}
                    className="bn-toc-row"
                    data-active={isActive || undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 8px',
                      paddingLeft: 8 + Math.max(0, h.level - 1) * 14,
                      borderRadius: 6,
                      fontSize: 13,
                      lineHeight: 1.4,
                      color: isActive ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-text)',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <span aria-hidden style={{ flexShrink: 0, opacity: 0.45 }}>—</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.text}</span>
                  </UnstyledButton>
                );
              })}
            </nav>
          </ScrollArea.Autosize>
        </Paper>
      )}

      {/* 평소 모습: 제목마다 짧은 선 하나 (현재 위치는 진하게) */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`목차 (${headings.length})`}
        onFocus={show}
        onBlur={hide}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 7,
          padding: '6px 4px',
          cursor: 'pointer',
          maxHeight: '60vh',
          overflow: 'hidden',
        }}
      >
        {headings.map((h) => (
          <span
            key={h.id}
            style={{
              display: 'block',
              width: RAIL_WIDTH_BY_LEVEL[h.level] ?? 8,
              height: 2,
              borderRadius: 1,
              backgroundColor:
                activeId === h.id ? 'var(--mantine-color-text)' : 'var(--mantine-color-dimmed)',
              opacity: activeId === h.id ? 0.9 : 0.4,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** 모바일 목차 시트용 헤딩 목록 (큰 터치 영역, 현재 위치 강조) */
export function TocTouchList({
  headings,
  activeId,
  onSelect,
}: {
  headings: HeadingItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (headings.length === 0) {
    return (
      <Text size="sm" c="dimmed" py="md" ta="center">
        본문에 제목(H1~H3)을 추가하면 목차가 표시됩니다
      </Text>
    );
  }
  return (
    <ScrollArea.Autosize mah="60dvh" type="auto">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {headings.map((h) => {
          const isActive = activeId === h.id;
          return (
            <UnstyledButton
              key={h.id}
              onClick={() => onSelect(h.id)}
              style={{
                minHeight: 44,
                padding: `0 12px 0 ${12 + Math.max(0, (h.level - 1) * 16)}px`,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                fontSize: h.level === 1 ? 15 : 14,
                fontWeight: isActive || h.level === 1 ? 600 : 400,
                color: isActive ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-text)',
                backgroundColor: isActive ? 'var(--mantine-color-blue-light)' : 'transparent',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.text}</span>
            </UnstyledButton>
          );
        })}
      </div>
    </ScrollArea.Autosize>
  );
}
