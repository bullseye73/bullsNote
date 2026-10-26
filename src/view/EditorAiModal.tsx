// VIEW: 에디터 내 Gemini AI 변환/가공/작성 모달
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
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowBarToDown,
  IconArrowBarToUp,
  IconCheck,
  IconCopy,
  IconPlayerPlay,
  IconReplace,
  IconSparkles,
  IconChecklist,
  IconX,
} from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { AI_ACTIONS_META, AiActionType, GeminiService } from '../model/GeminiService';
import { extractChecklistFromMarkdown } from '../model/TodoService';
import { useNotes } from '../controller/NotesController';
import { Note } from '../model/Note';

export interface EditorAiModalProps {
  opened: boolean;
  onClose: () => void;
  initialAction?: AiActionType;
  currentContentMarkdown: string;
  currentNote?: Note;
  onApplyResult: (resultMarkdown: string, placement: 'top' | 'bottom' | 'replace') => void;
}

export function EditorAiModal({
  opened,
  onClose,
  initialAction = 'summarize',
  currentContentMarkdown,
  currentNote,
  onApplyResult,
}: EditorAiModalProps) {
  const [selectedAction, setSelectedAction] = useState<AiActionType>(initialAction);
  const [customInstruction, setCustomInstruction] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultText, setResultText] = useState('');
  const [copied, setCopied] = useState(false);
  const [todoSuccessMessage, setTodoSuccessMessage] = useState<string | null>(null);

  const { createTodosFromChecklist } = useNotes();

  const handleRegisterAsTodo = (alsoInsertBottom: boolean) => {
    if (!resultText || !currentNote) return;
    const checklist = extractChecklistFromMarkdown(resultText);
    if (checklist.length === 0) {
      setError('추출된 결과에서 체크리스트(- [ ]) 항목을 찾을 수 없습니다.');
      return;
    }
    const { createdCount, duplicateCount } = createTodosFromChecklist(currentNote, checklist);
    let msg = `총 ${createdCount}개의 할일이 '할일관리' 프로젝트(To Do)에 등록되었습니다!`;
    if (duplicateCount > 0) {
      msg += ` (이미 등록된 ${duplicateCount}개 항목 제외)`;
    }
    setTodoSuccessMessage(msg);
    if (alsoInsertBottom) {
      onApplyResult(resultText, 'bottom');
      setTimeout(() => {
        onClose();
      }, 900);
    }
  };

  useEffect(() => {
    if (opened) {
      setSelectedAction(initialAction);
      setError(null);
      setResultText('');
      setCopied(false);
      setCustomInstruction('');
      setTodoSuccessMessage(null);

      // 내용이 있고 자유 요청이 아니면 바로 자동 실행 시작 (편의성 극대화)
      if (currentContentMarkdown.trim() && initialAction !== 'custom') {
        runAi(initialAction);
      }
    }
  }, [opened, initialAction, currentContentMarkdown]);

  const activeMeta = AI_ACTIONS_META.find((m) => m.type === selectedAction) || AI_ACTIONS_META[0];

  const runAi = async (actionToRun = selectedAction) => {
    if (!currentContentMarkdown.trim()) {
      setError('현재 노트의 내용이 비어있어 AI 작업을 실행할 수 없습니다.');
      return;
    }
    const config = GeminiService.getConfig();
    if (!config.apiKey.trim()) {
      setError('Gemini API 키가 등록되지 않았습니다. 메인 화면 상단 "Gemini AI" 메뉴의 설정 탭에서 API 키를 등록해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await GeminiService.transformContent(
        actionToRun,
        currentContentMarkdown,
        selectedAction === 'custom' ? customInstruction : undefined
      );
      setResultText(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleApply = (placement: 'top' | 'bottom' | 'replace') => {
    if (!resultText) return;
    onApplyResult(resultText, placement);
    onClose();
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
              에디터 AI 어시스턴트
            </Text>
            <Text size="xs" c="dimmed">
              현재 작성 중인 노트를 Gemini AI로 요약, 교정, 서식 정리 및 가공합니다
            </Text>
          </div>
        </Group>
      }
    >
      <Stack gap="md">
        {/* 상단: AI 액션 선택 칩 목록 */}
        <div>
          <Text size="xs" fw={600} c="dimmed" mb={6}>
            AI 작업 선택
          </Text>
          <Group gap={6}>
            {AI_ACTIONS_META.map((meta) => {
              const isSelected = selectedAction === meta.type;
              return (
                <Chip
                  key={meta.type}
                  size="xs"
                  checked={isSelected}
                  color="violet"
                  variant={isSelected ? 'filled' : 'outline'}
                  onClick={() => {
                    setSelectedAction(meta.type);
                    if (meta.type !== 'custom') {
                      runAi(meta.type);
                    }
                  }}
                >
                  {meta.icon} {meta.label}
                </Chip>
              );
            })}
          </Group>
        </div>

        {/* 현재 액션 설명 */}
        <Card p="xs" radius="md" withBorder bg="var(--mantine-color-default-hover)">
          <Group justify="space-between">
            <Group gap="xs">
              <Text size="sm" fw={600}>
                {activeMeta.icon} {activeMeta.label}
              </Text>
              <Text size="xs" c="dimmed">
                — {activeMeta.description}
              </Text>
            </Group>
            <Badge size="xs" color="violet" variant="light">
              추천 배치: {activeMeta.defaultPlacement === 'top' ? '상단 삽입' : activeMeta.defaultPlacement === 'bottom' ? '하단 추가' : '본문 교체'}
            </Badge>
          </Group>
        </Card>

        {/* 자유 요청인 경우 지시사항 입력창 */}
        {selectedAction === 'custom' && (
          <div>
            <TextInput
              label="자유 지시사항 입력"
              placeholder="예: 보고서 형식으로 바꿔줘, 질문과 답변 표로 정리해줘..."
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runAi('custom');
                }
              }}
              rightSection={
                <ActionIcon
                  size="sm"
                  color="violet"
                  variant="filled"
                  onClick={() => runAi('custom')}
                  loading={isLoading}
                  disabled={!customInstruction.trim()}
                >
                  <IconPlayerPlay size={14} />
                </ActionIcon>
              }
            />
          </div>
        )}

        {error && (
          <Alert color="red" icon={<IconAlertCircle size={16} />} title="AI 처리 오류" withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* 로딩 표시 */}
        {isLoading && (
          <Card p="md" radius="md" withBorder bg="var(--mantine-color-violet-light)">
            <Group gap="sm" justify="center">
              <Loader size="sm" color="violet" />
              <Text size="sm" fw={600} c="violet">
                Gemini가 노트를 분석하고 {activeMeta.label} 작업을 수행 중입니다...
              </Text>
            </Group>
          </Card>
        )}

        {/* 처리 결과 영역 */}
        {resultText && (
          <div>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={600} c="violet">
                ✨ AI 결과 미리보기
              </Text>
              <Group gap="xs">
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  leftSection={copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                  onClick={handleCopy}
                >
                  {copied ? '복사됨' : '결과 복사'}
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="violet"
                  leftSection={<IconPlayerPlay size={12} />}
                  onClick={() => runAi()}
                  loading={isLoading}
                >
                  다시 생성
                </Button>
              </Group>
            </Group>

            <ScrollArea.Autosize mah={240} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 6, padding: '8px 12px' }}>
              <Text size="xs" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                {resultText}
              </Text>
            </ScrollArea.Autosize>

            {/* 할일(Action Items) 추출 또는 체크리스트 포함 시: 할일 프로젝트 등록 카드 */}
            {(selectedAction === 'action_items' || /\[[ xX]\]/.test(resultText)) && (
              <Card withBorder radius="md" p="sm" bg="var(--mantine-color-blue-light)">
                <Group justify="space-between" wrap="wrap" gap="xs">
                  <div>
                    <Group gap={6}>
                      <IconChecklist size={18} color="var(--mantine-color-blue-filled)" />
                      <Text size="xs" fw={700} c="blue">
                        할일관리 프로젝트 연동
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      추출된 항목들을 '할일관리' 프로젝트의 To Do 그룹에 개별 할일 노트로 등록합니다.
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      color="blue"
                      variant="light"
                      leftSection={<IconChecklist size={14} />}
                      onClick={() => handleRegisterAsTodo(false)}
                    >
                      할일 프로젝트에만 등록
                    </Button>
                    <Button
                      size="xs"
                      color="blue"
                      variant="filled"
                      leftSection={<IconChecklist size={14} />}
                      onClick={() => handleRegisterAsTodo(true)}
                    >
                      할일 등록 + 노트 하단 추가
                    </Button>
                  </Group>
                </Group>
              </Card>
            )}

            {todoSuccessMessage && (
              <Alert color="teal" title="할일 등록 완료" icon={<IconCheck size={16} />}>
                {todoSuccessMessage}
              </Alert>
            )}

            {/* 적용 버튼 바 */}
            <Group justify="space-between" mt="md" wrap="wrap">
              <Text size="xs" c="dimmed">
                에디터 반영 방식 선택:
              </Text>
              <Group gap="xs">
                <Tooltip label="현재 노트의 맨 윗부분에 블록으로 삽입합니다 (요약문 등에 추천)">
                  <Button
                    size="xs"
                    variant={activeMeta.defaultPlacement === 'top' ? 'filled' : 'light'}
                    color="violet"
                    leftSection={<IconArrowBarToUp size={14} />}
                    onClick={() => handleApply('top')}
                  >
                    노트 상단에 삽입
                  </Button>
                </Tooltip>

                <Tooltip label="현재 노트의 맨 뒷부분에 이어서 추가합니다 (할 일, 이어 쓰기 등에 추천)">
                  <Button
                    size="xs"
                    variant={activeMeta.defaultPlacement === 'bottom' ? 'filled' : 'light'}
                    color="blue"
                    leftSection={<IconArrowBarToDown size={14} />}
                    onClick={() => handleApply('bottom')}
                  >
                    노트 하단에 추가
                  </Button>
                </Tooltip>

                <Tooltip label="현재 노트 전체 내용을 AI 결과로 교체합니다 (서식 정리, 맞춤법 교정, 번역 등에 추천)">
                  <Button
                    size="xs"
                    variant={activeMeta.defaultPlacement === 'replace' ? 'filled' : 'outline'}
                    color="teal"
                    leftSection={<IconReplace size={14} />}
                    onClick={() => handleApply('replace')}
                  >
                    본문 전체 교체
                  </Button>
                </Tooltip>
              </Group>
            </Group>
          </div>
        )}

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            닫기
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
