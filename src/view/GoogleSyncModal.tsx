// VIEW: Google Drive 연동 및 동기화 설정 모달
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
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
  IconCopy,
  IconDeviceMobile,
  IconExternalLink,
  IconInfoCircle,
  IconListCheck,
  IconLogout,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { GoogleDriveConfig, GoogleDriveService } from '../model/GoogleDriveService';
import { GoogleTaskList, GoogleTasksService } from '../model/GoogleTasksService';
import { SecretInput } from './SecretInput';
import QRCode from 'qrcode';
import { BUILTIN_OAUTH_ENV, resolveOAuthClient } from '../model/oauthClient';

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
    importMobileSyncCode,
    logoutGoogle,
    saveGoogleConfig,
    syncGoogleTasks,
    isTasksSyncing,
    tasksSyncError,
  } = useNotes();

  const [taskLists, setTaskLists] = useState<GoogleTaskList[]>([]);
  const [taskListsLoading, setTaskListsLoading] = useState(false);
  const [taskListsError, setTaskListsError] = useState<string | null>(null);
  const [tasksResultText, setTasksResultText] = useState<string | null>(null);

  const tasksEnabled = Boolean(googleConfig?.tasksEnabled);
  const selectedTaskListIds = googleConfig?.tasksListIds || [];

  const loadTaskLists = async () => {
    setTaskListsLoading(true);
    setTaskListsError(null);
    const res = await GoogleTasksService.listTaskLists();
    setTaskLists(res.lists);
    setTaskListsError(res.error || null);
    setTaskListsLoading(false);
  };

  // 모달을 열었을 때 Tasks 연동이 켜져 있으면 목록을 불러옴
  useEffect(() => {
    if (opened && googleConnected && tasksEnabled) {
      void loadTaskLists();
    }
    if (!opened) setTasksResultText(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, googleConnected, tasksEnabled]);

  const toggleTaskList = (listId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...selectedTaskListIds, listId]))
      : selectedTaskListIds.filter((id) => id !== listId);
    saveGoogleConfig({ tasksListIds: next });
  };

  const handleTasksSyncNow = async () => {
    setTasksResultText(null);
    const res = await syncGoogleTasks(false);
    if (res && !res.error) {
      setTasksResultText(`가져온 할일 ${res.imported}건 · Google에 반영 ${res.pushed}건`);
    }
  };

  const [autoSync, setAutoSync] = useState(true);
  const [pollingInterval, setPollingInterval] = useState('30000');
  const [customClientId, setCustomClientId] = useState('');
  const [customClientSecret, setCustomClientSecret] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [mobileCodeCopied, setMobileCodeCopied] = useState(false);
  const [exportedMobileCode, setExportedMobileCode] = useState<string | null>(null);
  const [mobileCodeInput, setMobileCodeInput] = useState('');
  const [mobileQr, setMobileQr] = useState<string | null>(null);

  // 휴대폰 연결 코드를 카메라로 찍을 수 있게 QR 이미지로 변환
  useEffect(() => {
    if (!exportedMobileCode) {
      setMobileQr(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(exportedMobileCode, { margin: 1, width: 180, errorCorrectionLevel: 'L' })
      .then((url) => !cancelled && setMobileQr(url))
      .catch(() => !cancelled && setMobileQr(null));
    return () => {
      cancelled = true;
    };
  }, [exportedMobileCode]);

  const copyTextWithFallback = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* HTTP(비보안 컨텍스트) 환경 등에서는 아래 textarea 폴백 사용 */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

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
      // 입력한 클라이언트도, 앱 기본 클라이언트도 없으면 고급 설정으로 안내
      if (resolveOAuthClient({ customClientId }, BUILTIN_OAUTH_ENV).source === 'none') {
        setShowAdvanced(true);
        setLoginError('이 빌드에는 기본 Google 클라이언트가 없어요. 아래 고급 설정에 OAuth 클라이언트 ID를 입력한 뒤 다시 눌러 주세요.');
        return;
      }
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
                    color="teal"
                    leftSection={mobileCodeCopied ? <IconCheck size={13} /> : <IconDeviceMobile size={13} />}
                    onClick={async () => {
                      const code = GoogleDriveService.exportMobileSyncCode();
                      if (!code) {
                        alert('연동 코드를 생성할 수 없습니다. 다시 로그인해주세요.');
                        return;
                      }
                      setExportedMobileCode(code);
                      await copyTextWithFallback(code);
                      setMobileCodeCopied(true);
                      setTimeout(() => setMobileCodeCopied(false), 3000);
                    }}
                  >
                    {mobileCodeCopied ? '연결 코드 복사됨' : '휴대폰 연결'}
                  </Button>
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

              {exportedMobileCode && (
                <Paper p="xs" radius="sm" withBorder style={{ backgroundColor: 'rgba(20, 184, 166, 0.06)' }}>
                  <Stack gap={4}>
                    <Group justify="space-between" align="center">
                      <Text size="11px" fw={700} c="teal">
                        휴대폰 카메라로 QR을 찍어 코드를 복사한 뒤, 휴대폰 BullsNote의 연결 코드 입력란에 붙여넣으세요
                      </Text>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="teal"
                        leftSection={<IconCopy size={12} />}
                        onClick={async () => {
                          await copyTextWithFallback(exportedMobileCode);
                          setMobileCodeCopied(true);
                          setTimeout(() => setMobileCodeCopied(false), 3000);
                        }}
                      >
                        다시 복사
                      </Button>
                    </Group>
                    {mobileQr && (
                      <img
                        src={mobileQr}
                        alt="휴대폰 연결 QR 코드"
                        width={180}
                        height={180}
                        style={{ alignSelf: 'center', borderRadius: 8, background: '#fff' }}
                      />
                    )}
                    <TextInput
                      value={exportedMobileCode}
                      readOnly
                      size="xs"
                      onFocus={(e) => e.currentTarget.select()}
                      onClick={(e) => e.currentTarget.select()}
                      styles={{
                        input: {
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: 11,
                        },
                      }}
                    />
                  </Stack>
                </Paper>
              )}

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
                  Google Drive로 백업하고 기기 간 맞추기
                </Text>
                <Stack gap={2} mt={8} align="flex-start" style={{ maxWidth: 360, marginInline: 'auto' }}>
                  <Text size="xs" c="dimmed">✓ 내 Drive의 BullsNote 폴더에만 저장돼요</Text>
                  <Text size="xs" c="dimmed">✓ 휴대폰 알림은 Google 캘린더로 받아요</Text>
                  <Text size="xs" c="dimmed">✓ 언제든 끌 수 있고, 꺼도 이 기기 데이터는 그대로예요</Text>
                </Stack>
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
                Google로 계속
              </Button>

              <Divider w="100%" label="또는 PC에서 복사한 모바일 연동 코드 입력" labelPosition="center" my={4} />

              <Group gap="xs" w="100%" wrap="nowrap">
                <TextInput
                  placeholder="BNM1:... 연동 코드 붙여넣기"
                  value={mobileCodeInput}
                  onChange={(e) => setMobileCodeInput(e.currentTarget.value)}
                  size="xs"
                  style={{ flex: 1 }}
                />
                <Button
                  size="xs"
                  variant="light"
                  color="teal"
                  loading={isLoggingIn}
                  onClick={async () => {
                    if (!mobileCodeInput.trim()) return;
                    setIsLoggingIn(true);
                    setLoginError(null);
                    const res = await importMobileSyncCode(mobileCodeInput);
                    setIsLoggingIn(false);
                    if (!res.success) {
                      setLoginError(res.error || '연동 코드 적용에 실패했습니다.');
                    } else {
                      setMobileCodeInput('');
                    }
                  }}
                >
                  즉시 연동
                </Button>
              </Group>
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

        {/* Google Tasks(할 일 목록) 연동 */}
        {googleConnected && (
          <Card withBorder p="sm" radius="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <IconListCheck size={18} color="#1a73e8" />
                  <div>
                    <Text size="sm" fw={600}>
                      Google Tasks 연동
                    </Text>
                    <Text size="xs" c="dimmed">
                      선택한 Google 할 일 목록을 할일관리로 가져오고, 완료·제목·기한·삭제를 양쪽에 반영합니다.
                    </Text>
                  </div>
                </Group>
                <Switch
                  checked={tasksEnabled}
                  onChange={(e) => saveGoogleConfig({ tasksEnabled: e.currentTarget.checked })}
                  color="blue"
                />
              </Group>

              {tasksEnabled && (
                <>
                  <Divider />
                  <Group justify="space-between" align="center">
                    <Text size="xs" fw={700} c="dimmed">
                      가져올 목록
                    </Text>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      leftSection={<IconRefresh size={12} />}
                      loading={taskListsLoading}
                      onClick={() => void loadTaskLists()}
                    >
                      목록 새로고침
                    </Button>
                  </Group>

                  {taskListsLoading && taskLists.length === 0 ? (
                    <Group gap="xs">
                      <Loader size="xs" />
                      <Text size="xs" c="dimmed">
                        목록을 불러오는 중...
                      </Text>
                    </Group>
                  ) : (
                    <Stack gap={6}>
                      {taskLists.map((list) => (
                        <Checkbox
                          key={list.id}
                          size="sm"
                          label={list.title}
                          checked={selectedTaskListIds.includes(list.id)}
                          onChange={(e) => toggleTaskList(list.id, e.currentTarget.checked)}
                        />
                      ))}
                      {!taskListsError && taskLists.length === 0 && (
                        <Text size="xs" c="dimmed">
                          Google Tasks에 목록이 없습니다.
                        </Text>
                      )}
                    </Stack>
                  )}

                  {(taskListsError || tasksSyncError) && (
                    <Alert color="red" variant="light" p="xs" icon={<IconAlertCircle size={16} />}>
                      <Text size="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {taskListsError || tasksSyncError}
                      </Text>
                    </Alert>
                  )}

                  <Group justify="space-between" align="center">
                    <Text size="xs" c={tasksResultText ? 'teal' : 'dimmed'}>
                      {tasksResultText ||
                        (selectedTaskListIds.length === 0
                          ? '가져올 목록을 하나 이상 선택하세요.'
                          : '완료된 할일은 가져오지 않습니다.')}
                    </Text>
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconRefresh size={14} />}
                      loading={isTasksSyncing}
                      disabled={selectedTaskListIds.length === 0}
                      onClick={() => void handleTasksSyncNow()}
                    >
                      지금 가져오기
                    </Button>
                  </Group>
                </>
              )}
            </Stack>
          </Card>
        )}

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
                고급: 내 OAuth 클라이언트 사용
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
