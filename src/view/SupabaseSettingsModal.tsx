// VIEW: Supabase 연동 정보 입력 및 동기화 관리 모달 (SecretInput 마스킹·호버 노출·원클릭 복사 지원)
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
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
  IconEye,
  IconEyeOff,
  IconInfoCircle,
  IconPlugConnected,
  IconRefresh,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { SUPABASE_SETUP_SQL, SupabaseConfig, SupabaseService } from '../model/SupabaseService';

export function SecretInput({
  label,
  description,
  placeholder,
  value,
  onChange,
  required,
}: {
  label: string;
  description?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [pinnedReveal, setPinnedReveal] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const visible = pinnedReveal || hovered || focused || !value;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <TextInput
        label={label}
        description={description}
        placeholder={placeholder}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required={required}
        rightSectionWidth={64}
        rightSection={
          <Group gap={2} wrap="nowrap">
            <Tooltip label={pinnedReveal ? '항상 숨기기' : '항상 표시 고정 (마우스 오버 시 자동 표시)'}>
              <ActionIcon
                size="sm"
                variant="subtle"
                color={pinnedReveal ? 'blue' : 'gray'}
                onClick={() => setPinnedReveal((v) => !v)}
                aria-label="표시 전환"
              >
                {visible ? <IconEyeOff size={14} /> : <IconEye size={14} />}
              </ActionIcon>
            </Tooltip>
            <CopyButton value={value} timeout={1500}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? '복사됨!' : '클립보드에 복사'}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color={copied ? 'teal' : 'gray'}
                    disabled={!value}
                    onClick={copy}
                    aria-label="복사"
                  >
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
        }
        styles={{
          input: {
            fontFamily: visible ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : undefined,
            fontSize: 12.5,
          },
        }}
      />
    </div>
  );
}

interface SupabaseSettingsModalProps {
  opened: boolean;
  onClose: () => void;
}

export function SupabaseSettingsModal({ opened, onClose }: SupabaseSettingsModalProps) {
  const {
    supabaseConnected,
    supabaseConfig,
    realtimeStatus,
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
                  : 'var(--bn-card-hover)',
                border: `1px solid ${
                  supabaseConnected ? 'var(--mantine-color-green-3)' : 'var(--bn-border-subtle)'
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
                <Group gap="xs">
                  {supabaseConnected && (
                    <Badge
                      color={
                        realtimeStatus === 'connected'
                          ? 'teal'
                          : realtimeStatus === 'connecting'
                          ? 'yellow'
                          : 'gray'
                      }
                      variant="light"
                    >
                      {realtimeStatus === 'connected'
                        ? '⚡ 실시간 동기화 활성'
                        : realtimeStatus === 'connecting'
                        ? '실시간 연결 중…'
                        : '실시간 대기 중'}
                    </Badge>
                  )}
                  <Badge color={supabaseConnected ? 'green' : 'gray'} variant="light">
                    {supabaseConnected ? '연동됨' : '미연동'}
                  </Badge>
                </Group>
              </Group>
            </div>

            {syncError && (
              <Alert icon={<IconAlertCircle size={16} />} title="동기화 오류" color="red">
                {syncError}
              </Alert>
            )}

            <SecretInput
              label="Supabase Project URL"
              description="기본 마스킹 보호됨 — 마우스를 올리거나 우측 눈 아이콘을 클릭하면 확인 및 원클릭 복사가 가능합니다."
              placeholder="https://your-project-id.supabase.co"
              value={url}
              onChange={setUrl}
              required
            />

            <SecretInput
              label="Supabase Anon Key (Public API Key)"
              description="Supabase 대시보드 -> Project Settings -> API -> Project API Keys (anon public)"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={anonKey}
              onChange={setAnonKey}
              required
            />

            <Switch
              label="실시간 자동 동기화 사용 (기기 간 실시간 자동 동기화 및 백그라운드 자동 전송)"
              description="다른 기기에서 수정한 내용이 실시간으로 자동 반영되고, 이 기기의 변경 사항도 즉시 클라우드로 전송됩니다."
              checked={autoSync}
              onChange={(e) => setAutoSync(e.currentTarget.checked)}
            />

            <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
              <Text size="xs">
                <strong>동기화 우선순위 안내:</strong> Supabase 연동 시 서버의 프로젝트와 노트가 최우선으로 로컬에 동기화(다운로드)되며, 변경된 노트만 델타(Delta) 방식으로 최소 전송됩니다.
              </Text>
            </Alert>

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
                <li>아래의 SQL 스크립트를 붙여넣고 우측 하단 <strong>Run</strong>을 누릅니다. (테이블 생성 및 다른 기기 간 실시간 동기화 활성화 포함)</li>
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
