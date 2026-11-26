// VIEW: Supabase 계정 및 클라우드 동기화 모달
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Collapse,
  Divider,
  Group,
  Modal,
  Paper,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconBrandGoogle,
  IconBrandGoogleDrive,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCloudCheck,
  IconCloudOff,
  IconLogout,
  IconMail,
  IconRefresh,
  IconSettings,
  IconSparkles,
  IconUser,
} from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { SupabaseService } from '../model/SupabaseService';
import { SecretInput } from './SecretInput';

interface SupabaseAccountModalProps {
  opened: boolean;
  onClose: () => void;
}

export function SupabaseAccountModal({ opened, onClose }: SupabaseAccountModalProps) {
  const {
    primarySyncEngine,
    supabaseUser,
    supabaseConfigured,
    isSupabaseSyncing,
    supabaseSyncError,
    lastSupabaseSyncedAt,
    saveSupabaseConfig,
    loginSupabaseEmail,
    signUpSupabaseEmail,
    resendSupabaseConfirmation,
    loginSupabaseMagicLink,
    loginSupabaseGoogle,
    logoutSupabase,
    syncSupabaseNow,
    openGoogleSyncModal,
  } = useNotes();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [canResendConfirm, setCanResendConfirm] = useState(false);

  const currentCfg = SupabaseService.resolveSupabaseConfig();
  const [configOpened, setConfigOpened] = useState(!supabaseConfigured);
  const [supabaseUrl, setSupabaseUrl] = useState(currentCfg?.url || '');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(currentCfg?.anonKey || '');

  useEffect(() => {
    if (opened) {
      const cfg = SupabaseService.resolveSupabaseConfig();
      setSupabaseUrl(cfg?.url || '');
      setSupabaseAnonKey(cfg?.anonKey || '');
      setConfigOpened(!cfg);
      setErrorMsg(null);
      setInfoMsg(null);
    }
  }, [opened]);

  const handleSaveConfig = () => {
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
      setErrorMsg('Supabase Project URL과 Anon Key를 모두 입력해주세요.');
      return;
    }
    saveSupabaseConfig(supabaseUrl, supabaseAnonKey);
    setErrorMsg(null);
    setInfoMsg('Supabase 연결 설정이 저장되었습니다.');
    setConfigOpened(false);
  };

  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('이메일과 비밀번호를 입력해주세요.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    setCanResendConfirm(false);
    try {
      if (mode === 'signin') {
        const res = await loginSupabaseEmail(email, password);
        if (!res.success) {
          setErrorMsg(res.error || '로그인에 실패했습니다.');
          if (res.error?.includes('인증')) {
            setCanResendConfirm(true);
          }
        } else {
          onClose();
        }
      } else {
        const res = await signUpSupabaseEmail(email, password, name);
        if (!res.success) {
          setErrorMsg(res.error || '회원가입에 실패했습니다.');
          if (res.alreadyRegistered || res.error?.includes('이미 가입')) {
            setCanResendConfirm(true);
          }
        } else if (res.needsEmailConfirmation) {
          setCanResendConfirm(true);
          setInfoMsg(
            '인증 메일을 발송했습니다. 메일함에서 링크를 클릭한 뒤 로그인해주세요. (메일이 안 오면 아래 재발송 또는 Google 로그인을 이용하세요)',
          );
        } else {
          onClose();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!email.trim()) {
      setErrorMsg('인증 메일을 받을 이메일 주소를 입력해주세요.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const res = await resendSupabaseConfirmation(email);
      if (!res.success) {
        setErrorMsg(res.error || '인증 메일 재발송에 실패했습니다.');
      } else {
        setInfoMsg('가입 인증 메일을 다시 발송했습니다. 스팸함도 확인해주세요.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email.trim()) {
      setErrorMsg('매직링크를 받을 이메일 주소를 입력해주세요.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const res = await loginSupabaseMagicLink(email);
      if (!res.success) {
        setErrorMsg(res.error || '매직링크 발송에 실패했습니다.');
      } else {
        setInfoMsg('로그인 링크를 이메일로 보냈습니다. 메일함에서 링크를 클릭하면 자동으로 로그인됩니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const res = await loginSupabaseGoogle();
      if (!res.success) {
        setErrorMsg(res.error || 'Google 로그인에 실패했습니다.');
      } else {
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  const isMobile = useMediaQuery('(max-width: 767px)');
  const primarySyncLabel =
    primarySyncEngine === 'supabase' ? 'Supabase 클라우드 동기화' : '로컬 모드 (동기화 꺼짐)';
  const primarySyncColor = primarySyncEngine === 'supabase' ? 'blue' : 'gray';

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen={isMobile}
      title={
        <Group gap="xs">
          <IconCloudCheck size={20} color="var(--mantine-color-blue-6)" />
          <Text fw={700} size="md">
            BullsNote 계정 · 클라우드 동기화
          </Text>
        </Group>
      }
      size="md"
      radius={isMobile ? 0 : 'md'}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Badge size="sm" variant="light" color={primarySyncColor}>
            {primarySyncLabel}
          </Badge>
        </Group>

        {supabaseUser ? (
          <>
            <Paper p="md" radius="md" withBorder>
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  {supabaseUser.avatarUrl ? (
                    <Avatar src={supabaseUser.avatarUrl} size={42} radius="xl" />
                  ) : (
                    <ThemeIcon size={42} radius="xl" variant="light" color="blue">
                      <IconUser size={22} />
                    </ThemeIcon>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <Group gap={6}>
                      <Text fw={700} size="sm" truncate>
                        {supabaseUser.name || supabaseUser.email || '로그인된 사용자'}
                      </Text>
                      <Badge size="xs" color="teal" variant="light">
                        연결됨
                      </Badge>
                    </Group>
                    {supabaseUser.email && (
                      <Text size="xs" c="dimmed" truncate>
                        {supabaseUser.email}
                      </Text>
                    )}
                    <Text size="11px" c="dimmed" mt={2}>
                      {isSupabaseSyncing
                        ? '클라우드 동기화 진행 중...'
                        : lastSupabaseSyncedAt
                        ? `마지막 동기화: ${new Date(lastSupabaseSyncedAt).toLocaleString()}`
                        : '동기화 대기 중'}
                    </Text>
                  </div>
                </Group>
              </Group>
            </Paper>

            {supabaseSyncError && (
              <Alert color="red" icon={<IconAlertCircle size={16} />} radius="md" styles={{ message: { fontSize: 12 } }}>
                {supabaseSyncError}
              </Alert>
            )}

            <Group grow>
              <Button
                variant="light"
                color="blue"
                leftSection={<IconRefresh size={16} className={isSupabaseSyncing ? 'spin-animation' : undefined} />}
                loading={isSupabaseSyncing}
                onClick={() => void syncSupabaseNow(false)}
              >
                지금 동기화
              </Button>
              <Button
                variant="default"
                color="red"
                leftSection={<IconLogout size={16} />}
                onClick={async () => {
                  await logoutSupabase();
                  onClose();
                }}
              >
                로그아웃
              </Button>
            </Group>
          </>
        ) : (
          <>
            <Alert color="blue" variant="light" icon={<IconCloudOff size={16} />} radius="md" styles={{ message: { fontSize: 12 } }}>
              로그인하면 노트·폴더·할일 상태 설정이 Supabase 클라우드에 안전하게 동기화됩니다.
            </Alert>

            <SegmentedControl
              fullWidth
              value={mode}
              onChange={(val) => {
                setMode(val as 'signin' | 'signup');
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              data={[
                { label: '로그인', value: 'signin' },
                { label: '회원가입', value: 'signup' },
              ]}
            />

            <form onSubmit={handleSubmitEmail}>
              <Stack gap="xs">
                {mode === 'signup' && (
                  <TextInput
                    label="이름 (선택)"
                    placeholder="홍길동"
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    size="sm"
                  />
                )}
                <TextInput
                  label="이메일"
                  type="email"
                  required
                  placeholder="name@example.com"
                  leftSection={<IconMail size={15} />}
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  size="sm"
                />
                <PasswordInput
                  label="비밀번호"
                  required
                  placeholder="6자 이상 입력"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  size="sm"
                />
                <Button type="submit" fullWidth loading={loading} mt={4}>
                  {mode === 'signin' ? '이메일로 로그인' : '회원가입'}
                </Button>
              </Stack>
            </form>

            <Group grow gap="xs">
              <Button
                variant="light"
                color="teal"
                size="xs"
                leftSection={<IconSparkles size={14} />}
                loading={loading}
                onClick={handleMagicLink}
              >
                매직링크로 로그인
              </Button>
              <Button
                variant="default"
                size="xs"
                leftSection={<IconBrandGoogle size={14} />}
                loading={loading}
                onClick={handleGoogleLogin}
              >
                Google로 계속하기
              </Button>
            </Group>

            {errorMsg && (
              <Alert color="red" icon={<IconAlertCircle size={16} />} radius="md" styles={{ message: { fontSize: 12 } }}>
                {errorMsg}
              </Alert>
            )}
            {infoMsg && (
              <Alert color="teal" icon={<IconCheck size={16} />} radius="md" styles={{ message: { fontSize: 12 } }}>
                {infoMsg}
              </Alert>
            )}
            {canResendConfirm && (
              <Stack gap={4}>
                <Button
                  variant="light"
                  color="blue"
                  size="xs"
                  loading={loading}
                  onClick={handleResendConfirmation}
                >
                  인증 메일 다시 보내기
                </Button>
                <Text size="11px" c="dimmed">
                  Google로 가입한 이메일은 비밀번호가 없어 이메일 로그인이 되지 않습니다.{' '}
                  <strong>Google로 계속하기</strong> 또는 <strong>매직링크로 로그인</strong>을 누르시거나, Supabase Authentication → Users에서 기존 계정을 확인해 주세요.
                </Text>
              </Stack>
            )}

            <Divider />

            <Button
              variant="subtle"
              size="xs"
              color="gray"
              leftSection={<IconSettings size={14} />}
              rightSection={configOpened ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              onClick={() => setConfigOpened((v) => !v)}
            >
              Supabase 연결 설정 (URL / Anon Key)
            </Button>

            <Collapse in={configOpened}>
              <Stack gap="xs" p="xs" style={{ border: '1px solid var(--bn-border-subtle)', borderRadius: 8 }}>
                <TextInput
                  label="Supabase Project URL"
                  placeholder="https://xxxx.supabase.co"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.currentTarget.value)}
                  size="xs"
                />
                <SecretInput
                  label="Supabase Anon Key"
                  placeholder="eyJ..."
                  value={supabaseAnonKey}
                  onChange={setSupabaseAnonKey}
                />
                <Button size="xs" variant="light" onClick={handleSaveConfig}>
                  연결 설정 저장
                </Button>
              </Stack>
            </Collapse>
          </>
        )}

        <Divider />

        <Button
          variant="light"
          color="teal"
          size="sm"
          fullWidth
          leftSection={<IconBrandGoogleDrive size={16} />}
          onClick={() => {
            onClose();
            openGoogleSyncModal();
          }}
        >
          Google 캘린더 · 할일 / Drive 수동 백업
        </Button>
      </Stack>
    </Modal>
  );
}
