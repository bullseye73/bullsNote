// VIEW: 노트 본문 헤딩(H1/H2/H3) 기반 우측 상단 고정 목차(TOC) 컴포넌트
import {
  ActionIcon,
  Collapse,
  Group,
  Paper,
  ScrollArea,
  Text,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconListTree } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
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

export function NoteTableOfContents({ editor, scrollContainerRef }: NoteTableOfContentsProps) {
  const scheme = useComputedColorScheme('light');
  const isDark = scheme === 'dark';

  // 로컬 스토리지에 펼침/접힘 상태 기억
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('bullsnote.toc.expanded');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const { headings, activeId, scrollToHeading } = useNoteHeadings(editor, scrollContainerRef);

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('bullsnote.toc.expanded', String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const handleHeadingClick = scrollToHeading;

  // 헤딩이 없는 경우 표시하지 않음
  if (headings.length === 0) {
    return null;
  }

  return (
    <div
      className="no-print"
      style={{
        position: 'absolute',
        top: 14,
        right: 18,
        zIndex: 10,
        pointerEvents: 'none', // 배경 클릭 통과
      }}
    >
      <Paper
        shadow="md"
        radius="md"
        p={expanded ? 'xs' : '4px 8px'}
        style={{
          pointerEvents: 'auto', // 컨트롤 영역만 이벤트 수신
          width: expanded ? 220 : 'auto',
          backgroundColor: isDark ? 'rgba(26, 27, 30, 0.88)' : 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(10px)',
          border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'}`,
          transition: 'width 0.2s ease, padding 0.2s ease',
          userSelect: 'none',
        }}
      >
        {/* 목차 헤더 바 */}
        <Group
          justify="space-between"
          gap={6}
          style={{ cursor: 'pointer' }}
          onClick={toggleExpanded}
          wrap="nowrap"
        >
          <Group gap={5} wrap="nowrap">
            <IconListTree size={14} style={{ opacity: 0.7 }} />
            <Text size="xs" fw={700} c={isDark ? 'gray.3' : 'dark.4'}>
              목차
            </Text>
            {!expanded && (
              <Text size="10px" c="dimmed">
                ({headings.length})
              </Text>
            )}
          </Group>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="xs"
            aria-label={expanded ? '목차 접기' : '목차 펼치기'}
          >
            {expanded ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
          </ActionIcon>
        </Group>

        {/* 목차 항목 리스트 */}
        <Collapse in={expanded}>
          <ScrollArea.Autosize mah="55vh" type="hover" offsetScrollbars style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {headings.map((h) => {
                const isActive = activeId === h.id;
                const indent = Math.max(0, (h.level - 1) * 10);

                return (
                  <Tooltip key={h.id} label={h.text} position="left" withArrow openDelay={400}>
                    <UnstyledButton
                      onClick={() => handleHeadingClick(h.id)}
                      style={{
                        padding: '4px 8px',
                        paddingLeft: `${8 + indent}px`,
                        borderRadius: 5,
                        backgroundColor: isActive
                          ? isDark
                            ? 'rgba(255, 255, 255, 0.14)'
                            : 'rgba(0, 0, 0, 0.08)'
                          : 'transparent',
                        color: isActive
                          ? isDark
                            ? '#ffffff'
                            : '#111827'
                          : isDark
                          ? 'rgba(255, 255, 255, 0.7)'
                          : '#4b5563',
                        fontWeight: isActive ? 600 : 400,
                        fontSize: '12px',
                        lineHeight: 1.4,
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        transition: 'background-color 0.15s ease, color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = isDark
                            ? 'rgba(255, 255, 255, 0.06)'
                            : 'rgba(0, 0, 0, 0.04)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      {h.text}
                    </UnstyledButton>
                  </Tooltip>
                );
              })}
            </div>
          </ScrollArea.Autosize>
        </Collapse>
      </Paper>
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
