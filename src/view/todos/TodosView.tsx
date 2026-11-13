// VIEW: 할일 화면 — 보기 전환(목록 / 보드 / 타임라인), 인라인 할일 추가, 필터
import { Box, Group, ScrollArea, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
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
import { DetailDrawer } from '../DetailDrawer';
import { PlannerView } from '../PlannerView';
import { TaskCard } from './TaskCard';
import { TaskFilterBar } from './TaskFilterBar';
import { useTaskItems } from './useTaskItems';

const FILTER_STORAGE_KEY = 'bullsnote.taskFilter';
const BOARD_COLUMNS: Array<{ status: TodoStatus; title: string }> = [
  { status: 'todo', title: '대기' },
  { status: 'doing', title: '진행 중' },
  { status: 'done', title: '완료' },
  { status: 'drop', title: '중단' },
];

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
  const { todoViewMode, setTodoViewMode, createPlannerTask } = useNotes();
  const tasks = useTaskItems();
  const [filter, setFilterState] = useState<TaskFilter>(loadFilter);
  const [draft, setDraft] = useState('');

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

  const card = (item: TaskItem) => (
    <TaskCard
      key={item.note.id}
      item={item}
      sourceTitle={tasks.sourceTitleOf(item)}
      onOpen={tasks.openDetail}
      onToggleDone={tasks.toggleDone}
      onOpenSource={tasks.openSource}
      highlightOverdue
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
                listItems.map(card)
              )}
            </Stack>
          </ScrollArea>
        )}

        {todoViewMode === 'board' && (
          // ScrollArea는 내용을 줄어드는 표로 감싸 열이 화면 너비를 채우지 못하므로 일반 스크롤 상자 사용
          <Box h="100%" style={{ overflow: 'auto' }}>
            {/* 네 열이 화면 너비를 나눠 쓰고, 좁으면 열마다 최소 240px을 지키며 가로 스크롤 */}
            <Group align="flex-start" gap="md" p="lg" wrap="nowrap">
              {BOARD_COLUMNS.map((col) => {
                const colItems = boardItems.filter((i) => i.status === col.status);
                return (
                  <Stack key={col.status} gap={8} style={{ flex: '1 1 0', minWidth: 240 }}>
                    <Group gap={6}>
                      <Text fw={600} size="sm">
                        {col.title}
                      </Text>
                      <Text c="dimmed" size="xs">
                        {colItems.length}
                      </Text>
                    </Group>
                    {colItems.map(card)}
                  </Stack>
                );
              })}
            </Group>
          </Box>
        )}
      </Box>

      <DetailDrawer opened={tasks.detailOpen} onClose={tasks.closeDetail} />
    </Box>
  );
}
