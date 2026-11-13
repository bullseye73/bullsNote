// VIEW: 할일 필터 막대 — 각 필터는 기준 하나만 (상태 / 기간 / 폴더 / 태그)
import { Button, Chip, Group, Select } from '@mantine/core';
import { IconFilterOff } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useNotes } from '../../controller/NotesController';
import type { TodoStatus } from '../../model/Note';
import { DEFAULT_TASK_FILTER, type PeriodFilter, type TaskFilter, type TaskItem } from '../../model/TaskQueryService';
import { TODO_PROJECT_ID } from '../../model/TodoService';

const STATUS_OPTIONS: Array<{ value: TodoStatus; label: string }> = [
  { value: 'todo', label: '대기' },
  { value: 'doing', label: '진행 중' },
  { value: 'done', label: '완료' },
  { value: 'drop', label: '중단' },
];

const PERIOD_OPTIONS: Array<{ value: PeriodFilter; label: string }> = [
  { value: 'all', label: '모든 기간' },
  { value: 'overdue', label: '지연' },
  { value: 'thisWeek', label: '이번 주' },
  { value: 'noDate', label: '날짜 없음' },
];

interface TaskFilterBarProps {
  value: TaskFilter;
  onChange: (next: TaskFilter) => void;
  items: TaskItem[];
  /** 보드 보기는 상태를 열로 보여주므로 상태 필터를 숨긴다 */
  hideStatus?: boolean;
}

export function TaskFilterBar({ value, onChange, items, hideStatus }: TaskFilterBarProps) {
  const { projects } = useNotes();

  const folderOptions = useMemo(() => {
    const used = new Set(items.map((i) => i.sourceProjectId).filter(Boolean));
    return projects
      .filter((p) => p.id !== TODO_PROJECT_ID && used.has(p.id))
      .map((p) => ({ value: p.id, label: `${p.icon ?? ''} ${p.name}`.trim() }));
  }, [projects, items]);

  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      for (const t of [...i.note.tags, ...i.sourceTags]) {
        if (!['일정', 'todo', 'doing', 'done', 'drop'].includes(t)) set.add(t);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ko')).map((t) => ({ value: t, label: `#${t}` }));
  }, [items]);

  const isDefault =
    value.statuses.length === 0 && value.period === 'all' && !value.projectId && !value.tag;

  return (
    <Group gap={8} wrap="wrap" align="center">
      {!hideStatus && (
        <Chip.Group
          multiple
          value={value.statuses}
          onChange={(v) => onChange({ ...value, statuses: v as TodoStatus[] })}
        >
          <Group gap={4}>
            {STATUS_OPTIONS.map((o) => (
              <Chip key={o.value} value={o.value} size="xs" variant="light">
                {o.label}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      )}
      <Select
        size="xs"
        w={110}
        data={PERIOD_OPTIONS}
        value={value.period}
        onChange={(v) => onChange({ ...value, period: (v as PeriodFilter) ?? 'all' })}
        allowDeselect={false}
        aria-label="기간"
      />
      <Select
        size="xs"
        w={140}
        placeholder="모든 폴더"
        data={folderOptions}
        value={value.projectId}
        onChange={(v) => onChange({ ...value, projectId: v })}
        clearable
        aria-label="폴더"
        disabled={folderOptions.length === 0}
      />
      <Select
        size="xs"
        w={130}
        placeholder="모든 태그"
        data={tagOptions}
        value={value.tag}
        onChange={(v) => onChange({ ...value, tag: v })}
        clearable
        searchable
        aria-label="태그"
        disabled={tagOptions.length === 0}
      />
      {!isDefault && (
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          leftSection={<IconFilterOff size={13} />}
          onClick={() => onChange(DEFAULT_TASK_FILTER)}
        >
          필터 지우기
        </Button>
      )}
    </Group>
  );
}
