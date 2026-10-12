// VIEW: 이 노트를 참조(링크)하고 있는 백링크(Backlinks) 목록 컴포넌트
import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronUp,
  IconFileText,
  IconLink,
  IconArrowRight,
} from '@tabler/icons-react';
import { Note, Project, getPastelConfig, getPathTitles } from '../model/Note';
import { noteBodyText } from '../model/HashtagService';

interface NoteBacklinksViewProps {
  currentNote: Note;
  backlinks: Note[];
  allNotes: Note[];
  projects: Project[];
  onSelectNote: (noteId: string) => void;
  /** 상단 컴팩트 모드 여부 */
  compact?: boolean;
}

export function NoteBacklinksView({
  currentNote,
  backlinks,
  allNotes,
  projects,
  onSelectNote,
  compact = false,
}: NoteBacklinksViewProps) {
  const [opened, setOpened] = useState(true);

  if (backlinks.length === 0) {
    return null;
  }

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  return (
    <Paper
      withBorder
      p={compact ? 'xs' : 'sm'}
      radius="md"
      className="backlinks-container"
      style={{
        backgroundColor: 'var(--mantine-color-default)',
        borderColor: 'var(--mantine-color-blue-2)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      <Group justify="space-between" wrap="nowrap" style={{ cursor: 'pointer' }} onClick={() => setOpened((o) => !o)}>
        <Group gap="xs" wrap="nowrap">
          <Badge
            size="sm"
            variant="light"
            color="blue"
            leftSection={<IconLink size={13} />}
          >
            이 노트를 참조하는 노트 (백링크)
          </Badge>
          <Badge size="xs" variant="filled" color="blue" circle>
            {backlinks.length}
          </Badge>
          <Text size="xs" c="dimmed">
            {backlinks.length}개의 다른 노트에서 이 노트로 연결되어 있습니다
          </Text>
        </Group>

        <Tooltip label={opened ? '백링크 목록 접기' : '백링크 목록 펼치기'}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setOpened((o) => !o);
            }}
          >
            {opened ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </ActionIcon>
        </Tooltip>
      </Group>

      <Collapse in={opened} mt="xs">
        <Stack gap={6} pt={4}>
          {backlinks.map((refNote) => {
            const proj = projectMap.get(refNote.projectId || 'default');
            const pathTitles = getPathTitles(allNotes, refNote.id);
            const pathStr = pathTitles.slice(0, -1).join(' / ');
            const pastelCfg = getPastelConfig(refNote.color);
            const plainSnippet = noteBodyText(refNote.content).slice(0, 80);

            return (
              <Paper
                key={refNote.id}
                p="xs"
                radius="sm"
                className="backlink-item-card"
                onClick={() => onSelectNote(refNote.id)}
                style={{
                  cursor: 'pointer',
                  border: '1px solid var(--mantine-color-gray-2)',
                  backgroundColor: 'var(--mantine-color-body)',
                  borderLeft: `3px solid ${pastelCfg.border}`,
                  transition: 'all 0.18s ease',
                }}
              >
                <Group justify="space-between" wrap="nowrap" align="center">
                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="xs" wrap="nowrap">
                      <IconFileText size={15} color={pastelCfg.border} style={{ flexShrink: 0 }} />
                      <Text size="sm" fw={600} truncate style={{ color: 'var(--mantine-color-text)' }}>
                        {refNote.title || '제목 없음'}
                      </Text>
                      {proj && (
                        <Badge size="xs" variant="outline" color="gray">
                          {proj.icon} {proj.name}
                        </Badge>
                      )}
                      {refNote.tags.slice(0, 2).map((t) => (
                        <Badge key={t} size="xs" variant="light" color="teal">
                          #{t}
                        </Badge>
                      ))}
                    </Group>

                    {pathStr && (
                      <Text size="xs" c="dimmed" truncate>
                        경로: {pathStr}
                      </Text>
                    )}

                    {plainSnippet && (
                      <Text size="xs" c="dimmed" lineClamp={1} mt={1}>
                        "{plainSnippet}..."
                      </Text>
                    )}
                  </Stack>

                  <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                    <Text size="xs" c="dimmed">
                      {new Date(refNote.updatedAt).toLocaleDateString('ko-KR', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                    <ActionIcon size="sm" variant="subtle" color="blue">
                      <IconArrowRight size={14} />
                    </ActionIcon>
                  </Group>
                </Group>
              </Paper>
            );
          })}
        </Stack>
      </Collapse>
    </Paper>
  );
}
