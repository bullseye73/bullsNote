// VIEW: 노트 알람(리마인더) 설정 팝오버 컴포넌트
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Popover,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconBell,
  IconBellRinging,
  IconCalendarEvent,
  IconClock,
  IconExternalLink,
  IconRepeat,
  IconTrash,
} from '@tabler/icons-react';
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

export function ReminderPopover({ note, disabled }: { note: Note; disabled?: boolean }) {
  const { setReminder, googleConnected, openGoogleSyncModal } = useNotes();
  const [opened, setOpened] = useState(false);
  const cfg = getPastelConfig(note.color);

  const isLocked = Boolean(disabled);

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
  const [syncToCalendar, setSyncToCalendar] = useState<boolean>(
    note.reminder?.syncToCalendar !== false,
  );

  useEffect(() => {
    if (opened) {
      setDatetimeStr(getInitialDatetime());
      setRepeat(note.reminder?.repeat || 'none');
      setSyncToCalendar(note.reminder?.syncToCalendar !== false);
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
      syncToCalendar,
      calendarEventId: syncToCalendar ? (note.reminder?.calendarEventId ?? null) : null,
      calendarHtmlLink: syncToCalendar ? (note.reminder?.calendarHtmlLink ?? null) : null,
      calendarSyncError: null,
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
      width={350}
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
                }${note.reminder?.calendarEventId ? ' · 📅 Google 캘린더 연동됨' : ''}`
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
            <Group gap={4}>
              {note.reminder?.calendarEventId && (
                <Badge size="xs" color="teal" variant="light">
                  📅 캘린더 연동됨
                </Badge>
              )}
              {hasActiveReminder && (
                <Badge size="xs" color="blue" variant="light">
                  설정됨
                </Badge>
              )}
            </Group>
          </Group>

          {hasActiveReminder && (
            <Group justify="space-between" align="center">
              <Text size="xs" c="dimmed">
                예약: {reminderDateText}
              </Text>
              {note.reminder?.calendarHtmlLink && (
                <Anchor
                  href={note.reminder.calendarHtmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="xs"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                >
                  캘린더 보기 <IconExternalLink size={11} />
                </Anchor>
              )}
            </Group>
          )}

          {note.reminder?.calendarSyncError && (
            <Alert
              color="orange"
              variant="light"
              p="xs"
              icon={<IconAlertCircle size={15} />}
              title={<Text size="xs" fw={700}>Google 캘린더 연동 안내</Text>}
            >
              <Stack gap={6}>
                <Text size="xs" style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>
                  {note.reminder.calendarSyncError}
                </Text>
                <Button
                  size="compact-xs"
                  variant="light"
                  color="orange"
                  onClick={() => {
                    setOpened(false);
                    openGoogleSyncModal();
                  }}
                >
                  Google 연동 설정 열기
                </Button>
              </Stack>
            </Alert>
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

          {/* Google 캘린더 동기화 (모바일 푸시 알림) 토글 */}
          <Box
            p="xs"
            mt={2}
            style={{
              borderRadius: 8,
              backgroundColor: 'var(--mantine-color-default-hover)',
              border: '1px solid var(--mantine-color-default-border)',
            }}
          >
            <Group justify="space-between" align="center" wrap="nowrap">
              <Group gap={6} wrap="nowrap">
                <IconCalendarEvent size={16} color="var(--mantine-color-teal-6)" />
                <Box>
                  <Text size="xs" fw={600}>
                    Google 캘린더 동기화 (모바일 알림)
                  </Text>
                  <Text size="11px" c="dimmed">
                    {googleConnected
                      ? '10분 전 + 정각(0분 전) 모바일 푸시 알림'
                      : 'Google 계정 연동 시 모바일 푸시 알림 지원'}
                  </Text>
                </Box>
              </Group>
              {googleConnected ? (
                <Switch
                  size="sm"
                  color="teal"
                  checked={syncToCalendar}
                  onChange={(e) => setSyncToCalendar(e.currentTarget.checked)}
                />
              ) : (
                <Button
                  size="compact-xs"
                  variant="light"
                  color="teal"
                  onClick={() => {
                    setOpened(false);
                    openGoogleSyncModal();
                  }}
                >
                  연동하기
                </Button>
              )}
            </Group>
          </Box>

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
