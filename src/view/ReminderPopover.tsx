// VIEW: 노트 알람(리마인더) 설정 팝오버 컴포넌트
import { ActionIcon, Badge, Button, Group, Popover, Select, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconBell, IconBellRinging, IconClock, IconRepeat, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Note, NoteReminder, NoteReminderRepeat, getPastelConfig } from '../model/Note';
import { useNotes } from '../controller/NotesController';

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
}

const REPEAT_OPTIONS = [
  { value: 'none', label: '반복 안함 (1회성)' },
  { value: 'daily', label: '매일 같은 시간' },
  { value: 'weekdays', label: '평일 매일 (월~금)' },
  { value: 'weekly', label: '매주 같은 요일/시간' },
  { value: 'monthly', label: '매월 같은 날짜/시간' },
];

import { CryptoService } from '../model/CryptoService';

export function ReminderPopover({ note, disabled }: { note: Note; disabled?: boolean }) {
  const { setReminder, isMasterSet, isUnlocked } = useNotes();
  const [opened, setOpened] = useState(false);
  const cfg = getPastelConfig(note.color);

  const isLocked =
    disabled ||
    (!isUnlocked && (isMasterSet || CryptoService.isEncrypted(note.content))) ||
    CryptoService.isEncrypted(note.content);

  const hasActiveReminder = !!note.reminder && !note.reminder.dismissed;

  const getInitialDatetime = () => {
    if (note.reminder?.targetAt) {
      return toLocalDatetimeString(new Date(note.reminder.targetAt));
    }
    const defaultTime = new Date(Date.now() + 60 * 60 * 1000);
    defaultTime.setMinutes(Math.ceil(defaultTime.getMinutes() / 5) * 5, 0, 0);
    return toLocalDatetimeString(defaultTime);
  };

  const [datetimeStr, setDatetimeStr] = useState<string>(getInitialDatetime);
  const [repeat, setRepeat] = useState<NoteReminderRepeat>(note.reminder?.repeat || 'none');

  useEffect(() => {
    if (opened) {
      setDatetimeStr(getInitialDatetime());
      setRepeat(note.reminder?.repeat || 'none');
    }
  }, [opened, note.reminder]);

  const handleQuickAdd = (minutes: number) => {
    const target = new Date(Date.now() + minutes * 60 * 1000);
    setDatetimeStr(toLocalDatetimeString(target));
  };

  const handleQuickTomorrow = (hour: number) => {
    const target = new Date();
    target.setDate(target.getDate() + 1);
    target.setHours(hour, 0, 0, 0);
    setDatetimeStr(toLocalDatetimeString(target));
  };

  const handleSave = () => {
    const targetTime = new Date(datetimeStr).getTime();
    if (isNaN(targetTime)) {
      alert('올바른 날짜와 시간을 입력해주세요.');
      return;
    }
    if (targetTime <= Date.now()) {
      alert('알람 시각은 현재 시각보다 미래여야 합니다.');
      return;
    }

    const newReminder: NoteReminder = {
      targetAt: targetTime,
      repeat,
      dismissed: false,
      snoozedUntil: null,
    };

    setReminder(note.id, newReminder);
    setOpened(false);
  };

  const handleRemove = () => {
    setReminder(note.id, null);
    setOpened(false);
  };

  const reminderDateText = note.reminder
    ? new Date(note.reminder.targetAt).toLocaleString('ko-KR', {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      withArrow
      shadow="md"
      width={330}
      withinPortal
    >
      <Popover.Target>
        <Tooltip
          label={
            hasActiveReminder
              ? `알람 설정됨: ${reminderDateText}${
                  note.reminder?.repeat !== 'none'
                    ? ` (${REPEAT_OPTIONS.find((r) => r.value === note.reminder?.repeat)?.label})`
                    : ''
                }`
              : '노트 알람 설정'
          }
        >
          <ActionIcon
            size="lg"
            variant={hasActiveReminder ? 'filled' : 'light'}
            color={hasActiveReminder ? 'blue' : 'gray'}
            disabled={isLocked}
            onClick={() => {
              if (isLocked) return;
              setOpened((o) => !o);
            }}
            aria-label="알람 설정"
            style={{
              backgroundColor: hasActiveReminder ? cfg.border : undefined,
              color: hasActiveReminder ? '#ffffff' : undefined,
            }}
          >
            {hasActiveReminder ? <IconBellRinging size={17} /> : <IconBell size={17} />}
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p="md">
        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Group gap={6}>
              <IconClock size={16} color="var(--mantine-color-blue-6)" />
              <Text fw={700} size="sm">
                노트 알람 및 리마인더
              </Text>
            </Group>
            {hasActiveReminder && (
              <Badge size="xs" color="blue" variant="light">
                설정됨
              </Badge>
            )}
          </Group>

          {hasActiveReminder && (
            <Text size="xs" c="dimmed">
              예약: {reminderDateText}
            </Text>
          )}

          {/* 빠른 설정 칩 */}
          <Text size="xs" fw={600} mt={4}>
            빠른 시간 선택
          </Text>
          <Group gap={5}>
            <Button size="compact-xs" variant="light" color="gray" onClick={() => handleQuickAdd(10)}>
              +10분
            </Button>
            <Button size="compact-xs" variant="light" color="gray" onClick={() => handleQuickAdd(30)}>
              +30분
            </Button>
            <Button size="compact-xs" variant="light" color="gray" onClick={() => handleQuickAdd(60)}>
              +1시간
            </Button>
            <Button size="compact-xs" variant="light" color="blue" onClick={() => handleQuickTomorrow(9)}>
              내일 09:00
            </Button>
            <Button size="compact-xs" variant="light" color="blue" onClick={() => handleQuickTomorrow(14)}>
              내일 14:00
            </Button>
          </Group>

          {/* 사용자 지정 날짜 및 시간 입력 */}
          <TextInput
            label="알람 일시 (직접 설정)"
            type="datetime-local"
            size="xs"
            value={datetimeStr}
            onChange={(e) => setDatetimeStr(e.currentTarget.value)}
            mt={4}
          />

          {/* 반복 주기 선택 */}
          <Select
            label="반복 주기"
            size="xs"
            leftSection={<IconRepeat size={14} />}
            data={REPEAT_OPTIONS}
            value={repeat}
            onChange={(val) => setRepeat((val as NoteReminderRepeat) || 'none')}
          />

          {/* 저장 및 해제 버튼 */}
          <Group justify="space-between" mt="sm">
            {hasActiveReminder ? (
              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={handleRemove}
              >
                알람 해제
              </Button>
            ) : (
              <span />
            )}
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => setOpened(false)}>
                취소
              </Button>
              <Button size="xs" variant="filled" color="blue" onClick={handleSave}>
                알람 저장
              </Button>
            </Group>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
