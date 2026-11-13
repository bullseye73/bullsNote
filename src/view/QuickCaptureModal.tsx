// VIEW: 빠른 입력 (⌘N) — 한 줄로 할일/노트 만들기, 날짜·시각·#태그 자동 인식, 긴 글은 AI로 정리
import { Alert, Badge, Button, Group, Modal, SegmentedControl, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { IconBell, IconCalendar, IconHash, IconSparkles } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { GeminiService } from '../model/GeminiService';
import { parseQuickCapture, toTaskParams } from '../model/QuickCaptureParser';

/** 이 길이 이상 붙여넣으면 "AI로 정리"를 보여준다 */
const AI_TIDY_MIN_LENGTH = 200;

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}/${d}`;
};

export function QuickCaptureModal() {
  const {
    quickCaptureOpened,
    quickCaptureInitialText,
    closeQuickCapture,
    createPlannerTask,
    createQuickNote,
    openGeminiModal,
  } = useNotes();
  const [text, setText] = useState('');
  const [memo, setMemo] = useState('');
  const [showMemo, setShowMemo] = useState(false);
  const [kindOverride, setKindOverride] = useState<'todo' | 'note' | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!quickCaptureOpened) return;
    // 긴 글(클립보드 등)은 메모 칸으로, 짧은 글은 한 줄 입력으로
    const initial = quickCaptureInitialText ?? '';
    const isLong = initial.length >= AI_TIDY_MIN_LENGTH || initial.includes('\n');
    setText(isLong ? '' : initial);
    setMemo(isLong ? initial : '');
    setShowMemo(isLong);
    setKindOverride(isLong ? 'note' : null);
    setError(null);
    setAiBusy(false);
  }, [quickCaptureOpened, quickCaptureInitialText]);

  const parsed = useMemo(() => parseQuickCapture(text, new Date()), [text]);
  const kind = kindOverride ?? parsed.kind;
  const longText = `${text}\n${memo}`.trim();
  const canTidyWithAi = longText.length >= AI_TIDY_MIN_LENGTH;

  const reset = () => {
    setText('');
    setMemo('');
    setShowMemo(false);
    setKindOverride(null);
  };

  const save = async () => {
    if (!text.trim() && !memo.trim()) return;
    setError(null);
    if (kind === 'todo') {
      const params = toTaskParams(parsed);
      createPlannerTask({ ...params, memo: [memo.trim(), params.memo].filter(Boolean).join(' '), select: false });
    } else {
      const tagLine = parsed.tags.map((t) => `#${t}`).join(' ');
      await createQuickNote({
        title: parsed.title || memo.trim().split('\n')[0].slice(0, 60),
        markdown: [memo.trim(), tagLine].filter(Boolean).join('\n\n'),
      });
    }
    reset();
    closeQuickCapture();
  };

  const tidyWithAi = async () => {
    if (!GeminiService.isConfigured()) {
      openGeminiModal('settings');
      return;
    }
    setAiBusy(true);
    setError(null);
    try {
      const summary = await GeminiService.transformContent('summarize', longText);
      await createQuickNote({ title: parsed.title || 'AI 정리 노트', markdown: `${summary}\n\n---\n\n${longText}` });
      reset();
      closeQuickCapture();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 정리에 실패했어요.');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <Modal
      opened={quickCaptureOpened}
      onClose={closeQuickCapture}
      withCloseButton={false}
      size="lg"
      radius="md"
      yOffset="12vh"
      // 확대 애니메이션 중에는 세그먼트 표시 위치가 잘못 계산되므로 페이드만 사용
      transitionProps={{ transition: 'fade', duration: 120 }}
      onKeyDown={(e) => {
        // Tab: 할일 ↔ 노트 전환 (한 줄 입력에서만)
        if (e.key === 'Tab' && !e.shiftKey && document.activeElement === inputRef.current) {
          e.preventDefault();
          setKindOverride(kind === 'todo' ? 'note' : 'todo');
        }
      }}
    >
      <Stack gap="sm">
        <SegmentedControl
          size="xs"
          w={160}
          value={kind}
          onChange={(v) => setKindOverride(v as 'todo' | 'note')}
          data={[
            { label: '할일', value: 'todo' },
            { label: '노트', value: 'note' },
          ]}
        />
        <TextInput
          ref={inputRef}
          data-autofocus
          size="md"
          variant="unstyled"
          placeholder={kind === 'todo' ? '내일 3시 견적서 회신 #업무' : '떠오른 생각을 적어 보세요'}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (e.shiftKey) setShowMemo(true);
            else void save();
          }}
          styles={{ input: { fontSize: 18 } }}
          aria-label="빠른 입력"
        />
        {(parsed.dueDate || parsed.time || parsed.tags.length > 0) && (
          <Group gap={6}>
            {parsed.dueDate && (
              <Badge variant="light" leftSection={<IconCalendar size={12} />}>
                {shortDate(parsed.dueDate)} 마감
              </Badge>
            )}
            {parsed.time && (
              <Badge variant="light" leftSection={<IconBell size={12} />}>
                {parsed.time} 알림
              </Badge>
            )}
            {parsed.tags.map((t) => (
              <Badge key={t} variant="default" leftSection={<IconHash size={12} />}>
                {t}
              </Badge>
            ))}
          </Group>
        )}
        {showMemo && (
          <Textarea
            autosize
            minRows={3}
            maxRows={12}
            placeholder="메모"
            value={memo}
            onChange={(e) => setMemo(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void save();
              }
            }}
          />
        )}
        {error && (
          <Alert color="red" variant="light" p="xs">
            {error}
          </Alert>
        )}
        <Group justify="space-between" pt={4} style={{ borderTop: '1px solid var(--bn-border-subtle)' }}>
          <Text size="xs" c="dimmed">
            Enter 저장 · ⇧Enter 메모 · Tab 할일↔노트
          </Text>
          <Group gap={6}>
            {canTidyWithAi && (
              <Button
                size="xs"
                variant="light"
                color="violet"
                leftSection={<IconSparkles size={14} />}
                loading={aiBusy}
                onClick={() => void tidyWithAi()}
              >
                {GeminiService.isConfigured() ? 'AI로 정리' : 'AI 켜기'}
              </Button>
            )}
            <Button size="xs" onClick={() => void save()} disabled={!text.trim() && !memo.trim()}>
              저장
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
