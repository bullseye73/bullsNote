// VIEW: 오늘 화면의 "오늘 브리핑" — 누를 때만 AI가 할 일·일정·오늘 노트를 3~4줄로 요약해 오늘 노트의 "브리핑" 섹션에 저장
import { Alert, Box, Button, Group, Text, Tooltip, ActionIcon } from '@mantine/core';
import { IconRefresh, IconSparkles } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { findDailyNote, readDailyBriefing } from '../model/DailyNoteService';
import { GeminiService } from '../model/GeminiService';
import { buildBriefingPrompt, cleanBriefingText, hasBriefingMaterial, type BriefingInput } from '../model/TodayBriefing';

/** 요청 시점의 자료를 만드는 함수를 받는다 (현재 시각이 들어가므로 누를 때 계산) */
export function TodayBriefingCard({ todayIso, getInput }: { todayIso: string; getInput: () => BriefingInput }) {
  const { openGeminiModal, notes, projects, saveDailyBriefing } = useNotes();
  // 저장된 브리핑 = 오늘 노트의 "브리핑" 섹션 (노트에서 직접 고쳐도 그대로 반영)
  const dailyContent = findDailyNote(notes, projects, todayIso)?.content;
  const lines = useMemo(() => (dailyContent ? readDailyBriefing(dailyContent) : []), [dailyContent]);
  const hasBriefing = lines.length > 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = GeminiService.isConfigured();

  const generate = async () => {
    const input = getInput();
    if (!hasBriefingMaterial(input)) {
      setError('오늘 정리할 할 일·일정·노트가 아직 없어요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const text = cleanBriefingText(await GeminiService.generateContent(buildBriefingPrompt(input)));
      if (!text) throw new Error('AI가 빈 브리핑을 돌려줬어요. 다시 시도해 주세요.');
      saveDailyBriefing(todayIso, text.split('\n'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '브리핑을 만들지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      style={{
        border: '1px solid var(--mantine-color-violet-light)',
        borderRadius: 10,
        padding: '10px 12px',
        background: 'linear-gradient(135deg, var(--mantine-color-violet-light) 0%, transparent 70%)',
      }}
    >
      <Group justify="space-between" wrap="nowrap" mb={hasBriefing || error ? 6 : 0}>
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <IconSparkles size={15} color="var(--mantine-color-violet-6)" />
          <Text size="sm" fw={600}>
            오늘 브리핑
          </Text>
        </Group>
        {!configured ? (
          <Button size="compact-xs" variant="light" color="violet" onClick={() => openGeminiModal('settings')}>
            AI 켜기
          </Button>
        ) : hasBriefing ? (
          <Tooltip label="다시 만들기" openDelay={300}>
            <ActionIcon variant="subtle" color="violet" size="sm" loading={busy} onClick={() => void generate()} aria-label="브리핑 다시 만들기">
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Button size="compact-xs" variant="light" color="violet" loading={busy} onClick={() => void generate()}>
            브리핑 만들기
          </Button>
        )}
      </Group>

      {hasBriefing ? (
        <Box component="ul" m={0} pl={18} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {lines.map((line, i) => (
            <Text component="li" key={i} size="sm" style={{ lineHeight: 1.5 }}>
              {line}
            </Text>
          ))}
        </Box>
      ) : (
        !error && (
          <Text size="xs" c="dimmed" mt={4}>
            {configured
              ? '할 일·일정·오늘 노트를 AI가 3~4줄로 요약해 오늘 노트에 남겨요'
              : 'Gemini API 키를 연결하면 오늘 할 일과 일정을 AI가 요약해 줘요'}
          </Text>
        )
      )}
      {error && (
        <Alert color="red" variant="light" p={6} mt={4}>
          <Text size="xs">{error}</Text>
        </Alert>
      )}
    </Box>
  );
}
