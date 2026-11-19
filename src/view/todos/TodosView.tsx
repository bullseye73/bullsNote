// VIEW: 할일 화면 — 보기 전환(목록 / 보드 / 타임라인), 인라인 할일 추가, 필터
import { ActionIcon, Box, Button, Group, ScrollArea, SegmentedControl, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconPencil, IconPlus, IconRotateClockwise, IconTrash } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import { useNotes, type TodoViewMode } from '../../controller/NotesController';
import type { TodoStatus } from '../../model/Note';
import { parseQuickCapture, toTaskParams } from '../../model/QuickCaptureParser';
import {
  DEFAULT_TASK_FILTER,
  filterTasks,
  sortTasksForList,
  type TaskFilter,
  type TaskItem,
} from '../../model/TaskQueryService';
import { BUILTIN_TODO_STATUSES, DEFAULT_TODO_STATUS_LABELS, isBuiltinTodoStatus } from '../../model/TodoService';
import { DetailDrawer } from '../DetailDrawer';
import { PlannerView } from '../PlannerView';
import { TaskCard } from './TaskCard';
import { TaskFilterBar } from './TaskFilterBar';
import { useTaskItems } from './useTaskItems';

const FILTER_STORAGE_KEY = 'bullsnote.taskFilter';

function loadFilter(): TaskFilter {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (raw) return { ...DEFAULT_TASK_FILTER, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  // 처음에는 끝나지 않은 할일만
  return { ...DEFAULT_TASK_FILTER, statuses: ['todo', 'doing'] };
}

export function TodosView() {
  const {
    todoViewMode,
    setTodoViewMode,
    createPlannerTask,
    changeTodoStatus,
    todoStatusLabels,
    customTodoStatuses,
    todoStatusOrder,
    renameTodoStatus,
    resetTodoStatusLabels,
    addCustomTodoStatus,
    deleteCustomTodoStatus,
  } = useNotes();
  const tasks = useTaskItems();
  const [filter, setFilterState] = useState<TaskFilter>(loadFilter);
  const [draft, setDraft] = useState('');
  const [editingStatus, setEditingStatus] = useState<TodoStatus | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [addingStatus, setAddingStatus] = useState(false);
  const [newStatusLabel, setNewStatusLabel] = useState('');
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TodoStatus | null>(null);
  const dragNoteIdRef = useRef<string | null>(null);

  const customMap = useMemo(
    () => new Map(customTodoStatuses.map((s) => [s.id, s])),
    [customTodoStatuses]
  );

  const getStatusLabel = (status: TodoStatus) =>
    todoStatusLabels[status] || customMap.get(status)?.label || status;

  const hasCustomLabels = useMemo(
    () => BUILTIN_TODO_STATUSES.some((s) => todoStatusLabels[s] !== DEFAULT_TODO_STATUS_LABELS[s]),
    [todoStatusLabels]
  );

  const startEditingStatus = (status: TodoStatus) => {
    setEditingStatus(status);
    setEditingLabel(getStatusLabel(status));
  };

  const cancelEditingStatus = () => {
    setEditingStatus(null);
    setEditingLabel('');
  };

  const commitEditingStatus = (status: TodoStatus) => {
    const trimmed = editingLabel.trim();
    if (trimmed) {
      renameTodoStatus(status, trimmed);
    }
    setEditingStatus(null);
    setEditingLabel('');
  };

  const commitAddingStatus = () => {
    const trimmed = newStatusLabel.trim();
    if (trimmed) {
      addCustomTodoStatus(trimmed);
    }
    setNewStatusLabel('');
    setAddingStatus(false);
  };

  const setFilter = (next: TaskFilter) => {
    setFilterState(next);
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const addTask = () => {
    const text = draft.trim();
    if (!text) return;
    createPlannerTask({ ...toTaskParams(parseQuickCapture(text, new Date())), select: false });
    setDraft('');
  };

  const card = (item: TaskItem, enableDrag = false) => (
    <TaskCard
      key={item.note.id}
      item={item}
      sourceTitle={tasks.sourceTitleOf(item)}
      onOpen={tasks.openDetail}
      onToggleDone={tasks.toggleDone}
      onOpenSource={tasks.openSource}
      highlightOverdue
      draggable={enableDrag}
      isDragging={enableDrag && draggingNoteId === item.note.id}
      onDragStart={
        enableDrag
          ? (e) => {
              dragNoteIdRef.current = item.note.id;
              setDraggingNoteId(item.note.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', item.note.id);
            }
          : undefined
      }
      onDragEnd={
        enableDrag
          ? () => {
              dragNoteIdRef.current = null;
              setDraggingNoteId(null);
              setDragOverStatus(null);
            }
          : undefined
      }
    />
  );

  const listItems = useMemo(
    () => sortTasksForList(filterTasks(tasks.items, filter, tasks.todayIso)),
    [tasks.items, filter, tasks.todayIso]
  );
  // 보드는 상태가 열이므로 상태 필터를 빼고 거른다
  const boardItems = useMemo(
    () => sortTasksForList(filterTasks(tasks.items, { ...filter, statuses: [] }, tasks.todayIso)),
    [tasks.items, filter, tasks.todayIso]
  );

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <Stack
        gap={10}
        px="lg"
        pt="md"
        pb={todoViewMode === 'timeline' ? 8 : 'sm'}
        style={{ borderBottom: '1px solid var(--bn-border-subtle)', flexShrink: 0 }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Text fw={700} fz={20} style={{ letterSpacing: '-0.3px' }}>
            할일
          </Text>
          <Group gap={8} wrap="nowrap">
            {todoViewMode === 'board' && hasCustomLabels && (
              <Tooltip label="상태 이름을 기본값으로 복원">
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  leftSection={<IconRotateClockwise size={13} />}
                  onClick={resetTodoStatusLabels}
                >
                  기본 이름 복원
                </Button>
              </Tooltip>
            )}
            <SegmentedControl
              size="xs"
              value={todoViewMode}
              onChange={(v) => setTodoViewMode(v as TodoViewMode)}
              data={[
                { label: '목록', value: 'list' },
                { label: '보드', value: 'board' },
                { label: '타임라인', value: 'timeline' },
              ]}
            />
          </Group>
        </Group>
        {todoViewMode !== 'timeline' && (
          <>
            <TextInput
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addTask();
                }
              }}
              leftSection={<IconPlus size={16} />}
              placeholder='할일 추가 — "내일 3시 보고서 #업무"'
              aria-label="할일 추가"
            />
            <TaskFilterBar
              value={filter}
              onChange={setFilter}
              items={tasks.items}
              hideStatus={todoViewMode === 'board'}
            />
          </>
        )}
      </Stack>

      <Box style={{ flex: 1, minHeight: 0 }}>
        {todoViewMode === 'timeline' && <PlannerView embedded />}

        {todoViewMode === 'list' && (
          <ScrollArea h="100%" type="auto">
            <Stack gap={8} p="lg" maw={860}>
              {listItems.length === 0 ? (
                <Text c="dimmed" size="sm" ta="center" py="xl">
                  조건에 맞는 할일이 없어요
                </Text>
              ) : (
                listItems.map((item) => card(item, false))
              )}
            </Stack>
          </ScrollArea>
        )}

        {todoViewMode === 'board' && (
          // ScrollArea는 내용을 줄어드는 표로 감싸 열이 화면 너비를 채우지 못하므로 일반 스크롤 상자 사용
          <Box h="100%" style={{ overflow: 'auto' }}>
            {/* 네 열이 화면 너비를 나눠 쓰고, 좁으면 열마다 최소 240px을 지키며 가로 스크롤 */}
            <Group align="flex-start" gap="md" p="lg" wrap="nowrap">
              {todoStatusOrder.map((status) => {
                const colItems = boardItems.filter((i) => i.status === status);
                const isEditing = editingStatus === status;
                const isBuiltin = isBuiltinTodoStatus(status);
                const isDropTarget = dragOverStatus === status && draggingNoteId !== null;
                return (
                  <Stack
                    key={status}
                    gap={8}
                    p={6}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverStatus !== status) setDragOverStatus(status);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setDragOverStatus((cur) => (cur === status ? null : cur));
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const noteId = e.dataTransfer.getData('text/plain') || dragNoteIdRef.current;
                      dragNoteIdRef.current = null;
                      setDragOverStatus(null);
                      setDraggingNoteId(null);
                      if (noteId) {
                        const droppedItem = boardItems.find((i) => i.note.id === noteId);
                        if (droppedItem && droppedItem.status !== status) {
                          changeTodoStatus(noteId, status);
                        }
                      }
                    }}
                    style={{
                      flex: '1 1 0',
                      minWidth: 240,
                      minHeight: 160,
                      borderRadius: 12,
                      border: isDropTarget
                        ? '2px dashed var(--mantine-color-blue-5)'
                        : '2px solid transparent',
                      backgroundColor: isDropTarget ? 'rgba(59, 130, 246, 0.06)' : undefined,
                      transition: 'background-color 120ms ease, border-color 120ms ease',
                    }}
                  >
                    <Group gap={6} wrap="nowrap" style={{ minHeight: 28 }}>
                      {isEditing ? (
                        <TextInput
                          size="xs"
                          maxLength={24}
                          autoFocus
                          value={editingLabel}
                          onChange={(e) => setEditingLabel(e.currentTarget.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                              e.preventDefault();
                              commitEditingStatus(status);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelEditingStatus();
                            }
                          }}
                          onBlur={() => commitEditingStatus(status)}
                          aria-label="상태 이름 입력"
                          style={{ flex: 1 }}
                        />
                      ) : (
                        <>
                          <Text
                            fw={600}
                            size="sm"
                            truncate
                            onDoubleClick={() => startEditingStatus(status)}
                            title="더블클릭하여 상태 이름 변경"
                            style={{ cursor: 'pointer' }}
                          >
                            {getStatusLabel(status)}
                          </Text>
                          <Text c="dimmed" size="xs">
                            {colItems.length}
                          </Text>
                          <Tooltip label="상태 이름 변경" openDelay={400}>
                            <ActionIcon
                              size="xs"
                              variant="subtle"
                              color="gray"
                              aria-label="상태 이름 변경"
                              onClick={() => startEditingStatus(status)}
                            >
                              <IconPencil size={12} />
                            </ActionIcon>
                          </Tooltip>
                          {!isBuiltin && (
                            <Tooltip label="상태 삭제" openDelay={400}>
                              <ActionIcon
                                size="xs"
                                variant="subtle"
                                color="gray"
                                aria-label="상태 삭제"
                                onClick={() => deleteCustomTodoStatus(status)}
                              >
                                <IconTrash size={12} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </>
                      )}
                    </Group>
                    {colItems.map((item) => card(item, true))}
                    {colItems.length === 0 && (
                      <Text size="xs" c="dimmed" ta="center" py="md" style={{ opacity: isDropTarget ? 1 : 0.6 }}>
                        {isDropTarget ? '여기에 놓아서 상태 변경' : '항목 없음'}
                      </Text>
                    )}
                  </Stack>
                );
              })}
              <Box style={{ flex: '0 0 220px', minWidth: 220 }}>
                {addingStatus ? (
                  <Stack
                    gap={6}
                    p="xs"
                    style={{
                      border: '1px solid var(--bn-border-subtle)',
                      borderRadius: 10,
                      backgroundColor: 'var(--bn-surface-editor)',
                    }}
                  >
                    <TextInput
                      size="xs"
                      autoFocus
                      maxLength={24}
                      placeholder="새 상태 이름 (예: 보류, 검토)"
                      value={newStatusLabel}
                      onChange={(e) => setNewStatusLabel(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          commitAddingStatus();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setNewStatusLabel('');
                          setAddingStatus(false);
                        }
                      }}
                      aria-label="새 상태 이름"
                    />
                    <Group gap={6} justify="flex-end">
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="gray"
                        onClick={() => {
                          setNewStatusLabel('');
                          setAddingStatus(false);
                        }}
                      >
                        취소
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="filled"
                        disabled={!newStatusLabel.trim()}
                        onClick={commitAddingStatus}
                      >
                        추가
                      </Button>
                    </Group>
                  </Stack>
                ) : (
                  <Button
                    variant="subtle"
                    color="gray"
                    size="xs"
                    fullWidth
                    justify="flex-start"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => setAddingStatus(true)}
                    style={{
                      border: '1px dashed var(--bn-border-subtle)',
                      borderRadius: 10,
                      height: 36,
                    }}
                  >
                    상태 추가
                  </Button>
                )}
              </Box>
            </Group>
          </Box>
        )}
      </Box>

      <DetailDrawer opened={tasks.detailOpen} onClose={tasks.closeDetail} />
    </Box>
  );
}
