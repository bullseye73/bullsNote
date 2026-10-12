// VIEW: BlockNote 블록 에디터 (표/코드/이미지 지원) + 히스토리 복원
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Menu,
  PasswordInput,
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
import {
  Note,
  NoteAttachment,
  getPathTitles,
  getPathNodes,
  findBacklinks,
  getPastelConfig,
  PASTEL_COLORS,
  isDeletedAttachmentUrl,
  markDeletedBlocks,
} from '../model/Note';
import { isBlocksJson, noteBodyText, parseBlocks } from '../model/HashtagService';
import { useNotes } from '../controller/NotesController';
import { CryptoService } from '../model/CryptoService';
import { ErrorBoundary } from './ErrorBoundary';
import { EditorToolbar } from './EditorToolbar';
import { ReminderPopover } from './ReminderPopover';
import { DatePickerModal } from './DatePickerModal';
import { PrintPreviewModal } from './PrintPreviewModal';
import { NoteTableOfContents } from './NoteTableOfContents';
import { formatDateIso } from '../model/dateUtils';
import { getDateAtSuggestions, getDateSlashMenuItems } from '../model/dateSuggestions';
import { getCombinedAtSuggestions, getNoteSlashMenuItems } from '../model/noteSuggestions';
import { NoteBacklinksView } from './NoteBacklinksView';
import { NoteAttachmentsView } from './NoteAttachmentsView';
import { SupabaseService } from '../model/SupabaseService';
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

/** 이미지 붙여넣기/드롭 -> dataURL로 인라인 저장 (로컬 폴백용) */
async function uploadFileAsDataUrl(file: File): Promise<string> {
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
  backlinks,
  onEditorInit,
}: {
  note: Note;
  backlinks: Note[];
  onEditorInit?: (editor: AnyEditor) => void;
}) {
  const {
    updateContent,
    select,
    notes,
    projects,
    supabaseConnected,
    supabaseConfig,
    openSupabaseModal,
    addAttachment,
  } = useNotes();
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerInitialDate, setDatePickerInitialDate] = useState<Date | undefined>(undefined);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hiddenFileInputRef = useRef<HTMLInputElement>(null);

  const initialContent = useMemo(() => {
    // 검증된 블록만 전달, 그 외는 플레인 텍스트 문단으로 보존 (크래시 방지)
    const blocks = parseBlocks(note.content);
    if (blocks) {
      return markDeletedBlocks(blocks, note.attachments, notes) as never;
    }
    const text = isBlocksJson(note.content) ? '' : noteBodyText(note.content);
    return [{ type: 'paragraph', content: text || '' } as never];
  }, [note.id, note.content, note.attachments, notes]);

  // Supabase 스토리지 연동 여부에 따른 파일 업로드 핸들러
  const handleUploadFile = useCallback(
    async (file: File): Promise<string> => {
      // 1. Supabase 연동 상태이면 클라우드 스토리지로 업로드
      if (supabaseConnected && supabaseConfig.enabled) {
        try {
          const att = await SupabaseService.uploadAttachment(note.id, file);
          addAttachment(note.id, att);
          return att.url;
        } catch (err) {
          console.error('Supabase 스토리지 업로드 실패:', err);
          if (file.type.startsWith('image/')) {
            return uploadFileAsDataUrl(file);
          }
          alert(`스토리지 업로드 실패: ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        }
      }

      // 2. Supabase 미연동 상태
      if (file.type.startsWith('image/')) {
        // 이미지는 로컬 dataURL로 삽입 허용
        return uploadFileAsDataUrl(file);
      }

      // 일반 파일은 업로드 차단 및 설정 모달 유도
      alert('파일 업로드 기능은 Supabase 클라우드 스토리지가 연동된 상태에서 사용할 수 있습니다. Supabase 설정을 완료해주세요.');
      openSupabaseModal();
      throw new Error('Supabase 미연동으로 파일 업로드 제한됨');
    },
    [supabaseConnected, supabaseConfig.enabled, note.id, addAttachment, openSupabaseModal]
  );

  const editor = useCreateBlockNote({
    schema: getAppSchema() as never,
    initialContent,
    uploadFile: handleUploadFile,
    extensions: [createSyntaxExtension()],
  });

  // / 슬래시 메뉴에서 파일 첨부 선택 시
  const handleAttachFromSlash = useCallback(() => {
    if (!supabaseConnected || !supabaseConfig.enabled) {
      alert('파일 첨부 기능은 Supabase 클라우드 스토리지가 연동된 상태에서 사용할 수 있습니다. Supabase 설정을 완료해주세요.');
      openSupabaseModal();
      return;
    }
    hiddenFileInputRef.current?.click();
  }, [supabaseConnected, supabaseConfig.enabled, openSupabaseModal]);

  // 숨겨진 input에서 파일 선택 시 본문에 노션 스타일 file 블록 삽입
  const handleFilePickedFromInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const url = await handleUploadFile(file);
        editor.insertBlocks(
          [
            {
              type: 'file',
              props: {
                url,
                name: file.name,
                caption: '',
              },
            } as never,
          ],
          editor.getTextCursorPosition().block,
          'after'
        );
      } catch {
        // 오류 처리는 handleUploadFile에서 수행
      } finally {
        if (e.target) e.target.value = '';
      }
    },
    [editor, handleUploadFile]
  );

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

  // 첨부파일 삭제 시 현재 에디터 본문의 파일 블록도 실시간으로 (삭제된 파일) 상태로 즉시 갱신
  const handleAttachmentDeleted = useCallback(
    (deletedAtt: NoteAttachment) => {
      let modified = false;
      const traverse = (blocks: any[]) => {
        for (const block of blocks) {
          if (block.type === 'file' && block.props?.url) {
            const url = String(block.props.url);
            if (
              url === deletedAtt.url ||
              (deletedAtt.storagePath && url.includes(deletedAtt.storagePath))
            ) {
              const currentName = String(block.props.name || deletedAtt.name);
              const cleanName = currentName.replace(/ \(삭제(?:된 파일|됨)\)/g, '').trim();
              editor.updateBlock(block, {
                props: {
                  ...block.props,
                  name: cleanName,
                  caption: '',
                },
              });
              modified = true;
            }
          }
          if (Array.isArray(block.children) && block.children.length > 0) {
            traverse(block.children);
          }
        }
      };
      traverse(editor.document as any);

      if (modified) {
        updateContent(note.id, JSON.stringify(editor.document));
      }
    },
    [editor, note.id, updateContent]
  );

  // 에디터 DOM 내 삭제된 첨부파일 링크 및 파일 블록에 data-deleted-attachment 속성 동적 부여
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const markDeletedElements = () => {
      // 1. 모든 링크 <a> 태그 검사
      const anchors = container.querySelectorAll<HTMLAnchorElement>('a[href]');
      anchors.forEach((a) => {
        const href = a.getAttribute('href');
        if (isDeletedAttachmentUrl(href, note.attachments, notes)) {
          a.setAttribute('data-deleted-attachment', 'true');
          a.classList.add('deleted-attachment-link');
          a.setAttribute('title', '삭제된 첨부파일입니다 (열기 불가)');
        } else if (a.hasAttribute('data-deleted-attachment')) {
          a.removeAttribute('data-deleted-attachment');
          a.classList.remove('deleted-attachment-link');
          a.removeAttribute('title');
        }
      });

      // 2. BlockNote의 파일 블록 [data-content-type="file"] 검사
      const fileBlocks = container.querySelectorAll<HTMLElement>('[data-content-type="file"]');
      fileBlocks.forEach((fb) => {
        const link = fb.querySelector<HTMLAnchorElement>('a[href]');
        const href = link?.getAttribute('href') || fb.getAttribute('data-url');
        if (isDeletedAttachmentUrl(href, note.attachments, notes)) {
          fb.setAttribute('data-deleted-attachment', 'true');
          fb.classList.add('deleted-attachment-block');
          fb.setAttribute('title', '삭제된 첨부파일입니다');
        } else if (fb.hasAttribute('data-deleted-attachment')) {
          fb.removeAttribute('data-deleted-attachment');
          fb.classList.remove('deleted-attachment-block');
          fb.removeAttribute('title');
        }
      });
    };

    markDeletedElements();

    const observer = new MutationObserver(() => {
      markDeletedElements();
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'data-url'],
    });

    return () => observer.disconnect();
  }, [note.attachments, notes, note.id, note.content]);

  // 외부(상위 컴포넌트)로 에디터 인스턴스 공유 (내보내기/공유/인쇄용)
  useEffect(() => {
    onEditorInit?.(editor);
  }, [editor, onEditorInit]);

  return (
    <Stack gap={4} style={{ flex: 1, minHeight: 0 }}>
      {/* 슬래시 메뉴용 숨겨진 파일 선택 인풋 */}
      <input
        type="file"
        ref={hiddenFileInputRef}
        style={{ display: 'none' }}
        onChange={handleFilePickedFromInput}
      />

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
          style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingBottom: 280 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              editor.focus();
            }
          }}
          onClickCapture={(e) => {
            const target = (e.target as HTMLElement).closest('a');
            if (target) {
              const href = target.getAttribute('href');
              // 1. 노트 간 이동 링크 (#note-, note://)
              if (href && (href.startsWith('#note-') || href.startsWith('note://'))) {
                e.preventDefault();
                e.stopPropagation();
                const targetNoteId = href.startsWith('#note-')
                  ? href.replace('#note-', '')
                  : href.replace('note://', '');
                select(targetNoteId);
                return;
              }

              // 2. 삭제된 첨부파일 링크 클릭 시 404 차단
              if (
                target.getAttribute('data-deleted-attachment') === 'true' ||
                target.classList.contains('deleted-attachment-link') ||
                isDeletedAttachmentUrl(href, note.attachments, notes)
              ) {
                e.preventDefault();
                e.stopPropagation();
                alert('해당 첨부파일은 이미 삭제되어 다운로드하거나 열 수 없습니다.');
                return;
              }
            }

            // 3. BlockNote의 file 블록 컨테이너 직접 클릭 시 404 차단
            const fileBlock = (e.target as HTMLElement).closest('[data-content-type="file"]');
            if (fileBlock) {
              const innerLink = fileBlock.querySelector('a');
              const href = innerLink?.getAttribute('href') || fileBlock.getAttribute('data-url');
              if (
                fileBlock.getAttribute('data-deleted-attachment') === 'true' ||
                fileBlock.classList.contains('deleted-attachment-block') ||
                isDeletedAttachmentUrl(href, note.attachments, notes)
              ) {
                e.preventDefault();
                e.stopPropagation();
                alert('해당 첨부파일은 이미 삭제되어 다운로드하거나 열 수 없습니다.');
                return;
              }
            }
          }}
        >
          <BlockNoteView
            editor={editor}
            theme={scheme === 'dark' ? 'dark' : 'light'}
            slashMenu={false}
            onChange={() => updateContent(note.id, JSON.stringify(editor.document))}
          >
            {/* 노션 스타일 @ 멘션 통합 추천 메뉴 (서브노트, 부모노트, 다른 노트 검색, 날짜 파싱) */}
            <SuggestionMenuController
              triggerCharacter="@"
              getItems={async (query) =>
                getCombinedAtSuggestions(
                  query,
                  editor,
                  notes,
                  note,
                  projects,
                  () => handleOpenDatePicker()
                )
              }
            />
            {/* 노트 링크, 파일 첨부 및 날짜가 포함된 / 슬래시 명령어 메뉴 */}
            <SuggestionMenuController
              triggerCharacter="/"
              shouldOpen={(e) => !e.selection.$from.parent.type.isInGroup('tableContent')}
              getItems={async (query) => {
                const defaultSlashItems = getDefaultReactSlashMenuItems(editor);
                const dateSlashItems = getDateSlashMenuItems(editor, () => handleOpenDatePicker());
                const noteSlashItems = getNoteSlashMenuItems(
                  editor,
                  notes,
                  note,
                  handleAttachFromSlash
                );
                return filterSuggestionItems(
                  [...noteSlashItems, ...dateSlashItems, ...defaultSlashItems],
                  query
                );
              }}
            />
          </BlockNoteView>

          {/* 노트 하단 영역: 첨부파일 목록 및 백링크 목록 */}
          <div
            className="no-print"
            style={{
              marginTop: 48,
              paddingLeft: 54,
              paddingRight: 54,
              paddingBottom: 24,
              maxWidth: 900,
            }}
          >
            <Divider mb="md" color="var(--mantine-color-gray-2)" />
            <Stack gap="sm">
              {/* 첨부파일 관리 패널 (파일 없을 시 접힘) */}
              <NoteAttachmentsView
                note={note}
                onAttachmentDeleted={handleAttachmentDeleted}
              />

              {/* 이 노트를 참조(링크)하고 있는 백링크 목록 */}
              {backlinks.length > 0 && (
                <NoteBacklinksView
                  currentNote={note}
                  backlinks={backlinks}
                  allNotes={notes}
                  projects={projects}
                  onSelectNote={select}
                />
              )}
            </Stack>
          </div>
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
    select,
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
    unlockMasterPassword,
    openSecurityModal,
  } = useNotes();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [currentEditor, setCurrentEditor] = useState<AnyEditor | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // 에디터 내 빠른 잠금 해제 상태
  const [quickPassword, setQuickPassword] = useState('');
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);

  const handleQuickUnlock = async () => {
    if (!quickPassword) {
      setQuickError('마스터 비밀번호를 입력해주세요.');
      return;
    }
    setQuickError(null);
    setQuickLoading(true);
    try {
      const ok = await unlockMasterPassword(quickPassword);
      if (ok) {
        setQuickPassword('');
      } else {
        setQuickError('비밀번호가 올바르지 않습니다.');
      }
    } catch {
      setQuickError('잠금 해제 중 오류가 발생했습니다.');
    } finally {
      setQuickLoading(false);
    }
  };

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

  // 이 노트를 참조하는 백링크 목록 계산 (React Rules of Hooks 준수를 위해 early return 이전에 호출)
  const backlinks = useMemo(
    () => (selected ? findBacklinks(notes, selected.id) : []),
    [notes, selected?.id]
  );

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
  const pathNodes = getPathNodes(notes, selected.id);

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
          <Group gap={4} wrap="nowrap" style={{ overflow: 'hidden' }}>
            {currentProject && (
              <>
                <Text size="xs" c="dimmed">
                  {currentProject.icon} {currentProject.name}
                </Text>
                <Text size="xs" c="dimmed">
                  /
                </Text>
              </>
            )}
            {pathNodes.map((pNode, idx) => {
              const isCurrent = pNode.id === selected.id;
              return (
                <Group key={pNode.id} gap={4} wrap="nowrap">
                  {idx > 0 && (
                    <Text size="xs" c="dimmed">
                      /
                    </Text>
                  )}
                  {isCurrent ? (
                    <Text size="xs" fw={600} c="dimmed" truncate>
                      {pNode.title || '제목 없음'}
                    </Text>
                  ) : (
                    <Text
                      size="xs"
                      c="dimmed"
                      className="clickable-breadcrumb-item"
                      truncate
                      onClick={() => select(pNode.id)}
                    >
                      {pNode.title || '제목 없음'}
                    </Text>
                  )}
                </Group>
              );
            })}
          </Group>
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
          {new Date(selected.updatedAt).toLocaleString('ko-KR')} ·{' '}
          {CryptoService.isEncrypted(selected.content)
            ? '🔒 암호화됨'
            : `${noteBodyText(selected.content).length}자`}
        </Text>
      </div>

      {(!isUnlocked && (isMasterSet || CryptoService.isEncrypted(selected.content))) ||
      CryptoService.isEncrypted(selected.content) ? (
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
          <Stack align="center" gap="md" style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
            <ThemeIcon size={64} radius="xl" color="orange" variant="light">
              <IconLock size={36} />
            </ThemeIcon>
            <div>
              <Text fw={700} size="lg">
                노트 본문이 암호화되어 있습니다
              </Text>
              <Text size="sm" c="dimmed" mt={6}>
                안전한 보안을 위해 본문이 AES-GCM 256비트로 암호화되어 보호 중입니다.
                마스터 비밀번호를 입력하면 내용을 확인하고 편집할 수 있습니다.
              </Text>
            </div>

            <Group gap={8} style={{ width: '100%', maxWidth: 360 }} justify="center">
              <PasswordInput
                placeholder="마스터 비밀번호 입력"
                value={quickPassword}
                onChange={(e) => setQuickPassword(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleQuickUnlock();
                }}
                style={{ flex: 1 }}
                error={quickError}
                autoFocus
              />
              <Button
                color="orange"
                onClick={handleQuickUnlock}
                loading={quickLoading}
                leftSection={<IconLockOpen size={16} />}
              >
                잠금 해제
              </Button>
            </Group>

            <Button
              variant="subtle"
              size="xs"
              color="gray"
              onClick={openSecurityModal}
            >
              보안 설정 창 열기
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
            <BlockEditor
              key={editorKey}
              note={selected}
              backlinks={backlinks}
              onEditorInit={setCurrentEditor}
            />
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
