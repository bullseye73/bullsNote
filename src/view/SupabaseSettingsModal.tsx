// VIEW: Supabase 연동 정보 입력 및 동기화 관리 모달
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Divider,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconCloud,
  IconCloudCheck,
  IconCloudOff,
  IconCopy,
  IconDatabase,
  IconExternalLink,
  IconInfoCircle,
  IconPlugConnected,
  IconRefresh,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { SUPABASE_SETUP_SQL, SupabaseConfig, SupabaseService } from '../model/SupabaseService';

interface SupabaseSettingsModalProps {
  opened: boolean;
  onClose: () => void;
}

export function SupabaseSettingsModal({ opened, onClose }: SupabaseSettingsModalProps) {
  const {
    supabaseConnected,
    supabaseConfig,
    isSyncing,
    syncError,
    lastSyncedAt,
    saveSupabaseConfig,
    syncWithSupabase,
    disconnectSupabase,
  } = useNotes();

  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [autoSync, setAutoSync] = useState(true);

  // 테스트 상태
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    tablesExist?: boolean;
  } | null>(null);

  useEffect(() => {
    if (opened) {
      const cfg = supabaseConfig || SupabaseService.getConfig();
      setUrl(cfg.url || '');
      setAnonKey(cfg.anonKey || '');
      setAutoSync(cfg.autoSync);
      setTestResult(null);
    }
  }, [opened, supabaseConfig]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await SupabaseService.testConnection(url.trim(), anonKey.trim());
      if (res.success && res.tablesExist) {
        setTestResult({
          success: true,
          tablesExist: true,
          message: 'Supabase 연결 성공! 테이블이 정상적으로 준비되어 있습니다.',
        });
      } else if (res.success && !res.tablesExist) {
        setTestResult({
          success: false,
          tablesExist: false,
          message: res.error || 'Supabase 연결에는 성공했으나 필수 테이블이 없습니다. 하단 SQL 가이드를 참고하세요.',
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Supabase 연결에 실패했습니다.',
        });
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndSync = async () => {
    const trimmedUrl = url.trim();
    const trimmedKey = anonKey.trim();

    if (!trimmedUrl || !trimmedKey) {
      alert('Supabase URL과 Anon API Key를 모두 입력해주세요.');
      return;
    }

    const newConfig: SupabaseConfig = {
      url: trimmedUrl,
      anonKey: trimmedKey,
      enabled: true,
      autoSync,
      lastSyncedAt: supabaseConfig.lastSyncedAt,
    };

    await saveSupabaseConfig(newConfig);
    // 즉시 동기화 실행
    await syncWithSupabase();
  };

  const handleDisconnect = () => {
    if (confirm('Supabase 연동을 해제하고 로컬 전용 모드로 전환하시겠습니까?\n(로컬에 저장된 데이터는 그대로 유지됩니다.)')) {
      disconnectSupabase();
      onClose();
    }
  };

  const formatLastSync = (ts: number | null) => {
    if (!ts) return '동기화 이력 없음';
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(
      d.getHours(),
    ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconCloud size={20} color="#228be6" />
          <Text fw={700} size="md">
            Supabase 클라우드 동기화 설정
          </Text>
        </Group>
      }
      size="lg"
      centered
    >
      <Tabs defaultValue="settings">
        <Tabs.List mb="md">
          <Tabs.Tab value="settings" leftSection={<IconPlugConnected size={16} />}>
            연동 설정
          </Tabs.Tab>
          <Tabs.Tab value="guide" leftSection={<IconDatabase size={16} />}>
            초기 설정 가이드 & SQL
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="settings">
          <Stack gap="md">
            {/* 현재 연결 상태 알림 카드 */}
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                backgroundColor: supabaseConnected
                  ? 'var(--mantine-color-green-light)'
                  : 'var(--mantine-color-gray-1)',
                border: `1px solid ${
                  supabaseConnected ? 'var(--mantine-color-green-3)' : 'var(--mantine-color-gray-3)'
                }`,
              }}
            >
              <Group justify="space-between">
                <Group gap="xs">
                  {supabaseConnected ? (
                    <IconCloudCheck size={24} color="#2f9e44" />
                  ) : (
                    <IconCloudOff size={24} color="#868e96" />
                  )}
                  <div>
                    <Text size="sm" fw={700} c={supabaseConnected ? 'green' : 'dimmed'}>
                      {supabaseConnected ? 'Supabase 클라우드 연동 활성화' : '로컬 전용 모드 (미연동)'}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {supabaseConnected
                        ? `마지막 동기화: ${formatLastSync(lastSyncedAt)}`
                        : '클라우드에 연동하지 않으면 데이터가 현재 로컬에만 안전하게 보관됩니다.'}
                    </Text>
                  </div>
                </Group>
                <Badge color={supabaseConnected ? 'green' : 'gray'} variant="light">
                  {supabaseConnected ? '연동됨' : '미연동'}
                </Badge>
              </Group>
            </div>

            {syncError && (
              <Alert icon={<IconAlertCircle size={16} />} title="동기화 오류" color="red">
                {syncError}
              </Alert>
            )}

            <TextInput
              label="Supabase Project URL"
              description="Supabase 대시보드 -> Project Settings -> API -> Project URL"
              placeholder="https://your-project-id.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.currentTarget.value)}
              required
            />

            <PasswordInput
              label="Supabase Anon Key (Public API Key)"
              description="Supabase 대시보드 -> Project Settings -> API -> Project API Keys (anon public)"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.currentTarget.value)}
              required
            />

            <Switch
              label="자동 동기화 사용 (노트 생성/수정/삭제 시 백그라운드 자동 전송)"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.currentTarget.checked)}
            />

            {/* 연결 테스트 결과 */}
            {testResult && (
              <Alert
                icon={testResult.success ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
                color={testResult.success ? 'green' : 'red'}
                title={testResult.success ? '연결 성공' : '연결 확인 필요'}
              >
                {testResult.message}
              </Alert>
            )}

            <Group justify="space-between" mt="xs">
              <Button
                variant="light"
                color="blue"
                onClick={handleTestConnection}
                loading={isTesting}
                leftSection={<IconPlugConnected size={16} />}
              >
                연결 테스트
              </Button>

              <Group gap="xs">
                {supabaseConnected && (
                  <>
                    <Button
                      variant="subtle"
                      color="red"
                      onClick={handleDisconnect}
                    >
                      연동 해제 (로컬 모드)
                    </Button>
                    <Button
                      variant="light"
                      color="teal"
                      onClick={() => syncWithSupabase()}
                      loading={isSyncing}
                      leftSection={<IconRefresh size={16} />}
                    >
                      지금 동기화
                    </Button>
                  </>
                )}
                <Button
                  color="blue"
                  onClick={handleSaveAndSync}
                  loading={isSyncing}
                >
                  {supabaseConnected ? '설정 저장 & 동기화' : '연동 및 첫 동기화'}
                </Button>
              </Group>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="guide">
          <Stack gap="sm">
            <Alert icon={<IconInfoCircle size={16} />} color="blue" title="Supabase 연동 순서">
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                <li>
                  <a href="https://supabase.com" target="_blank" rel="noreferrer" style={{ color: '#228be6' }}>
                    Supabase 웹사이트
                  </a>
                  에 로그인하여 새 프로젝트를 무료로 생성합니다.
                </li>
                <li>좌측 메뉴 <strong>SQL Editor</strong>로 이동하여 <strong>New query</strong>를 클릭합니다.</li>
                <li>아래의 SQL 스크립트를 붙여넣고 우측 하단 <strong>Run</strong>을 누릅니다.</li>
                <li>
                  좌측 메뉴 <strong>Project Settings -&gt; API</strong>에서 <strong>Project URL</strong>과{' '}
                  <strong>anon public API Key</strong>를 복사하여 BullsNote 연동 설정 탭에 붙여넣습니다.
                </li>
              </ol>
            </Alert>

            <Group justify="space-between">
              <Text size="sm" fw={600}>
                테이블 생성 SQL 스크립트
              </Text>
              <CopyButton value={SUPABASE_SETUP_SQL} timeout={2000}>
                {({ copied, copy }) => (
                  <Button
                    size="xs"
                    color={copied ? 'teal' : 'gray'}
                    variant="light"
                    onClick={copy}
                    leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  >
                    {copied ? '복사 완료!' : 'SQL 전체 복사'}
                  </Button>
                )}
              </CopyButton>
            </Group>

            <Code block style={{ maxHeight: 220, overflow: 'auto', fontSize: 12 }}>
              {SUPABASE_SETUP_SQL}
            </Code>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
