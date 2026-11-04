// VIEW: Google Drive 연동 및 동기화 설정 모달
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Collapse,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconBrandGoogle,
  IconBrandGoogleDrive,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCloudCheck,
  IconCloudOff,
  IconExternalLink,
  IconInfoCircle,
  IconLogout,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { GoogleDriveConfig, GoogleDriveService } from '../model/GoogleDriveService';
import { SecretInput } from './SecretInput';

interface GoogleSyncModalProps {
  opened: boolean;
  onClose: () => void;
}

const POLLING_INTERVAL_OPTIONS = [
  { value: '15000', label: '15초 (매우 빠름)' },
  { value: '30000', label: '30초 (권장 기본값)' },
  { value: '60000', label: '1분' },
  { value: '120000', label: '2분' },
  { value: '300000', label: '5분' },
  { value: '600000', label: '10분 (절전 모드)' },
  { value: '0', label: '수동 동기화만 (자동 폴링 끔)' },
];

export function GoogleSyncModal({ opened, onClose }: GoogleSyncModalProps) {
  const {
    googleConnected,
    googleConfig,
    isSyncing,
    syncError,
    lastSyncedAt,
    syncWithGoogleDrive,
    loginGoogle,
    logoutGoogle,
    saveGoogleConfig,
  } = useNotes();

  const [autoSync, setAutoSync] = useState(true);
  const [pollingInterval, setPollingInterval] = useState('30000');
  const [customClientId, setCustomClientId] = useState('');
  const [customClientSecret, setCustomClientSecret] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      const cfg = googleConfig || GoogleDriveService.getConfig();
      setAutoSync(cfg.autoSync ?? true);
      setPollingInterval(String(cfg.pollingIntervalMs ?? 30000));
      setCustomClientId(cfg.customClientId || '');
      setCustomClientSecret(cfg.customClientSecret || '');
      setLoginError(null);
      if (googleConnected && !cfg.lastSyncedAt && !isSyncing) {
        void syncWithGoogleDrive(false);
      }
    }
  }, [opened, googleConfig, googleConnected, isSyncing, syncWithGoogleDrive]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      // 커스텀 클라이언트 키가 있으면 먼저 저장
      if (customClientId) {
        saveGoogleConfig({
          customClientId: customClientId.trim(),
          customClientSecret: customClientSecret.trim(),
        });
      }
      const res = await loginGoogle();
      if (!res.success) {
        setLoginError(res.error || 'Google 로그인에 실패했습니다.');
      } else {
        // 로그인 성공 시 즉시 1회 동기화 수행
        void syncWithGoogleDrive();
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    if (confirm('Google Drive 연동을 해제하시겠습니까?\n(로컬에 저장된 노트 데이터는 그대로 안전하게 유지됩니다.)')) {
      logoutGoogle();
    }
  };

  const handleSaveSettings = () => {
    const intervalMs = Number(pollingInterval) || 0;
    saveGoogleConfig({
      autoSync,
      pollingIntervalMs: intervalMs,
      customClientId: customClientId.trim() || undefined,
      customClientSecret: customClientSecret.trim() || undefined,
    });
    onClose();
  };

  // 마지막 동기화 시간 텍스트 포맷
  const lastSyncText = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '기록 없음';

  const user = googleConfig?.user;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconBrandGoogleDrive size={22} color="#0f9d58" />
          <Text fw={700} size="md">
            Google Drive 클라우드 동기화
          </Text>
        </Group>
      }
      size="md"
      radius="md"
      centered
    >
      <Stack gap="md">
        {/* 상단 연결 상태 카드 */}
        <Paper
          p="md"
          radius="md"
          withBorder
          style={{
            backgroundColor: googleConnected
              ? 'rgba(16, 185, 129, 0.05)'
              : 'var(--mantine-color-default-hover)',
            borderColor: googleConnected
              ? 'var(--mantine-color-green-4)'
              : 'var(--mantine-color-default-border)',
          }}
        >
          {googleConnected ? (
            <Stack gap="xs">
              <Group justify="space-between" align="center">
                <Group gap="sm">
                  {user?.picture ? (
                    <Avatar src={user.picture} radius="xl" size="md" />
                  ) : (
                    <Avatar color="blue" radius="xl" size="md">
                      <IconBrandGoogle size={20} />
                    </Avatar>
                  )}
                  <div>
                    <Text size="sm" fw={700}>
                      {user?.name || 'Google 사용자'}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {user?.email || '연동됨'}
                    </Text>
                  </div>
                </Group>
                <Badge color="green" variant="light" size="sm" leftSection={<IconCheck size={12} />}>
                  연동됨
                </Badge>
              </Group>

              <Divider my={4} />

              <Group justify="space-between" align="center">
                <Text size="xs" c="dimmed">
                  최근 동기화: <strong>{lastSyncText}</strong>
                </Text>
                <Group gap="xs">
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="blue"
                    leftSection={
                      isSyncing ? (
                        <Loader size={12} color="blue" />
                      ) : (
                        <IconRefresh size={13} />
                      )
                    }
                    disabled={isSyncing}
                    onClick={() => void syncWithGoogleDrive(false)}
                  >
                    {isSyncing ? '동기화 중...' : '지금 동기화'}
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    leftSection={<IconLogout size={13} />}
                    onClick={handleLogout}
                  >
                    연동 해제
                  </Button>
                </Group>
              </Group>

              {syncError && (
                <Alert
                  icon={<IconAlertCircle size={16} />}
                  color="red"
                  title="Google Drive 동기화 실패"
                  mt={4}
                  styles={{ message: { fontSize: 12, whiteSpace: 'pre-line', wordBreak: 'break-word' } }}
                >
                  <Stack gap="xs">
                    <Text size="xs">{syncError}</Text>
                    {(() => {
                      const urlMatch = syncError.match(/https:\/\/console\.(?:developers|cloud)\.google\.com\/[^\s]+/);
                      const consoleUrl =
                        urlMatch?.[0] ||
                        (syncError.includes('Google Drive API')
                          ? 'https://console.cloud.google.com/apis/library/drive.googleapis.com'
                          : null);
                      if (!consoleUrl) return null;
                      return (
                        <Button
                          component="a"
                          href={consoleUrl}
                          target="_blank"
                          rel="noreferrer"
                          size="xs"
                          color="red"
                          variant="filled"
                          leftSection={<IconExternalLink size={14} />}
                        >
                          Google Cloud 콘솔에서 Google Drive API [사용(Enable)] 켜기
                        </Button>
                      );
                    })()}
                  </Stack>
                </Alert>
              )}
            </Stack>
          ) : (
            <Stack gap="sm" align="center" py="xs">
              <Avatar color="blue" radius="xl" size="lg">
                <IconBrandGoogle size={28} />
              </Avatar>
              <div style={{ textAlign: 'center' }}>
                <Text size="sm" fw={700}>
                  Google 계정으로 간편하게 시작하세요
                </Text>
                <Text size="xs" c="dimmed" mt={4} style={{ maxWidth: 360 }}>
                  별도의 데이터베이스 구축 없이, 구글 로그인만으로 개인 Google Drive(15GB)에 노트와 첨부파일이 안전하게 동기화됩니다.
                </Text>
              </div>

              {loginError && (
                <Alert
                  icon={<IconAlertCircle size={16} />}
                  color="red"
                  title="로그인 실패"
                  w="100%"
                  styles={{ message: { fontSize: 12 } }}
                >
                  {loginError}
                </Alert>
              )}

              <Button
                fullWidth
                size="md"
                variant="filled"
                color="blue"
                leftSection={
                  isLoggingIn ? (
                    <Loader size={16} color="white" />
                  ) : (
                    <IconBrandGoogle size={18} />
                  )
                }
                loading={isLoggingIn}
                onClick={handleLogin}
                mt="xs"
              >
                Google 계정으로 로그인 & 연동
              </Button>
            </Stack>
          )}
        </Paper>

        {/* 동기화 동작 설정 */}
        <Card withBorder p="sm" radius="md">
          <Stack gap="sm">
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
              동기화 환경 설정
            </Text>

            <Group justify="space-between" align="center">
              <div>
                <Text size="sm" fw={600}>
                  실시간 자동 동기화 (Auto-Sync)
                </Text>
                <Text size="xs" c="dimmed">
                  노트 작성 후 자동으로 Google Drive에 변경 사항을 업로드합니다.
                </Text>
              </div>
              <Switch
                checked={autoSync}
                onChange={(e) => setAutoSync(e.currentTarget.checked)}
                color="blue"
              />
            </Group>

            <Divider />

            <Select
              label="원격 변경 감지 폴링 주기"
              description="다른 기기에서 수정한 내용을 확인하는 주기입니다. 백그라운드에서 트래픽을 거의 발생시키지 않는 초경량 체크로 동작합니다."
              data={POLLING_INTERVAL_OPTIONS}
              value={pollingInterval}
              onChange={(val) => setPollingInterval(val || '30000')}
              allowDeselect={false}
              size="sm"
            />
          </Stack>
        </Card>

        {/* 고급: 커스텀 Google OAuth 클라이언트 ID 설정 */}
        <Card withBorder p="sm" radius="md">
          <Group
            justify="space-between"
            style={{ cursor: 'pointer' }}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <Group gap="xs">
              <IconSettings size={16} color="gray" />
              <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                고급 설정 (커스텀 Google OAuth 키)
              </Text>
            </Group>
            <ActionIcon variant="subtle" size="xs" color="gray">
              {showAdvanced ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
            </ActionIcon>
          </Group>

          <Collapse in={showAdvanced}>
            <Stack gap="xs" mt="sm">
              <Text size="xs" c="dimmed">
                기본 제공 클라이언트 대신 본인의 Google Cloud Console 프로젝트에서 발급받은 데스크톱 OAuth 2.0 클라이언트 ID를 직접 사용하실 수 있습니다. (미입력 시 BullsNote 기본 클라이언트 사용)
              </Text>

              <TextInput
                label="Google Client ID"
                placeholder="예: xxxxx.apps.googleusercontent.com"
                value={customClientId}
                onChange={(e) => setCustomClientId(e.currentTarget.value)}
                size="xs"
              />

              <SecretInput
                label="Google Client Secret (선택)"
                placeholder="데스크톱 앱인 경우 비워두어도 됩니다"
                value={customClientSecret}
                onChange={setCustomClientSecret}
              />
            </Stack>
          </Collapse>
        </Card>

        {/* 보안 및 프라이버시 안내 */}
        <Alert icon={<IconInfoCircle size={16} />} color="blue" radius="md" styles={{ message: { fontSize: 11.5, lineHeight: 1.5 } }}>
          <strong>데이터 소유권 및 개인정보 보호:</strong> BullsNote는 사용자의 Google Drive 내 전용 <code>BullsNote</code> 폴더만을 이용하며 개인 정보나 다른 드라이브 파일에는 일체 접근하지 않습니다.
        </Alert>

        {/* 모달 하단 버튼 */}
        <Group justify="flex-end" gap="xs" mt="xs">
          <Button variant="default" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button color="blue" size="sm" onClick={handleSaveSettings}>
            설정 저장
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
