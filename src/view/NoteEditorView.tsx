// VIEW: BlockNote 블록 에디터 (표/코드/이미지 지원) + 히스토리 복원
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Menu,
  Paper,
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
  IconChevronDown,
  IconChevronUp,
  IconCode,
  IconCopy,
  IconDownload,
  IconEye,
  IconFileTypePdf,
  IconHash,
  IconHistory,
  IconLock,
  IconLockOpen,
  IconMarkdown,
  IconPalette,
  IconPin,
  IconPrinter,
  IconSearch,
  IconShare,
  IconStar,
  IconX,
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
import { EditorAiModal } from './EditorAiModal';
import { formatDateIso } from '../model/dateUtils';
import { getDateAtSuggestions, getDateSlashMenuItems } from '../model/dateSuggestions';
import { getCombinedAtSuggestions, getNoteSlashMenuItems } from '../model/noteSuggestions';
import { getAiSlashMenuItems } from '../model/aiSlashMenu';
import { AiActionType } from '../model/GeminiService';
import { SHORTCUTS } from '../model/shortcutUtils';
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
import {
  HashtagExtension,
  CodeShortcutsExtension,
  SearchHighlightExtension,
  searchHighlightPluginKey,
  setGlobalSearchTokens,
  getHashtagSuggestions,
} from '../model/editorExtensions';

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
    setActiveTag,
    supabaseConnected,
    supabaseConfig,
    openSupabaseModal,
    addAttachment,
    searchTokens,
    setSearch,
  } = useNotes();
  const scheme = useComputedColorScheme('light');
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

  // 에디터 자체 방출 콘텐츠와 외부 변경(히스토리 복원, 동기화 등)을 구분하기 위한 ref
  const lastEmittedRef = useRef<string>(note.content);
  const isApplyingExternalRef = useRef<boolean>(false);

  // note.id가 변경될 때 (노트 전환 시) lastEmittedRef 동기화
  useEffect(() => {
    lastEmittedRef.current = note.content;
  }, [note.id]);

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

  // 에디터 내 링크 클릭 핸들러: 내부 노트 링크는 브라우저를 열지 않고 내부 이동만 수행
  const handleLinkClick = useCallback(
    (event: MouseEvent) => {
      const target = (event.target as HTMLElement)?.closest('a');
      if (!target) return true;
      const href = target.getAttribute('href') || target.href || '';

      // 1. 내부 노트 이동 링크 (#note-, note://)
      if (href.includes('#note-') || href.startsWith('note://')) {
        event.preventDefault();
        event.stopPropagation();
        const match = href.match(/#note-([a-zA-Z0-9_-]+)/) || href.match(/^note:\/\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          select(match[1]);
        }
        return true;
      }

      // 2. 삭제된 첨부파일 링크 클릭 시 404 차단
      if (
        target.getAttribute('data-deleted-attachment') === 'true' ||
        target.classList.contains('deleted-attachment-link') ||
        isDeletedAttachmentUrl(href, note.attachments, notes)
      ) {
        event.preventDefault();
        event.stopPropagation();
        alert('해당 첨부파일은 이미 삭제되어 다운로드하거나 열 수 없습니다.');
        return true;
      }

      // 3. 외부 웹 링크
      if (href.startsWith('http://') || href.startsWith('https://')) {
        window.open(href, '_blank', 'noopener,noreferrer');
        return true;
      }

      return true;
    },
    [select, note.attachments, notes]
  );

  const extensions = useMemo(
    () => [
      createSyntaxExtension(),
      HashtagExtension(),
      CodeShortcutsExtension(),
      SearchHighlightExtension(),
    ],
    []
  );

  const editor = useCreateBlockNote(
    {
      schema: getAppSchema() as never,
      initialContent,
      uploadFile: handleUploadFile,
      extensions,
      links: {
        onClick: handleLinkClick,
      },
    },
    [note.id]
  );

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

  // 에디터 내 링크 클릭 시 ProseMirror 기본 동작 및 외부 브라우저 오픈 완벽 방지 (네이티브 캡처)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleNativeLinkCapture = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('a');
      if (!target) return;
      const href = target.getAttribute('href') || target.href || '';

      if (href.includes('#note-') || href.startsWith('note://')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const match = href.match(/#note-([a-zA-Z0-9_-]+)/) || href.match(/^note:\/\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          select(match[1]);
        }
      }
    };

    container.addEventListener('click', handleNativeLinkCapture, true);
    return () => {
      container.removeEventListener('click', handleNativeLinkCapture, true);
    };
  }, [select]);

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
        const json = JSON.stringify(editor.document);
        lastEmittedRef.current = json;
        updateContent(note.id, json);
      }
    },
    [editor, note.id, updateContent]
  );

  // 외부 변경(히스토리 복원, vault poll, supabase sync, onResetNote 등)을 에디터 문서에 반영
  useEffect(() => {
    // 에디터 자신이 직렬화해서 내보낸 내용과 동일하면 외부 변경이 아님
    if (note.content === lastEmittedRef.current) {
      return;
    }

    const blocks = parseBlocks(note.content);
    // 손상된 콘텐츠이거나 빈 배열/비정상 구조면 아무 것도 하지 않음 (기존 문서 보호)
    if (!blocks) {
      return;
    }

    const markedBlocks = markDeletedBlocks(blocks, note.attachments, notes);

    isApplyingExternalRef.current = true;
    try {
      editor.replaceBlocks(editor.document, markedBlocks as never);
      lastEmittedRef.current = note.content;
    } finally {
      // replaceBlocks로 유발된 동기 이벤트를 무시한 뒤, 비동기 틱까지 안전하게 가드 후 해제
      queueMicrotask(() => {
        isApplyingExternalRef.current = false;
      });
    }
  }, [note.content, note.attachments, notes, editor]);

  // 에디터 내부 변경 핸들러: 외부 변경 반영 중에는 호출을 건너뛰어 무한 루프 방지
  const handleEditorChange = useCallback(() => {
    if (isApplyingExternalRef.current) return;
    const json = JSON.stringify(editor.document);
    lastEmittedRef.current = json;
    updateContent(note.id, json);
  }, [editor, note.id, updateContent]);

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

  const [matchCount, setMatchCount] = useState(0);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  // 검색 토큰 변경 시 ProseMirror 플러그인에 동기화
  useEffect(() => {
    setGlobalSearchTokens(searchTokens);
    try {
      const view = (editor as any)._tiptapEditor?.view;
      if (view && !view.isDestroyed) {
        const tr = view.state.tr.setMeta(searchHighlightPluginKey, { tokens: searchTokens });
        view.dispatch(tr);
      }
    } catch {
      // 에디터 마운트 이전 등 무시
    }
  }, [searchTokens, editor]);

  // 검색 일치 항목 개수 및 활성 데코레이션 갱신 & 최초 일치 위치 스크롤
  useEffect(() => {
    if (!searchTokens || searchTokens.length === 0) {
      setMatchCount(0);
      setActiveMatchIndex(0);
      return;
    }

    const timer = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const elements = container.querySelectorAll<HTMLElement>('.bn-search-highlight');
      setMatchCount(elements.length);

      if (elements.length > 0) {
        elements.forEach((el, idx) => {
          if (idx === 0) {
            el.classList.add('bn-search-highlight-active');
          } else {
            el.classList.remove('bn-search-highlight-active');
          }
        });
        setActiveMatchIndex(0);

        // 사용자가 에디터 내부를 직접 타이핑 중이 아닌 경우 최초 일치 위치로 스크롤
        if (!container.contains(document.activeElement)) {
          elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        setActiveMatchIndex(0);
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [searchTokens, note.id, editor]);

  // 다음 일치 항목으로 이동
  const handleNextMatch = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const elements = container.querySelectorAll<HTMLElement>('.bn-search-highlight');
    if (elements.length === 0) return;

    elements.forEach((el) => el.classList.remove('bn-search-highlight-active'));
    const nextIdx = (activeMatchIndex + 1) % elements.length;
    setActiveMatchIndex(nextIdx);
    const target = elements[nextIdx];
    if (target) {
      target.classList.add('bn-search-highlight-active');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeMatchIndex]);

  // 이전 일치 항목으로 이동
  const handlePrevMatch = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const elements = container.querySelectorAll<HTMLElement>('.bn-search-highlight');
    if (elements.length === 0) return;

    elements.forEach((el) => el.classList.remove('bn-search-highlight-active'));
    const prevIdx = (activeMatchIndex - 1 + elements.length) % elements.length;
    setActiveMatchIndex(prevIdx);
    const target = elements[prevIdx];
    if (target) {
      target.classList.add('bn-search-highlight-active');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeMatchIndex]);

  // 키보드 단축키 (F3 / Cmd+G / Ctrl+G: 다음, Shift+F3 / Cmd+Shift+G: 이전, Esc: 닫기)
  useEffect(() => {
    if (!searchTokens || searchTokens.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'F3' && !e.shiftKey) ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g' && !e.shiftKey)
      ) {
        e.preventDefault();
        handleNextMatch();
      } else if (
        (e.key === 'F3' && e.shiftKey) ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g' && e.shiftKey)
      ) {
        e.preventDefault();
        handlePrevMatch();
      } else if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey) {
        setSearch('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchTokens, handleNextMatch, handlePrevMatch, setSearch]);

  const [aiModalOpened, setAiModalOpened] = useState(false);
  const [aiModalAction, setAiModalAction] = useState<AiActionType>('summarize');
  const [currentMarkdownForAi, setCurrentMarkdownForAi] = useState('');

  const handleTriggerAi = useCallback(
    (action: AiActionType) => {
      if (!editor) return;
      try {
        const md = editor.blocksToMarkdownLossy(editor.document);
        setCurrentMarkdownForAi(md);
      } catch {
        setCurrentMarkdownForAi('');
      }
      setAiModalAction(action);
      setAiModalOpened(true);
    },
    [editor]
  );

  const handleApplyAiResult = useCallback(
    async (resultMarkdown: string, placement: 'top' | 'bottom' | 'replace') => {
      if (!editor) return;
      try {
        const newBlocks = await editor.tryParseMarkdownToBlocks(resultMarkdown);
        if (!Array.isArray(newBlocks) || newBlocks.length === 0) return;

        if (placement === 'replace') {
          editor.replaceBlocks(editor.document, newBlocks as never);
        } else if (placement === 'top') {
          const firstBlock = editor.document[0];
          if (firstBlock) {
            editor.insertBlocks(newBlocks as never, firstBlock, 'before');
          } else {
            editor.replaceBlocks(editor.document, newBlocks as never);
          }
        } else if (placement === 'bottom') {
          const lastBlock = editor.document[editor.document.length - 1];
          if (lastBlock) {
            editor.insertBlocks(newBlocks as never, lastBlock, 'after');
          } else {
            editor.replaceBlocks(editor.document, newBlocks as never);
          }
        }
        editor.focus();
      } catch (err) {
        console.error('Failed to apply AI result to blocks:', err);
      }
    },
    [editor]
  );

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
          onTriggerAi={handleTriggerAi}
        />
      </div>

      {/* 본문 검색 키워드 하이라이트 네비게이터 바 */}
      {searchTokens.length > 0 && (
        <Paper
          className="no-print"
          px="sm"
          py={6}
          radius="sm"
          withBorder
          style={{
            backgroundColor: scheme === 'dark' ? 'rgba(245, 159, 0, 0.12)' : 'rgba(255, 249, 219, 0.95)',
            borderColor: scheme === 'dark' ? 'rgba(245, 159, 0, 0.35)' : 'rgba(245, 159, 0, 0.4)',
            marginBottom: 2,
          }}
        >
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap="xs" wrap="nowrap" style={{ overflow: 'hidden' }}>
              <IconSearch size={15} color="var(--mantine-color-yellow-6)" />
              <Text size="xs" fw={700} c={scheme === 'dark' ? 'yellow.2' : 'dark.6'}>
                본문 검색어 강조:
              </Text>
              <Group gap={4} wrap="nowrap" style={{ overflow: 'hidden' }}>
                {searchTokens.map((t, i) => (
                  <Badge key={i} size="xs" variant="filled" color="yellow">
                    {t}
                  </Badge>
                ))}
              </Group>
              <Badge
                size="xs"
                variant="light"
                color={matchCount > 0 ? 'yellow' : 'gray'}
              >
                {matchCount > 0
                  ? `본문 일치 ${activeMatchIndex + 1} / ${matchCount}건`
                  : '본문 일치 없음 (제목/태그 등 일치)'}
              </Badge>
            </Group>

            <Group gap={4} wrap="nowrap">
              {matchCount > 0 && (
                <>
                  <Tooltip label={`이전 일치 위치로 이동 (${SHORTCUTS.findPrev})`}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="yellow"
                      onClick={handlePrevMatch}
                      aria-label="이전 일치 위치"
                    >
                      <IconChevronUp size={15} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={`다음 일치 위치로 이동 (${SHORTCUTS.findNext})`}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="yellow"
                      onClick={handleNextMatch}
                      aria-label="다음 일치 위치"
                    >
                      <IconChevronDown size={15} />
                    </ActionIcon>
                  </Tooltip>
                </>
              )}
              <Tooltip label="검색 하이라이트 닫기 (Esc)">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={() => setSearch('')}
                  aria-label="검색 하이라이트 닫기"
                >
                  <IconX size={15} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Paper>
      )}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--mantine-color-body)',
        }}
      >
        {/* 우측 상단 고정 목차 (TOC) */}
        <NoteTableOfContents editor={editor} scrollContainerRef={scrollContainerRef} />

        <div
          ref={scrollContainerRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            paddingBottom: 280,
            backgroundColor: 'var(--mantine-color-body)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              editor.focus();
            }
          }}
          onClickCapture={(e) => {
            const target = (e.target as HTMLElement).closest('a');
            if (target) {
              const href = target.getAttribute('href') || target.href || '';
              // 1. 노트 간 이동 링크 (#note-, note://)
              if (href && (href.includes('#note-') || href.startsWith('note://'))) {
                e.preventDefault();
                e.stopPropagation();
                const match = href.match(/#note-([a-zA-Z0-9_-]+)/) || href.match(/^note:\/\/([a-zA-Z0-9_-]+)/);
                if (match && match[1]) {
                  select(match[1]);
                }
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

            // 4. 본문 내 해시태그(#태그) 칩 클릭 시 해당 태그로 즉시 필터링
            const hashtagBadge = (e.target as HTMLElement).closest('.bn-hashtag-badge');
            if (hashtagBadge) {
              const tag = hashtagBadge.getAttribute('data-tag');
              if (tag) {
                e.preventDefault();
                e.stopPropagation();
                setActiveTag(tag);
                return;
              }
            }
          }}
        >
          <BlockNoteView
            editor={editor}
            theme={scheme === 'dark' ? 'dark' : 'light'}
            slashMenu={false}
            onChange={handleEditorChange}
          >
            {/* 해시태그(#) 입력 시 실시간 추천 및 자동완성 메뉴 */}
            <SuggestionMenuController
              triggerCharacter="#"
              getItems={async (query) =>
                getHashtagSuggestions(query, editor, notes, note)
              }
            />
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
            {/* 노트 링크, 파일 첨부, AI 및 날짜가 포함된 / 슬래시 명령어 메뉴 */}
            <SuggestionMenuController
              triggerCharacter="/"
              shouldOpen={(e) => !e.selection.$from.parent.type.isInGroup('tableContent')}
              getItems={async (query) => {
                const aiSlashItems = getAiSlashMenuItems(editor, handleTriggerAi);
                const defaultSlashItems = getDefaultReactSlashMenuItems(editor);
                const dateSlashItems = getDateSlashMenuItems(editor, () => handleOpenDatePicker());
                const noteSlashItems = getNoteSlashMenuItems(
                  editor,
                  notes,
                  note,
                  handleAttachFromSlash
                );
                return filterSuggestionItems(
                  [...aiSlashItems, ...noteSlashItems, ...dateSlashItems, ...defaultSlashItems],
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

      <EditorAiModal
        opened={aiModalOpened}
        onClose={() => setAiModalOpened(false)}
        initialAction={aiModalAction}
        currentContentMarkdown={currentMarkdownForAi}
        onApplyResult={handleApplyAiResult}
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
    storageError,
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

  // 마스터 비밀번호로 잠긴 상태이거나 본문이 암호화되어 있는 경우 메타데이터 편집 비활성화
  const isNoteLocked =
    (!isUnlocked && (isMasterSet || CryptoService.isEncrypted(selected.content))) ||
    CryptoService.isEncrypted(selected.content);

  // ready 이후에만 렌더되므로 content는 블록 JSON이 보장됨 (손상 시 문단 폴백)
  const editorKey = `${selected.id}`;

  return (
    <Stack
      gap="xs"
      p="md"
      h="100%"
      className="note-editor-stack"
      style={{
        overflow: 'hidden',
        backgroundColor: 'var(--mantine-color-body)',
        color: 'var(--mantine-color-text)',
      }}
    >
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
            disabled={isNoteLocked}
            placeholder={isNoteLocked ? '잠긴 노트 (마스터 비밀번호로 잠금 해제 필요)' : '제목 없음 (본문에 #태그 가능)'}
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
            <Tooltip label={isNoteLocked ? '잠긴 상태에서는 인쇄할 수 없습니다' : `인쇄 및 미리보기 (${SHORTCUTS.print})`}>
              <ActionIcon
                size="lg"
                variant="light"
                color="gray"
                disabled={isNoteLocked}
                onClick={() => setPrintPreviewOpen(true)}
                aria-label="인쇄 및 미리보기"
              >
                <IconPrinter size={17} />
              </ActionIcon>
            </Tooltip>

            {/* PDF 내보내기 버튼 */}
            <Tooltip label={isNoteLocked ? '잠긴 상태에서는 내보낼 수 없습니다' : 'PDF로 내보내기'}>
              <ActionIcon
                size="lg"
                variant="light"
                color="red"
                disabled={isNoteLocked}
                onClick={handleExportPdf}
                aria-label="PDF로 내보내기"
              >
                <IconFileTypePdf size={17} />
              </ActionIcon>
            </Tooltip>

            {/* 공유 및 내보내기 메뉴 */}
            <Menu position="bottom-end" withArrow shadow="md" withinPortal disabled={isNoteLocked}>
              <Menu.Target>
                <Tooltip label={isNoteLocked ? '잠긴 상태에서는 공유할 수 없습니다' : '공유 및 내보내기'}>
                  <ActionIcon size="lg" variant="light" color="blue" disabled={isNoteLocked} aria-label="공유 및 내보내기">
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
            <Menu position="bottom-end" withArrow shadow="md" withinPortal disabled={isNoteLocked}>
              <Menu.Target>
                <Tooltip label={isNoteLocked ? '잠긴 상태에서는 색상을 변경할 수 없습니다' : `노트 색상: ${colorCfg.name}`}>
                  <ActionIcon
                    size="lg"
                    variant="subtle"
                    disabled={isNoteLocked}
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, padding: '6px 8px', minWidth: 260 }}>
                  {Object.values(PASTEL_COLORS).map((c) => {
                    const isCurrent = (selected.color || 'blue') === c.id;
                    return (
                      <Tooltip key={c.id} label={c.name} position="top" withArrow>
                        <ActionIcon
                          size="sm"
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
            <ReminderPopover note={selected} disabled={isNoteLocked} />

            <Button
              size="xs"
              variant="light"
              color="gray"
              disabled={isNoteLocked}
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
            <Tooltip label={isNoteLocked ? '잠긴 상태에서는 변경할 수 없습니다' : (selected.pinned ? '핀 해제' : '상단 고정')}>
              <ActionIcon
                size="lg"
                variant={selected.pinned ? 'filled' : 'light'}
                color="blue"
                disabled={isNoteLocked}
                onClick={() => togglePin(selected.id)}
                aria-label="핀"
              >
                <IconPin size={17} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={isNoteLocked ? '잠긴 상태에서는 변경할 수 없습니다' : (selected.favorite ? '즐겨찾기 해제' : '즐겨찾기 등록')}>
              <ActionIcon
                size="lg"
                variant={selected.favorite ? 'filled' : 'light'}
                color="yellow"
                disabled={isNoteLocked}
                onClick={() => toggleFavorite(selected.id)}
                aria-label="즐겨찾기"
              >
                <IconStar size={17} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Group gap={6} mb={6} align="center">
          <ThemeIcon size={20} variant="subtle" color="blue" radius="sm">
            <IconHash size={15} />
          </ThemeIcon>
          {selected.tags.length === 0 ? (
            <Text size="xs" c="dimmed">
              태그 없음 — 본문에 <Text span fw={600} c="blue.6">#태그명</Text>을 입력하면 실시간으로 감지 및 분류됩니다.
            </Text>
          ) : (
            selected.tags.map((t) => (
              <Tooltip key={t} label={`#${t} 태그로 목록 필터링`}>
                <Badge
                  key={t}
                  variant="light"
                  color="blue"
                  size="sm"
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    fontWeight: 600,
                  }}
                  onClick={() => setActiveTag(t)}
                >
                  #{t}
                </Badge>
              </Tooltip>
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
        {storageError && (
          <Badge
            size="md"
            color="red"
            variant="filled"
            fullWidth
            style={{
              borderRadius: 6,
              padding: '8px 12px',
              height: 'auto',
              whiteSpace: 'normal',
              textAlign: 'left',
              marginBottom: 8,
            }}
          >
            ⚠️ {storageError}
          </Badge>
        )}
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
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--mantine-color-body)',
          }}
        >
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
