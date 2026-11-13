// VIEW: 오늘 대시보드 — 오늘 할 일(지연·오늘 마감·진행 중) / 오늘 일정(알림 시각) / 진행 중인 기간 작업
import { Box, Button, Group, Progress, ScrollArea, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconCalendarEvent, IconPlus } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { WEEKDAYS } from '../model/dateUtils';
import { diffCalendarDays, parseIsoDateLocal } from '../model/PlannerService';
import { getTodayBoard } from '../model/TaskQueryService';
import { DetailDrawer } from './DetailDrawer';
import { TaskCard } from './todos/TaskCard';
import { useTaskItems } from './todos/useTaskItems';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" fw={600} c="dimmed" mb={8}>
      {children}
    </Text>
  );
}

export function TodayView() {
  const { openOrCreateDailyNote, openNote, openQuickCapture } = useNotes();
  const tasks = useTaskItems();
  const board = useMemo(() => getTodayBoard(tasks.items, tasks.notes, tasks.todayIso), [tasks.items, tasks.notes, tasks.todayIso]);

  // 현재 시각 선 위치 갱신
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const today = parseIsoDateLocal(tasks.todayIso);
  const nowIndex = board.schedule.findIndex((s) => s.at > now);
  const splitAt = nowIndex === -1 ? board.schedule.length : nowIndex;

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Group
        justify="space-between"
        px="lg"
        pt="md"
        pb="sm"
        wrap="wrap"
        gap="xs"
        style={{ borderBottom: '1px solid var(--bn-border-subtle)', flexShrink: 0 }}
      >
        <Group gap={12} align="baseline" wrap="wrap">
          <Text fw={700} fz={20} style={{ letterSpacing: '-0.3px' }}>
            {today.getMonth() + 1}월 {today.getDate()}일 {WEEKDAYS[today.getDay()]}요일
          </Text>
          <Text size="sm" c="dimmed">
            할 일 {board.counts.tasks} · 진행 중 {board.counts.doing}
            {board.counts.overdue > 0 && (
              <Text span c="red" inherit>
                {' '}
                · 지연 {board.counts.overdue}
              </Text>
            )}
          </Text>
        </Group>
        <Group gap={6}>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconCalendarEvent size={14} />}
            onClick={() => openNote(openOrCreateDailyNote())}
          >
            오늘 노트
          </Button>
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => openQuickCapture()}>
            할일 추가
          </Button>
        </Group>
      </Group>

      <ScrollArea style={{ flex: 1 }} type="auto">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" p="lg" style={{ alignItems: 'start' }}>
          {/* 왼쪽: 오늘 할 일 */}
          <Box>
            <SectionTitle>오늘 할 일</SectionTitle>
            {board.tasks.length === 0 ? (
              <Stack align="center" gap={8} py="xl" style={{ border: '1px dashed var(--bn-border-subtle)', borderRadius: 10 }}>
                <Text fw={600} size="sm">
                  오늘 할 일이 없어요
                </Text>
                <Text size="xs" c="dimmed">
                  마감일이 오늘이거나 지난 할일, 진행 중인 할일이 여기에 모여요
                </Text>
                <Button size="xs" variant="light" onClick={() => openQuickCapture()}>
                  할일 추가
                </Button>
              </Stack>
            ) : (
              <Stack gap={8}>
                {board.tasks.map((item) => (
                  <TaskCard
                    key={item.note.id}
                    item={item}
                    sourceTitle={tasks.sourceTitleOf(item)}
                    onOpen={tasks.openDetail}
                    onToggleDone={tasks.toggleDone}
                    onOpenSource={tasks.openSource}
                    highlightOverdue
                  />
                ))}
              </Stack>
            )}
          </Box>

          {/* 오른쪽: 오늘 일정 + 진행 중인 기간 작업 */}
          <Stack gap="xl">
            <Box>
              <SectionTitle>오늘 일정</SectionTitle>
              {board.schedule.length === 0 ? (
                <Text size="xs" c="dimmed">
                  오늘 시각이 정해진 알림이 없어요
                </Text>
              ) : (
                <Stack gap={6}>
                  {board.schedule.map((entry, i) => (
                    <Box key={`${entry.note.id}-${entry.at}`}>
                      {i === splitAt && <NowLine now={now} />}
                      <UnstyledButton
                        onClick={() => tasks.openDetail(entry.note.id)}
                        style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%' }}
                      >
                        <Text size="xs" c="dimmed" w={40} style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                          {hhmm(entry.at)}
                        </Text>
                        <Text
                          size="sm"
                          truncate
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: 8,
                            backgroundColor: 'var(--mantine-color-blue-light)',
                            color: 'var(--mantine-color-blue-light-color)',
                            opacity: entry.at < now ? 0.6 : 1,
                          }}
                        >
                          {entry.label}
                        </Text>
                      </UnstyledButton>
                    </Box>
                  ))}
                  {splitAt === board.schedule.length && <NowLine now={now} />}
                </Stack>
              )}
            </Box>

            <Box>
              <SectionTitle>진행 중인 기간 작업</SectionTitle>
              {board.ongoing.length === 0 ? (
                <Text size="xs" c="dimmed">
                  오늘을 포함하는 여러 날짜 작업이 없어요
                </Text>
              ) : (
                <Stack gap={12}>
                  {board.ongoing.map((item) => {
                    const span = diffCalendarDays(item.startDate!, item.dueDate!) + 1;
                    const elapsed = diffCalendarDays(item.startDate!, tasks.todayIso) + 1;
                    const left = diffCalendarDays(tasks.todayIso, item.dueDate!);
                    return (
                      <UnstyledButton key={item.note.id} onClick={() => tasks.openDetail(item.note.id)} style={{ display: 'block' }}>
                        <Group justify="space-between" wrap="nowrap" mb={4}>
                          <Text size="sm" truncate>
                            {item.note.title || '제목 없음'}
                          </Text>
                          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                            {left === 0 ? '오늘 마감' : `D-${left}`}
                          </Text>
                        </Group>
                        <Progress value={Math.round((elapsed / span) * 100)} size="sm" radius="xl" />
                      </UnstyledButton>
                    );
                  })}
                </Stack>
              )}
            </Box>
          </Stack>
        </SimpleGrid>
      </ScrollArea>

      <DetailDrawer opened={tasks.detailOpen} onClose={tasks.closeDetail} />
    </Box>
  );
}

function NowLine({ now }: { now: number }) {
  return (
    <Group gap={10} wrap="nowrap" my={2} aria-label="현재 시각">
      <Text size="xs" c="blue" fw={600} w={40} style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {hhmm(now)}
      </Text>
      <Box style={{ flex: 1, height: 2, backgroundColor: 'var(--mantine-color-blue-5)', borderRadius: 1 }} />
    </Group>
  );
}
