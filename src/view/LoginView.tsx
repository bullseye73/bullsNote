// VIEW: 앱 시작 시 인증 화면 (모바일/데스크톱 통합: Google 원클릭 메인 CTA + 이메일/게스트/고급 아코디언)
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Collapse,
  Container,
  Divider,
  Group,
  Loader,
  Paper,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconBrandGoogle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCloudCheck,
  IconDeviceFloppy,
  IconMail,
  IconMoon,
  IconSettings,
  IconSparkles,
  IconSun,
} from '@tabler/icons-react';
import React, { useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { SupabaseService } from '../model/SupabaseService';
import { APP_VERSION } from '../model/version';
import { SecretInput } from './SecretInput';

export function LoginView() {
  const {
    enterGuestMode,
    supabaseConfigured,
    saveSupabaseConfig,
    loginSupabaseEmail,
    signUpSupabaseEmail,
    resendSupabaseConfirmation,
    loginSupabaseMagicLink,
    loginSupabaseGoogle,
  } = useNotes();
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = computedColorScheme === 'dark';

  // 이메일 로그인/회원가입 섹션
  const [emailAuthOpened, setEmailAuthOpened] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [sbEmail, setSbEmail] = useState('');
  const [sbPassword, setSbPassword] = useState('');
  const [sbName, setSbName] = useState('');
  const [sbLoading, setSbLoading] = useState(false);
  const [sbError, setSbError] = useState<string | null>(null);
  const [sbInfo, setSbInfo] = useState<string | null>(null);
  const [canResendConfirm, setCanResendConfirm] = useState(false);

  // 고급: Supabase 연결 설정 (VITE_SUPABASE_URL / ANON_KEY가 빌드에 내장되지 않은 경우에만 표시)
  const initialSbCfg = SupabaseService.resolveSupabaseConfig();
  const hasBakedEnv = initialSbCfg?.source === 'env';
  const [sbConfigOpened, setSbConfigOpened] = useState(!supabaseConfigured);
  const [sbUrl, setSbUrl] = useState(initialSbCfg?.url || '');
  const [sbAnonKey, setSbAnonKey] = useState(initialSbCfg?.anonKey || '');

  const handleSupabaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sbEmail.trim() || !sbPassword) {
      setSbError('이메일과 비밀번호를 입력해주세요.');
      return;
    }
    setSbLoading(true);
    setSbError(null);
    setSbInfo(null);
    setCanResendConfirm(false);
    try {
      if (authMode === 'signin') {
        const res = await loginSupabaseEmail(sbEmail, sbPassword);
        if (!res.success) {
          setSbError(res.error || '로그인에 실패했습니다.');
          if (res.error?.includes('인증')) {
            setCanResendConfirm(true);
          }
        }
      } else {
        const res = await signUpSupabaseEmail(sbEmail, sbPassword, sbName);
        if (!res.success) {
          setSbError(res.error || '회원가입에 실패했습니다.');
          if (res.alreadyRegistered || res.error?.includes('이미 가입')) {
            setCanResendConfirm(true);
          }
        } else if (res.needsEmailConfirmation) {
          setCanResendConfirm(true);
          setSbInfo(
            '인증 메일을 발송했습니다. 메일함에서 인증 링크를 클릭한 뒤 로그인해주세요. (메일이 안 오면 아래 재발송 또는 Google 로그인을 이용하세요)',
          );
        }
      }
    } finally {
      setSbLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!sbEmail.trim()) {
      setSbError('인증 메일을 받을 이메일 주소를 입력해주세요.');
      return;
    }
    setSbLoading(true);
    setSbError(null);
    setSbInfo(null);
    try {
      const res = await resendSupabaseConfirmation(sbEmail);
      if (!res.success) {
        setSbError(res.error || '인증 메일 재발송에 실패했습니다.');
      } else {
        setSbInfo('가입 인증 메일을 다시 발송했습니다. 스팸함도 확인해주세요.');
      }
    } finally {
      setSbLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!sbEmail.trim()) {
      setSbError('로그인 링크를 받을 이메일 주소를 입력해주세요.');
      return;
    }
    setSbLoading(true);
    setSbError(null);
    setSbInfo(null);
    try {
      const res = await loginSupabaseMagicLink(sbEmail);
      if (!res.success) {
        setSbError(res.error || '매직링크 발송에 실패했습니다.');
      } else {
        setSbInfo('비밀번호 없는 로그인 링크를 이메일로 보냈습니다. 메일함을 확인해주세요.');
      }
    } finally {
      setSbLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!sbEmail.trim()) {
      setSbError('비밀번호 재설정 메일을 받을 이메일 주소를 입력해주세요.');
      return;
    }
    setSbLoading(true);
    setSbError(null);
    setSbInfo(null);
    try {
      const res = await SupabaseService.resetPassword(sbEmail);
      if (!res.success) {
        setSbError(res.error || '비밀번호 재설정 메일 발송에 실패했습니다.');
      } else {
        setSbInfo('비밀번호 재설정 안내 메일을 발송했습니다.');
      }
    } finally {
      setSbLoading(false);
    }
  };

  const handleSupabaseGoogle = async () => {
    if (!supabaseConfigured) {
      setSbConfigOpened(true);
      setSbInfo(null);
      setSbError('먼저 아래 [고급: Supabase 연결 설정]에서 Project URL과 Anon Key를 입력하고 저장해주세요.');
      return;
    }

    setSbLoading(true);
    setSbError(null);
    setSbInfo(null);
    try {
      const res = await loginSupabaseGoogle();
      if (!res.success) {
        setSbError(res.error || 'Google 로그인에 실패했습니다.');
      }
    } finally {
      setSbLoading(false);
    }
  };

  const handleSaveSupabaseConfig = () => {
    if (!sbUrl.trim() || !sbAnonKey.trim()) {
      setSbError('Supabase URL과 Anon Key를 모두 입력해주세요.');
      return;
    }
    saveSupabaseConfig(sbUrl, sbAnonKey);
    setSbError(null);
    setSbInfo('Supabase 연결 설정이 저장되었습니다. 이제 [Google로 계속하기]를 눌러 바로 시작할 수 있습니다.');
    setSbConfigOpened(false);
  };

  return (
    <Box
      style={{
        minHeight: '100dvh',
        width: '100%',
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: isDark ? '#0f172a' : '#f8fafc',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* 상단 타이틀바 영역 (창 드래그 가능) */}
      <Box
        style={{
          height: 40,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        <Group gap="xs" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Text size="xs" fw={700} c="dimmed">
            BullsNote
          </Text>
          <Badge size="xs" variant="outline" color="gray">
            v{APP_VERSION}
          </Badge>
        </Group>

        <Group gap="xs" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Tooltip label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}>
            <ActionIcon
              variant="subtle"
              size="sm"
              color="gray"
              onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
              aria-label="테마 전환"
            >
              {isDark ? <IconSun size={15} /> : <IconMoon size={15} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>

      {/* 중앙 메인 로그인 컨테이너 */}
      <Center style={{ flex: 1, padding: '20px 14px' }}>
        <Container size={440} w="100%" px={0}>
          <Paper
            p={{ base: 20, sm: 28 }}
            radius="lg"
            withBorder
            shadow="md"
            style={{
              backgroundColor: isDark ? '#1e293b' : '#ffffff',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
            }}
          >
            <Stack gap="md">
              {/* 앱 아이콘 및 헤더 */}
              <Stack gap={6} align="center" style={{ textAlign: 'center' }}>
                <ThemeIcon
                  size={56}
                  radius={16}
                  variant="gradient"
                  gradient={{ from: 'blue.6', to: 'cyan.5', deg: 135 }}
                >
                  <IconCloudCheck size={30} color="white" />
                </ThemeIcon>

                <Title order={2} fw={800} mt={4} style={{ letterSpacing: -0.5 }}>
                  BullsNote 시작하기
                </Title>
              </Stack>

              {/* 1. 최상단 메인 CTA: Google로 계속하기 */}
              <Stack gap={8}>
                <Button
                  fullWidth
                  size="lg"
                  radius="md"
                  color="blue"
                  leftSection={
                    sbLoading ? (
                      <Loader size={18} color="white" />
                    ) : (
                      <IconBrandGoogle size={20} />
                    )
                  }
                  loading={sbLoading}
                  onClick={handleSupabaseGoogle}
                  styles={{
                    root: {
                      minHeight: 50,
                      fontSize: 15,
                      fontWeight: 700,
                    },
                  }}
                >
                  Google로 계속하기
                </Button>
                <Text size="xs" c="dimmed" ta="center" style={{ lineHeight: 1.45 }}>
                  별도 회원가입 없이 Google 계정으로 1초 만에 시작하고 모든 기기에서 자동 동기화됩니다.
                </Text>
              </Stack>

              {sbError && (
                <Alert icon={<IconAlertCircle size={16} />} color="red" radius="md" styles={{ message: { fontSize: 12 } }}>
                  {sbError}
                </Alert>
              )}
              {sbInfo && (
                <Alert icon={<IconCheck size={16} />} color="teal" radius="md" styles={{ message: { fontSize: 12 } }}>
                  {sbInfo}
                </Alert>
              )}
              {canResendConfirm && (
                <Stack gap={4}>
                  <Button
                    variant="light"
                    color="blue"
                    size="xs"
                    loading={sbLoading}
                    onClick={handleResendConfirmation}
                  >
                    인증 메일 다시 보내기
                  </Button>
                  <Text size="11px" c="dimmed">
                    Google로 가입한 이메일은 비밀번호가 없어 이메일 로그인이 되지 않습니다.{' '}
                    <strong>Google로 계속하기</strong> 또는 <strong>매직링크로 로그인</strong>을 이용해주세요.
                  </Text>
                </Stack>
              )}

              {/* 2. 이메일로 로그인 / 회원가입 토글 */}
              <Stack gap="xs">
                <Button
                  variant="light"
                  color="gray"
                  size="sm"
                  fullWidth
                  leftSection={<IconMail size={15} />}
                  rightSection={emailAuthOpened ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                  onClick={() => setEmailAuthOpened((v) => !v)}
                >
                  이메일로 로그인 / 회원가입
                </Button>

                <Collapse in={emailAuthOpened}>
                  <Card
                    withBorder
                    radius="md"
                    p="sm"
                    style={{
                      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.35)' : 'rgba(248, 250, 252, 0.8)',
                    }}
                  >
                    <Stack gap="xs">
                      <SegmentedControl
                        fullWidth
                        size="xs"
                        value={authMode}
                        onChange={(val) => {
                          setAuthMode(val as 'signin' | 'signup');
                          setSbError(null);
                          setSbInfo(null);
                        }}
                        data={[
                          { label: '로그인', value: 'signin' },
                          { label: '회원가입', value: 'signup' },
                        ]}
                      />

                      <form onSubmit={handleSupabaseSubmit}>
                        <Stack gap="xs">
                          {authMode === 'signup' && (
                            <TextInput
                              label="이름 (선택)"
                              placeholder="홍길동"
                              value={sbName}
                              onChange={(e) => setSbName(e.currentTarget.value)}
                              size="sm"
                            />
                          )}
                          <TextInput
                            label="이메일"
                            type="email"
                            required
                            placeholder="name@example.com"
                            leftSection={<IconMail size={15} />}
                            value={sbEmail}
                            onChange={(e) => setSbEmail(e.currentTarget.value)}
                            size="sm"
                          />
                          <PasswordInput
                            label="비밀번호"
                            required
                            placeholder="6자 이상 입력"
                            value={sbPassword}
                            onChange={(e) => setSbPassword(e.currentTarget.value)}
                            size="sm"
                          />
                          <Button type="submit" fullWidth size="sm" loading={sbLoading} mt={4}>
                            {authMode === 'signin' ? '이메일로 로그인' : '회원가입'}
                          </Button>
                        </Stack>
                      </form>

                      {authMode === 'signin' && (
                        <Group justify="flex-end">
                          <Button variant="subtle" size="compact-xs" color="gray" onClick={handleResetPassword}>
                            비밀번호를 잊으셨나요?
                          </Button>
                        </Group>
                      )}

                      <Button
                        variant="light"
                        color="teal"
                        size="xs"
                        fullWidth
                        leftSection={<IconSparkles size={14} />}
                        loading={sbLoading}
                        onClick={handleMagicLink}
                      >
                        비밀번호 없이 메일로 로그인 (매직링크)
                      </Button>
                    </Stack>
                  </Card>
                </Collapse>
              </Stack>

              <Divider w="100%" my={0} />

              {/* 3. 게스트(로컬) 모드로 시작하기 */}
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                fullWidth
                leftSection={<IconDeviceFloppy size={15} />}
                onClick={enterGuestMode}
              >
                게스트(로컬) 모드로 시작하기
              </Button>

              {/* 4. 고급: Supabase 연결 설정 (빌드 env가 없을 때만 노출) */}
              {!hasBakedEnv && (
                <Box>
                  <Button
                    variant="subtle"
                    size="xs"
                    color="gray"
                    fullWidth
                    leftSection={<IconSettings size={14} />}
                    rightSection={sbConfigOpened ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                    onClick={() => setSbConfigOpened((v) => !v)}
                  >
                    고급: Supabase 연결 설정
                  </Button>

                  <Collapse in={sbConfigOpened}>
                    <Card
                      withBorder
                      radius="md"
                      p="sm"
                      mt="xs"
                      style={{
                        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.35)' : 'rgba(248, 250, 252, 0.8)',
                      }}
                    >
                      <Stack gap="xs">
                        <TextInput
                          label="Supabase Project URL"
                          placeholder="https://xxxx.supabase.co"
                          value={sbUrl}
                          onChange={(e) => setSbUrl(e.currentTarget.value)}
                          size="xs"
                        />
                        <SecretInput
                          label="Supabase Anon Key"
                          placeholder="eyJ..."
                          value={sbAnonKey}
                          onChange={setSbAnonKey}
                        />
                        <Button size="xs" variant="light" onClick={handleSaveSupabaseConfig}>
                          연결 설정 저장
                        </Button>
                      </Stack>
                    </Card>
                  </Collapse>
                </Box>
              )}
            </Stack>
          </Paper>
        </Container>
      </Center>
    </Box>
  );
}
