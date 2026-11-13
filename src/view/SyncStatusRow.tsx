// VIEW: 사이드바 하단 저장·동기화 상태 줄 (누르면 동기화 설정 열기)
import { Group, Text, UnstyledButton } from '@mantine/core';
import { IconCloudCheck, IconDeviceLaptop, IconRefresh } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { formatRelativeTime } from '../model/dateUtils';

export function SyncStatusRow({ onOpen }: { onOpen: () => void }) {
  const { googleConnected, isSyncing, lastSyncedAt } = useNotes();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  let icon = <IconDeviceLaptop size={15} />;
  let label = '이 기기에 저장됨';
  let action: string | null = '동기화';
  if (googleConnected && isSyncing) {
    icon = <IconRefresh size={15} className="spin-animation" />;
    label = '동기화 중';
    action = null;
  } else if (googleConnected) {
    icon = <IconCloudCheck size={15} color="var(--mantine-color-teal-6)" />;
    label = lastSyncedAt ? `동기화됨 · ${formatRelativeTime(lastSyncedAt, now)}` : '동기화 켜짐';
    action = null;
  }

  return (
    <UnstyledButton
      onClick={onOpen}
      aria-label="저장 및 동기화 설정"
      style={{ display: 'block', width: '100%', padding: '8px 10px', borderRadius: 8 }}
      className="bn-sync-status-row"
    >
      <Group gap={8} wrap="nowrap">
        {icon}
        <Text size="xs" c="dimmed" style={{ flex: 1 }} truncate>
          {label}
        </Text>
        {action && (
          <Text size="xs" c="blue" fw={600}>
            {action}
          </Text>
        )}
      </Group>
    </UnstyledButton>
  );
}
