// VIEW: 첫 실행 환영 화면 — 로그인 없이 바로 시작하거나, 다른 기기 데이터를 불러오기(기존 로그인 화면)
import { Box, Button, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconArrowLeft, IconNotebook } from '@tabler/icons-react';
import { useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { LoginView } from './LoginView';

export function WelcomeView() {
  const { startLocal } = useNotes();
  const [showImport, setShowImport] = useState(false);

  if (showImport) {
    return (
      <Box style={{ position: 'relative', height: '100dvh' }}>
        <LoginView />
        <Button
          variant="default"
          size="xs"
          leftSection={<IconArrowLeft size={14} />}
          onClick={() => setShowImport(false)}
          style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 12, zIndex: 10 }}
        >
          처음으로
        </Button>
      </Box>
    );
  }

  return (
    <Box
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: 'var(--bn-surface-editor)',
      }}
    >
      <Stack align="center" gap="md" maw={380} w="100%" ta="center">
        <ThemeIcon size={56} radius="xl" variant="light" color="blue">
          <IconNotebook size={30} />
        </ThemeIcon>
        <Text fw={700} fz={24} style={{ letterSpacing: '-0.4px' }}>
          노트와 할일을 한곳에
        </Text>
        <Text c="dimmed" size="sm" style={{ lineHeight: 1.6 }}>
          데이터는 이 기기와 내 Google Drive에만 저장돼요.
          <br />
          설정 없이 바로 쓰고, 동기화는 원할 때 켜면 돼요.
        </Text>
        <Button size="md" fullWidth mt="sm" onClick={startLocal}>
          바로 시작하기
        </Button>
        <Button size="md" fullWidth variant="default" onClick={() => setShowImport(true)}>
          다른 기기에서 쓰던 데이터 불러오기
        </Button>
      </Stack>
    </Box>
  );
}
