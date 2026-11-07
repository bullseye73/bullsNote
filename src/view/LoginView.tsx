// VIEW: 앱 시작 시 구글 로그인 필수 인증 화면 (OAuth Client ID 발급 가이드 및 전면 입력 제공)
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Collapse,
  Container,
  Divider,
  Group,
  List,
  Loader,
  Modal,
  Paper,
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
  IconArrowRight,
  IconBook,
  IconBrandGoogle,
  IconBrandGoogleDrive,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCloudCheck,
  IconDeviceFloppy,
  IconDeviceMobile,
  IconExternalLink,
  IconInfoCircle,
  IconKey,
  IconMoon,
  IconRocket,
  IconShieldCheck,
  IconSparkles,
  IconSun,
} from '@tabler/icons-react';
import React, { useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { GoogleDriveService } from '../model/GoogleDriveService';
import { APP_VERSION } from '../model/version';
import { SecretInput } from './SecretInput';

export function LoginView() {
  const { loginGoogle, importMobileSyncCode, saveGoogleConfig, enterGuestMode } = useNotes();
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = computedColorScheme === 'dark';

  const cfg = GoogleDriveService.getConfig();
  const [clientId, setClientId] = useState(cfg.customClientId || '');
  const [clientSecret, setClientSecret] = useState(cfg.customClientSecret || '');
  const [mobileSyncCode, setMobileSyncCode] = useState('');
  const [guideOpened, setGuideOpened] = useState(false);

  const isElectronRuntime =
    typeof window !== 'undefined' &&
    (Boolean(window.bullsNote) || (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)));
  const hasGoogleAuthIpc = typeof window !== 'undefined' && Boolean(window.bullsNote?.googleAuth);
  const isLegacyElectronProcess = isElectronRuntime && !hasGoogleAuthIpc;
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5190';

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    const trimmedId = clientId.trim();
    if (!trimmedId) {
      setErrorMessage('Google OAuth Client ID를 입력해주세요. [발급 가이드]를 참고하면 1분 만에 무료로 발급받을 수 있습니다.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      saveGoogleConfig({
        customClientId: trimmedId,
        customClientSecret: clientSecret.trim() || undefined,
      });

      const res = await loginGoogle();
      if (!res.success) {
        setErrorMessage(res.error || 'Google 로그인에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: isDark ? '#0f172a' : '#f8fafc',
        userSelect: 'none',
      }}
    >
      {/* 상단 타이틀바 영역 (창 드래그 가능) */}
      <Box
        style={{
          height: 38,
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
      <Center style={{ flex: 1, padding: '24px 16px' }}>
        <Container size={460} w="100%">
          <Paper
            p={32}
            radius="lg"
            withBorder
            shadow="md"
            style={{
              backgroundColor: isDark ? '#1e293b' : '#ffffff',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
            }}
          >
            <Stack gap="lg" align="center">
              {/* 앱 아이콘 및 헤더 */}
              <Stack gap="xs" align="center" style={{ textAlign: 'center' }}>
                <ThemeIcon
                  size={64}
                  radius={18}
                  variant="gradient"
                  gradient={{ from: 'blue.6', to: 'cyan.5', deg: 135 }}
                >
                  <IconBrandGoogleDrive size={36} color="white" />
                </ThemeIcon>

                <Title order={2} fw={800} mt={6} style={{ letterSpacing: -0.5 }}>
                  BullsNote 시작하기
                </Title>
                <Text size="xs" c="dimmed" style={{ maxWidth: 360, lineHeight: 1.5 }}>
                  본인의 Google Drive를 무료(15GB) 개인 데이터베이스로 연동하여 안전하게 노트를 동기화합니다.
                </Text>
              </Stack>

              {/* 기능 핵심 안내 */}
              <Card
                w="100%"
                p="xs"
                radius="md"
                withBorder
                style={{
                  backgroundColor: isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(241, 245, 249, 0.6)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                }}
              >
                <Group gap="xs" wrap="nowrap">
                  <ThemeIcon color="teal" variant="light" size="sm" radius="md">
                    <IconCloudCheck size={14} />
                  </ThemeIcon>
                  <Text size="xs">
                    <strong>Google Drive 클라우드 저장</strong>: 중앙 서버 없이 오직 본인의 드라이브에만 보관
                  </Text>
                </Group>
              </Card>

              {/* Google OAuth Client ID 입력 섹션 */}
              <Box w="100%">
                <Group justify="space-between" mb={4}>
                  <Text size="xs" fw={700}>
                    Google OAuth Client ID
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="blue"
                    leftSection={<IconBook size={13} />}
                    onClick={() => setGuideOpened(true)}
                  >
                    발급 가이드 (1분)
                  </Button>
                </Group>

                <TextInput
                  placeholder="예: 123456789-xxxx.apps.googleusercontent.com"
                  value={clientId}
                  onChange={(e) => setClientId(e.currentTarget.value)}
                  size="sm"
                  leftSection={<IconKey size={15} color="var(--mantine-color-dimmed)" />}
                  styles={{
                    input: {
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 12,
                    },
                  }}
                />

                <Text size="11px" c="dimmed" mt={4}>
                  Google Cloud에서 발급받은 <strong>데스크톱 앱</strong> 클라이언트 ID 및 보안 비밀번호(Secret)
                </Text>

                <Box mt="xs">
                  <SecretInput
                    label="Client Secret (클라이언트 보안 비밀번호)"
                    placeholder="예: GOCSPX-xxxxxxxxxxxx (발급 시 표시된 경우 입력)"
                    value={clientSecret}
                    onChange={setClientSecret}
                  />
                </Box>

                {isLegacyElectronProcess && (
                  <Alert
                    color="orange"
                    variant="filled"
                    icon={<IconAlertCircle size={18} />}
                    radius="md"
                    mt="xs"
                    styles={{ message: { fontSize: 12, lineHeight: 1.6 } }}
                  >
                    <strong>⚠️ 앱이 구버전 프로세스(트레이 상주)로 실행 중입니다!</strong><br />
                    앱의 UI는 최신 버전으로 업데이트되었으나, 백그라운드의 Electron 메인 프로세스가 이전 버전 상태로 남아 있어 Google 데스크톱 인증 모듈(<code>googleAuth</code>)이 연결되지 않았습니다.<br />
                    👉 <strong>해결 방법 (10초):</strong><br />
                    1. 화면 우측 상단 메뉴바(시계 옆 트레이 아이콘)에서 <strong>BullsNote 아이콘을 우클릭 &gt; [완전히 종료]</strong>를 누르거나, 실행 중인 터미널에서 <code>Ctrl + C</code>로 앱을 완전히 끕니다.<br />
                    2. 터미널에서 <code>npm run electron:dev</code> (또는 <code>npm run dev</code>)로 앱을 다시 시작하면 정상적으로 로그인됩니다!
                  </Alert>
                )}

                {!isElectronRuntime && (
                  <Card
                    withBorder
                    radius="md"
                    p="sm"
                    mt="xs"
                    style={{
                      backgroundColor: isDark ? 'rgba(20, 184, 166, 0.08)' : 'rgba(20, 184, 166, 0.06)',
                      borderColor: 'var(--mantine-color-teal-5)',
                    }}
                  >
                    <Stack gap={6}>
                      <Group gap={6}>
                        <IconDeviceMobile size={16} color="var(--mantine-color-teal-6)" />
                        <Text size="xs" fw={700} c="teal">
                          📱 모바일(Pad·Phone) / 웹 원클릭 연동 (권장)
                        </Text>
                      </Group>
                      <Text size="11.5px" c="dimmed" style={{ lineHeight: 1.45 }}>
                        PC용 BullsNote의 <strong>[Google Drive 동기화 설정] &gt; [모바일 연동 코드 복사]</strong>로 복사한 코드(<code>BNM1:...</code>)를 아래에 붙여넣으면 Google Cloud 추가 설정 없이 즉시 연동됩니다.
                      </Text>
                      <Group gap={6} wrap="nowrap">
                        <TextInput
                          placeholder="BNM1:... 연동 코드 붙여넣기"
                          value={mobileSyncCode}
                          onChange={(e) => setMobileSyncCode(e.currentTarget.value)}
                          size="xs"
                          style={{ flex: 1 }}
                        />
                        <Button
                          size="xs"
                          color="teal"
                          loading={isLoading}
                          onClick={async () => {
                            if (!mobileSyncCode.trim()) {
                              setErrorMessage('PC에서 복사한 모바일 연동 코드(BNM1:...)를 입력해주세요.');
                              return;
                            }
                            setIsLoading(true);
                            setErrorMessage(null);
                            const res = await importMobileSyncCode(mobileSyncCode);
                            setIsLoading(false);
                            if (!res.success) {
                              setErrorMessage(res.error || '모바일 연동 코드 적용 실패');
                            }
                          }}
                        >
                          원클릭 연동
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                )}
              </Box>

              {/* 로그인 실패 에러 배너 */}
              {errorMessage && (
                <Alert
                  icon={<IconAlertCircle size={16} />}
                  color="red"
                  title="알림"
                  w="100%"
                  styles={{ message: { fontSize: 12, lineHeight: 1.5 } }}
                >
                  {errorMessage}
                </Alert>
              )}

              {/* 메인 Google 로그인 버튼 */}
              <Stack gap="xs" w="100%">
                <Button
                  fullWidth
                  size="md"
                  radius="md"
                  color="blue"
                  leftSection={
                    isLoading ? (
                      <Loader size={18} color="white" />
                    ) : (
                      <IconBrandGoogle size={20} />
                    )
                  }
                  loading={isLoading}
                  onClick={handleLogin}
                  styles={{
                    root: {
                      height: 48,
                      fontSize: 14.5,
                      fontWeight: 600,
                    },
                  }}
                >
                  {isLoading ? 'Google 로그인 창 열리는 중...' : 'Google 계정으로 로그인'}
                </Button>

                {isLoading && (
                  <Text size="xs" c="dimmed" ta="center">
                    시스템 기본 브라우저(Chrome/Safari)에서 열리는 Google 로그인 화면에서 인증을 완료해주세요.
                  </Text>
                )}
              </Stack>

              <Divider w="100%" label="또는" labelPosition="center" my={0} />

              {/* 오프라인 로컬 둘러보기 버튼 */}
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                fullWidth
                leftSection={<IconDeviceFloppy size={14} />}
                onClick={enterGuestMode}
              >
                로그인 없이 로컬 오프라인 모드로 시작하기
              </Button>

              {/* 하단 프라이버시 약속 */}
              <Text size="xs" c="dimmed" ta="center" style={{ fontSize: 11, lineHeight: 1.4 }}>
                🔒 BullsNote는 제3자 중앙 서버를 두지 않습니다.<br />
                모든 데이터는 사용자 본인의 Google Drive와 로컬에만 저장됩니다.
              </Text>
            </Stack>
          </Paper>
        </Container>
      </Center>

      {/* Google Cloud Console Client ID 발급 가이드 모달 */}
      <Modal
        opened={guideOpened}
        onClose={() => setGuideOpened(false)}
        title={
          <Group gap="xs">
            <IconBrandGoogle size={20} color="#4285F4" />
            <Text fw={700} size="md">
              Google OAuth 클라이언트 ID 발급 방법 (1~2분)
            </Text>
          </Group>
        }
        size="lg"
        radius="md"
      >
        <Stack gap="md">
          <Alert color="blue" icon={<IconInfoCircle size={16} />} radius="md" styles={{ message: { fontSize: 12.5 } }}>
            Google Cloud Console은 구글 계정만 있으면 <strong>완전 무료</strong>로 이용 가능합니다. 생성된 클라이언트 ID는 오직 본인의 BullsNote 앱과 Google Drive 통신에만 안전하게 사용됩니다.
          </Alert>

          <List type="ordered" spacing="sm" size="sm">
            <List.Item>
              <strong>Google Cloud Console 열기</strong>
              <Text size="xs" c="dimmed" mt={2}>
                웹 브라우저에서 Google Cloud 콘솔에 접속하여 본인의 구글 계정으로 로그인합니다.
              </Text>
              <Button
                component="a"
                href="https://console.cloud.google.com"
                target="_blank"
                rel="noreferrer"
                size="compact-xs"
                variant="light"
                color="blue"
                leftSection={<IconExternalLink size={12} />}
                mt={4}
              >
                console.cloud.google.com 바로가기
              </Button>
            </List.Item>

            <List.Item>
              <strong>새 프로젝트 생성</strong>
              <Text size="xs" c="dimmed" mt={2}>
                화면 상단의 프로젝트 드롭다운을 클릭하고 <strong>[새 프로젝트]</strong>를 누른 뒤 프로젝트 이름(예: <code>BullsNote</code>)을 입력하고 생성합니다.
              </Text>
            </List.Item>

            <List.Item>
              <strong>Google Drive API 사용 설정 (중요)</strong>
              <Text size="xs" c="dimmed" mt={2}>
                좌측 상단 햄버거 메뉴(≡) &gt; <strong>[API 및 서비스]</strong> &gt; <strong>[라이브러리]</strong>로 이동하여 <code>Google Drive API</code>를 검색한 후 <strong>[사용(Enable)]</strong> 버튼을 클릭합니다.
              </Text>
            </List.Item>

            <List.Item>
              <strong>OAuth 동의 화면 구성 및 테스트 사용자 등록 (중요!)</strong>
              <Text size="xs" c="dimmed" mt={2}>
                1) 좌측 메뉴 <strong>[OAuth 동의 화면]</strong> 클릭 &gt; User Type: <strong>[외부(External)]</strong> 선택 후 앱 이름(<code>BullsNote</code>)과 본인 이메일을 입력하고 저장합니다.<br />
                2) <strong>[대상(Audience)]</strong> 또는 <strong>[OAuth 동의 화면]</strong> 내 <strong>[테스트 사용자(Test users)]</strong> 항목에서 <strong>[+ ADD USERS]</strong>를 눌러 <strong>본인의 구글 이메일 주소</strong>를 반드시 추가하거나, 상단의 <strong>[앱 게시(Publish App)]</strong> 버튼을 눌러 프로덕션 상태로 전환합니다. (미등록 시 <code>403: access_denied</code> 오류 발생)
              </Text>
            </List.Item>

            <List.Item>
              <strong>OAuth 클라이언트 ID 생성</strong>
              <Text size="xs" c="dimmed" mt={2}>
                좌측 메뉴 <strong>[사용자 인증 정보]</strong> 클릭 &gt; 상단 <strong>[+ 사용자 인증 정보 만들기]</strong> &gt; <strong>[OAuth 클라이언트 ID]</strong>를 선택합니다.
              </Text>
              <Paper p="xs" mt={4} withBorder style={{ backgroundColor: 'var(--mantine-color-default-hover)' }}>
                <Text size="xs" fw={700}>
                  애플리케이션 유형 선택:
                </Text>
                <Text size="11px" c="dimmed" mt={2}>
                  • <strong>데스크톱 앱 (권장)</strong>: PC 앱(Electron, <code>npm run electron:dev</code>)에서 사용 시 선택 (별도 URL 설정 없이 즉시 동작)
                </Text>
                <Text size="11px" c="dimmed" mt={2}>
                  • <strong>웹 애플리케이션</strong>: 브라우저(<code>http://localhost:5190</code>)에서 테스트 시 선택 (승인된 자바스크립트 원본에 <code>http://localhost:5190</code> 추가 필요)
                </Text>
              </Paper>
            </List.Item>

            <List.Item>
              <strong>생성된 클라이언트 ID와 보안 비밀번호(Secret) 복사하여 붙여넣기</strong>
              <Text size="xs" c="dimmed" mt={2}>
                생성 완료 팝업에 나타나는 <strong>클라이언트 ID</strong>(예: <code>123456789-xxx.apps.googleusercontent.com</code>)와 <strong>클라이언트 보안 비밀번호(Client Secret)</strong>(예: <code>GOCSPX-xxx</code>)를 각각 복사하여 BullsNote 화면에 붙여넣고 로그인 버튼을 누르면 끝납니다!
              </Text>
            </List.Item>
          </List>

          <Alert
            color="orange"
            icon={<IconAlertCircle size={16} />}
            title="💡 401 오류 (no registered origin) 발생 시 해결법"
            radius="md"
            styles={{ message: { fontSize: 12, lineHeight: 1.5 } }}
          >
            웹 브라우저(<code>{currentOrigin}</code>)에서 테스트할 때 이 오류가 발생하는 경우:<br />
            1. Google Cloud 콘솔 &gt; <strong>[사용자 인증 정보]</strong>로 이동하여 생성한 웹 클라이언트 ID를 클릭합니다.<br />
            2. <strong>[승인된 자바스크립트 원본]</strong>에 <code>{currentOrigin}</code>과 <code>http://localhost</code>를 추가하고 [저장]합니다.<br />
            <em>(또는 PC 앱 터미널에서 <code>npm run electron:dev</code>로 실행하시면 이 설정 없이도 데스크톱 앱으로 즉시 동작합니다.)</em>
          </Alert>

          <Divider />

          <Group justify="flex-end">
            <Button color="blue" size="sm" onClick={() => setGuideOpened(false)}>
              이해했습니다 (가이드 닫기)
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
