// VIEW: 사이드바 미니 달력 컴포넌트 (옵시디언 스타일 날짜별 작성 노트 점 표시 및 데일리 노트 연동)
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
} from '@mantine/core';
import {
  IconCalendar,
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconX,
} from '@tabler/icons-react';
import React, { useMemo, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { buildCreatedDateMap, getCalendarMatrix } from '../model/CalendarService';
import { formatDateIso, WEEKDAYS } from '../model/dateUtils';

export function MiniCalendar() {
  const {
    notes,
    projects,
    selectedProjectId,
    selectedDate,
    setSelectedDate,
    openOrCreateDailyNote,
  } = useNotes();

  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = scheme === 'dark';

  // 현재 표시 중인 연도와 월 (0-11)
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth());

  // 달력 집계 범위: 'all'(전체 프로젝트) | 'current'(현재 프로젝트)
  const [calendarScope, setCalendarScope] = useState<'all' | 'current'>('all');

  // 집계 대상 노트 목록
  const targetNotes = useMemo(() => {
    if (calendarScope === 'current') {
      return notes.filter((n) => (n.projectId || 'default') === selectedProjectId);
    }
    return notes;
  }, [notes, calendarScope, selectedProjectId]);

  // 날짜별(YYYY-MM-DD) 노트 맵 (작성일 createdAt 기준)
  const dateNotesMap = useMemo(() => buildCreatedDateMap(targetNotes), [targetNotes]);

  // 이번 달 달력 날짜 그리드 (35 또는 42칸)
  const cells = useMemo(() => getCalendarMatrix(year, month), [year, month]);

  // 이전 달 이동
  const handlePrevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  };

  // 다음 달 이동
  const handleNextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  };

  // 오늘이 속한 달로 이동
  const handleGoToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  // 프로젝트 맵 (툴팁에 프로젝트명 표시용)
  const projectMap = useMemo(() => {
    const map = new Map<string, { name: string; icon: string }>();
    for (const p of projects) {
      map.set(p.id, { name: p.name, icon: p.icon || '📁' });
    }
    return map;
  }, [projects]);

  const todayStr = useMemo(() => formatDateIso(new Date()), []);

  return (
    <Stack gap="xs" p="xs" style={{ userSelect: 'none' }}>
      {/* 1. 상단 월 이동 헤더 및 퀵 액션 */}
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap={4} wrap="nowrap">
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={handlePrevMonth} aria-label="이전 달">
            <IconChevronLeft size={14} />
          </ActionIcon>
          <Text size="xs" fw={700} style={{ minWidth: 84, textAlign: 'center' }}>
            {year}년 {month + 1}월
          </Text>
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={handleNextMonth} aria-label="다음 달">
            <IconChevronRight size={14} />
          </ActionIcon>
        </Group>

        <Group gap={4} wrap="nowrap">
          <Button
            size="compact-xs"
            variant="light"
            color="gray"
            onClick={handleGoToday}
            style={{ fontSize: 10, height: 20 }}
          >
            오늘
          </Button>
          <Tooltip label={calendarScope === 'all' ? '전체 프로젝트의 노트 표시 중 (클릭 시 현재 프로젝트만)' : '현재 프로젝트의 노트만 표시 중 (클릭 시 전체 표시)'}>
            <Button
              size="compact-xs"
              variant="subtle"
              color={calendarScope === 'all' ? 'blue' : 'gray'}
              onClick={() => setCalendarScope((s) => (s === 'all' ? 'current' : 'all'))}
              style={{ fontSize: 10, height: 20, padding: '0 4px' }}
            >
              {calendarScope === 'all' ? '🌐 전체' : '📁 현재'}
            </Button>
          </Tooltip>
        </Group>
      </Group>

      {/* 2. 요일 헤더 행 (일 ~ 토) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          textAlign: 'center',
          fontSize: 10,
          fontWeight: 600,
          opacity: 0.65,
        }}
      >
        {WEEKDAYS.map((day, idx) => (
          <div
            key={day}
            style={{
              color: idx === 0 ? 'var(--mantine-color-red-6)' : idx === 6 ? 'var(--mantine-color-blue-6)' : undefined,
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 3. 날짜 그리드 (7열) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2,
        }}
      >
        {cells.map((cell) => {
          const dayNotes = dateNotesMap.get(cell.dateStr) || [];
          const noteCount = dayNotes.length;
          const isSelected = selectedDate === cell.dateStr;

          // 툴팁 내용 구성
          const tooltipContent = (
            <div style={{ maxWidth: 220, fontSize: 11 }}>
              <Text size="xs" fw={700} c={isSelected ? 'blue.4' : undefined}>
                {cell.dateStr} ({WEEKDAYS[cell.dayOfWeek]})
              </Text>
              {noteCount > 0 ? (
                <div style={{ marginTop: 4 }}>
                  <Text size="11px" fw={600} c="dimmed">
                    작성된 노트 {noteCount}개:
                  </Text>
                  <Stack gap={2} mt={2}>
                    {dayNotes.slice(0, 4).map((n) => {
                      const proj = projectMap.get(n.projectId || 'default');
                      return (
                        <Text key={n.id} size="10px" truncate>
                          • {proj ? `${proj.icon} ` : ''}
                          {n.title || '제목 없음'}
                        </Text>
                      );
                    })}
                    {noteCount > 4 && (
                      <Text size="10px" c="dimmed">
                        ...외 {noteCount - 4}개
                      </Text>
                    )}
                  </Stack>
                </div>
              ) : (
                <Text size="11px" c="dimmed" mt={2}>
                  작성된 노트 없음
                </Text>
              )}
              <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 4 }}>
                <Text size="9px" c="dimmed">
                  클릭: 목록 필터 | 더블클릭: 데일리 노트
                </Text>
              </div>
            </div>
          );

          return (
            <Tooltip
              key={cell.dateStr}
              label={tooltipContent}
              position="top"
              withArrow
              openDelay={350}
              withinPortal
            >
              <UnstyledButton
                onClick={() => {
                  setSelectedDate(isSelected ? null : cell.dateStr);
                }}
                onDoubleClick={() => {
                  openOrCreateDailyNote(cell.dateStr);
                }}
                style={{
                  height: 32,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  position: 'relative',
                  backgroundColor: isSelected
                    ? 'var(--mantine-color-blue-6)'
                    : cell.isToday
                    ? isDark
                      ? 'rgba(59, 130, 246, 0.16)'
                      : 'rgba(59, 130, 246, 0.1)'
                    : 'transparent',
                  color: isSelected
                    ? '#ffffff'
                    : cell.isCurrentMonth
                    ? cell.dayOfWeek === 0
                      ? isDark
                        ? '#ff8787'
                        : '#e03131'
                      : cell.dayOfWeek === 6
                      ? isDark
                        ? '#74c0fc'
                        : '#1971c2'
                      : 'inherit'
                    : isDark
                    ? 'rgba(255,255,255,0.22)'
                    : 'rgba(0,0,0,0.22)',
                  boxShadow:
                    cell.isToday && !isSelected
                      ? `0 0 0 1.5px var(--mantine-color-blue-5)`
                      : undefined,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease, transform 0.1s ease',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: cell.isToday || isSelected ? 700 : 500,
                    lineHeight: 1,
                  }}
                >
                  {cell.dayNumber}
                </span>

                {/* 노트 수에 따른 옵시디언 스타일 점(dot) 표시 */}
                <div
                  style={{
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 5,
                    marginTop: 2,
                  }}
                >
                  {noteCount > 0 && noteCount <= 3 && (
                    Array.from({ length: noteCount }).map((_, i) => (
                      <span
                        key={i}
                        style={{
                          width: 3.5,
                          height: 3.5,
                          borderRadius: '50%',
                          backgroundColor: isSelected
                            ? '#ffffff'
                            : 'var(--mantine-color-blue-5)',
                        }}
                      />
                    ))
                  )}
                  {noteCount > 3 && (
                    <span
                      style={{
                        fontSize: 8,
                        lineHeight: 1,
                        fontWeight: 700,
                        color: isSelected ? '#ffffff' : 'var(--mantine-color-blue-6)',
                      }}
                    >
                      {noteCount}
                    </span>
                  )}
                </div>
              </UnstyledButton>
            </Tooltip>
          );
        })}
      </div>

      {/* 4. 하단 데일리 노트 액션 바 */}
      {selectedDate ? (
        <Paper
          p={6}
          radius="sm"
          withBorder
          style={{
            backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(231, 245, 255, 0.7)',
            borderColor: 'var(--mantine-color-blue-3)',
          }}
        >
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap={4} wrap="nowrap" style={{ overflow: 'hidden' }}>
              <IconCalendar size={13} color="var(--mantine-color-blue-6)" />
              <Text size="11px" fw={700} truncate>
                {selectedDate} ({dateNotesMap.get(selectedDate)?.length || 0}개)
              </Text>
            </Group>
            <Group gap={2} wrap="nowrap">
              <Tooltip label="이 날짜의 데일리 노트 열기/작성 (Daily Note 프로젝트)">
                <ActionIcon
                  size="xs"
                  variant="filled"
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
      ) : (
        <Button
          size="compact-xs"
          variant="light"
          color="blue"
          fullWidth
          leftSection={<IconCalendarEvent size={13} />}
          onClick={() => openOrCreateDailyNote(todayStr)}
          style={{ height: 24, fontSize: 11 }}
        >
          오늘 데일리 노트 ({todayStr})
        </Button>
      )}
    </Stack>
  );
}
