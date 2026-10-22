import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  Group,
  Kbd,
  Loader,
  Modal,
  PasswordInput,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconClipboard,
  IconExternalLink,
  IconHelpCircle,
  IconKey,
  IconNotes,
  IconPlayerPlay,
  IconRefresh,
  IconSettings,
  IconSparkles,
} from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { DEFAULT_GEMINI_MODELS, GeminiConfig, GeminiService } from '../model/GeminiService';

interface GeminiAiModalProps {
  opened: boolean;
  onClose: () => void;
  initialTab?: 'clipboard' | 'prompt' | 'settings';
}

const QUICK_PROMPTS = [
  { label: '💡 아이디어 정리', prompt: '다음 아이디어에 대해 장단점, 실현 방안, 구체적 실행 계획을 마크다운 표와 목록으로 정리해줘:\n\n' },
  { label: '📝 회의/업무 요약', prompt: '다음 회의/업무 내용의 핵심 결정 사항, Action Items(담당자 및 기한), 주요 논의 포인트를 명확히 요약해줘:\n\n' },
  { label: '📚 핵심 요약', prompt: '다음 내용을 누구나 이해하기 쉽게 핵심 개념, 구조적 설명, 요점 정리(3줄 요약)로 깔끔하게 정리해줘:\n\n' },
  { label: '💻 코드 리팩토링', prompt: '다음 코드의 개선 포인트, 보안/성능 최적화 방안, 그리고 리팩토링된 코드를 친절한 설명과 함께 작성해줘:\n\n```\n\n```' },
];

export function GeminiAiModal({ opened, onClose, initialTab = 'clipboard' }: GeminiAiModalProps) {
  const { createNoteFromGemini } = useNotes();

  const [activeTab, setActiveTab] = useState<string | null>(initialTab);

  // 클립보드 탭 상태
  const [clipboardTitle, setClipboardTitle] = useState('');
  const [clipboardContent, setClipboardContent] = useState('');
  const [isReadingClipboard, setIsReadingClipboard] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  // 프롬프트 탭 상태
  const [promptText, setPromptText] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // 설정 탭 상태
  const [config, setConfig] = useState<GeminiConfig>(() => GeminiService.getConfig());
  const [modelsList, setModelsList] = useState(DEFAULT_GEMINI_MODELS);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 모달이 열릴 때 탭 동기화 및 클립보드 자동 확인
  useEffect(() => {
    if (opened) {
      setActiveTab(initialTab);
      const currentConfig = GeminiService.getConfig();
      setConfig(currentConfig);
      setTestResult(null);
      setSaveSuccess(false);
      setClipboardError(null);
      setGenerationError(null);

      // API Key가 이미 있으면 사용 가능한 모델 목록 백그라운드 조회
      if (currentConfig.apiKey) {
        refreshModels(currentConfig.apiKey);
      }

      // 클립보드 탭으로 열렸을 때 클립보드 자동 읽기 시도
      if (initialTab === 'clipboard') {
        loadFromClipboard();
      }
    }
  }, [opened, initialTab]);

  const refreshModels = async (key: string) => {
    if (!key.trim()) return;
    setIsFetchingModels(true);
    try {
      const fetched = await GeminiService.fetchAvailableModels(key);
      if (fetched.length > 0) {
        setModelsList(fetched);
      }
    } finally {
      setIsFetchingModels(false);
    }
  };

  const loadFromClipboard = async () => {
    setIsReadingClipboard(true);
    setClipboardError(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setClipboardError('클립보드에 복사된 텍스트가 없습니다. 브라우저에서 Gemini 답변을 복사한 후 다시 시도해주세요.');
        return;
      }
      const extracted = GeminiService.extractTitleAndContent(text);
      setClipboardTitle(extracted.title);
      setClipboardContent(extracted.markdownBody);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setClipboardError(`클립보드를 읽을 수 없습니다 (${msg}). 아래 입력창에 직접 붙여넣으실 수 있습니다.`);
    } finally {
      setIsReadingClipboard(false);
    }
  };

  // 클립보드로 새 노트 생성
  const handleCreateFromClipboard = async () => {
    if (!clipboardContent.trim()) {
      setClipboardError('노트로 생성할 내용이 비어있습니다.');
      return;
    }
    try {
      await createNoteFromGemini({
        title: clipboardTitle.trim() || undefined,
        markdown: clipboardContent,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setClipboardError(`노트 생성 실패: ${msg}`);
    }
  };

  // 프롬프트 질의 및 노트 생성
  const handleGenerateAndCreate = async () => {
    if (!promptText.trim()) {
      setGenerationError('프롬프트를 입력해주세요.');
      return;
    }
    if (!config.apiKey.trim()) {
      setActiveTab('settings');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const responseMarkdown = await GeminiService.generateContent(promptText);
      await createNoteFromGemini({
        title: customTitle.trim() || undefined,
        markdown: responseMarkdown,
        prompt: promptText,
      });
      setPromptText('');
      setCustomTitle('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setGenerationError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // 설정 저장
  const handleSaveConfig = () => {
    GeminiService.saveConfig(config);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // 연결 테스트
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await GeminiService.testConnection(config.apiKey, config.model);
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      radius="md"
      padding="lg"
      title={
        <Group gap="xs">
          <IconSparkles size={22} style={{ color: '#8b5cf6' }} />
          <div>
            <Text fw={700} size="md">
              Gemini AI 어시스턴트
            </Text>
            <Text size="xs" c="dimmed">
              AI의 답변을 bullsNote의 전용 프로젝트로 바로 정리하고 블록으로 생성합니다
            </Text>
          </div>
        </Group>
      }
    >
      <Tabs value={activeTab} onChange={setActiveTab} variant="pills" radius="md">
        <Tabs.List grow mb="md">
          <Tabs.Tab value="clipboard" leftSection={<IconClipboard size={16} />}>
            클립보드로 생성
          </Tabs.Tab>
          <Tabs.Tab value="prompt" leftSection={<IconSparkles size={16} />}>
            AI 직접 질의
          </Tabs.Tab>
          <Tabs.Tab value="settings" leftSection={<IconSettings size={16} />}>
            Gemini 설정
          </Tabs.Tab>
        </Tabs.List>

        {/* 탭 1: 클립보드로 새 노트 생성 */}
        <Tabs.Panel value="clipboard">
          <Stack gap="md">
            <Alert color="violet" variant="light" icon={<IconClipboard size={18} />}>
              웹 브라우저의 Gemini(또는 ChatGPT 등)에서 답변을 복사한 뒤, 여기서 바로 BullsNote 블록 노트로 생성할 수 있습니다. (API 키 불필요)
            </Alert>

            {clipboardError && (
              <Alert color="red" icon={<IconAlertCircle size={16} />} title="알림" withCloseButton onClose={() => setClipboardError(null)}>
                {clipboardError}
              </Alert>
            )}

            <Group justify="space-between">
              <Text size="sm" fw={600}>
                노트 제목
              </Text>
              <Button
                variant="subtle"
                size="xs"
                color="violet"
                leftSection={<IconRefresh size={14} />}
                onClick={loadFromClipboard}
                loading={isReadingClipboard}
              >
                클립보드 다시 읽기
              </Button>
            </Group>

            <TextInput
              placeholder="노트 제목을 입력하거나 자동 추출된 제목을 사용합니다"
              value={clipboardTitle}
              onChange={(e) => setClipboardTitle(e.currentTarget.value)}
            />

            <div>
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={600}>
                  내용 (Markdown)
                </Text>
                <Text size="xs" c="dimmed">
                  {clipboardContent.length.toLocaleString()} 자
                </Text>
              </Group>
              <Textarea
                rows={10}
                placeholder="여기에 마크다운 내용을 직접 붙여넣거나, '클립보드 다시 읽기'를 눌러주세요"
                value={clipboardContent}
                onChange={(e) => {
                  setClipboardContent(e.currentTarget.value);
                  if (!clipboardTitle) {
                    const extracted = GeminiService.extractTitleAndContent(e.currentTarget.value);
                    setClipboardTitle(extracted.title);
                  }
                }}
                style={{ fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>

            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={onClose}>
                취소
              </Button>
              <Button
                color="violet"
                leftSection={<IconNotes size={16} />}
                onClick={handleCreateFromClipboard}
                disabled={!clipboardContent.trim()}
              >
                Gemini AI 노트로 생성
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        {/* 탭 2: AI 직접 질의 */}
        <Tabs.Panel value="prompt">
          <Stack gap="md">
            {!config.apiKey.trim() && (
              <Alert
                color="yellow"
                icon={<IconKey size={18} />}
                title="API 키 등록 필요"
              >
                직접 질의 기능을 사용하려면 Google Gemini API 키가 필요합니다.{' '}
                <Button
                  variant="subtle"
                  size="compact-xs"
                  color="yellow"
                  onClick={() => setActiveTab('settings')}
                >
                  설정 탭으로 이동하기 →
                </Button>
              </Alert>
            )}

            {generationError && (
              <Alert color="red" icon={<IconAlertCircle size={16} />} title="생성 오류" withCloseButton onClose={() => setGenerationError(null)}>
                {generationError}
              </Alert>
            )}

            <div>
              <Text size="xs" fw={600} c="dimmed" mb="xs">
                빠른 프롬프트 템플릿
              </Text>
              <Group gap="xs">
                {QUICK_PROMPTS.map((qp, idx) => (
                  <Chip
                    key={idx}
                    size="xs"
                    checked={false}
                    onClick={() => {
                      setPromptText((prev) => (prev ? prev + '\n\n' + qp.prompt : qp.prompt));
                    }}
                  >
                    {qp.label}
                  </Chip>
                ))}
              </Group>
            </div>

            <TextInput
              label="노트 제목 (선택사항)"
              placeholder="비워둘 시 Gemini의 첫 번째 문장을 바탕으로 자동 생성됩니다"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.currentTarget.value)}
            />

            <div>
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={600}>
                  질문 또는 요청사항
                </Text>
                <Group gap={4}>
                  <Kbd size="xs">Cmd</Kbd>
                  <Text size="xs" c="dimmed">+</Text>
                  <Kbd size="xs">Enter</Kbd>
                  <Text size="xs" c="dimmed">로 즉시 실행</Text>
                </Group>
              </Group>
              <Textarea
                rows={6}
                placeholder="Gemini에게 질문하거나 요약/정리하고 싶은 주제나 내용을 입력하세요..."
                value={promptText}
                onChange={(e) => setPromptText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    if (!isGenerating && promptText.trim()) {
                      handleGenerateAndCreate();
                    }
                  }
                }}
              />
            </div>

            {isGenerating && (
              <Card p="sm" radius="md" withBorder bg="var(--mantine-color-violet-light)">
                <Group gap="sm">
                  <Loader size="sm" color="violet" />
                  <Text size="sm" fw={500} c="violet">
                    Gemini가 답변을 생성하고 BlockNote 블록으로 변환하는 중입니다...
                  </Text>
                </Group>
              </Card>
            )}

            <Group justify="space-between" mt="xs">
              <Badge variant="light" color="violet" size="sm">
                사용 모델: {config.model || 'gemini-3.8-flash'}
              </Badge>
              <Group gap="xs">
                <Button variant="default" onClick={onClose} disabled={isGenerating}>
                  취소
                </Button>
                <Button
                  color="violet"
                  leftSection={<IconPlayerPlay size={16} />}
                  onClick={handleGenerateAndCreate}
                  loading={isGenerating}
                  disabled={!promptText.trim()}
                >
                  답변 생성 및 노트 작성
                </Button>
              </Group>
            </Group>
          </Stack>
        </Tabs.Panel>

        {/* 탭 3: Gemini 설정 */}
        <Tabs.Panel value="settings">
          <Stack gap="md">
            <Card withBorder radius="md" p="sm" bg="var(--mantine-color-default-hover)">
              <Group justify="space-between">
                <div>
                  <Text size="sm" fw={600}>
                    Google AI Studio API Key
                  </Text>
                  <Text size="xs" c="dimmed">
                    무료로 발급받아 개인 PC에서 안전하게 사용할 수 있습니다. (외부 서버 전송 없이 로컬 브라우저에서 직접 통신)
                  </Text>
                </div>
                <Button
                  component="a"
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  variant="light"
                  size="xs"
                  rightSection={<IconExternalLink size={14} />}
                >
                  API Key 무료 발급
                </Button>
              </Group>
            </Card>

            <PasswordInput
              label="API Key"
              placeholder="AIzaSy..."
              value={config.apiKey}
              onChange={(e) => {
                const newKey = e.currentTarget.value;
                setConfig((prev) => ({ ...prev, apiKey: newKey }));
              }}
            />

            <div>
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={500}>
                  기본 AI 모델
                </Text>
                <Button
                  variant="subtle"
                  size="compact-xs"
                  color="violet"
                  leftSection={<IconRefresh size={12} />}
                  onClick={() => refreshModels(config.apiKey)}
                  loading={isFetchingModels}
                  disabled={!config.apiKey.trim()}
                >
                  지원 모델 목록 갱신
                </Button>
              </Group>
              <Select
                description="Google에서 권장하는 최신 gemini-3.8-flash 또는 원하는 모델을 선택하세요"
                value={config.model}
                searchable
                allowDeselect={false}
                data={modelsList.map((m) => ({ value: m.id, label: m.name }))}
                onChange={(val) => setConfig((prev) => ({ ...prev, model: val || 'gemini-3.8-flash' }))}
              />
            </div>

            <Textarea
              label="시스템 지침 (노트 작성 스타일 가이드)"
              description="Gemini가 노트를 작성할 때 준수할 포맷팅이나 말투 규칙을 지정합니다"
              rows={3}
              value={config.systemInstruction || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, systemInstruction: e.currentTarget.value }))}
            />

            {testResult && (
              <Alert
                color={testResult.ok ? 'green' : 'red'}
                icon={testResult.ok ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
                title={testResult.ok ? '연결 성공' : '연결 실패'}
                withCloseButton
                onClose={() => setTestResult(null)}
              >
                {testResult.message}
              </Alert>
            )}

            {saveSuccess && (
              <Alert color="teal" icon={<IconCheck size={16} />}>
                Gemini 설정이 성공적으로 저장되었습니다.
              </Alert>
            )}

            <Divider />

            <Group justify="space-between">
              <Button
                variant="outline"
                color="violet"
                onClick={handleTestConnection}
                loading={isTesting}
                disabled={!config.apiKey.trim()}
              >
                연결 테스트
              </Button>
              <Button color="violet" onClick={handleSaveConfig}>
                설정 저장
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
