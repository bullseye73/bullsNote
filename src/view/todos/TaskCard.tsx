// VIEW: 할일 카드 (오늘 대시보드·할일 목록·보드 공용) — 상태, 제목, 마감, 본문 미리보기, 체크리스트 진행률, 출처 노트
import { ActionIcon, Badge, Box, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import {
  IconCircle,
  IconCircleCheck,
  IconCircleX,
  IconFileText,
  IconProgress,
  IconSquareCheck,
} from '@tabler/icons-react';
import type { TodoStatus } from '../../model/Note';
import { getDueDateBadgeInfo } from '../../model/PlannerService';
import { getBodyPreview, getChecklistProgress, type TaskItem } from '../../model/TaskQueryService';

const STATUS_ICON: Record<TodoStatus, React.ReactNode> = {
  todo: <IconCircle size={18} />,
  doing: <IconProgress size={18} color="var(--mantine-color-blue-6)" />,
  done: <IconCircleCheck size={18} color="var(--mantine-color-teal-6)" />,
  drop: <IconCircleX size={18} color="var(--mantine-color-gray-5)" />,
};

interface TaskCardProps {
  item: TaskItem;
  sourceTitle?: string | null;
  onOpen: (noteId: string) => void;
  onToggleDone: (noteId: string, done: boolean) => void;
  onOpenSource?: (sourceNoteId: string) => void;
  /** 지연 항목 강조 테두리 */
  highlightOverdue?: boolean;
}

export function TaskCard({ item, sourceTitle, onOpen, onToggleDone, onOpenSource, highlightOverdue }: TaskCardProps) {
  const { note, status, dueDate } = item;
  const badge = getDueDateBadgeInfo(dueDate, status);
  const preview = getBodyPreview(note.content);
  const progress = getChecklistProgress(note.content);
  const isClosed = status === 'done' || status === 'drop';
  const overdue = Boolean(highlightOverdue && badge?.isOverdue && !isClosed);

  return (
    <Box
      className="bn-task-card"
      style={{
        border: `1px solid ${overdue ? 'var(--mantine-color-red-4)' : 'var(--bn-border-subtle)'}`,
        borderRadius: 10,
        padding: '10px 12px',
        backgroundColor: 'var(--bn-surface-editor)',
      }}
    >
      <Group gap={10} wrap="nowrap" align="flex-start">
        <Tooltip label={isClosed ? '다시 열기' : '완료'} openDelay={400}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            mt={1}
            onClick={() => onToggleDone(note.id, !isClosed)}
            aria-label={isClosed ? '할일 다시 열기' : '할일 완료'}
          >
            {STATUS_ICON[status]}
          </ActionIcon>
        </Tooltip>
        <UnstyledButton onClick={() => onOpen(note.id)} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={8} wrap="nowrap" align="center">
            <Text
              size="sm"
              fw={600}
              truncate
              style={{
                flex: 1,
                textDecoration: isClosed ? 'line-through' : undefined,
                opacity: isClosed ? 0.6 : 1,
              }}
            >
              {note.title || '제목 없음'}
            </Text>
            {badge && (
              <Badge size="sm" variant={overdue ? 'filled' : 'light'} color={badge.color} style={{ flexShrink: 0 }}>
                {badge.label}
              </Badge>
            )}
          </Group>
          {preview && (
            <Text size="xs" c="dimmed" mt={4} lineClamp={2} style={{ lineHeight: 1.5 }}>
              {preview}
            </Text>
          )}
          {progress && (
            <Group gap={4} mt={4}>
              <IconSquareCheck size={13} color="var(--mantine-color-dimmed)" />
              <Text size="11px" c="dimmed">
                {progress.done}/{progress.total}
              </Text>
            </Group>
          )}
        </UnstyledButton>
      </Group>
      {item.sourceNoteId && onOpenSource && (
        <UnstyledButton
          onClick={() => onOpenSource(item.sourceNoteId!)}
          mt={6}
          ml={34}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <IconFileText size={13} color="var(--mantine-color-dimmed)" />
          <Text size="11px" c="dimmed" truncate>
            {sourceTitle || '출처 노트'}
          </Text>
        </UnstyledButton>
      )}
    </Box>
  );
}
