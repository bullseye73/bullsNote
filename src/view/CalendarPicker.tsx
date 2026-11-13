// VIEW: 날짜 하나를 고르는 작은 달력 (오늘 화면 날짜 이동용) — 표시된 날(예: Daily Note가 있는 날)은 점으로 표시
import { ActionIcon, Box, Group, SimpleGrid, Text, UnstyledButton } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import { getCalendarMatrix } from '../model/CalendarService';
import { WEEKDAYS } from '../model/dateUtils';
import { parseIsoDateLocal } from '../model/PlannerService';

interface CalendarPickerProps {
  value: string;
  onChange: (dateIso: string) => void;
  /** 점으로 표시할 날짜 (YYYY-MM-DD) */
  markedDates?: Set<string>;
}

export function CalendarPicker({ value, onChange, markedDates }: CalendarPickerProps) {
  const initial = parseIsoDateLocal(value);
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());
  const cells = getCalendarMatrix(year, month);

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return (
    <Box w={252} style={{ userSelect: 'none' }}>
      <Group justify="space-between" mb={6}>
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => shift(-1)} aria-label="이전 달">
          <IconChevronLeft size={15} />
        </ActionIcon>
        <Text size="sm" fw={600}>
          {year}년 {month + 1}월
        </Text>
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => shift(1)} aria-label="다음 달">
          <IconChevronRight size={15} />
        </ActionIcon>
      </Group>
      <SimpleGrid cols={7} spacing={2} verticalSpacing={2}>
        {WEEKDAYS.map((w, i) => (
          <Text key={w} size="11px" ta="center" c={i === 0 ? 'red' : i === 6 ? 'blue' : 'dimmed'}>
            {w}
          </Text>
        ))}
        {cells.map((c) => {
          const selected = c.dateStr === value;
          return (
            <UnstyledButton
              key={c.dateStr}
              onClick={() => onChange(c.dateStr)}
              aria-label={c.dateStr}
              aria-pressed={selected}
              style={{
                height: 32,
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: c.isCurrentMonth ? 1 : 0.35,
                backgroundColor: selected ? 'var(--mantine-color-blue-filled)' : undefined,
                color: selected ? 'white' : c.dayOfWeek === 0 ? 'var(--mantine-color-red-6)' : undefined,
                outline: c.isToday && !selected ? '1px solid var(--mantine-color-blue-5)' : undefined,
              }}
            >
              <Text size="xs" fw={c.isToday || selected ? 700 : 400} inherit>
                {c.dayNumber}
              </Text>
              <Box
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: markedDates?.has(c.dateStr)
                    ? selected
                      ? 'white'
                      : 'var(--mantine-color-teal-6)'
                    : 'transparent',
                }}
              />
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}
