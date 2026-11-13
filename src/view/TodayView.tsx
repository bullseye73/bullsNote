// VIEW: 오늘 대시보드 — 오늘 할 일(지연·오늘 마감·진행 중) / 오늘 일정(알림 시각) / 진행 중인 기간 작업
import { ActionIcon, Box, Button, Group, Popover, Progress, ScrollArea, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconCalendar, IconChevronLeft, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { findDailyNote, formatDashboardDateLabel, isDailyNoteProject, removeDailyBriefing } from '../model/DailyNoteService';
import { noteBodyText } from '../model/HashtagService';
import type { BriefingInput } from '../model/TodayBriefing';
import { TodayBriefingCard } from './TodayBriefingCard';
import { addCalendarDays, diffCalendarDays } from '../model/PlannerService';
import { CalendarPicker } from './CalendarPicker';
import { DailyNotePanel } from './DailyNotePanel';
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
  const { openQuickCapture, projects } = useNotes();
  const tasks = useTaskItems();

  // 보고 있는 날짜: 실제 오늘을 보고 있었다면 자정에 새 오늘로 따라간다
  const [viewDate, setViewDate] = useState(tasks.todayIso);
  const prevTodayRef = useRef(tasks.todayIso);
  useEffect(() => {
    setViewDate((v) => (v === prevTodayRef.current ? tasks.todayIso : v));
    prevTodayRef.current = tasks.todayIso;
  }, [tasks.todayIso]);
  const isToday = viewDate === tasks.todayIso;
  const [calendarOpen, setCalendarOpen] = useState(false);

  const board = useMemo(() => getTodayBoard(tasks.items, tasks.notes, viewDate), [tasks.items, tasks.notes, viewDate]);

  // 달력에 점으로 표시할 Daily Note가 있는 날
  const dailyDates = useMemo(() => {
    const ids = new Set(projects.filter(isDailyNoteProject).map((p) => p.id));
    return new Set(tasks.notes.filter((n) => ids.has(n.projectId) && /^\d{4}-\d{2}-\d{2}$/.test(n.title.trim())).map((n) => n.title.trim()));
  }, [projects, tasks.notes]);

  // 현재 시각 선 위치 갱신
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 브리핑 자료는 누를 때 계산 (현재 시각 포함)
  const getBriefingInput = (): BriefingInput => {
    const daily = findDailyNote(tasks.notes, projects, viewDate);
    return {
      todayIso: viewDate,
      dateLabel: formatDashboardDateLabel(viewDate, tasks.todayIso),
      nowTime: hhmm(Date.now()),
      tasks: board.tasks.map((t) => ({
        title: t.note.title || '제목 없음',
        dueDate: t.dueDate,
        status: t.status,
        overdue: t.dueDate !== null && t.dueDate < viewDate,
      })),
      schedule: board.schedule.map((s) => ({ time: hhmm(s.at), title: s.label })),
      dailyNote: daily ? noteBodyText(removeDailyBriefing(daily.content)) : '',
    };
  };

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
        <Group gap={12} align="center" wrap="wrap">
          <Group gap={2} wrap="nowrap">
            <ActionIcon variant="subtle" color="gray" onClick={() => setViewDate((v) => addCalendarDays(v, -1))} aria-label="전날">
              <IconChevronLeft size={18} />
            </ActionIcon>
            <Text fw={700} fz={20} style={{ letterSpacing: '-0.3px' }}>
              {formatDashboardDateLabel(viewDate, tasks.todayIso)}
            </Text>
            <ActionIcon variant="subtle" color="gray" onClick={() => setViewDate((v) => addCalendarDays(v, 1))} aria-label="다음 날">
              <IconChevronRight size={18} />
            </ActionIcon>
            <Popover opened={calendarOpen} onChange={setCalendarOpen} position="bottom-start" shadow="md" withArrow>
              <Popover.Target>
                <Tooltip label="날짜 고르기" openDelay={400}>
                  <ActionIcon variant="subtle" color="gray" onClick={() => setCalendarOpen((o) => !o)} aria-label="달력">
                    <IconCalendar size={17} />
                  </ActionIcon>
                </Tooltip>
              </Popover.Target>
              <Popover.Dropdown p="xs">
                <CalendarPicker
                  value={viewDate}
                  markedDates={dailyDates}
                  onChange={(d) => {
                    setViewDate(d);
                    setCalendarOpen(false);
                  }}
                />
              </Popover.Dropdown>
            </Popover>
            {!isToday && (
              <Button size="compact-xs" variant="light" ml={4} onClick={() => setViewDate(tasks.todayIso)}>
                오늘
              </Button>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            할 일 {board.counts.tasks} · 진행 중 {board.counts.doing}
            {board.counts.completed > 0 && ` · 완료 ${board.counts.completed}`}
            {board.counts.overdue > 0 && (
              <Text span c="red" inherit>
                {' '}
                · 지연 {board.counts.overdue}
              </Text>
            )}
          </Text>
        </Group>
        <Group gap={6}>
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => openQuickCapture()}>
            할일 추가
          </Button>
        </Group>
      </Group>

      <ScrollArea style={{ flex: 1 }} type="auto">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" p="lg" style={{ alignItems: 'start' }}>
          {/* 왼쪽: 그날의 Daily Note(계획표) + 할 일 */}
          <Stack gap="lg">
            {isToday && <TodayBriefingCard todayIso={tasks.todayIso} getInput={getBriefingInput} />}
            <DailyNotePanel dateIso={viewDate} todayIso={tasks.todayIso} />
          <Box>
            <SectionTitle>{isToday ? '오늘 할 일' : '할 일'}</SectionTitle>
            {board.tasks.length === 0 && board.completed.length > 0 ? (
              <Text size="sm" c="dimmed" py={6}>
                {isToday ? '오늘 할 일을 모두 끝냈어요 🎉' : '이 날 할 일을 모두 끝냈어요'}
              </Text>
            ) : board.tasks.length === 0 ? (
              <Stack align="center" gap={8} py="xl" style={{ border: '1px dashed var(--bn-border-subtle)', borderRadius: 10 }}>
                <Text fw={600} size="sm">
                  {isToday ? '오늘 할 일이 없어요' : '이 날 할 일이 없어요'}
                </Text>
                <Text size="xs" c="dimmed">
                  {isToday ? '마감일이 오늘이거나 지난 할일, 진행 중인 할일이 여기에 모여요' : '이 날까지 마감인 할일과 진행 중인 할일이 여기에 모여요'}
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
            {board.completed.length > 0 && (
              <Box mt="md">
                <Text size="xs" fw={600} c="dimmed" mb={8}>
                  완료 {board.completed.length}
                </Text>
                <Stack gap={8}>
                  {board.completed.map((item) => (
                    <TaskCard
                      key={item.note.id}
                      item={item}
                      sourceTitle={tasks.sourceTitleOf(item)}
                      onOpen={tasks.openDetail}
                      onToggleDone={tasks.toggleDone}
                      onOpenSource={tasks.openSource}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
          </Stack>

          {/* 오른쪽: 일정 + 진행 중인 기간 작업 */}
          <Stack gap="xl">
            <Box>
              <SectionTitle>{isToday ? '오늘 일정' : '일정'}</SectionTitle>
              {board.schedule.length === 0 ? (
                <Text size="xs" c="dimmed">
                  {isToday ? '오늘' : '이 날'} 시각이 정해진 알림이 없어요
                </Text>
              ) : (
                <Stack gap={6}>
                  {board.schedule.map((entry, i) => (
                    <Box key={`${entry.note.id}-${entry.at}`}>
                      {isToday && i === splitAt && <NowLine now={now} />}
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
                  {isToday && splitAt === board.schedule.length && <NowLine now={now} />}
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
                    const elapsed = diffCalendarDays(item.startDate!, viewDate) + 1;
                    const left = diffCalendarDays(viewDate, item.dueDate!);
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
