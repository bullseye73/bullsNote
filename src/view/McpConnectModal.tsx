// VIEW: AI 클라이언트(Claude Desktop, Gemini CLI) MCP 연결 설정 모달
import { Alert, Badge, Button, Code, Collapse, Group, Modal, Paper, Stack, Text } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconCopy, IconInfoCircle, IconPlugConnected } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { McpClientStatus, McpStatus } from '../electron.d';

interface McpConnectModalProps {
  opened: boolean;
  onClose: () => void;
}

function clientBadge(c: McpClientStatus) {
  if (!c.installed) return <Badge color="gray" variant="light">설치되지 않음</Badge>;
  if (c.connected && c.upToDate) return <Badge color="green" variant="light">연결됨</Badge>;
  if (c.connected) return <Badge color="yellow" variant="light">경로 갱신 필요</Badge>;
  return <Badge color="gray" variant="light">연결 안 됨</Badge>;
}

export function McpConnectModal({ opened, onClose }: McpConnectModalProps) {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = useCallback(async (id: string | null, action: () => Promise<McpStatus> | undefined) => {
    setBusyId(id);
    setError('');
    try {
      const next = await action();
      if (next) setStatus(next);
      if (id) setChanged(true);
    } catch (e) {
      // Electron 은 IPC 오류 메시지 앞에 "Error invoking remote method ..." 접두사를 붙인다
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setBusyId(null);
    }
  }, []);

  useEffect(() => {
    if (!opened) return;
    setChanged(false);
    setCopied(false);
    void run(null, () => window.bullsNote?.mcp?.status());
  }, [opened, run]);

  const manualJson = status ? JSON.stringify({ mcpServers: { bullsnote: status.entry } }, null, 2) : '';

  const copyManual = async () => {
    try {
      await navigator.clipboard.writeText(manualJson);
      setCopied(true);
    } catch {
      setError('클립보드에 복사하지 못했습니다. 아래 내용을 직접 선택해 복사해주세요.');
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={
        <Group gap="xs">
          <IconPlugConnected size={22} />
          <Text fw={700} size="md">
            AI 연결 (MCP)
          </Text>
        </Group>
      }
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          연결하면 Claude나 Gemini와 대화하다가 "이 내용 BullsNote에 저장해줘"라고 말해 노트를 만들 수 있습니다. 노트는 이
          PC의 저장 폴더에 기록되고, 다른 기기와의 동기화는 기존 Google Drive 동기화가 처리합니다.
        </Text>

        {error && (
          <Alert color="red" icon={<IconInfoCircle size={16} />}>
            {error}
          </Alert>
        )}

        {status?.clients.map((c) => (
          <Paper key={c.id} withBorder p="sm" radius="md">
            <Group justify="space-between" wrap="nowrap">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Group gap="xs">
                  <Text fw={600} size="sm">
                    {c.name}
                  </Text>
                  {clientBadge(c)}
                </Group>
                <Text size="11px" c="dimmed" truncate title={c.configPath}>
                  {c.error || c.configPath}
                </Text>
              </Stack>
              <Group gap="xs" wrap="nowrap">
                {c.connected && (
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    loading={busyId === c.id}
                    onClick={() => void run(c.id, () => window.bullsNote?.mcp?.disconnect(c.id))}
                  >
                    연결 해제
                  </Button>
                )}
                {(!c.connected || !c.upToDate) && (
                  <Button
                    size="xs"
                    disabled={!c.installed || !!c.error}
                    loading={busyId === c.id}
                    onClick={() => void run(c.id, () => window.bullsNote?.mcp?.connect(c.id))}
                  >
                    {c.connected ? '경로 갱신' : '연결'}
                  </Button>
                )}
              </Group>
            </Group>
          </Paper>
        ))}

        {changed && (
          <Alert color="blue" icon={<IconInfoCircle size={16} />}>
            변경 사항은 해당 AI 앱을 완전히 종료한 뒤 다시 실행해야 적용됩니다.
          </Alert>
        )}

        <Button
          variant="subtle"
          color="gray"
          size="xs"
          onClick={() => setManualOpen((v) => !v)}
          rightSection={manualOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          style={{ alignSelf: 'flex-start' }}
        >
          다른 AI 클라이언트에 직접 등록
        </Button>
        <Collapse in={manualOpen}>
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              Claude Code 등 MCP를 지원하는 다른 클라이언트는 설정 파일의 mcpServers에 아래 항목을 추가하면 됩니다.
            </Text>
            <Code block style={{ maxHeight: 220, overflow: 'auto', fontSize: 11 }}>
              {manualJson}
            </Code>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconCopy size={12} />}
              onClick={() => void copyManual()}
              style={{ alignSelf: 'flex-start' }}
            >
              {copied ? '복사됨' : '설정 복사'}
            </Button>
          </Stack>
        </Collapse>
      </Stack>
    </Modal>
  );
}
