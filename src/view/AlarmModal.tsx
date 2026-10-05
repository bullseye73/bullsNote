// VIEW: 알람 발화 시 표시되는 팝업 모달 다이얼로그 (인앱 알람)
import { Badge, Button, Card, Group, Modal, Stack, Text } from '@mantine/core';
import { IconBellRinging, IconClock, IconExternalLink, IconRepeat, IconX } from '@tabler/icons-react';
import { useNotes } from '../controller/NotesController';
import { getPastelConfig, NoteReminderRepeat } from '../model/Note';
import { noteBodyText } from '../model/HashtagService';

const REPEAT_LABELS: Record<NoteReminderRepeat, string> = {
  none: '반복 안함',
  daily: '매일 반복',
  weekdays: '평일 반복 (월~금)',
  weekly: '매주 반복',
  monthly: '매월 반복',
};

export function AlarmModal() {
  const { activeAlarmNote, select, dismissReminder, snoozeReminder, closeAlarmModal, projects } =
    useNotes();

  if (!activeAlarmNote) return null;

  const note = activeAlarmNote;
  const cfg = getPastelConfig(note.color);
  const project = projects.find((p) => p.id === (note.projectId || 'default'));
  const reminder = note.reminder;
  const repeatLabel = reminder?.repeat && reminder.repeat !== 'none' ? REPEAT_LABELS[reminder.repeat] : null;

  const handleOpenNote = () => {
    select(note.id);
    dismissReminder(note.id);
  };

  const handleSnooze = () => {
    snoozeReminder(note.id, 5);
  };

  const handleDismiss = () => {
    dismissReminder(note.id);
  };

  return (
    <Modal
      opened={!!activeAlarmNote}
      onClose={closeAlarmModal}
      title={
        <Group gap="xs">
          <IconBellRinging size={20} color="var(--mantine-color-blue-6)" />
          <Text fw={700} size="md">
            노트 알람 알림
          </Text>
        </Group>
      }
      centered
      shadow="xl"
      radius="md"
      overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
    >
      <Stack gap="md">
        {/* 파스텔 테마 노트 요약 카드 */}
        <Card
          withBorder
          shadow="sm"
          radius="md"
          p="md"
          style={{
            backgroundColor: cfg.bg,
            borderColor: cfg.border,
            borderLeft: `6px solid ${cfg.border}`,
          }}
        >
          <Group justify="space-between" mb="xs" wrap="nowrap">
            {project && (
              <Badge
                size="xs"
                variant="filled"
                style={{ backgroundColor: cfg.badgeBg, color: cfg.badgeColor, border: 'none' }}
              >
                {project.icon} {project.name}
              </Badge>
            )}
            {repeatLabel && (
              <Badge
                size="xs"
                variant="filled"
                leftSection={<IconRepeat size={11} />}
                style={{ backgroundColor: cfg.badgeBg, color: cfg.badgeColor, border: 'none' }}
              >
                {repeatLabel}
              </Badge>
            )}
          </Group>

          <Text fw={700} size="lg" style={{ color: cfg.textColor }} mb={4}>
            {note.title || '제목 없음'}
          </Text>

          <Text size="sm" lineClamp={3} style={{ color: cfg.dimmedColor }}>
            {noteBodyText(note.content) || '내용 없음'}
          </Text>

          {note.tags.length > 0 && (
            <Group gap={4} mt="xs">
              {note.tags.map((t) => (
                <Badge
                  key={t}
                  size="xs"
                  style={{
                    backgroundColor: cfg.badgeBg,
                    color: cfg.badgeColor,
                    border: 'none',
                  }}
                >
                  #{t}
                </Badge>
              ))}
            </Group>
          )}
        </Card>

        {/* 안내 문구 */}
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            설정된 알람 시각이 되었습니다.
          </Text>
          <Text size="xs" c="dimmed">
            {new Date(reminder?.targetAt ?? Date.now()).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </Group>

        {/* 액션 버튼 */}
        <Group justify="flex-end" gap="xs">
          <Button
            variant="default"
            size="sm"
            leftSection={<IconClock size={15} />}
            onClick={handleSnooze}
          >
            5분 후 다시 알림
          </Button>
          <Button
            variant="light"
            color="gray"
            size="sm"
            leftSection={<IconX size={15} />}
            onClick={handleDismiss}
          >
            알람 완료
          </Button>
          <Button
            variant="filled"
            color="blue"
            size="sm"
            leftSection={<IconExternalLink size={15} />}
            onClick={handleOpenNote}
          >
            노트 열기
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
