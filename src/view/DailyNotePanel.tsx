// VIEW: 오늘 화면의 Daily Note(하루 계획표) 영역 — 접기/펼치기, 바로 편집, 없으면 "시작하기"
import { ActionIcon, Box, Button, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconExternalLink, IconNotebook } from '@tabler/icons-react';
import { useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { findDailyNote } from '../model/DailyNoteService';
import { parseIsoDateLocal } from '../model/PlannerService';
import { EmbeddedNoteEditor } from './NoteEditorView';

const COLLAPSED_STORAGE_KEY = 'bullsnote.today.dailyCollapsed';

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function DailyNotePanel({ dateIso, todayIso }: { dateIso: string; todayIso: string }) {
  const { notes, projects, ensureDailyNote, openNote } = useNotes();
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const note = findDailyNote(notes, projects, dateIso);

  const d = parseIsoDateLocal(dateIso);
  const title = dateIso === todayIso ? '오늘 노트' : `${d.getMonth() + 1}월 ${d.getDate()}일 노트`;

  const toggle = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, v ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  return (
    <Box
      style={{
        border: '1px solid var(--bn-border-subtle)',
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: 'var(--bn-surface-editor)',
      }}
    >
      <Group justify="space-between" wrap="nowrap" px={10} py={6} style={{ borderBottom: collapsed ? undefined : '1px solid var(--bn-border-subtle)' }}>
        <UnstyledButton onClick={toggle} aria-expanded={!collapsed} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          {collapsed ? <IconChevronRight size={15} /> : <IconChevronDown size={15} />}
          <IconNotebook size={15} color="var(--mantine-color-teal-6)" />
          <Text size="sm" fw={600} truncate>
            {title}
          </Text>
        </UnstyledButton>
        {note && (
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => openNote(note.id)} aria-label="노트 화면에서 열기">
            <IconExternalLink size={15} />
          </ActionIcon>
        )}
      </Group>

      {!collapsed &&
        (note ? (
          // 계획표가 길어지면 이 영역 안에서만 스크롤
          <Box style={{ maxHeight: '55vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <EmbeddedNoteEditor noteId={note.id} />
          </Box>
        ) : (
          <Stack align="center" gap={6} py="lg" px="md">
            <Text size="xs" c="dimmed" ta="center">
              할 일 순서와 주의할 점을 미리 적어 두는 하루 계획표예요
            </Text>
            <Button size="xs" variant="light" color="teal" onClick={() => ensureDailyNote(dateIso)}>
              이 날의 노트 시작하기
            </Button>
          </Stack>
        ))}
    </Box>
  );
}
