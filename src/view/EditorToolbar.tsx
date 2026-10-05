// VIEW: 에디터 상단 빠른 편집 툴바 (인라인 서식/블록 변환/삽입)
import { ActionIcon, Divider, Group, Menu, Tooltip } from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconClipboard,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconHighlight,
  IconItalic,
  IconList,
  IconListNumbers,
  IconMinus,
  IconPhoto,
  IconQuote,
  IconSquareCheck,
  IconStrikethrough,
  IconTable,
  IconTerminal,
  IconTextSize,
  IconUnderline,
} from '@tabler/icons-react';
import type { BlockNoteEditor } from '@blocknote/core';
import { useState } from 'react';

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

export function EditorToolbar({ editor }: { editor: AnyEditor }) {
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
      gap={3}
      wrap="nowrap"
      style={{ overflowX: 'auto', paddingBottom: 2 }}
      onMouseDown={keepSelection}
    >
      <Tool label="실행 취소" onClick={() => editor.undo()}><IconArrowBackUp size={16} /></Tool>
      <Tool label="다시 실행" onClick={() => editor.redo()}><IconArrowForwardUp size={16} /></Tool>
      <Divider orientation="vertical" />
      <Tool label="굵게" onClick={() => editor.toggleStyles({ bold: true })}><IconBold size={16} /></Tool>
      <Tool label="기울임" onClick={() => editor.toggleStyles({ italic: true })}><IconItalic size={16} /></Tool>
      <Tool label="밑줄" onClick={() => editor.toggleStyles({ underline: true })}><IconUnderline size={16} /></Tool>
      <Tool label="취소선" onClick={() => editor.toggleStyles({ strike: true })}><IconStrikethrough size={16} /></Tool>
      <Tool label="인라인 코드" onClick={() => editor.toggleStyles({ code: true })}><IconCode size={16} /></Tool>
      <Menu position="bottom-start" withArrow shadow="md" withinPortal>
        <Menu.Target>
          <Tooltip label="글자색">
            <ActionIcon variant="light" size="md" onMouseDown={keepSelection} aria-label="글자색">
              <span style={{ fontWeight: 800, fontSize: 14 }}>A</span>
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>글자색</Menu.Label>
          {TEXT_COLORS.map((c) => (
            <Menu.Item
              key={c.value}
              leftSection={<span style={{ width: 12, height: 12, borderRadius: 6, background: c.css, border: '1px solid var(--mantine-color-gray-4)' }} />}
              onClick={() => editor.toggleStyles({ textColor: c.value })}
            >
              {c.name}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      <Menu position="bottom-start" withArrow shadow="md" withinPortal>
        <Menu.Target>
          <Tooltip label="배경색">
            <ActionIcon variant="light" size="md" onMouseDown={keepSelection} aria-label="배경색">
              <IconHighlight size={16} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>배경색</Menu.Label>
          {BG_COLORS.map((c) => (
            <Menu.Item
              key={c.value}
              leftSection={<span style={{ width: 12, height: 12, borderRadius: 6, background: c.css, border: '1px solid var(--mantine-color-gray-4)' }} />}
              onClick={() => editor.toggleStyles({ backgroundColor: c.value })}
            >
              {c.name}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      <Divider orientation="vertical" />
      <Tool label="제목 1" onClick={() => setType('heading', { level: 1 })}><IconH1 size={16} /></Tool>
      <Tool label="제목 2" onClick={() => setType('heading', { level: 2 })}><IconH2 size={16} /></Tool>
      <Tool label="제목 3" onClick={() => setType('heading', { level: 3 })}><IconH3 size={16} /></Tool>
      <Tool label="본문" onClick={() => setType('paragraph')}><IconTextSize size={16} /></Tool>
      <Tool label="글머리 목록" onClick={() => setType('bulletListItem')}><IconList size={16} /></Tool>
      <Tool label="번호 목록" onClick={() => setType('numberedListItem')}><IconListNumbers size={16} /></Tool>
      <Tool label="체크 목록" onClick={() => setType('checkListItem')}><IconSquareCheck size={16} /></Tool>
      <Tool label="인용" onClick={() => setType('quote')}><IconQuote size={16} /></Tool>
      <Tool label="코드 블록" onClick={() => setType('codeBlock')}><IconTerminal size={16} /></Tool>
      <Divider orientation="vertical" />
      <Tool
        label="표 삽입 (3x2)"
        onClick={() =>
          insertAfter({
            type: 'table',
            content: { type: 'tableContent', rows: [{ cells: ['', '', ''] }, { cells: ['', '', ''] }] },
          })
        }
      >
        <IconTable size={16} />
      </Tool>
      <Tool label="이미지 삽입" onClick={() => insertAfter({ type: 'image' })}><IconPhoto size={16} /></Tool>
      <Tool label="구분선 삽입" onClick={() => insertAfter({ type: 'divider' })}><IconMinus size={16} /></Tool>
      <Divider orientation="vertical" />
      <Tool label={copied ? '복사됨!' : 'Markdown으로 복사'} onClick={() => void copyMarkdown()}>
        <IconClipboard size={16} />
      </Tool>
    </Group>
  );
}
