// VIEW: BlockNote 블록 에디터 (표/코드/이미지 지원) + 히스토리 복원
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Menu,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
  useComputedColorScheme,
} from '@mantine/core';
import {
  IconBell,
  IconCheck,
  IconCode,
  IconCopy,
  IconDownload,
  IconEye,
  IconFileTypePdf,
  IconHistory,
  IconLock,
  IconLockOpen,
  IconMarkdown,
  IconPalette,
  IconPin,
  IconPrinter,
  IconShare,
  IconStar,
} from '@tabler/icons-react';
import { BlockNoteView } from '@blocknote/ariakit';
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from '@blocknote/react';
import { filterSuggestionItems, type BlockNoteEditor } from '@blocknote/core';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/react/style.css';
import '@blocknote/ariakit/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Note, getPathTitles, getPastelConfig, PASTEL_COLORS } from '../model/Note';
import { isBlocksJson, noteBodyText, parseBlocks } from '../model/HashtagService';
import { useNotes } from '../controller/NotesController';
import { ErrorBoundary } from './ErrorBoundary';
import { EditorToolbar } from './EditorToolbar';
import { ReminderPopover } from './ReminderPopover';
import { DatePickerModal } from './DatePickerModal';
import { PrintPreviewModal } from './PrintPreviewModal';
import { NoteTableOfContents } from './NoteTableOfContents';
import { formatDateIso } from '../model/dateUtils';
import { getDateAtSuggestions, getDateSlashMenuItems } from '../model/dateSuggestions';
import { createSyntaxExtension, getAppSchema } from '../model/codeHighlight';
import {
  canNativeShare,
  copyHtmlToClipboard,
  copyPlainTextToClipboard,
  downloadFile,
  exportToHtmlDocument,
  exportToMarkdown,
  exportToPdf,
  sanitizeFileName,
  shareNative,
} from '../model/exportUtils';

type AnyEditor = BlockNoteEditor<any, any, any>;

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

function BlockEditor({
  note,
  onEditorInit,
}: {
  note: Note;
  onEditorInit?: (editor: AnyEditor) => void;
}) {
  const { updateContent } = useNotes();
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerInitialDate, setDatePickerInitialDate] = useState<Date | undefined>(undefined);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  const handleInsertToday = useCallback(() => {
    editor.focus();
    editor.insertInlineContent(formatDateIso(new Date()));
  }, [editor]);

  const handleOpenDatePicker = useCallback((initialDate?: Date) => {
    setDatePickerInitialDate(initialDate);
    setDatePickerOpen(true);
  }, []);

  const handleDatePicked = useCallback(
    (formattedDate: string) => {
      editor.focus();
      editor.insertInlineContent(formattedDate);
    },
    [editor]
  );

  // 단축키: Ctrl + ; (Mac: Cmd + ;) -> 오늘 날짜(YYYY-MM-DD) 즉시 삽입
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ';') {
        e.preventDefault();
        handleInsertToday();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleInsertToday]);

  // 외부(상위 컴포넌트)로 에디터 인스턴스 공유 (내보내기/공유/인쇄용)
  useEffect(() => {
    onEditorInit?.(editor);
  }, [editor, onEditorInit]);

  return (
    <Stack gap={4} style={{ flex: 1, minHeight: 0 }}>
      <div className="no-print">
        <EditorToolbar
          editor={editor}
          onOpenDatePicker={() => handleOpenDatePicker()}
          onInsertToday={handleInsertToday}
        />
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 우측 상단 고정 목차 (TOC) */}
        <NoteTableOfContents editor={editor} scrollContainerRef={scrollContainerRef} />

        <div
          ref={scrollContainerRef}
          style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              editor.focus();
            }
          }}
        >
          <BlockNoteView
            editor={editor}
            theme={scheme === 'dark' ? 'dark' : 'light'}
            slashMenu={false}
            onChange={() => updateContent(note.id, JSON.stringify(editor.document))}
          >
            {/* 노션 스타일 @ 멘션 날짜 추천 메뉴 (@오늘, @내일, @11/20 등 동적 파싱 + 달력 선택) */}
            <SuggestionMenuController
              triggerCharacter="@"
              getItems={async (query) =>
                getDateAtSuggestions(query, editor, () => handleOpenDatePicker())
              }
            />
            {/* 날짜 삽입 항목이 포함된 / 슬래시 명령어 메뉴 */}
            <SuggestionMenuController
              triggerCharacter="/"
              shouldOpen={(e) => !e.selection.$from.parent.type.isInGroup('tableContent')}
              getItems={async (query) => {
                const defaultSlashItems = getDefaultReactSlashMenuItems(editor);
                const dateSlashItems = getDateSlashMenuItems(editor, () => handleOpenDatePicker());
                return filterSuggestionItems([...dateSlashItems, ...defaultSlashItems], query);
              }}
            />
          </BlockNoteView>
        </div>
      </div>

      <DatePickerModal
        opened={datePickerOpen}
        initialDate={datePickerInitialDate}
        onClose={() => setDatePickerOpen(false)}
        onInsert={handleDatePicked}
      />
    </Stack>
  );
}

export function NoteEditorView() {
  const {
    ready,
    selected,
    notes,
    projects,
    updateTitle,
    updateContent,
    updateColor,
    togglePin,
    toggleFavorite,
    setActiveTag,
    restoreHistory,
    isMasterSet,
    isUnlocked,
    openSecurityModal,
  } = useNotes();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [currentEditor, setCurrentEditor] = useState<AnyEditor | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const showFeedback = useCallback((msg: string) => {
    setCopyFeedback(msg);
    setTimeout(() => setCopyFeedback(null), 2500);
  }, []);

  // 인쇄 실행
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // 단축키: Ctrl + P (Mac: Cmd + P) -> 인쇄 미리보기 열기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPrintPreviewOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // PDF 내보내기
  const handleExportPdf = useCallback(async () => {
    if (!selected) return;
    const res = await exportToPdf(selected.title || '노트');
    if (res.success) {
      showFeedback('PDF 내보내기 완료');
    }
  }, [selected, showFeedback]);

  // 마크다운 복사
  const handleCopyMarkdown = useCallback(async () => {
    if (!currentEditor || !selected) return;
    const md = exportToMarkdown(currentEditor, selected.title);
    const ok = await copyPlainTextToClipboard(md);
    if (ok) showFeedback('마크다운 복사됨');
  }, [currentEditor, selected, showFeedback]);

  // 서식 있는 텍스트(HTML) 복사
  const handleCopyHtml = useCallback(async () => {
    if (!currentEditor || !selected) return;
    const html = exportToHtmlDocument(currentEditor, selected.title);
    const md = exportToMarkdown(currentEditor, selected.title);
    const ok = await copyHtmlToClipboard(html, md);
    if (ok) showFeedback('서식 있는 텍스트 복사됨');
  }, [currentEditor, selected, showFeedback]);

  // 일반 텍스트 복사
  const handleCopyPlainText = useCallback(async () => {
    if (!selected) return;
    const plain = noteBodyText(selected.content);
    const ok = await copyPlainTextToClipboard(selected.title ? `${selected.title}\n\n${plain}` : plain);
    if (ok) showFeedback('일반 텍스트 복사됨');
  }, [selected, showFeedback]);

  // 마크다운(.md) 파일 저장
  const handleDownloadMarkdown = useCallback(() => {
    if (!currentEditor || !selected) return;
    const md = exportToMarkdown(currentEditor, selected.title);
    downloadFile(`${sanitizeFileName(selected.title)}.md`, md, 'text/markdown;charset=utf-8');
    showFeedback('.md 파일 다운로드됨');
  }, [currentEditor, selected, showFeedback]);

  // HTML(.html) 파일 저장
  const handleDownloadHtml = useCallback(() => {
    if (!currentEditor || !selected) return;
    const html = exportToHtmlDocument(currentEditor, selected.title);
    downloadFile(`${sanitizeFileName(selected.title)}.html`, html, 'text/html;charset=utf-8');
    showFeedback('.html 파일 다운로드됨');
  }, [currentEditor, selected, showFeedback]);

  // OS 시스템 공유 창
  const handleNativeShare = useCallback(async () => {
    if (!currentEditor || !selected) return;
    const md = exportToMarkdown(currentEditor, selected.title);
    await shareNative(selected.title, md);
  }, [currentEditor, selected]);

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

  const currentProject = projects.find((p) => p.id === (selected.projectId || 'default'));
  const path = getPathTitles(notes, selected.id);
  const breadcrumbs = [
    ...(currentProject ? [`${currentProject.icon} ${currentProject.name}`] : []),
    ...path,
  ];

  const colorCfg = getPastelConfig(selected.color);

  // ready 이후에만 렌더되므로 content는 블록 JSON이 보장됨 (손상 시 문단 폴백)
  const editorKey = `${selected.id}`;

  return (
    <Stack gap="xs" p="md" h="100%" className="note-editor-stack" style={{ overflow: 'hidden' }}>
      {/* 인쇄 시에만 표시되는 인쇄 전용 헤더 (A4 문서용 깔끔한 레이아웃) */}
      <div className="print-only" style={{ marginBottom: 20, paddingBottom: 12, borderBottom: '2px solid #222' }}>
        <h1 style={{ fontSize: '24pt', fontWeight: 800, margin: '0 0 10px 0', color: '#111' }}>
          {selected.title || '제목 없음'}
        </h1>
        <div style={{ fontSize: '10pt', color: '#555', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <span>생성: {new Date(selected.createdAt).toLocaleString('ko-KR')}</span>
          <span>수정: {new Date(selected.updatedAt).toLocaleString('ko-KR')}</span>
          {selected.tags.length > 0 && <span>태그: #{selected.tags.join(' #')}</span>}
        </div>
      </div>

      {/* 화면용 브레드크럼 및 알람/색상 뱃지 */}
      <div className="no-print">
        <Group justify="space-between" align="center" wrap="nowrap" mb={6}>
          <Text size="xs" c="dimmed">
            {breadcrumbs.join(' / ')}
          </Text>
          <Group gap="xs">
            {selected.reminder && !selected.reminder.dismissed && (
              <Badge
                size="xs"
                variant="light"
                color="blue"
                leftSection={<IconBell size={11} />}
              >
                {new Date(selected.reminder.targetAt).toLocaleString('ko-KR', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {selected.reminder.repeat !== 'none' ? ' (반복)' : ''}
              </Badge>
            )}
            <Badge
              size="xs"
              variant="filled"
              style={{
                backgroundColor: colorCfg.bg,
                color: colorCfg.textColor,
                border: `1px solid ${colorCfg.border}`,
              }}
            >
              {colorCfg.name}
            </Badge>
          </Group>
        </Group>

        <div
          style={{
            height: 3,
            borderRadius: 2,
            background: `linear-gradient(90deg, ${colorCfg.border} 0%, ${colorCfg.bg} 100%)`,
            marginBottom: 8,
          }}
        />

        <Group justify="space-between" wrap="nowrap" mb={6}>
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
            {/* 복사 성공 안내 피드백 */}
            {copyFeedback && (
              <Badge size="sm" color="teal" variant="filled" leftSection={<IconCheck size={12} />}>
                {copyFeedback}
              </Badge>
            )}

            {/* 인쇄 및 미리보기 버튼 */}
            <Tooltip label="인쇄 및 미리보기 (Ctrl+P / Cmd+P)">
              <ActionIcon
                size="lg"
                variant="light"
                color="gray"
                onClick={() => setPrintPreviewOpen(true)}
                aria-label="인쇄 및 미리보기"
              >
                <IconPrinter size={17} />
              </ActionIcon>
            </Tooltip>

            {/* PDF 내보내기 버튼 */}
            <Tooltip label="PDF로 내보내기">
              <ActionIcon
                size="lg"
                variant="light"
                color="red"
                onClick={handleExportPdf}
                aria-label="PDF로 내보내기"
              >
                <IconFileTypePdf size={17} />
              </ActionIcon>
            </Tooltip>

            {/* 공유 및 내보내기 메뉴 */}
            <Menu position="bottom-end" withArrow shadow="md" withinPortal>
              <Menu.Target>
                <Tooltip label="공유 및 내보내기">
                  <ActionIcon size="lg" variant="light" color="blue" aria-label="공유 및 내보내기">
                    <IconShare size={17} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconEye size={15} color="var(--mantine-color-blue-6)" />}
                  onClick={() => setPrintPreviewOpen(true)}
                >
                  인쇄 / PDF 미리보기…
                </Menu.Item>
                <Menu.Divider />

                <Menu.Label>클립보드 복사</Menu.Label>
                <Menu.Item
                  leftSection={<IconMarkdown size={15} />}
                  onClick={handleCopyMarkdown}
                >
                  마크다운(Markdown) 복사
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconCode size={15} />}
                  onClick={handleCopyHtml}
                >
                  서식 있는 텍스트(HTML) 복사
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconCopy size={15} />}
                  onClick={handleCopyPlainText}
                >
                  일반 텍스트만 복사
                </Menu.Item>

                <Menu.Divider />
                <Menu.Label>파일로 내보내기</Menu.Label>
                <Menu.Item
                  leftSection={<IconFileTypePdf size={15} color="var(--mantine-color-red-6)" />}
                  onClick={handleExportPdf}
                >
                  PDF 문서 (.pdf)
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconDownload size={15} />}
                  onClick={handleDownloadMarkdown}
                >
                  마크다운 파일 (.md)
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconDownload size={15} />}
                  onClick={handleDownloadHtml}
                >
                  HTML 웹페이지 (.html)
                </Menu.Item>

                {canNativeShare() && (
                  <>
                    <Menu.Divider />
                    <Menu.Label>기기 공유</Menu.Label>
                    <Menu.Item
                      leftSection={<IconShare size={15} color="var(--mantine-color-blue-6)" />}
                      onClick={handleNativeShare}
                    >
                      시스템 공유 창 열기…
                    </Menu.Item>
                  </>
                )}
              </Menu.Dropdown>
            </Menu>

            <Divider orientation="vertical" />

            {/* 파스텔 색상 선택 메뉴 */}
            <Menu position="bottom-end" withArrow shadow="md" withinPortal>
              <Menu.Target>
                <Tooltip label={`노트 색상: ${colorCfg.name}`}>
                  <ActionIcon
                    size="lg"
                    variant="subtle"
                    aria-label="노트 색상 변경"
                    style={{
                      backgroundColor: colorCfg.bg,
                      border: `2px solid ${colorCfg.border}`,
                      color: colorCfg.iconColor,
                    }}
                  >
                    <IconPalette size={17} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>노트 색상 변경</Menu.Label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, padding: '4px 8px' }}>
                  {Object.values(PASTEL_COLORS).map((c) => {
                    const isCurrent = (selected.color || 'blue') === c.id;
                    return (
                      <Tooltip key={c.id} label={c.name} position="top" withArrow>
                        <ActionIcon
                          size="md"
                          radius="xl"
                          onClick={() => updateColor(selected.id, c.id)}
                          style={{
                            backgroundColor: c.bg,
                            border: `2px solid ${c.border}`,
                            boxShadow: isCurrent ? `0 0 0 2px ${c.textColor}` : undefined,
                            transform: isCurrent ? 'scale(1.2)' : 'none',
                            transition: 'all 0.15s ease',
                          }}
                        />
                      </Tooltip>
                    );
                  })}
                </div>
              </Menu.Dropdown>
            </Menu>

            {/* 알람 리마인더 설정 팝오버 */}
            <ReminderPopover note={selected} />

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

        <Group gap={4} mb={4}>
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
        <Text size="xs" c="dimmed" mb={8}>
          생성 {new Date(selected.createdAt).toLocaleString('ko-KR')} · 수정{' '}
          {new Date(selected.updatedAt).toLocaleString('ko-KR')} · {noteBodyText(selected.content).length}자
        </Text>
      </div>

      {isMasterSet && !isUnlocked ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            backgroundColor: 'var(--mantine-color-gray-0)',
            borderRadius: 8,
          }}
        >
          <Stack align="center" gap="md" style={{ maxWidth: 440, textAlign: 'center' }}>
            <ThemeIcon size={64} radius="xl" color="orange" variant="light">
              <IconLock size={36} />
            </ThemeIcon>
            <div>
              <Text fw={700} size="lg">
                노트 본문이 암호화되어 있습니다
              </Text>
              <Text size="sm" c="dimmed" mt={6}>
                안전한 보안을 위해 본문이 AES-GCM 256비트로 암호화되어 보호 중입니다.
                내용을 확인하고 편집하려면 마스터 비밀번호로 잠금을 해제하세요.
              </Text>
            </div>
            <Button
              color="orange"
              size="md"
              leftSection={<IconLockOpen size={18} />}
              onClick={openSecurityModal}
            >
              마스터 비밀번호로 잠금 해제
            </Button>
          </Stack>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <ErrorBoundary
            title="에디터를 표시하지 못했습니다"
            onResetNote={() =>
              updateContent(selected.id, JSON.stringify([{ type: 'paragraph', content: '' }]))
            }
          >
            <BlockEditor key={editorKey} note={selected} onEditorInit={setCurrentEditor} />
          </ErrorBoundary>
        </div>
      )}

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

      <PrintPreviewModal
        opened={printPreviewOpen}
        onClose={() => setPrintPreviewOpen(false)}
        note={selected}
        editor={currentEditor}
        onPrint={handlePrint}
        onExportPdf={handleExportPdf}
      />
    </Stack>
  );
}
