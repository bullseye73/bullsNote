// VIEW: BlockNote 블록 에디터 (표/코드/이미지 지원) + 히스토리 복원
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Stack,
  Text,
  TextInput,
  Tooltip,
  useComputedColorScheme,
} from '@mantine/core';
import { IconHistory, IconPin, IconStar } from '@tabler/icons-react';
import { BlockNoteView } from '@blocknote/ariakit';
import { useCreateBlockNote } from '@blocknote/react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/react/style.css';
import '@blocknote/ariakit/style.css';
import { useMemo, useState } from 'react';
import { Note, getPathTitles } from '../model/Note';
import { isBlocksJson, noteBodyText, parseBlocks } from '../model/HashtagService';
import { useNotes } from '../controller/NotesController';
import { ErrorBoundary } from './ErrorBoundary';
import { EditorToolbar } from './EditorToolbar';
import { createSyntaxExtension, getAppSchema } from '../model/codeHighlight';

/** 이미지 붙여넣기/드롭 -> dataURL로 인라인 저장 */
async function uploadFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
  return dataUrl;
}

function BlockEditor({ note }: { note: Note }) {
  const { updateContent } = useNotes();
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true });

  const initialContent = useMemo(() => {
    // 검증된 블록만 전달, 그 외는 플레인 텍스트 문단으로 보존 (크래시 방지)
    const blocks = parseBlocks(note.content);
    if (blocks) return blocks as never;
    const text = isBlocksJson(note.content) ? '' : noteBodyText(note.content);
    return [{ type: 'paragraph', content: text || '' } as never];
  }, [note.id, note.content]);

  const editor = useCreateBlockNote({
    schema: getAppSchema() as never,
    initialContent,
    uploadFile,
    extensions: [createSyntaxExtension()],
  });

  return (
    <Stack gap={4} style={{ flex: 1, minHeight: 0 }}>
      <EditorToolbar editor={editor} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <BlockNoteView
          editor={editor}
          theme={scheme === 'dark' ? 'dark' : 'light'}
          onChange={() => updateContent(note.id, JSON.stringify(editor.document))}
        />
      </div>
    </Stack>
  );
}

export function NoteEditorView() {
  const { ready, selected, notes, updateTitle, updateContent, togglePin, toggleFavorite, setActiveTag, restoreHistory } = useNotes();
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!ready) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed">노트를 불러오는 중…</Text>
      </Stack>
    );
  }

  if (!selected) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed">노트를 선택하세요.</Text>
      </Stack>
    );
  }

  const path = getPathTitles(notes, selected.id);
  // ready 이후에만 렌더되므로 content는 블록 JSON이 보장됨 (손상 시 문단 폴백)
  const editorKey = `${selected.id}`;

  return (
    <Stack gap="xs" p="md" h="100%" style={{ overflow: 'auto' }}>
      {path.length > 1 && (
        <Text size="xs" c="dimmed">
          {path.join(' / ')}
        </Text>
      )}
      <Group justify="space-between" wrap="nowrap">
        <TextInput
          value={selected.title}
          onChange={(e) => updateTitle(selected.id, e.currentTarget.value)}
          variant="unstyled"
          size="xl"
          fw={700}
          placeholder="제목 없음 (본문에 #태그 가능)"
          style={{ flex: 1 }}
        />
        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            variant="light"
            color="gray"
            leftSection={<IconHistory size={15} />}
            rightSection={
              <Badge size="xs" variant="filled" color={selected.history.length > 0 ? 'blue' : 'gray'}>
                {selected.history.length}
              </Badge>
            }
            onClick={() => setHistoryOpen(true)}
          >
            히스토리
          </Button>
          <Divider orientation="vertical" />
          <Tooltip label={selected.pinned ? '핀 해제' : '상단 고정'}>
            <ActionIcon
              size="lg"
              variant={selected.pinned ? 'filled' : 'light'}
              color="blue"
              onClick={() => togglePin(selected.id)}
              aria-label="핀"
            >
              <IconPin size={17} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={selected.favorite ? '즐겨찾기 해제' : '즐겨찾기 등록'}>
            <ActionIcon
              size="lg"
              variant={selected.favorite ? 'filled' : 'light'}
              color="yellow"
              onClick={() => toggleFavorite(selected.id)}
              aria-label="즐겨찾기"
            >
              <IconStar size={17} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Group gap={4}>
        {selected.tags.length === 0 ? (
          <Text size="xs" c="dimmed">
            #태그 없음 — 본문에 예를 들어 #회의록 을 입력하세요.
          </Text>
        ) : (
          selected.tags.map((t) => (
            <Badge key={t} variant="light" style={{ cursor: 'pointer' }} onClick={() => setActiveTag(t)}>
              #{t}
            </Badge>
          ))
        )}
      </Group>
      <Text size="xs" c="dimmed">
        생성 {new Date(selected.createdAt).toLocaleString('ko-KR')} · 수정{' '}
        {new Date(selected.updatedAt).toLocaleString('ko-KR')} · {noteBodyText(selected.content).length}자
      </Text>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ErrorBoundary
          title="에디터를 표시하지 못했습니다"
          onResetNote={() =>
            updateContent(selected.id, JSON.stringify([{ type: 'paragraph', content: '' }]))
          }
        >
          <BlockEditor key={editorKey} note={selected} />
        </ErrorBoundary>
      </div>

      <Drawer opened={historyOpen} onClose={() => setHistoryOpen(false)} title="노트 히스토리" position="right" size="md">
        <Text size="xs" c="dimmed" mb="sm">
          편집 중 자동 저장됩니다 (최대 30개, 복원 시 현재 상태도 저장됨).
        </Text>
        {selected.history.length === 0 ? (
          <Text size="sm" c="dimmed">
            아직 히스토리가 없습니다.
          </Text>
        ) : (
          <Stack gap="xs">
            {selected.history.map((h) => (
              <Group key={h.savedAt} justify="space-between" wrap="nowrap" align="flex-start"
                style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, padding: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600} truncate>
                    {h.title || '제목 없음'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {new Date(h.savedAt).toLocaleString('ko-KR')}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {noteBodyText(h.content).slice(0, 100) || '내용 없음'}
                  </Text>
                </div>
                <Button
                  size="xs"
                  variant="light"
                  style={{ flexShrink: 0 }}
                  onClick={() => {
                    if (confirm(`${new Date(h.savedAt).toLocaleString('ko-KR')} 버전으로 복원할까요?`)) {
                      restoreHistory(selected.id, h.savedAt);
                      setHistoryOpen(false);
                    }
                  }}
                >
                  복원
                </Button>
              </Group>
            ))}
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
