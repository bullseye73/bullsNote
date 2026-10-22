// VIEW: 에디터 상단 빠른 편집 툴바 (인라인 서식/블록 변환/삽입)
import { ActionIcon, Divider, Group, Menu, Tooltip } from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconCalendar,
  IconCalendarEvent,
  IconChevronDown,
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
  IconUnderline,
  IconSparkles,
  IconWand,
  IconPencilCheck,
  IconChecklist,
  IconWriting,
  IconLanguage,
} from '@tabler/icons-react';
import type { BlockNoteEditor } from '@blocknote/core';
import { useState } from 'react';
import { AI_ACTIONS_META, AiActionType } from '../model/GeminiService';

type AnyEditor = BlockNoteEditor<any, any, any>;

// 클릭 시 에디터 선택(커서)이 풀리지 않도록
const keepSelection = (e: React.MouseEvent) => e.preventDefault();

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
  return (
    <Tooltip label={label}>
      <ActionIcon variant="light" size="md" onMouseDown={keepSelection} onClick={onClick} aria-label={label}>
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
  return (
    <Menu position="bottom-start" withArrow shadow="md" withinPortal>
      <Menu.Target>
        <Tooltip label={label}>
          <ActionIcon
            variant="light"
            size="md"
            onMouseDown={keepSelection}
            aria-label={label}
            style={{ width: 'auto', padding: '0 6px' }}
          >
            <Group gap={3} wrap="nowrap">
              {icon}
              <IconChevronDown size={11} style={{ opacity: 0.7 }} />
            </Group>
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown onMouseDown={keepSelection}>{children}</Menu.Dropdown>
    </Menu>
  );
}

export function EditorToolbar({
  editor,
  onOpenDatePicker,
  onInsertToday,
  onTriggerAi,
}: {
  editor: AnyEditor;
  onOpenDatePicker?: () => void;
  onInsertToday?: () => void;
  onTriggerAi?: (action: AiActionType) => void;
}) {
  const [copied, setCopied] = useState(false);

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

  return (
    <Group
      gap={4}
      wrap="wrap"
      style={{ overflow: 'visible', paddingBottom: 2, alignItems: 'center' }}
      onMouseDown={keepSelection}
    >
      {/* 실행 취소 / 다시 실행 */}
      <Tool label="실행 취소 (Ctrl+Z)" onClick={() => editor.undo()}>
        <IconArrowBackUp size={16} />
      </Tool>
      <Tool label="다시 실행 (Ctrl+Y)" onClick={() => editor.redo()}>
        <IconArrowForwardUp size={16} />
      </Tool>

      <Divider orientation="vertical" />

      {/* 기본 인라인 서식 */}
      <Tool label="굵게 (Ctrl+B)" onClick={() => editor.toggleStyles({ bold: true })}>
        <IconBold size={16} />
      </Tool>
      <Tool label="기울임 (Ctrl+I)" onClick={() => editor.toggleStyles({ italic: true })}>
        <IconItalic size={16} />
      </Tool>
      <Tool label="밑줄 (Ctrl+U)" onClick={() => editor.toggleStyles({ underline: true })}>
        <IconUnderline size={16} />
      </Tool>
      <Tool label="취소선" onClick={() => editor.toggleStyles({ strike: true })}>
        <IconStrikethrough size={16} />
      </Tool>
      <Tool
        label="싱글라인 인라인 코드 (Ctrl+` 또는 Ctrl+E, `코드`)"
        onClick={() => editor.toggleStyles({ code: true })}
      >
        <IconCode size={16} />
      </Tool>
      <Tool
        label="멀티라인 코드 블록 (``` + Enter 또는 Ctrl+Alt+C)"
        onClick={toggleOrInsertCodeBlock}
      >
        <IconTerminal size={16} />
      </Tool>
      <Tool
        label="해시태그 삽입 (단축키: #)"
        onClick={() => {
          editor.focus();
          editor.insertInlineContent('#');
        }}
      >
        <IconHash size={16} />
      </Tool>

      {/* 글자색 드롭다운 */}
      <Menu position="bottom-start" withArrow shadow="md" withinPortal>
        <Menu.Target>
          <Tooltip label="글자색">
            <ActionIcon
              variant="light"
              size="md"
              onMouseDown={keepSelection}
              aria-label="글자색"
              style={{ width: 'auto', padding: '0 6px' }}
            >
              <Group gap={3} wrap="nowrap">
                <span style={{ fontWeight: 800, fontSize: 13, lineHeight: 1 }}>A</span>
                <IconChevronDown size={11} style={{ opacity: 0.7 }} />
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
              variant="light"
              size="md"
              onMouseDown={keepSelection}
              aria-label="배경색"
              style={{ width: 'auto', padding: '0 6px' }}
            >
              <Group gap={3} wrap="nowrap">
                <IconHighlight size={15} />
                <IconChevronDown size={11} style={{ opacity: 0.7 }} />
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

      <Divider orientation="vertical" />

      {/* 1. 제목 / 본문 스타일 드롭다운 */}
      <DropdownTool label="제목 및 본문 스타일" icon={<IconHeading size={16} />}>
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
      <DropdownTool label="목록 스타일" icon={<IconList size={16} />}>
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
      <DropdownTool label="표 / 요소 / 미디어 삽입" icon={<IconPlus size={16} />}>
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
        <Menu.Item
          leftSection={<IconCalendarEvent size={15} />}
          onClick={onOpenDatePicker}
        >
          날짜 삽입 (달력 / 사용자 지정)...
        </Menu.Item>
        <Menu.Item
          leftSection={<IconCalendar size={15} />}
          onClick={onInsertToday}
        >
          오늘 날짜 삽입 (Ctrl+;)
        </Menu.Item>
      </DropdownTool>

      {/* 빠른 오늘 날짜 삽입 단축 버튼 */}
      <Tool
        label="오늘 날짜 바로 삽입 (단축키: Ctrl+; / @오늘)"
        onClick={() => onInsertToday?.()}
      >
        <IconCalendar size={16} />
      </Tool>

      <Divider orientation="vertical" />

      {/* 마크다운 복사 */}
      <Tool label={copied ? '복사됨!' : 'Markdown으로 복사'} onClick={() => void copyMarkdown()}>
        <IconClipboard size={16} />
      </Tool>

      <Divider orientation="vertical" />

      {/* Gemini AI 어시스턴트 드롭다운 메뉴 */}
      <Menu position="bottom-end" withArrow shadow="md" withinPortal>
        <Menu.Target>
          <Tooltip label="Gemini AI 어시스턴트 (요약, 서식 정리, 교정, 할 일 추출)">
            <ActionIcon
              variant="light"
              color="violet"
              size="md"
              onMouseDown={keepSelection}
              aria-label="AI 어시스턴트"
              style={{ width: 'auto', padding: '0 8px' }}
            >
              <Group gap={4} wrap="nowrap">
                <IconSparkles size={16} />
                <span style={{ fontSize: 12, fontWeight: 700 }}>AI 보조</span>
                <IconChevronDown size={11} style={{ opacity: 0.7 }} />
              </Group>
            </ActionIcon>
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
    </Group>
  );
}

