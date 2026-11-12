// VIEW: 에디터 상단 빠른 편집 툴바 (미니멀·접기/펼치기 지원 + 인라인 서식/블록 변환/AI 보조)
import { ActionIcon, Button, Divider, Group, Menu, Text, Tooltip } from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconCalendar,
  IconCalendarEvent,
  IconChevronDown,
  IconChevronUp,
  IconClipboard,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconHash,
  IconHeading,
  IconHighlight,
  IconItalic,
  IconList,
  IconListNumbers,
  IconMinus,
  IconPhoto,
  IconPlus,
  IconQuote,
  IconSquareCheck,
  IconStrikethrough,
  IconTable,
  IconTerminal,
  IconTextSize,
  IconTool,
  IconUnderline,
  IconSparkles,
} from '@tabler/icons-react';
import type { BlockNoteEditor } from '@blocknote/core';
import { createContext, useContext, useState } from 'react';
import { AI_ACTIONS_META, AiActionType } from '../model/GeminiService';
import { SHORTCUTS } from '../model/shortcutUtils';

type AnyEditor = BlockNoteEditor<any, any, any>;

// 클릭 시 에디터 선택(커서)이 풀리지 않도록
const keepSelection = (e: React.MouseEvent) => e.preventDefault();

// 툴바 변형별 버튼 크기 (모바일 키보드 보조 막대는 터치 영역을 크게)
type ToolbarVariant = 'default' | 'accessory';
const ToolSizeContext = createContext<'sm' | 'lg'>('sm');

const TEXT_COLORS = [
  { name: '기본', value: 'default', css: 'var(--mantine-color-text)' },
  { name: '회색', value: 'gray', css: 'var(--mantine-color-gray-6)' },
  { name: '빨강', value: 'red', css: 'var(--mantine-color-red-6)' },
  { name: '주황', value: 'orange', css: 'var(--mantine-color-orange-6)' },
  { name: '노랑', value: 'yellow', css: 'var(--mantine-color-yellow-6)' },
  { name: '초록', value: 'green', css: 'var(--mantine-color-green-6)' },
  { name: '파랑', value: 'blue', css: 'var(--mantine-color-blue-6)' },
  { name: '보라', value: 'purple', css: 'var(--mantine-color-violet-6)' },
];

const BG_COLORS = [
  { name: '기본', value: 'default', css: 'transparent' },
  { name: '회색', value: 'gray', css: 'var(--mantine-color-gray-2)' },
  { name: '빨강', value: 'red', css: 'var(--mantine-color-red-1)' },
  { name: '주황', value: 'orange', css: 'var(--mantine-color-orange-1)' },
  { name: '노랑', value: 'yellow', css: 'var(--mantine-color-yellow-1)' },
  { name: '초록', value: 'green', css: 'var(--mantine-color-green-1)' },
  { name: '파랑', value: 'blue', css: 'var(--mantine-color-blue-1)' },
  { name: '보라', value: 'purple', css: 'var(--mantine-color-violet-1)' },
];

function Tool({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  const size = useContext(ToolSizeContext);
  return (
    <Tooltip label={label} disabled={size === 'lg'}>
      <ActionIcon
        variant="subtle"
        color="gray"
        size={size}
        onMouseDown={keepSelection}
        onClick={onClick}
        aria-label={label}
      >
        {children}
      </ActionIcon>
    </Tooltip>
  );
}

function DropdownTool({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const size = useContext(ToolSizeContext);
  return (
    <Menu position="bottom-start" withArrow shadow="md" withinPortal>
      <Menu.Target>
        <Tooltip label={label} disabled={size === 'lg'}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size={size}
            onMouseDown={keepSelection}
            aria-label={label}
            style={{ width: 'auto', padding: '0 5px' }}
          >
            <Group gap={2} wrap="nowrap">
              {icon}
              <IconChevronDown size={10} style={{ opacity: 0.6 }} />
            </Group>
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown onMouseDown={keepSelection}>{children}</Menu.Dropdown>
    </Menu>
  );
}

const TOOLBAR_COLLAPSED_KEY = 'bullsnote.editorToolbar.collapsed';

export function EditorToolbar({
  editor,
  onOpenDatePicker,
  onInsertToday,
  onTriggerAi,
  variant = 'default',
}: {
  editor: AnyEditor;
  onOpenDatePicker?: () => void;
  onInsertToday?: () => void;
  onTriggerAi?: (action: AiActionType) => void;
  /** accessory: 모바일 키보드 위 한 줄 가로 스크롤 막대 (접기 없음, 큰 터치 영역) */
  variant?: ToolbarVariant;
}) {
  const isAccessory = variant === 'accessory';
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TOOLBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(TOOLBAR_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const cursorBlock = () => {
    try {
      return editor.getTextCursorPosition().block;
    } catch {
      return undefined;
    }
  };

  const setType = (type: string, props?: Record<string, unknown>) => {
    const b = cursorBlock();
    if (!b) return;
    editor.updateBlock(b, { type, ...(props ? { props } : {}) } as never);
    editor.focus();
  };

  const insertAfter = (partial: Record<string, unknown>) => {
    const b = cursorBlock() ?? editor.document[editor.document.length - 1];
    if (!b) return;
    editor.insertBlocks([partial] as never, b, 'after');
    editor.focus();
  };

  const toggleOrInsertCodeBlock = () => {
    const b = cursorBlock();
    if (b) {
      if (b.type === 'codeBlock') {
        editor.updateBlock(b, { type: 'paragraph' } as never);
      } else {
        editor.updateBlock(b, {
          type: 'codeBlock',
          props: { language: 'javascript' },
        } as never);
      }
    } else {
      insertAfter({ type: 'codeBlock', props: { language: 'javascript' } });
    }
    editor.focus();
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(editor.blocksToMarkdownLossy());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 권한 거부 시 무시 */
    }
  };

  const aiMenu = (
    <Menu position="bottom-end" withArrow shadow="md" withinPortal>
      <Menu.Target>
        <Tooltip label="Gemini AI 어시스턴트 (요약, 서식 정리, 교정, 할 일 추출)">
          <Button
            variant="light"
            color="violet"
            size="compact-xs"
            onMouseDown={keepSelection}
            leftSection={<IconSparkles size={13} />}
            rightSection={<IconChevronDown size={10} style={{ opacity: 0.7 }} />}
            styles={{ root: { height: 24, fontSize: 11.5 } }}
          >
            AI 보조
          </Button>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown onMouseDown={keepSelection}>
        <Menu.Label>Gemini AI 작업</Menu.Label>
        {AI_ACTIONS_META.map((meta) => (
          <Menu.Item
            key={meta.type}
            leftSection={<span style={{ fontSize: 15 }}>{meta.icon}</span>}
            onClick={() => onTriggerAi?.(meta.type)}
          >
            <div>
              <span style={{ fontWeight: 600 }}>{meta.label}</span>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{meta.description}</div>
            </div>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );

  if (collapsed && !isAccessory) {
    return (
      <Group
        justify="space-between"
        align="center"
        py={2}
        px={4}
        onMouseDown={keepSelection}
        style={{ borderBottom: '1px solid var(--bn-border-subtle)' }}
      >
        <Group gap={8}>
          <Text size="11px" c="dimmed">
            💡 본문에서 <kbd style={{ fontSize: 10 }}>/</kbd> 로 블록 삽입, 텍스트 드래그 시 플로팅 서식 툴바가 표시됩니다
          </Text>
        </Group>
        <Group gap={6}>
          {aiMenu}
          <Tooltip label="상단 서식 툴바 펼치기">
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<IconTool size={12} />}
              rightSection={<IconChevronDown size={11} />}
              onClick={toggleCollapsed}
              styles={{ root: { height: 24, fontSize: 11 } }}
            >
              서식 도구
            </Button>
          </Tooltip>
        </Group>
      </Group>
    );
  }

  return (
    <ToolSizeContext.Provider value={isAccessory ? 'lg' : 'sm'}>
    <Group
      justify="space-between"
      wrap={isAccessory ? 'nowrap' : 'wrap'}
      gap={4}
      py={4}
      px={6}
      className={isAccessory ? 'bn-toolbar-accessory' : undefined}
      style={
        isAccessory
          ? {
              // 모바일: 한 줄 가로 스크롤 (스크롤바 숨김)
              overflowX: 'auto',
              overflowY: 'hidden',
              alignItems: 'center',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }
          : {
              overflow: 'visible',
              alignItems: 'center',
              backgroundColor: 'var(--bn-card-hover)',
              borderRadius: 8,
              border: '1px solid var(--bn-border-subtle)',
            }
      }
      onMouseDown={keepSelection}
    >
      <Group gap={2} wrap={isAccessory ? 'nowrap' : 'wrap'} style={{ alignItems: 'center', flexShrink: 0 }}>
        {/* 실행 취소 / 다시 실행 */}
        <Tool label={`실행 취소 (${SHORTCUTS.undo})`} onClick={() => editor.undo()}>
          <IconArrowBackUp size={15} />
        </Tool>
        <Tool label={`다시 실행 (${SHORTCUTS.redo})`} onClick={() => editor.redo()}>
          <IconArrowForwardUp size={15} />
        </Tool>

        <Divider orientation="vertical" color="var(--bn-border-subtle)" mx={2} />

        {/* 기본 인라인 서식 */}
        <Tool label={`굵게 (${SHORTCUTS.bold})`} onClick={() => editor.toggleStyles({ bold: true })}>
          <IconBold size={15} />
        </Tool>
        <Tool label={`기울임 (${SHORTCUTS.italic})`} onClick={() => editor.toggleStyles({ italic: true })}>
          <IconItalic size={15} />
        </Tool>
        <Tool label={`밑줄 (${SHORTCUTS.underline})`} onClick={() => editor.toggleStyles({ underline: true })}>
          <IconUnderline size={15} />
        </Tool>
        <Tool label="취소선" onClick={() => editor.toggleStyles({ strike: true })}>
          <IconStrikethrough size={15} />
        </Tool>
        <Tool
          label={`싱글라인 인라인 코드 (${SHORTCUTS.inlineCode}, \`코드\`)`}
          onClick={() => editor.toggleStyles({ code: true })}
        >
          <IconCode size={15} />
        </Tool>
        <Tool
          label={`멀티라인 코드 블록 (\`\`\` + Enter 또는 ${SHORTCUTS.codeBlock})`}
          onClick={toggleOrInsertCodeBlock}
        >
          <IconTerminal size={15} />
        </Tool>
        <Tool
          label="해시태그 삽입 (단축키: #)"
          onClick={() => {
            editor.focus();
            editor.insertInlineContent('#');
          }}
        >
          <IconHash size={15} />
        </Tool>

        {/* 글자색 드롭다운 */}
        <Menu position="bottom-start" withArrow shadow="md" withinPortal>
          <Menu.Target>
            <Tooltip label="글자색">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onMouseDown={keepSelection}
                aria-label="글자색"
                style={{ width: 'auto', padding: '0 5px' }}
              >
                <Group gap={2} wrap="nowrap">
                  <span style={{ fontWeight: 800, fontSize: 12, lineHeight: 1 }}>A</span>
                  <IconChevronDown size={10} style={{ opacity: 0.6 }} />
                </Group>
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown onMouseDown={keepSelection}>
            <Menu.Label>글자색</Menu.Label>
            {TEXT_COLORS.map((c) => (
              <Menu.Item
                key={c.value}
                leftSection={
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      background: c.css,
                      border: '1px solid var(--mantine-color-gray-4)',
                    }}
                  />
                }
                onClick={() => editor.toggleStyles({ textColor: c.value })}
              >
                {c.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>

        {/* 배경색(형광펜) 드롭다운 */}
        <Menu position="bottom-start" withArrow shadow="md" withinPortal>
          <Menu.Target>
            <Tooltip label="배경색 (형광펜)">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onMouseDown={keepSelection}
                aria-label="배경색"
                style={{ width: 'auto', padding: '0 5px' }}
              >
                <Group gap={2} wrap="nowrap">
                  <IconHighlight size={14} />
                  <IconChevronDown size={10} style={{ opacity: 0.6 }} />
                </Group>
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown onMouseDown={keepSelection}>
            <Menu.Label>배경색 (형광펜)</Menu.Label>
            {BG_COLORS.map((c) => (
              <Menu.Item
                key={c.value}
                leftSection={
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      background: c.css,
                      border: '1px solid var(--mantine-color-gray-4)',
                    }}
                  />
                }
                onClick={() => editor.toggleStyles({ backgroundColor: c.value })}
              >
                {c.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>

        <Divider orientation="vertical" color="var(--bn-border-subtle)" mx={2} />

        {/* 1. 제목 / 본문 스타일 드롭다운 */}
        <DropdownTool label="제목 및 본문 스타일" icon={<IconHeading size={15} />}>
          <Menu.Label>텍스트 스타일</Menu.Label>
          <Menu.Item leftSection={<IconH1 size={15} />} onClick={() => setType('heading', { level: 1 })}>
            제목 1 (H1)
          </Menu.Item>
          <Menu.Item leftSection={<IconH2 size={15} />} onClick={() => setType('heading', { level: 2 })}>
            제목 2 (H2)
          </Menu.Item>
          <Menu.Item leftSection={<IconH3 size={15} />} onClick={() => setType('heading', { level: 3 })}>
            제목 3 (H3)
          </Menu.Item>
          <Menu.Item leftSection={<IconTextSize size={15} />} onClick={() => setType('paragraph')}>
            일반 본문 (Paragraph)
          </Menu.Item>
        </DropdownTool>

        {/* 2. 목록 스타일 드롭다운 */}
        <DropdownTool label="목록 스타일" icon={<IconList size={15} />}>
          <Menu.Label>목록 스타일</Menu.Label>
          <Menu.Item leftSection={<IconList size={15} />} onClick={() => setType('bulletListItem')}>
            글머리 기호 목록
          </Menu.Item>
          <Menu.Item leftSection={<IconListNumbers size={15} />} onClick={() => setType('numberedListItem')}>
            번호 매기기 목록
          </Menu.Item>
          <Menu.Item leftSection={<IconSquareCheck size={15} />} onClick={() => setType('checkListItem')}>
            할 일 체크리스트
          </Menu.Item>
        </DropdownTool>

        {/* 3. 블록 및 미디어 삽입 드롭다운 */}
        <DropdownTool label="표 / 요소 / 미디어 삽입" icon={<IconPlus size={15} />}>
          <Menu.Label>블록 삽입</Menu.Label>
          <Menu.Item
            leftSection={<IconTable size={15} />}
            onClick={() =>
              insertAfter({
                type: 'table',
                content: { type: 'tableContent', rows: [{ cells: ['', '', ''] }, { cells: ['', '', ''] }] },
              })
            }
          >
            표 삽입 (3x2 Table)
          </Menu.Item>
          <Menu.Item leftSection={<IconQuote size={15} />} onClick={() => setType('quote')}>
            인용구 블록
          </Menu.Item>
          <Menu.Item leftSection={<IconTerminal size={15} />} onClick={() => setType('codeBlock')}>
            코드 블록 (문법 강조)
          </Menu.Item>
          <Menu.Divider />
          <Menu.Label>미디어 / 구분선</Menu.Label>
          <Menu.Item leftSection={<IconPhoto size={15} />} onClick={() => insertAfter({ type: 'image' })}>
            이미지 삽입
          </Menu.Item>
          <Menu.Item leftSection={<IconMinus size={15} />} onClick={() => insertAfter({ type: 'divider' })}>
            구분선 삽입
          </Menu.Item>
          <Menu.Divider />
          <Menu.Label>날짜 삽입</Menu.Label>
          <Menu.Item leftSection={<IconCalendarEvent size={15} />} onClick={onOpenDatePicker}>
            날짜 삽입 (달력 / 사용자 지정)...
          </Menu.Item>
          <Menu.Item leftSection={<IconCalendar size={15} />} onClick={onInsertToday}>
            오늘 날짜 삽입 ({SHORTCUTS.insertDate})
          </Menu.Item>
        </DropdownTool>

        {/* 빠른 오늘 날짜 삽입 단축 버튼 */}
        <Tool
          label={`오늘 날짜 바로 삽입 (단축키: ${SHORTCUTS.insertDate} / @오늘)`}
          onClick={() => onInsertToday?.()}
        >
          <IconCalendar size={15} />
        </Tool>

        <Divider orientation="vertical" color="var(--bn-border-subtle)" mx={2} />

        {/* 마크다운 복사 */}
        <Tool label={copied ? '복사됨!' : 'Markdown으로 복사'} onClick={() => void copyMarkdown()}>
          <IconClipboard size={15} />
        </Tool>
      </Group>

      <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
        {aiMenu}
        {!isAccessory && (
          <Tooltip label="상단 서식 툴바 접기 (텍스트 선택 시 플로팅 툴바 사용 가능)">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onMouseDown={keepSelection}
              onClick={toggleCollapsed}
              aria-label="서식 툴바 접기"
            >
              <IconChevronUp size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Group>
    </ToolSizeContext.Provider>
  );
}
