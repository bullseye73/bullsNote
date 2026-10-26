import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconIndentDecrease,
  IconIndentIncrease,
  IconBellRinging,
  IconCalendar,
  IconCalendarEvent,
  IconPin,
  IconPlus,
  IconStar,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import { PastelColorConfig, PASTEL_COLORS, getPastelConfig, TreeNode, getPathTitles } from '../model/Note';
import { noteBodyText } from '../model/HashtagService';
import { useNotes } from '../controller/NotesController';
import { CryptoService } from '../model/CryptoService';
import { getSearchSnippet } from '../model/SearchService';
import { HighlightText } from './HighlightText';
import { formatDateTimeIso } from '../model/dateUtils';
import { isSystemGroupNote } from '../model/TodoService';

function cleanExcerpt(content: string, title?: string): string {
  if (!content) return '';
  if (CryptoService.isEncrypted(content) || CryptoService.isCorruptedPlaceholder(content)) {
    return '🔒 암호화된 노트';
  }
  let t = noteBodyText(content);
  // 할일 템플릿 메타 헤더 안내 텍스트들 및 장식 제거
  t = t
    .replace(/📌\s*원본\s*노트:[^\n]*/g, '')
    .replace(/⏰\s*작성\s*일시:[^\n]*/g, '')
    .replace(/📝\s*세부\s*내용\s*및\s*작업\s*메모/g, '')
    .replace(/💡\s*작업\s*세부\s*내용\s*및\s*진행\s*메모[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 제목과 동일한 텍스트만 남아있으면 제거 (추가 메모가 없는 경우)
  if (title && t.trim() === title.trim()) {
    return '';
  }
  return t;
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
  const isSystemGroup = isSystemGroupNote(note);

  const descendantCount = (() => {
    let c = 0;
    const stack = [id];
    const visited = new Set<string>([id]);
    const kids = new Map<string, string[]>();
    for (const n of notes) {
      if (!n.parentId) continue;
      kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n.id]);
    }
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const k of kids.get(cur) ?? []) {
        if (!visited.has(k)) {
          visited.add(k);
          c += 1;
          stack.push(k);
        }
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
      <Tooltip label={isSystemGroup ? '시스템 그룹 노트는 이동할 수 없습니다' : isNoteLocked ? '잠긴 상태에서는 이동할 수 없습니다' : '들여쓰기 (이전 형제의 자식으로)'}>
        <ActionIcon
          size="sm"
          variant="subtle"
          disabled={isSystemGroup || !hasPrevSibling || isNoteLocked}
          onClick={() => indent(id)}
          aria-label="들여쓰기"
          style={{
            color: active ? (!isSystemGroup && hasPrevSibling && !isNoteLocked ? colorCfg.iconColor : 'rgba(0,0,0,0.25)') : undefined,
          }}
        >
          <IconIndentIncrease size={14} />
        </ActionIcon>
      </Tooltip>
      {/* 이동: 내어쓰기 */}
      <Tooltip label={isSystemGroup ? '시스템 그룹 노트는 이동할 수 없습니다' : isNoteLocked ? '잠긴 상태에서는 이동할 수 없습니다' : '내어쓰기 (부모와 같은 레벨로)'}>
        <ActionIcon
          size="sm"
          variant="subtle"
          disabled={isSystemGroup || !hasParent || isNoteLocked}
          onClick={() => outdent(id)}
          aria-label="내어쓰기"
          style={{
            color: active ? (!isSystemGroup && hasParent && !isNoteLocked ? colorCfg.iconColor : 'rgba(0,0,0,0.25)') : undefined,
          }}
        >
          <IconIndentDecrease size={14} />
        </ActionIcon>
      </Tooltip>
      {/* 상태: 상단 고정 */}
      <Tooltip label={isSystemGroup ? '시스템 그룹은 항상 상단에 고정됩니다' : isNoteLocked ? '잠긴 상태에서는 변경할 수 없습니다' : (note.pinned ? '핀 해제' : '상단 고정')}>
        <ActionIcon
          size="sm"
          variant={note.pinned ? 'filled' : 'subtle'}
          color={note.pinned ? 'blue' : undefined}
          disabled={isSystemGroup || isNoteLocked}
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
      <Tooltip label={isSystemGroup ? '시스템 그룹은 즐겨찾기 대상이 아닙니다' : isNoteLocked ? '잠긴 상태에서는 변경할 수 없습니다' : (note.favorite ? '즐겨찾기 해제' : '즐겨찾기 등록')}>
        <ActionIcon
          size="sm"
          variant={note.favorite ? 'filled' : 'subtle'}
          color={note.favorite ? 'yellow' : undefined}
          disabled={isSystemGroup || isNoteLocked}
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
          {!isSystemGroup && (
            <>
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
            </>
          )}
          <Menu.Label>노트 관리</Menu.Label>
          {!isSystemGroup && (
            <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => duplicate(id)}>
              복제
            </Menu.Item>
          )}
          {/* 시스템 그룹 노트인 경우 이동/삭제 차단 */}
          {!isSystemGroup && projects.length > 1 && (
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
          {!isSystemGroup && (
            <>
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
            </>
          )}
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
          marginLeft: depth * 14,
          borderColor: active ? cfg.border : undefined,
          borderLeft: active ? `5px solid ${cfg.border}` : `4px solid ${cfg.border}`,
          background: active ? cfg.bg : undefined,
        }}
        onClick={() => select(n.id)}
        py={6}
        px="xs"
      >
        {/* 1줄: 펼치기/접기 + 제목 + 상태/알람/자식수 뱃지 + 액션 버튼 */}
        <Group justify="space-between" wrap="nowrap" gap={4}>
          <Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            {node.children.length > 0 ? (
              <ActionIcon
                size="xs"
                variant="subtle"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(n.id);
                }}
                aria-label={isCollapsed ? '펼치기' : '접기'}
                style={{
                  color: active ? cfg.iconColor : undefined,
                  flexShrink: 0,
                }}
              >
                {isCollapsed ? <IconChevronRight size={13} /> : <IconChevronDown size={13} />}
              </ActionIcon>
            ) : (
              <span style={{ width: 18, flexShrink: 0 }} />
            )}
            <Text fw={600} truncate size="sm" style={{ color: active ? cfg.textColor : undefined, minWidth: 0 }}>
              {n.title || '제목 없음'}
            </Text>
            {n.systemGroupType && (
              <Badge size="xs" variant="light" color={n.color || 'blue'} style={{ flexShrink: 0 }}>
                그룹
              </Badge>
            )}
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

        {/* 2줄: 작성일시와 상세 내용만 정제하여 1줄로 컴팩트하게 표시 */}
        <Group gap={6} wrap="nowrap" mt={3} pl={22} style={{ minWidth: 0, overflow: 'hidden' }}>
          {n.systemGroupType ? (
            <Text
              size="xs"
              truncate
              c={active ? undefined : 'dimmed'}
              style={{ color: active ? cfg.dimmedColor : undefined }}
            >
              {cleanExcerpt(n.content, n.title) || `${n.title} 그룹`}
            </Text>
          ) : (
            <>
              <Text
                size="xs"
                style={{
                  fontSize: 11,
                  flexShrink: 0,
                  color: active ? cfg.dimmedColor : 'var(--mantine-color-dimmed)',
                }}
              >
                ⏰ {formatDateTimeIso(new Date(n.createdAt))}
              </Text>
              {(() => {
                const detail = cleanExcerpt(n.content, n.title);
                if (!detail) return null;
                return (
                  <>
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      ·
                    </Text>
                    <Text
                      size="xs"
                      truncate
                      c={active ? undefined : 'dimmed'}
                      style={{ color: active ? cfg.dimmedColor : undefined, minWidth: 0, flex: 1 }}
                    >
                      {detail}
                    </Text>
                  </>
                );
              })()}
            </>
          )}
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
  const {
    tree,
    flat,
    isFiltering,
    selectedId,
    select,
    setActiveTag,
    selectedDate,
    setSelectedDate,
    openOrCreateDailyNote,
    notes,
    projects,
    searchTokens,
    searchScope,
  } = useNotes();
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
      if (selectedDate) {
        return (
          <Stack align="center" justify="center" h="100%" gap="sm" p="xl">
            <IconCalendar size={36} color="var(--mantine-color-blue-5)" style={{ opacity: 0.6 }} />
            <Text fw={600} size="sm">
              {selectedDate}에 작성된 노트가 없습니다.
            </Text>
            <Button
              size="xs"
              variant="light"
              color="blue"
              leftSection={<IconCalendarEvent size={14} />}
              onClick={() => openOrCreateDailyNote(selectedDate)}
            >
              {selectedDate} 데일리 노트 작성하기
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => setSelectedDate(null)}
            >
              날짜 필터 해제
            </Button>
          </Stack>
        );
      }
      return (
        <Stack align="center" justify="center" h="100%" gap="xs" p="xl">
          <Text c="dimmed">조건에 맞는 노트가 없습니다.</Text>
        </Stack>
      );
    }
    return (
      <ScrollArea h="100%" type="auto">
        <Stack gap="xs" p="sm">
          {selectedDate && (
            <Paper
              p="xs"
              withBorder
              radius="sm"
              style={{
                backgroundColor: 'var(--mantine-color-blue-light)',
                borderColor: 'var(--mantine-color-blue-4)',
              }}
            >
              <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap={6} wrap="nowrap" style={{ overflow: 'hidden' }}>
                  <IconCalendar size={14} color="var(--mantine-color-blue-6)" />
                  <Text size="xs" fw={700} truncate>
                    {selectedDate} 작성된 노트
                  </Text>
                  <Badge size="xs" variant="filled" color="blue">
                    {flat.length}개
                  </Badge>
                </Group>
                <Group gap={2} wrap="nowrap">
                  <Tooltip label="해당 날짜 데일리 노트 열기 (Daily Note 프로젝트)">
                    <ActionIcon
                      size="xs"
                      variant="light"
                      color="blue"
                      onClick={() => openOrCreateDailyNote(selectedDate)}
                      aria-label="데일리 노트 열기"
                    >
                      <IconCalendarEvent size={12} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="날짜 필터 해제">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => setSelectedDate(null)}
                      aria-label="날짜 필터 해제"
                    >
                      <IconX size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Paper>
          )}
          {flat.map((n) => {
            const active = n.id === selectedId;
            const path = getPathTitles(notes, n.id);
            const cfg = getPastelConfig(n.color);
            const proj = projects.find((p) => p.id === (n.projectId || 'default'));
            const snippet = getSearchSnippet(n.content, searchTokens);

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
                py={6}
                px="xs"
              >
                {/* 1줄: 제목 + 프로젝트/알람 배지 */}
                <Group justify="space-between" align="center" wrap="nowrap" gap={4}>
                  <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    {searchScope === 'all' && proj && (
                      <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                        {proj.icon || '📁'} {proj.name}
                      </Badge>
                    )}
                    <Text fw={600} truncate size="sm" style={{ color: active ? cfg.textColor : undefined, minWidth: 0 }}>
                      <HighlightText text={n.title || '제목 없음'} tokens={searchTokens} />
                    </Text>
                  </Group>
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

                {/* 2줄: 작성일시와 상세내용/스니펫만 1줄로 표시 */}
                <Group gap={6} wrap="nowrap" mt={3} style={{ minWidth: 0, overflow: 'hidden' }}>
                  <Text
                    size="xs"
                    style={{
                      fontSize: 11,
                      flexShrink: 0,
                      color: active ? cfg.dimmedColor : 'var(--mantine-color-dimmed)',
                    }}
                  >
                    ⏰ {formatDateTimeIso(new Date(n.createdAt))}
                  </Text>
                  {(() => {
                    const detail = snippet || cleanExcerpt(n.content, n.title);
                    if (!detail) return null;
                    return (
                      <>
                        <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                          ·
                        </Text>
                        <Text
                          size="xs"
                          truncate
                          c={active ? undefined : 'dimmed'}
                          style={{ color: active ? cfg.dimmedColor : undefined, minWidth: 0, flex: 1 }}
                        >
                          <HighlightText text={detail} tokens={searchTokens} />
                        </Text>
                      </>
                    );
                  })()}
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
