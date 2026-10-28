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
  useComputedColorScheme,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconGripVertical,
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
import { useState, useCallback, useMemo } from 'react';
import { PastelColorConfig, PASTEL_COLORS, getPastelConfig, TreeNode } from '../model/Note';
import { useNotes } from '../controller/NotesController';
import { CryptoService } from '../model/CryptoService';
import { getSearchSnippet } from '../model/SearchService';
import { HighlightText } from './HighlightText';
import { formatDateTimeIso } from '../model/dateUtils';
import { isSystemGroupNote, GROUP_ID_TO_STATUS, TODO_PROJECT_ID } from '../model/TodoService';
import { buildNoteHierarchy, cleanExcerpt, NoteHierarchy } from '../model/treeUtils';

function RowActions({
  id,
  hasChildren,
  hasPrevSibling,
  hasParent,
  active,
  colorCfg,
  descendantCount = 0,
}: {
  id: string;
  hasChildren: boolean;
  hasPrevSibling: boolean;
  hasParent: boolean;
  active: boolean;
  colorCfg: PastelColorConfig;
  descendantCount?: number;
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
  draggingId,
  dropTargetId,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  descendantCounts,
}: {
  node: TreeNode;
  depth: number;
  prevSibling: boolean;
  collapsed: Set<string>;
  onToggle(id: string): void;
  draggingId: string | null;
  dropTargetId: string | null;
  onDragStart: (id: string, e: React.DragEvent) => void;
  onDragOver: (id: string, e: React.DragEvent) => void;
  onDragLeave: (id: string, e: React.DragEvent) => void;
  onDrop: (id: string, e: React.DragEvent) => void;
  onDragEnd: () => void;
  descendantCounts: Map<string, number>;
}) {
  const { selectedId, select, setActiveTag, isUnlocked, isMasterSet } = useNotes();
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = scheme === 'dark';

  const n = node.note;
  const active = n.id === selectedId;
  const isCollapsed = collapsed.has(n.id);
  const cfg = getPastelConfig(n.color);
  const isSystemGroup = isSystemGroupNote(n);

  const isNoteLocked =
    (!isUnlocked && (isMasterSet || CryptoService.isEncrypted(n.content))) ||
    CryptoService.isEncrypted(n.content);

  const isDragging = draggingId === n.id;
  const isOver = dropTargetId === n.id && draggingId !== n.id;
  const canDrag = !isSystemGroup && !isNoteLocked;

  return (
    <>
      <Card
        withBorder
        shadow={active ? 'sm' : 'none'}
        className={active ? 'active-pastel-card' : 'inactive-note-card'}
        draggable={canDrag}
        onDragStart={(e) => {
          if (canDrag) onDragStart(n.id, e);
        }}
        onDragEnd={onDragEnd}
        onDragOver={(e) => onDragOver(n.id, e)}
        onDragLeave={(e) => onDragLeave(n.id, e)}
        onDrop={(e) => onDrop(n.id, e)}
        style={{
          cursor: isSystemGroup ? 'pointer' : isDragging ? 'grabbing' : 'grab',
          marginLeft: depth * 14,
          borderColor: isOver ? 'var(--mantine-color-blue-5)' : active ? cfg.border : undefined,
          borderLeft: isOver
            ? '6px solid var(--mantine-color-blue-5)'
            : active
            ? `5px solid ${cfg.border}`
            : `4px solid ${cfg.border}`,
          background: isOver
            ? isDark
              ? 'rgba(34, 139, 230, 0.22)'
              : 'rgba(231, 245, 255, 0.9)'
            : active
            ? cfg.bg
            : undefined,
          opacity: isDragging ? 0.35 : 1,
          transform: isOver ? 'scale(1.015)' : 'none',
          outline: isOver ? (isDark ? '2px dashed var(--mantine-color-blue-4)' : '2px dashed var(--mantine-color-blue-6)') : undefined,
          outlineOffset: isOver ? '-2px' : undefined,
          transition: 'all 0.15s ease',
        }}
        onClick={() => select(n.id)}
        py={6}
        px="xs"
      >
        {/* 1줄: 드래그 핸들 + 펼치기/접기 + 제목 + 상태/알람/자식수 뱃지 + 액션 버튼 */}
        <Group justify="space-between" wrap="nowrap" gap={4}>
          <Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            {canDrag && (
              <Tooltip label="드래그하여 다른 상태나 위치로 이동" position="left" withArrow>
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <IconGripVertical
                    size={13}
                    style={{
                      color: active ? cfg.iconColor : 'var(--mantine-color-dimmed)',
                      opacity: 0.45,
                      cursor: 'grab',
                      flexShrink: 0,
                    }}
                  />
                </span>
              </Tooltip>
            )}
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
              <span style={{ width: canDrag ? 6 : 18, flexShrink: 0 }} />
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
            descendantCount={descendantCounts.get(n.id) ?? 0}
          />
        </Group>

        {/* 2줄: 작성일시와 상세 내용만 정제하여 1줄로 컴팩트하게 표시 */}
        <Group gap={6} wrap="nowrap" mt={3} pl={canDrag ? 32 : 22} style={{ minWidth: 0, overflow: 'hidden' }}>
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
            draggingId={draggingId}
            dropTargetId={dropTargetId}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            descendantCounts={descendantCounts}
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
    changeTodoStatus,
    setParent,
  } = useNotes();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // O(N)으로 전체 계층 구조 및 자손 수를 1회만 계산
  const hierarchy = useMemo(() => buildNoteHierarchy(notes), [notes]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleDragStart = useCallback((id: string, e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  }, []);

  const handleDragOver = useCallback((id: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetId((prev) => (prev !== id ? id : prev));
  }, []);

  const handleDragLeave = useCallback((id: string, e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetId((prev) => (prev === id ? null : prev));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
  }, []);

  const handleDrop = useCallback(
    (targetId: string, e: React.DragEvent) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('text/plain') || draggingId;
      setDraggingId(null);
      setDropTargetId(null);

      if (!draggedId || draggedId === targetId) return;

      const draggedNote = notes.find((n) => n.id === draggedId);
      const targetNote = notes.find((n) => n.id === targetId);
      if (!draggedNote || !targetNote) return;

      // 시스템 그룹 노트(To Do, Doing, Done, Drop)는 드래그하여 이동할 수 없음
      if (isSystemGroupNote(draggedNote)) return;

      // 할일 관리 그룹 판별:
      // 1) 대상이 그룹 카드 본체인 경우 (To Do, Doing, Done, Drop)
      const targetGroupStatus = GROUP_ID_TO_STATUS[targetNote.id];
      if (targetGroupStatus) {
        changeTodoStatus(draggedId, targetGroupStatus);
        return;
      }

      // 2) 대상이 특정 상태 그룹에 속한 할일 카드인 경우 -> 대상 카드의 부모 그룹 상태로 변경
      if (targetNote.parentId && GROUP_ID_TO_STATUS[targetNote.parentId]) {
        const parentStatus = GROUP_ID_TO_STATUS[targetNote.parentId];
        changeTodoStatus(draggedId, parentStatus);
        return;
      }

      // 3) 일반 노트의 경우: 순환 참조 방지 후 해당 노트의 자식으로 계층 이동
      if (hierarchy.isDescendant(draggedId, targetId)) {
        return;
      }
      setParent(draggedId, targetId);
    },
    [draggingId, notes, changeTodoStatus, setParent, hierarchy]
  );

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
            const path = hierarchy.getPathTitles(n.id);
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
          <TreeRow
            key={node.note.id}
            node={node}
            depth={0}
            prevSibling={i > 0}
            collapsed={collapsed}
            onToggle={toggle}
            draggingId={draggingId}
            dropTargetId={dropTargetId}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            descendantCounts={hierarchy.descendantCounts}
          />
        ))}
      </Stack>
    </ScrollArea>
  );
}
