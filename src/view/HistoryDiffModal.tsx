// VIEW: Git 스타일의 히스토리 변경점(Diff) 비교 모달
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconCheck,
  IconGitCommit,
  IconGitCompare,
  IconHistory,
  IconRotate,
  IconX,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Note, NoteSnapshot } from '../model/Note';
import { computeLineDiff } from '../model/diffUtils';

interface HistoryDiffModalProps {
  opened: boolean;
  onClose: () => void;
  currentNote: Note;
  selectedSnapshot: NoteSnapshot | null;
  previousSnapshot: NoteSnapshot | null;
  onRestore: (savedAt: number) => void;
}

export function HistoryDiffModal({
  opened,
  onClose,
  currentNote,
  selectedSnapshot,
  previousSnapshot,
  onRestore,
}: HistoryDiffModalProps) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  // 비교 기준 모드: 'vsCurrent' (현재 버전과 비교) vs 'vsPrevious' (직전 히스토리와 비교)
  const [compareMode, setCompareMode] = useState<'vsCurrent' | 'vsPrevious'>('vsCurrent');

  // 비교할 두 텍스트 및 제목 결정
  const { oldTitle, newTitle, oldContent, newContent, baseLabel, targetLabel } = useMemo(() => {
    if (!selectedSnapshot) {
      return {
        oldTitle: '',
        newTitle: '',
        oldContent: '',
        newContent: '',
        baseLabel: '',
        targetLabel: '',
      };
    }

    if (compareMode === 'vsCurrent') {
      // 선택한 히스토리(과거) vs 현재 노트(현재)
      return {
        oldTitle: selectedSnapshot.title || '제목 없음',
        newTitle: currentNote.title || '제목 없음',
        oldContent: selectedSnapshot.content,
        newContent: currentNote.content,
        baseLabel: `히스토리 (${new Date(selectedSnapshot.savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})`,
        targetLabel: '현재 작성본',
      };
    } else {
      // 직전 히스토리(더 과거) vs 선택한 히스토리(해당 시점)
      const prev = previousSnapshot;
      return {
        oldTitle: prev ? prev.title || '제목 없음' : '(생성됨)',
        newTitle: selectedSnapshot.title || '제목 없음',
        oldContent: prev ? prev.content : '',
        newContent: selectedSnapshot.content,
        baseLabel: prev
          ? `이전 버전 (${new Date(prev.savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})`
          : '최초 작성',
        targetLabel: `선택 버전 (${new Date(selectedSnapshot.savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})`,
      };
    }
  }, [compareMode, currentNote, selectedSnapshot, previousSnapshot]);

  const diffResult = useMemo(() => {
    return computeLineDiff(oldContent, newContent);
  }, [oldContent, newContent]);

  if (!selectedSnapshot) return null;

  const isTitleChanged = oldTitle !== newTitle;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconGitCompare size={20} color="var(--mantine-color-blue-6)" />
          <Text fw={700} size="md">
            히스토리 변경점 비교 (Diff)
          </Text>
          <Badge size="sm" variant="light" color="gray">
            {new Date(selectedSnapshot.savedAt).toLocaleString('ko-KR')}
          </Badge>
        </Group>
      }
      size="xl"
      styles={{
        body: { padding: '12px 16px 20px 16px' },
      }}
    >
      <Stack gap="sm">
        {/* 상단 컨트롤 바: 비교 모드 선택 & 복원 버튼 */}
        <Group justify="space-between" align="center" wrap="wrap">
          <SegmentedControl
            size="xs"
            value={compareMode}
            onChange={(val) => setCompareMode(val as 'vsCurrent' | 'vsPrevious')}
            data={[
              { label: '현재 작성본과 비교', value: 'vsCurrent' },
              {
                label: previousSnapshot ? '직전 히스토리와 비교' : '직전 히스토리 (없음)',
                value: 'vsPrevious',
                disabled: !previousSnapshot,
              },
            ]}
          />

          <Group gap="xs">
            {/* Diff 통계 뱃지 */}
            <Badge color="green" variant="light" size="sm">
              +{diffResult.additions} 줄
            </Badge>
            <Badge color="red" variant="light" size="sm">
              -{diffResult.deletions} 줄
            </Badge>

            <Button
              size="xs"
              color="blue"
              variant="filled"
              leftSection={<IconRotate size={14} />}
              onClick={() => {
                const dateStr = new Date(selectedSnapshot.savedAt).toLocaleString('ko-KR');
                if (confirm(`${dateStr} 버전으로 복원할까요?\n현재 작성 중인 내용은 새로운 히스토리로 보존됩니다.`)) {
                  onRestore(selectedSnapshot.savedAt);
                  onClose();
                }
              }}
            >
              이 버전으로 복원
            </Button>
          </Group>
        </Group>

        {/* 제목 변경 안내 카드 (제목이 바뀐 경우) */}
        {isTitleChanged && (
          <Paper p="xs" withBorder radius="sm" style={{ backgroundColor: isDark ? 'rgba(34, 139, 230, 0.1)' : '#e7f5ff' }}>
            <Group gap="xs">
              <Text size="xs" fw={700} c="dimmed">
                제목 변경:
              </Text>
              <Text size="xs" style={{ textDecoration: 'line-through', color: '#fa5252' }}>
                {oldTitle}
              </Text>
              <Text size="xs" c="dimmed">
                ➔
              </Text>
              <Text size="xs" fw={700} style={{ color: '#40c057' }}>
                {newTitle}
              </Text>
            </Group>
          </Paper>
        )}

        {/* 비교 범례 바 */}
        <Group justify="space-between" px={4}>
          <Text size="xs" c="dimmed">
            기준: <span style={{ fontWeight: 600 }}>{baseLabel}</span> ➔ 대상:{' '}
            <span style={{ fontWeight: 600 }}>{targetLabel}</span>
          </Text>
          <Group gap={8}>
            <Group gap={4}>
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  backgroundColor: isDark ? 'rgba(201, 42, 42, 0.6)' : '#ffa8a8',
                  borderRadius: 2,
                }}
              />
              <Text size="xs" c="dimmed">
                삭제됨 (-)
              </Text>
            </Group>
            <Group gap={4}>
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  backgroundColor: isDark ? 'rgba(43, 138, 62, 0.6)' : '#8ce99a',
                  borderRadius: 2,
                }}
              />
              <Text size="xs" c="dimmed">
                추가됨 (+)
              </Text>
            </Group>
          </Group>
        </Group>

        {/* Git Unified Diff 메인 뷰어 */}
        <Paper
          withBorder
          radius="sm"
          style={{
            backgroundColor: isDark ? '#1a1b1e' : '#f8f9fa',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <ScrollArea.Autosize mah={450} type="auto">
            {!diffResult.hasChanges ? (
              <Stack align="center" justify="center" py="xl" gap="xs">
                <IconCheck size={28} color="var(--mantine-color-green-6)" />
                <Text size="sm" c="dimmed">
                  두 버전 사이에 본문 내용 차이가 없습니다. (완전 일치)
                </Text>
              </Stack>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', userSelect: 'text' }}>
                <tbody>
                  {diffResult.lines.map((line, idx) => {
                    let bg = 'transparent';
                    let textCol = isDark ? '#c1c2c5' : '#212529';
                    let prefix = ' ';
                    let signCol = 'transparent';

                    if (line.type === 'added') {
                      bg = isDark ? 'rgba(43, 138, 62, 0.22)' : '#e6fcf5';
                      textCol = isDark ? '#69db7c' : '#2b8a3e';
                      signCol = textCol;
                      prefix = '+';
                    } else if (line.type === 'removed') {
                      bg = isDark ? 'rgba(201, 42, 42, 0.22)' : '#fff5f5';
                      textCol = isDark ? '#ff8787' : '#c92a2a';
                      signCol = textCol;
                      prefix = '-';
                    }

                    return (
                      <tr
                        key={idx}
                        style={{
                          backgroundColor: bg,
                          borderBottom: isDark ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(0,0,0,0.03)',
                        }}
                      >
                        {/* 이전 라인 번호 */}
                        <td
                          style={{
                            width: 36,
                            textAlign: 'right',
                            padding: '1px 6px',
                            color: isDark ? '#5c5f66' : '#adb5bd',
                            userSelect: 'none',
                            fontSize: 11,
                          }}
                        >
                          {line.oldLineNumber ?? ''}
                        </td>
                        {/* 새 라인 번호 */}
                        <td
                          style={{
                            width: 36,
                            textAlign: 'right',
                            padding: '1px 6px',
                            color: isDark ? '#5c5f66' : '#adb5bd',
                            userSelect: 'none',
                            fontSize: 11,
                            borderRight: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #dee2e6',
                          }}
                        >
                          {line.newLineNumber ?? ''}
                        </td>
                        {/* +/- 기호 */}
                        <td
                          style={{
                            width: 20,
                            textAlign: 'center',
                            fontWeight: 700,
                            color: signCol,
                            userSelect: 'none',
                          }}
                        >
                          {prefix}
                        </td>
                        {/* 본문 텍스트 */}
                        <td
                          style={{
                            padding: '1px 8px',
                            color: textCol,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {line.text || ' '}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ScrollArea.Autosize>
        </Paper>
      </Stack>
    </Modal>
  );
}
