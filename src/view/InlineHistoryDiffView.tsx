// VIEW: 에디터 본문 영역에서 인라인으로 바로 보는 Git 스타일 히스토리 Diff 뷰어
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
  useComputedColorScheme,
} from '@mantine/core';
import {
  IconCheck,
  IconGitCompare,
  IconRotate,
  IconX,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Note, NoteSnapshot } from '../model/Note';
import { computeLineDiff } from '../model/diffUtils';

interface InlineHistoryDiffViewProps {
  currentNote: Note;
  selectedSnapshot: NoteSnapshot;
  previousSnapshot: NoteSnapshot | null;
  onRestore: (savedAt: number) => void;
  onClose: () => void;
}

export function InlineHistoryDiffView({
  currentNote,
  selectedSnapshot,
  previousSnapshot,
  onRestore,
  onClose,
}: InlineHistoryDiffViewProps) {
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = scheme === 'dark';

  // 비교 기준 모드: 'vsCurrent' (현재 편집본과 비교) vs 'vsPrevious' (직전 히스토리와 비교)
  const [compareMode, setCompareMode] = useState<'vsCurrent' | 'vsPrevious'>('vsCurrent');

  // 비교할 두 텍스트 및 제목 결정
  const { oldTitle, newTitle, oldContent, newContent, baseLabel, targetLabel } = useMemo(() => {
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
          ? `직전 버전 (${new Date(prev.savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})`
          : '최초 작성',
        targetLabel: `선택 버전 (${new Date(selectedSnapshot.savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})`,
      };
    }
  }, [compareMode, currentNote, selectedSnapshot, previousSnapshot]);

  const diffResult = useMemo(() => {
    return computeLineDiff(oldContent, newContent);
  }, [oldContent, newContent]);

  const isTitleChanged = oldTitle !== newTitle;
  const snapshotDateStr = new Date(selectedSnapshot.savedAt).toLocaleString('ko-KR');

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--mantine-color-body)',
      }}
    >
      {/* 상단 인라인 버전 비교 헤더 바 */}
      <Paper
        p="xs"
        withBorder
        style={{
          borderLeft: 'none',
          borderRight: 'none',
          borderTop: 'none',
          backgroundColor: isDark ? 'var(--mantine-color-dark-7)' : 'var(--mantine-color-blue-0)',
          borderColor: isDark ? 'var(--mantine-color-dark-5)' : 'var(--mantine-color-blue-2)',
        }}
      >
        <Group justify="space-between" align="center" wrap="wrap" gap="xs">
          {/* 좌측: 비교 대상 버전 정보 & 제목 변경 */}
          <Group gap="xs" wrap="wrap">
            <Badge color="blue" variant="filled" size="sm" leftSection={<IconGitCompare size={12} />}>
              버전 비교 모드
            </Badge>
            <Text size="xs" fw={700} style={{ color: isDark ? 'var(--mantine-color-gray-2)' : 'var(--mantine-color-dark-9)' }}>
              {snapshotDateStr}
            </Text>
            {isTitleChanged && (
              <Group gap={4} wrap="nowrap">
                <Text size="xs" c="dimmed" style={{ textDecoration: 'line-through' }}>
                  {oldTitle}
                </Text>
                <Text size="xs" c="dimmed">
                  ➔
                </Text>
                <Text size="xs" fw={700} style={{ color: isDark ? 'var(--mantine-color-green-4)' : 'var(--mantine-color-green-7)' }}>
                  {newTitle}
                </Text>
              </Group>
            )}
          </Group>

          {/* 중앙/우측: 비교 모드 세그먼트, 통계 뱃지, 복원 및 닫기 버튼 */}
          <Group gap="xs" wrap="wrap">
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

            <Badge color="green" variant="light" size="sm">
              +{diffResult.additions}
            </Badge>
            <Badge color="red" variant="light" size="sm">
              -{diffResult.deletions}
            </Badge>

            <Button
              size="xs"
              color="blue"
              variant="filled"
              leftSection={<IconRotate size={13} />}
              onClick={() => {
                if (confirm(`${snapshotDateStr} 버전으로 복원할까요?\n현재 작성 중인 내용은 새로운 히스토리로 자동 보존됩니다.`)) {
                  onRestore(selectedSnapshot.savedAt);
                  onClose();
                }
              }}
            >
              이 버전으로 복원
            </Button>

            <Tooltip label="비교를 종료하고 편집 모드로 복귀">
              <Button
                size="xs"
                variant="default"
                leftSection={<IconX size={13} />}
                onClick={onClose}
              >
                닫기
              </Button>
            </Tooltip>
          </Group>
        </Group>

        {/* 하단 범례 안내 */}
        <Group justify="space-between" align="center" mt={4} px={4}>
          <Text size="xs" c="dimmed">
            기준: <span style={{ fontWeight: 600, color: isDark ? 'var(--mantine-color-gray-3)' : 'var(--mantine-color-dark-7)' }}>{baseLabel}</span> ➔ 대상:{' '}
            <span style={{ fontWeight: 600, color: isDark ? 'var(--mantine-color-gray-3)' : 'var(--mantine-color-dark-7)' }}>{targetLabel}</span>
          </Text>
          <Group gap={12}>
            <Group gap={4}>
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  backgroundColor: isDark ? 'rgba(201, 42, 42, 0.7)' : '#ffa8a8',
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
                  backgroundColor: isDark ? 'rgba(43, 138, 62, 0.7)' : '#8ce99a',
                  borderRadius: 2,
                }}
              />
              <Text size="xs" c="dimmed">
                추가됨 (+)
              </Text>
            </Group>
          </Group>
        </Group>
      </Paper>

      {/* 본문 Git Unified Diff 뷰어 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          backgroundColor: isDark ? 'var(--mantine-color-dark-8)' : 'var(--mantine-color-gray-0)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <ScrollArea h="100%" type="auto">
          {!diffResult.hasChanges ? (
            <Stack align="center" justify="center" py={80} gap="xs">
              <IconCheck size={36} color="var(--mantine-color-green-6)" />
              <Text size="sm" fw={600} style={{ color: isDark ? 'var(--mantine-color-gray-2)' : 'var(--mantine-color-dark-8)' }}>
                두 버전 사이에 본문 내용 차이가 없습니다.
              </Text>
              <Text size="xs" c="dimmed">
                선택한 히스토리와 비교 대상의 본문 텍스트가 완전히 일치합니다.
              </Text>
            </Stack>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', userSelect: 'text' }}>
              <tbody>
                {diffResult.lines.map((line, idx) => {
                  let bg = 'transparent';
                  let textCol = isDark ? 'var(--mantine-color-gray-3)' : 'var(--mantine-color-dark-9)';
                  let prefix = ' ';
                  let signCol = 'transparent';

                  if (line.type === 'added') {
                    bg = isDark ? 'rgba(43, 138, 62, 0.28)' : 'rgba(81, 207, 102, 0.16)';
                    textCol = isDark ? '#8ce99a' : '#2b8a3e';
                    signCol = textCol;
                    prefix = '+';
                  } else if (line.type === 'removed') {
                    bg = isDark ? 'rgba(201, 42, 42, 0.28)' : 'rgba(255, 107, 107, 0.16)';
                    textCol = isDark ? '#ffa8a8' : '#c92a2a';
                    signCol = textCol;
                    prefix = '-';
                  }

                  return (
                    <tr
                      key={idx}
                      style={{
                        backgroundColor: bg,
                        borderBottom: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.04)',
                      }}
                    >
                      {/* 이전 라인 번호 */}
                      <td
                        style={{
                          width: 44,
                          textAlign: 'right',
                          padding: '2px 8px',
                          color: isDark ? 'var(--mantine-color-dark-3)' : 'var(--mantine-color-gray-5)',
                          backgroundColor: isDark ? 'var(--mantine-color-dark-7)' : 'var(--mantine-color-gray-1)',
                          userSelect: 'none',
                          fontSize: 11,
                        }}
                      >
                        {line.oldLineNumber ?? ''}
                      </td>
                      {/* 새 라인 번호 */}
                      <td
                        style={{
                          width: 44,
                          textAlign: 'right',
                          padding: '2px 8px',
                          color: isDark ? 'var(--mantine-color-dark-3)' : 'var(--mantine-color-gray-5)',
                          backgroundColor: isDark ? 'var(--mantine-color-dark-7)' : 'var(--mantine-color-gray-1)',
                          userSelect: 'none',
                          fontSize: 11,
                          borderRight: isDark ? '1px solid var(--mantine-color-dark-5)' : '1px solid var(--mantine-color-gray-3)',
                        }}
                      >
                        {line.newLineNumber ?? ''}
                      </td>
                      {/* +/- 기호 */}
                      <td
                        style={{
                          width: 24,
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
                          padding: '2px 12px',
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
        </ScrollArea>
      </div>
    </div>
  );
}
