// VIEW: 트리형 노트 목록 (필터 중에는 평탄 + 경로 표시)
import { ActionIcon, Badge, Card, Group, Menu, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconIndentDecrease,
  IconIndentIncrease,
  IconBellRinging,
  IconPin,
  IconPlus,
  IconStar,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { PastelColorConfig, PASTEL_COLORS, getPastelConfig, TreeNode, getPathTitles } from '../model/Note';
import { noteBodyText } from '../model/HashtagService';
import { useNotes } from '../controller/NotesController';
import { CryptoService } from '../model/CryptoService';

function excerpt(content: string): string {
  if (CryptoService.isEncrypted(content) || CryptoService.isCorruptedPlaceholder(content)) {
    return '🔒 암호화된 노트입니다.';
  }
  const t = noteBodyText(content);
  return t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

function RowActions({
  id,
  hasChildren,
  hasPrevSibling,
  hasParent,
  active,
  colorCfg,
}: {
  id: string;
  hasChildren: boolean;
  hasPrevSibling: boolean;
  hasParent: boolean;
  active: boolean;
  colorCfg: PastelColorConfig;
}) {
  const {
    create,
    duplicate,
    remove,
    togglePin,
    toggleFavorite,
    indent,
    outdent,
    updateColor,
    notes,
    projects,
    moveNoteToProject,
    isMasterSet,
    isUnlocked,
  } = useNotes();
  const note = notes.find((n) => n.id === id)!;
  const isNoteLocked =
    note &&
    ((!isUnlocked && (isMasterSet || CryptoService.isEncrypted(note.content))) ||
      CryptoService.isEncrypted(note.content));
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
      {/* 생성: 하위 노트 추가 */}
      <Tooltip label="하위 노트 추가">
        <ActionIcon
          size="sm"
          variant="subtle"
          onClick={() => create(id)}
          aria-label="하위 노트 추가"
          style={{
            color: active ? '#087f5b' : 'var(--mantine-color-green-6)',
            backgroundColor: active ? 'rgba(8, 127, 91, 0.12)' : undefined,
          }}
        >
          <IconPlus size={14} />
        </ActionIcon>
      </Tooltip>
      {/* 이동: 들여쓰기 */}
      <Tooltip label={isNoteLocked ? '잠긴 상태에서는 이동할 수 없습니다' : '들여쓰기 (이전 형제의 자식으로)'}>
        <ActionIcon
          size="sm"
          variant="subtle"
          disabled={!hasPrevSibling || isNoteLocked}
          onClick={() => indent(id)}
          aria-label="들여쓰기"
          style={{
            color: active ? (hasPrevSibling && !isNoteLocked ? colorCfg.iconColor : 'rgba(0,0,0,0.25)') : undefined,
          }}
        >
          <IconIndentIncrease size={14} />
        </ActionIcon>
      </Tooltip>
      {/* 이동: 내어쓰기 */}
      <Tooltip label={isNoteLocked ? '잠긴 상태에서는 이동할 수 없습니다' : '내어쓰기 (부모와 같은 레벨로)'}>
        <ActionIcon
          size="sm"
          variant="subtle"
          disabled={!hasParent || isNoteLocked}
          onClick={() => outdent(id)}
          aria-label="내어쓰기"
          style={{
            color: active ? (hasParent && !isNoteLocked ? colorCfg.iconColor : 'rgba(0,0,0,0.25)') : undefined,
          }}
        >
          <IconIndentDecrease size={14} />
        </ActionIcon>
      </Tooltip>
      {/* 상태: 상단 고정 */}
      <Tooltip label={isNoteLocked ? '잠긴 상태에서는 변경할 수 없습니다' : (note.pinned ? '핀 해제' : '상단 고정')}>
        <ActionIcon
          size="sm"
          variant={note.pinned ? 'filled' : 'subtle'}
          color={note.pinned ? 'blue' : undefined}
          disabled={isNoteLocked}
          onClick={() => togglePin(id)}
          aria-label="핀"
          style={{
            color: !note.pinned && active ? colorCfg.iconColor : undefined,
            backgroundColor: note.pinned && active ? colorCfg.border : undefined,
          }}
        >
          <IconPin size={14} />
        </ActionIcon>
      </Tooltip>
      {/* 상태: 즐겨찾기 */}
      <Tooltip label={isNoteLocked ? '잠긴 상태에서는 변경할 수 없습니다' : (note.favorite ? '즐겨찾기 해제' : '즐겨찾기 등록')}>
        <ActionIcon
          size="sm"
          variant={note.favorite ? 'filled' : 'subtle'}
          color={note.favorite ? 'yellow' : undefined}
          disabled={isNoteLocked}
          onClick={() => toggleFavorite(id)}
          aria-label="즐겨찾기"
          style={{
            color: !note.favorite && active ? colorCfg.iconColor : undefined,
          }}
        >
          <IconStar size={14} />
        </ActionIcon>
      </Tooltip>
      {/* 관리 메뉴 */}
      <Menu position="bottom-end" withArrow shadow="md" withinPortal disabled={isNoteLocked}>
        <Menu.Target>
          <ActionIcon
            size="sm"
            variant="subtle"
            disabled={isNoteLocked}
            aria-label="노트 관리 메뉴"
            style={{
              color: active ? colorCfg.iconColor : undefined,
            }}
          >
            <IconDots size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>노트 색상 변경</Menu.Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, padding: '6px 8px', minWidth: 260 }}>
            {Object.values(PASTEL_COLORS).map((c) => {
              const isCurrent = (note.color || 'blue') === c.id;
              return (
                <Tooltip key={c.id} label={c.name} position="top" withArrow>
                  <ActionIcon
                    size="sm"
                    radius="xl"
                    onClick={() => updateColor(id, c.id)}
                    style={{
                      backgroundColor: c.bg,
                      border: `2px solid ${c.border}`,
                      boxShadow: isCurrent ? `0 0 0 2px ${c.textColor}` : undefined,
                      transform: isCurrent ? 'scale(1.2)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  />
                </Tooltip>
              );
            })}
          </div>
          <Menu.Divider />
          <Menu.Label>노트 관리</Menu.Label>
          <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => duplicate(id)}>
            복제
          </Menu.Item>
          {projects.length > 1 && (
            <>
              <Menu.Divider />
              <Menu.Label>프로젝트 이동</Menu.Label>
              {projects
                .filter((p) => p.id !== (note.projectId || 'default'))
                .map((p) => (
                  <Menu.Item
                    key={p.id}
                    leftSection={<span style={{ fontSize: 14 }}>{p.icon}</span>}
                    onClick={() => moveNoteToProject(id, p.id)}
                  >
                    {p.name}
                  </Menu.Item>
                ))}
            </>
          )}
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

function TreeRow({
  node,
  depth,
  prevSibling,
  collapsed,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  prevSibling: boolean;
  collapsed: Set<string>;
  onToggle(id: string): void;
}) {
  const { selectedId, select, setActiveTag } = useNotes();
  const n = node.note;
  const active = n.id === selectedId;
  const isCollapsed = collapsed.has(n.id);
  const cfg = getPastelConfig(n.color);

  return (
    <>
      <Card
        withBorder
        shadow={active ? 'sm' : 'none'}
        className={active ? 'active-pastel-card' : 'inactive-note-card'}
        style={{
          cursor: 'pointer',
          marginLeft: depth * 16,
          borderColor: active ? cfg.border : undefined,
          borderLeft: active ? `5px solid ${cfg.border}` : `4px solid ${cfg.border}`,
          background: active ? cfg.bg : undefined,
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
                style={{
                  color: active ? cfg.iconColor : undefined,
                }}
              >
                {isCollapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
              </ActionIcon>
            ) : (
              <span style={{ width: 22, flexShrink: 0 }} />
            )}
            <Text fw={700} truncate size="sm" style={{ color: active ? cfg.textColor : undefined }}>
              {n.title || '제목 없음'}
            </Text>
            {n.reminder && !n.reminder.dismissed && (
              <Tooltip
                label={`알람: ${new Date(n.reminder.targetAt).toLocaleString('ko-KR', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}${n.reminder.repeat !== 'none' ? ' (반복)' : ''}`}
              >
                <IconBellRinging
                  size={13}
                  style={{
                    color: active ? cfg.textColor : 'var(--mantine-color-blue-5)',
                    flexShrink: 0,
                  }}
                />
              </Tooltip>
            )}
            {node.children.length > 0 && (
              <Badge
                size="xs"
                variant={active ? 'filled' : 'light'}
                style={{
                  flexShrink: 0,
                  backgroundColor: active ? cfg.badgeBg : undefined,
                  color: active ? cfg.badgeColor : undefined,
                  border: 'none',
                }}
              >
                {node.children.length}
              </Badge>
            )}
          </Group>
          <RowActions
            id={n.id}
            hasChildren={node.children.length > 0}
            hasPrevSibling={prevSibling}
            hasParent={n.parentId !== null}
            active={active}
            colorCfg={cfg}
          />
        </Group>
        <Text
          size="xs"
          lineClamp={2}
          mt={2}
          pl={24}
          c={active ? undefined : 'dimmed'}
          style={{ color: active ? cfg.dimmedColor : undefined }}
        >
          {excerpt(n.content) || '내용 없음'}
        </Text>
        <Group gap={4} mt={4} pl={24}>
          {n.tags.map((t) => (
            <Badge
              key={t}
              size="xs"
              variant={active ? 'filled' : 'light'}
              style={{
                cursor: 'pointer',
                backgroundColor: active ? cfg.badgeBg : undefined,
                color: active ? cfg.badgeColor : undefined,
                border: 'none',
              }}
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
          <TreeRow
            key={c.note.id}
            node={c}
            depth={depth + 1}
            prevSibling={i > 0}
            collapsed={collapsed}
            onToggle={onToggle}
          />
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
            const cfg = getPastelConfig(n.color);
            return (
              <Card
                key={n.id}
                withBorder
                shadow={active ? 'sm' : 'none'}
                className={active ? 'active-pastel-card' : 'inactive-note-card'}
                style={{
                  cursor: 'pointer',
                  borderColor: active ? cfg.border : undefined,
                  borderLeft: active ? `5px solid ${cfg.border}` : `4px solid ${cfg.border}`,
                  background: active ? cfg.bg : undefined,
                }}
                onClick={() => select(n.id)}
                p="xs"
              >
                {path.length > 1 && (
                  <Text
                    size="xs"
                    c={active ? undefined : 'dimmed'}
                    style={{ color: active ? cfg.dimmedColor : undefined }}
                    truncate
                  >
                    {path.slice(0, -1).join(' / ')} /
                  </Text>
                )}
                <Group justify="space-between" align="center" wrap="nowrap">
                  <Text fw={700} truncate size="sm" style={{ color: active ? cfg.textColor : undefined, flex: 1 }}>
                    {n.title || '제목 없음'}
                  </Text>
                  {n.reminder && !n.reminder.dismissed && (
                    <Tooltip
                      label={`알람: ${new Date(n.reminder.targetAt).toLocaleString('ko-KR', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}${n.reminder.repeat !== 'none' ? ' (반복)' : ''}`}
                    >
                      <IconBellRinging
                        size={13}
                        style={{
                          color: active ? cfg.textColor : 'var(--mantine-color-blue-5)',
                          flexShrink: 0,
                        }}
                      />
                    </Tooltip>
                  )}
                </Group>
                <Text
                  size="xs"
                  c={active ? undefined : 'dimmed'}
                  style={{ color: active ? cfg.dimmedColor : undefined }}
                  lineClamp={2}
                  mt={2}
                >
                  {excerpt(n.content) || '내용 없음'}
                </Text>
                <Group gap={4} mt={4}>
                  {n.tags.map((t) => (
                    <Badge
                      key={t}
                      size="xs"
                      variant={active ? 'filled' : 'light'}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: active ? cfg.badgeBg : undefined,
                        color: active ? cfg.badgeColor : undefined,
                        border: 'none',
                      }}
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
