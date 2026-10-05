// VIEW: 트리형 노트 목록 (필터 중에는 평탄 + 경로 표시)
import { ActionIcon, Badge, Card, Group, Menu, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconIndentDecrease,
  IconIndentIncrease,
  IconPin,
  IconPlus,
  IconStar,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { TreeNode } from '../model/Note';
import { getPathTitles } from '../model/Note';
import { noteBodyText } from '../model/HashtagService';
import { useNotes } from '../controller/NotesController';

function excerpt(content: string): string {
  const t = noteBodyText(content);
  return t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

function RowActions({ id, hasChildren, hasPrevSibling, hasParent }: { id: string; hasChildren: boolean; hasPrevSibling: boolean; hasParent: boolean }) {
  const { create, duplicate, remove, togglePin, toggleFavorite, indent, outdent, notes } = useNotes();
  const note = notes.find((n) => n.id === id)!;
  const descendantCount = (() => {
    let c = 0;
    const stack = [id];
    const kids = new Map<string, string[]>();
    for (const n of notes) {
      if (!n.parentId) continue;
      kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n.id]);
    }
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const k of kids.get(cur) ?? []) {
        c += 1;
        stack.push(k);
      }
    }
    return c;
  })();
  return (
    <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
      {/* 생성: 초록 */}
      <Tooltip label="하위 노트 추가">
        <ActionIcon size="sm" variant="light" color="green" onClick={() => create(id)} aria-label="하위 노트 추가">
          <IconPlus size={14} />
        </ActionIcon>
      </Tooltip>
      {/* 이동: 회색 */}
      <Tooltip label="들여쓰기 (이전 형제의 자식으로)">
        <ActionIcon size="sm" variant="subtle" color="gray" disabled={!hasPrevSibling} onClick={() => indent(id)} aria-label="들여쓰기">
          <IconIndentIncrease size={14} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="내어쓰기 (부모와 같은 레벨로)">
        <ActionIcon size="sm" variant="subtle" color="gray" disabled={!hasParent} onClick={() => outdent(id)} aria-label="내어쓰기">
          <IconIndentDecrease size={14} />
        </ActionIcon>
      </Tooltip>
      {/* 상태: 활성 시 채움색 */}
      <Tooltip label={note.pinned ? '핀 해제' : '상단 고정'}>
        <ActionIcon
          size="sm"
          variant={note.pinned ? 'filled' : 'subtle'}
          color="blue"
          onClick={() => togglePin(id)}
          aria-label="핀"
        >
          <IconPin size={14} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={note.favorite ? '즐겨찾기 해제' : '즐겨찾기 등록'}>
        <ActionIcon
          size="sm"
          variant={note.favorite ? 'filled' : 'subtle'}
          color="yellow"
          onClick={() => toggleFavorite(id)}
          aria-label="즐겨찾기"
        >
          <IconStar size={14} />
        </ActionIcon>
      </Tooltip>
      {/* 관리 메뉴: 복제/삭제로 그룹화 */}
      <Menu position="bottom-end" withArrow shadow="md" withinPortal>
        <Menu.Target>
          <ActionIcon size="sm" variant="subtle" color="gray" aria-label="노트 관리 메뉴">
            <IconDots size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>노트 관리</Menu.Label>
          <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => duplicate(id)}>
            복제
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() => {
              const msg = hasChildren
                ? `"${note.title}"과 하위 ${descendantCount}개 노트를 모두 삭제할까요?`
                : `"${note.title}" 노트를 삭제할까요?`;
              if (confirm(msg)) remove(id);
            }}
          >
            삭제{hasChildren ? ` (하위 ${descendantCount}개 포함)` : ''}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

function TreeRow({ node, depth, prevSibling, collapsed, onToggle }: { node: TreeNode; depth: number; prevSibling: boolean; collapsed: Set<string>; onToggle(id: string): void }) {
  const { selectedId, select, setActiveTag } = useNotes();
  const n = node.note;
  const active = n.id === selectedId;
  const isCollapsed = collapsed.has(n.id);
  return (
    <>
      <Card
        withBorder
        shadow={active ? 'sm' : 'none'}
        style={{
          cursor: 'pointer',
          marginLeft: depth * 16,
          borderColor: active ? 'var(--mantine-color-blue-5)' : undefined,
          background: active ? 'var(--mantine-color-blue-0)' : undefined,
        }}
        onClick={() => select(n.id)}
        p="xs"
      >
        <Group justify="space-between" wrap="nowrap" gap={4}>
          <Group gap={2} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            {node.children.length > 0 ? (
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(n.id);
                }}
                aria-label={isCollapsed ? '펼치기' : '접기'}
              >
                {isCollapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
              </ActionIcon>
            ) : (
              <span style={{ width: 22, flexShrink: 0 }} />
            )}
            <Text fw={600} truncate size="sm">
              {n.title || '제목 없음'}
            </Text>
            {node.children.length > 0 && (
              <Badge size="xs" variant="light" style={{ flexShrink: 0 }}>
                {node.children.length}
              </Badge>
            )}
          </Group>
          <RowActions id={n.id} hasChildren={node.children.length > 0} hasPrevSibling={prevSibling} hasParent={n.parentId !== null} />
        </Group>
        <Text size="xs" c="dimmed" lineClamp={2} mt={2} pl={24}>
          {excerpt(n.content) || '내용 없음'}
        </Text>
        <Group gap={4} mt={4} pl={24}>
          {n.tags.map((t) => (
            <Badge
              key={t}
              size="xs"
              variant="light"
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                setActiveTag(t);
              }}
            >
              #{t}
            </Badge>
          ))}
        </Group>
      </Card>
      {!isCollapsed &&
        node.children.map((c, i) => (
          <TreeRow key={c.note.id} node={c} depth={depth + 1} prevSibling={i > 0} collapsed={collapsed} onToggle={onToggle} />
        ))}
    </>
  );
}

export function NoteListView() {
  const { tree, flat, isFiltering, selectedId, select, setActiveTag, notes } = useNotes();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (isFiltering) {
    if (flat.length === 0) {
      return (
        <Stack align="center" justify="center" h="100%" gap="xs" p="xl">
          <Text c="dimmed">조건에 맞는 노트가 없습니다.</Text>
        </Stack>
      );
    }
    return (
      <ScrollArea h="100%" type="auto">
        <Stack gap="xs" p="sm">
          {flat.map((n) => {
            const active = n.id === selectedId;
            const path = getPathTitles(notes, n.id);
            return (
              <Card
                key={n.id}
                withBorder
                shadow={active ? 'sm' : 'none'}
                style={{
                  cursor: 'pointer',
                  borderColor: active ? 'var(--mantine-color-blue-5)' : undefined,
                  background: active ? 'var(--mantine-color-blue-0)' : undefined,
                }}
                onClick={() => select(n.id)}
                p="xs"
              >
                {path.length > 1 && (
                  <Text size="xs" c="dimmed" truncate>
                    {path.slice(0, -1).join(' / ')} /
                  </Text>
                )}
                <Text fw={600} truncate size="sm">
                  {n.title || '제목 없음'}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
                  {excerpt(n.content) || '내용 없음'}
                </Text>
                <Group gap={4} mt={4}>
                  {n.tags.map((t) => (
                    <Badge
                      key={t}
                      size="xs"
                      variant="light"
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTag(t);
                      }}
                    >
                      #{t}
                    </Badge>
                  ))}
                </Group>
              </Card>
            );
          })}
        </Stack>
      </ScrollArea>
    );
  }

  if (tree.length === 0) {
    return (
      <Stack align="center" justify="center" h="100%" gap="xs" p="xl">
        <Text c="dimmed">노트가 없습니다.</Text>
        <Text size="sm" c="dimmed">
          + 버튼으로 새 노트를 만드세요.
        </Text>
      </Stack>
    );
  }

  return (
    <ScrollArea h="100%" type="auto">
      <Stack gap={4} p="sm">
        {tree.map((node, i) => (
          <TreeRow key={node.note.id} node={node} depth={0} prevSibling={i > 0} collapsed={collapsed} onToggle={toggle} />
        ))}
      </Stack>
    </ScrollArea>
  );
}
