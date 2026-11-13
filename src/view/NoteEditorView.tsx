import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Chip,
  Divider,
  Drawer,
  Group,
  Menu,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Tooltip,
  useComputedColorScheme,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconBell,
  IconCheck,
  IconChecklist,
  IconChevronDown,
  IconChevronUp,
  IconCloudUpload,
  IconCode,
  IconCopy,
  IconDownload,
  IconEye,
  IconFileTypePdf,
  IconGitCompare,
  IconHash,
  IconHistory,
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
import {
  TODO_PROJECT_ID,
  TODO_GROUPS,
  GROUP_ID_TO_STATUS,
  extractChecklistFromBlocks,
  isSystemGroupNote,
  getEffectiveTodoStatus,
  resolveSourceNoteId,
} from '../model/TodoService';
import { TodoStatus } from '../model/Note';
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
  NoteSnapshot,
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
import { hasLegacyEncryptedText } from '../model/LegacyDecryptor';
import { ErrorBoundary } from './ErrorBoundary';
import { EditorToolbar } from './EditorToolbar';
import { ReminderPopover } from './ReminderPopover';
import { DatePickerModal } from './DatePickerModal';
import { PrintPreviewModal } from './PrintPreviewModal';
import { InlineHistoryDiffView } from './InlineHistoryDiffView';
import { NoteTableOfContents } from './NoteTableOfContents';
import { MobileNoteHeader, type NoteShareActions } from './MobileNoteHeader';
import { KeyboardAccessoryBar } from './mobile/KeyboardAccessoryBar';
import { ChecklistTodoOverlay } from './ChecklistTodoOverlay';
import { EditorAiModal } from './EditorAiModal';
import { formatDateIso } from '../model/dateUtils';
import { getDueDateBadgeInfo, toIsoDateLocal } from '../model/PlannerService';
import { getDateAtSuggestions, getDateSlashMenuItems } from '../model/dateSuggestions';
import { getCombinedAtSuggestions, getNoteSlashMenuItems } from '../model/noteSuggestions';
import { getAiSlashMenuItems } from '../model/aiSlashMenu';
import { AiActionType } from '../model/GeminiService';
import { SHORTCUTS } from '../model/shortcutUtils';
import { NoteBacklinksView } from './NoteBacklinksView';
import { NoteAttachmentsView } from './NoteAttachmentsView';
import { GoogleDriveService } from '../model/GoogleDriveService';
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
  compact = false,
  embedded = false,
  onScrollContainerReady,
}: {
  note: Note;
  backlinks: Note[];
  /** 다른 화면(오늘 화면 등) 안에 끼워 넣을 때: 첨부·백링크 하단 패널, 플로팅 목차 숨김 */
  embedded?: boolean;
  onEditorInit?: (editor: AnyEditor) => void;
  /** 모바일: 서식 툴바는 편집 중에만 키보드 위에 표시, 플로팅 목차 숨김 */
  compact?: boolean;
  /** 본문 스크롤 컨테이너를 상위(헤더 숨김·목차 시트)에 전달 */
  onScrollContainerReady?: (el: HTMLDivElement | null) => void;
}) {
  const {
    updateContent,
    select,
    notes,
    projects,
    setActiveTag,
    googleConnected,
    openGoogleSyncModal,
    addAttachment,
    searchTokens,
    setSearch,
    changeTodoStatus,
    createTodosFromChecklist,
    updateTaskSchedule,
    openPlannerView,
    openNote,
  } = useNotes();
  const scheme = useComputedColorScheme('light');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerInitialDate, setDatePickerInitialDate] = useState<Date | undefined>(undefined);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const attachScrollContainer = useCallback(
    (el: HTMLDivElement | null) => {
      scrollContainerRef.current = el;
      setScrollEl(el);
      onScrollContainerReady?.(el);
    },
    [onScrollContainerReady]
  );
  // 체크리스트 항목 하나를 할일로 등록 (최신 본문을 먼저 저장해 블록 ID 일치 보장)
  const linkChecklistBlock = useCallback(
    (blockId: string) => {
      const blocks = editor.document;
      const item = extractChecklistFromBlocks(blocks).find((it) => it.id === blockId);
      if (!item) return;
      const latestJson = JSON.stringify(blocks);
      lastEmittedRef.current = latestJson;
      updateContent(note.id, latestJson);
      createTodosFromChecklist({ ...note, content: latestJson }, [item]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note, updateContent, createTodosFromChecklist]
  );
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
  const notesRef = useRef<Note[]>(notes);
  notesRef.current = notes;

  // note.id가 변경될 때 (노트 전환 시) lastEmittedRef 동기화
  useEffect(() => {
    lastEmittedRef.current = note.content;
  }, [note.id]);

  // Google Drive 스토리지 연동 여부에 따른 파일 업로드 핸들러
  const handleUploadFile = useCallback(
    async (file: File): Promise<string> => {
      // 1. Google Drive 연동 상태이면 클라우드 스토리지로 업로드
      if (googleConnected) {
        try {
          const att = await GoogleDriveService.uploadAttachment(note.id, file);
          addAttachment(note.id, att);
          return att.url;
        } catch (err) {
          console.error('Google Drive 스토리지 업로드 실패:', err);
          if (file.type.startsWith('image/')) {
            return uploadFileAsDataUrl(file);
          }
          alert(`스토리지 업로드 실패: ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        }
      }

      // 2. Google Drive 미연동 상태
      if (file.type.startsWith('image/')) {
        // 이미지는 로컬 dataURL로 삽입 허용
        return uploadFileAsDataUrl(file);
      }

      // 일반 파일은 업로드 차단 및 설정 모달 유도
      alert('파일 업로드 기능은 Google Drive가 연동된 상태에서 사용할 수 있습니다. Google Drive 설정을 완료해주세요.');
      openGoogleSyncModal();
      throw new Error('Google Drive 미연동으로 파일 업로드 제한됨');
    },
    [googleConnected, note.id, addAttachment, openGoogleSyncModal]
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

  const handleResolveFileUrl = useCallback(
    async (url: string) => {
      if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url;
      const matchedAtt = (note.attachments || []).find(
        (a) => a.url === url || (a.storagePath && url.includes(a.storagePath))
      );
      if (matchedAtt && matchedAtt.type && !matchedAtt.type.startsWith('image/') && !url.includes('#image')) {
        return url;
      }
      return GoogleDriveService.resolveDriveFileUrl(url);
    },
    [note.attachments]
  );

  const editor = useCreateBlockNote(
    {
      schema: getAppSchema() as never,
      initialContent,
      uploadFile: handleUploadFile,
      resolveFileUrl: handleResolveFileUrl,
      extensions,
      links: {
        onClick: handleLinkClick,
      },
    },
    [note.id]
  );

  // 첨부파일/이미지를 본문에 삽입 (이미지는 노트에서 바로 볼 수 있도록 image 블록, 일반 파일은 클릭 가능한 링크로 표시)
  const insertAttachmentBlockOrLink = useCallback(
    (att: NoteAttachment) => {
      try {
        const cursorBlock = editor.getTextCursorPosition()?.block || editor.document[editor.document.length - 1];
        const isImage =
          att.type?.startsWith('image/') ||
          /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(att.name || '');

        if (isImage) {
          editor.insertBlocks(
            [
              {
                type: 'image',
                props: {
                  url: att.url,
                  name: att.name,
                  caption: '',
                },
              } as never,
            ],
            cursorBlock,
            'after'
          );
        } else {
          editor.insertBlocks(
            [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'link',
                    href: att.url,
                    content: `📎 ${att.name}`,
                  },
                ],
              } as never,
            ],
            cursorBlock,
            'after'
          );
        }
        const json = JSON.stringify(editor.document);
        lastEmittedRef.current = json;
        updateContent(note.id, json);
      } catch (err) {
        console.warn('첨부파일 본문 삽입 실패:', err);
      }
    },
    [editor, note.id, updateContent]
  );

  // / 슬래시 메뉴에서 파일 첨부 선택 시
  const handleAttachFromSlash = useCallback(() => {
    if (!googleConnected) {
      alert('파일 첨부 기능은 Google Drive가 연동된 상태에서 사용할 수 있습니다. Google Drive 설정을 완료해주세요.');
      openGoogleSyncModal();
      return;
    }
    hiddenFileInputRef.current?.click();
  }, [googleConnected, openGoogleSyncModal]);

  // 숨겨진 input에서 파일 선택 시: 이미지는 에디터에서 바로 보이도록 image 블록, 일반 첨부파일은 링크로 삽입
  const handleFilePickedFromInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const url = await handleUploadFile(file);
        const isImage =
          file.type.startsWith('image/') ||
          /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name || '');
        const cursorBlock = editor.getTextCursorPosition()?.block || editor.document[editor.document.length - 1];
        if (isImage) {
          editor.insertBlocks(
            [
              {
                type: 'image',
                props: {
                  url,
                  name: file.name,
                  caption: '',
                },
              } as never,
            ],
            cursorBlock,
            'after'
          );
        } else {
          editor.insertBlocks(
            [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'link',
                    href: url,
                    content: `📎 ${file.name}`,
                  },
                ],
              } as never,
            ],
            cursorBlock,
            'after'
          );
        }
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

  // 외부 변경(히스토리 복원, vault poll, google drive sync, onResetNote 등)을 에디터 문서에 반영
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

    const markedBlocks = markDeletedBlocks(blocks, note.attachments, notesRef.current);

    // 백그라운드 동기화 등으로 replaceBlocks가 실행될 때 에디터가 포커스를 강제로 가로채지 않도록 이전 포커스 상태 보존
    const prevActive = document.activeElement as HTMLElement | null;
    const wasEditorFocused = scrollContainerRef.current?.contains(prevActive) ?? false;

    isApplyingExternalRef.current = true;
    try {
      editor.replaceBlocks(editor.document, markedBlocks as never);
      lastEmittedRef.current = note.content;
      if (!wasEditorFocused) {
        if (
          prevActive &&
          prevActive !== document.body &&
          prevActive !== document.documentElement &&
          typeof prevActive.focus === 'function'
        ) {
          prevActive.focus({ preventScroll: true });
        } else {
          const currentActive = document.activeElement as HTMLElement | null;
          if (currentActive && scrollContainerRef.current?.contains(currentActive)) {
            currentActive.blur();
          }
        }
      }
    } finally {
      // replaceBlocks로 유발된 동기 이벤트를 무시한 뒤, 비동기 틱까지 안전하게 가드 후 해제
      queueMicrotask(() => {
        isApplyingExternalRef.current = false;
      });
    }
  }, [note.content, note.attachments, editor]);

  // 에디터 내부 변경 핸들러: 외부 변경 반영 중에는 호출을 건너뛰어 무한 루프 방지
  const handleEditorChange = useCallback(() => {
    if (isApplyingExternalRef.current) return;
    const json = JSON.stringify(editor.document);
    if (json === lastEmittedRef.current || json === note.content) return;
    lastEmittedRef.current = json;
    updateContent(note.id, json);
  }, [editor, note.id, note.content, updateContent]);

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

      {compact ? (
        <KeyboardAccessoryBar scope={scrollEl}>
          <EditorToolbar
            variant="accessory"
            editor={editor}
            onOpenDatePicker={() => handleOpenDatePicker()}
            onInsertToday={handleInsertToday}
            onTriggerAi={handleTriggerAi}
          />
        </KeyboardAccessoryBar>
      ) : (
        <div className="no-print">
          <EditorToolbar
            editor={editor}
            onOpenDatePicker={() => handleOpenDatePicker()}
            onInsertToday={handleInsertToday}
            onTriggerAi={handleTriggerAi}
          />
        </div>
      )}

      {/* 할일 항목인 경우 상단 원클릭 상태 전환 + 플래너 일정(Start Date / Working Days / Due Date 09:00 알림) 통합 바 */}
      {note.projectId === TODO_PROJECT_ID && !note.systemGroupType && (
        <Paper
          className="no-print"
          px="md"
          py={6}
          radius="sm"
          withBorder
          style={{
            backgroundColor: scheme === 'dark' ? 'rgba(34, 139, 230, 0.12)' : 'rgba(231, 245, 255, 0.75)',
            borderColor: scheme === 'dark' ? 'rgba(34, 139, 230, 0.3)' : 'rgba(51, 154, 240, 0.35)',
            marginBottom: 2,
          }}
        >
          <Stack gap={6}>
            <Group justify="space-between" align="center" wrap="wrap">
              <Group gap="xs" wrap="wrap">
                <Badge color="blue" variant="filled" size="sm">
                  할일 항목
                </Badge>
                <Text size="xs" fw={600} c="dimmed">
                  상태 변경:
                </Text>
                <Group gap={6}>
                  {TODO_GROUPS.map((g) => {
                    const currentStatus: TodoStatus = getEffectiveTodoStatus(note, notes);
                    const isCurrent = currentStatus === g.status;
                    return (
                      <Chip
                        key={g.status}
                        size="xs"
                        checked={isCurrent}
                        color={g.color}
                        variant={isCurrent ? 'filled' : 'outline'}
                        onChange={() => changeTodoStatus(note.id, g.status)}
                      >
                        {g.title}
                      </Chip>
                    );
                  })}
                </Group>
              </Group>

              <Group gap={6}>
                <Button
                  size="compact-xs"
                  variant="light"
                  color="orange"
                  onClick={() => openPlannerView()}
                >
                  📊 플래너 간트차트 열기
                </Button>
                {resolveSourceNoteId(note) && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="blue"
                    leftSection={<IconArrowLeft size={13} />}
                    onClick={() => select(resolveSourceNoteId(note)!)}
                  >
                    원본 노트로 이동
                  </Button>
                )}
              </Group>
            </Group>

            {/* 플래너 일정(Start Date · Working Day 소요일 · Due Date 09:00 자동 알림) 빠른 설정 줄 */}
            {(() => {
              const effStatus = getEffectiveTodoStatus(note, notes);
              const startStr =
                note.todoMeta?.startDate || toIsoDateLocal(new Date(note.createdAt || Date.now()));
              const dueStr = note.todoMeta?.dueDate || startStr;
              const durDays = note.todoMeta?.durationDays || 1;
              const dBadge = getDueDateBadgeInfo(note.todoMeta?.dueDate, effStatus);

              return (
                <Group gap="xs" wrap="wrap" align="center">
                  <Text size="11.5px" fw={600} c="dimmed">
                    🗓️ 일정(Schedule):
                  </Text>
                  <Group gap={4} wrap="nowrap">
                    <Text size="11px" c="dimmed">
                      시작일
                    </Text>
                    <input
                      type="date"
                      value={startStr}
                      onChange={(e) => {
                        if (!e.currentTarget.value) return;
                        updateTaskSchedule(note.id, { startDate: e.currentTarget.value });
                      }}
                      style={{
                        fontSize: 11.5,
                        padding: '1px 5px',
                        borderRadius: 4,
                        border: '1px solid var(--bn-border-subtle)',
                        backgroundColor: 'var(--mantine-color-body)',
                        color: 'var(--mantine-color-text)',
                      }}
                    />
                  </Group>

                  <Group gap={4} wrap="nowrap">
                    <Text size="11px" c="dimmed">
                      소요일
                    </Text>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={durDays}
                      onChange={(e) => {
                        const v = Math.max(1, Number(e.currentTarget.value) || 1);
                        updateTaskSchedule(note.id, { durationDays: v });
                      }}
                      style={{
                        width: 48,
                        fontSize: 11.5,
                        textAlign: 'center',
                        padding: '1px 4px',
                        borderRadius: 4,
                        border: '1px solid var(--bn-border-subtle)',
                        backgroundColor: 'var(--mantine-color-body)',
                        color: 'var(--mantine-color-text)',
                      }}
                    />
                    <Text size="11px" c="dimmed">
                      일
                    </Text>
                  </Group>

                  <Group gap={4} wrap="nowrap">
                    <Text size="11px" fw={700} c="dimmed">
                      Due Date (09시 알림):
                    </Text>
                    <input
                      type="date"
                      value={dueStr}
                      onChange={(e) => {
                        if (!e.currentTarget.value) return;
                        updateTaskSchedule(note.id, { dueDate: e.currentTarget.value });
                      }}
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: 4,
                        border: '1px solid var(--bn-border-subtle)',
                        backgroundColor: 'var(--mantine-color-body)',
                        color: 'var(--mantine-color-text)',
                      }}
                    />
                    {dBadge && (
                      <Badge
                        size="xs"
                        color={dBadge.color}
                        variant={dBadge.isOverdue ? 'filled' : 'light'}
                      >
                        {dBadge.label}
                      </Badge>
                    )}
                  </Group>
                </Group>
              );
            })()}
          </Stack>
        </Paper>
      )}

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
        className="bn-editor-area"
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bn-surface-editor)',
        }}
      >
        {/* 우측 상단 목차: 얇은 선 막대 + 펼쳐지는 제목 목록 */}
        {!embedded && <NoteTableOfContents editor={editor} scrollContainerRef={scrollContainerRef} />}

        <div
          ref={attachScrollContainer}
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            paddingBottom: embedded ? 24 : 280,
            backgroundColor: 'var(--bn-surface-editor)',
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            // 내부 링크, 버튼, 입력창, select(코드블록 언어 선택), 툴바, 파일 블록, 태그 뱃지, 하단 패널 등이 아닌 빈 공간/패딩 클릭 시에만 쓰기모드로 포커스
            if (
              !target.closest(
                'a, button, input, textarea, select, option, .bn-code-toolbar, [data-content-type="file"], .bn-hashtag-badge, .note-bottom-panels, .backlinks-container'
              )
            ) {
              try {
                editor.focus();
              } catch { }
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
          {/* 체크리스트 항목별 할일 연결 배지 / "+ 할일로" */}
          <ChecklistTodoOverlay
            editor={editor}
            noteId={note.id}
            container={scrollEl}
            onLink={linkChecklistBlock}
            onOpenTodo={openNote}
          />
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

                const todoExportSlashItem = {
                  title: '할일 프로젝트로 내보내기',
                  subtext: '현재 노트의 체크리스트 항목들을 할일관리 프로젝트(To Do)로 등록합니다',
                  badge: '할일',
                  aliases: ['할일등록', 'todo-export', '할일', 'todo', '체크리스트', 'actions'],
                  group: '할일 관리',
                  icon: <IconChecklist size={18} color="var(--mantine-color-blue-5)" />,
                  onItemClick: () => {
                    const blocks = editor.document;
                    const items = extractChecklistFromBlocks(blocks);
                    if (items.length === 0) {
                      alert('현재 노트에 체크리스트(- [ ] 또는 체크박스) 항목이 없습니다.');
                      return;
                    }
                    const latestJson = JSON.stringify(blocks);
                    lastEmittedRef.current = latestJson;
                    updateContent(note.id, latestJson);
                    const { createdCount, updatedCount, duplicateCount } = createTodosFromChecklist(
                      { ...note, content: latestJson },
                      items
                    );
                    let msg = '';
                    if (createdCount > 0 && updatedCount > 0) {
                      msg = `총 ${createdCount}개의 새 할일이 등록되고, 기존 ${updatedCount}개의 할일이 최신 내용으로 업데이트되었습니다!`;
                    } else if (createdCount > 0) {
                      msg = `총 ${createdCount}개의 할일이 '할일관리' 프로젝트에 등록되었습니다!`;
                    } else if (updatedCount > 0) {
                      msg = `이미 등록된 ${updatedCount}개의 할일이 최신 하위 내용으로 업데이트되었습니다!`;
                    } else {
                      msg = `모든 할일(${duplicateCount}개)이 이미 최신 상태로 등록되어 있습니다.`;
                    }
                    if (duplicateCount > 0 && (createdCount > 0 || updatedCount > 0)) {
                      msg += ` (변경 없는 기존 ${duplicateCount}개 유지)`;
                    }
                    alert(msg);
                  },
                };

                return filterSuggestionItems(
                  [
                    ...aiSlashItems,
                    todoExportSlashItem,
                    ...noteSlashItems,
                    ...dateSlashItems,
                    ...defaultSlashItems,
                  ],
                  query
                );
              }}
            />
          </BlockNoteView>

          {/* 노트 하단 영역: 첨부파일 목록 및 백링크 목록 */}
          {!embedded && (
          <div
            className="no-print note-bottom-panels"
            onClick={(e) => e.stopPropagation()}
            style={{
              marginTop: 48,
              paddingLeft: 54,
              paddingRight: 54,
              paddingBottom: 24,
              maxWidth: 900,
            }}
          >
            <Divider mb="md" color="var(--bn-border-subtle)" />
            <Stack gap="sm">
              {/* 첨부파일 관리 패널 (파일 없을 시 접힘) */}
              <NoteAttachmentsView
                note={note}
                onAttachmentDeleted={handleAttachmentDeleted}
                onAttachmentUploaded={insertAttachmentBlockOrLink}
                onInsertAttachmentToNote={insertAttachmentBlockOrLink}
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
          )}
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
        currentNote={note}
        onApplyResult={handleApplyAiResult}
      />
    </Stack>
  );
}

/** 다른 화면 안에서 노트 본문만 편집하는 에디터 (하단 패널 없음, 선택 노트와 무관하게 noteId로 지정) */
export function EmbeddedNoteEditor({ noteId }: { noteId: string }) {
  const { notes } = useNotes();
  const note = notes.find((n) => n.id === noteId);
  if (!note) return null;
  return (
    <ErrorBoundary title="노트를 표시하지 못했습니다">
      <BlockEditor key={note.id} note={note} backlinks={[]} embedded />
    </ErrorBoundary>
  );
}

export function NoteEditorView({
  onBackToList,
  isCompact = false,
}: {
  onBackToList?: () => void;
  isCompact?: boolean;
} = {}) {
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
    storageError,
    externalChange,
    acceptExternalChange,
    dismissExternalChange,
    hasEncryptedNotes,
    decryptAllLegacyNotes,
  } = useNotes();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [diffTargetSnapshot, setDiffTargetSnapshot] = useState<{
    selected: NoteSnapshot;
    previous: NoteSnapshot | null;
  } | null>(null);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [currentEditor, setCurrentEditor] = useState<AnyEditor | null>(null);
  const [editorScrollEl, setEditorScrollEl] = useState<HTMLDivElement | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const [recoveryPw, setRecoveryPw] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const handleRecoverNotes = async () => {
    if (!recoveryPw) {
      setRecoveryError('이전에 설정하셨던 마스터 비밀번호를 입력해주세요.');
      return;
    }
    setRecoveryError(null);
    setRecoveryLoading(true);
    try {
      const res = await decryptAllLegacyNotes(recoveryPw);
      if (res.success) {
        setRecoveryPw('');
        showFeedback(`${res.count}개 노트의 원문이 영구 복구되었습니다!`);
      } else {
        setRecoveryError('비밀번호가 일치하지 않습니다. 이전에 설정한 마스터 비밀번호를 다시 확인해주세요.');
      }
    } catch {
      setRecoveryError('복호화 중 오류가 발생했습니다.');
    } finally {
      setRecoveryLoading(false);
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

  if (!selected || isSystemGroupNote(selected)) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed">노트를 선택하세요.</Text>
      </Stack>
    );
  }

  const currentProject = projects.find((p) => p.id === (selected.projectId || 'default'));
  const pathNodes = getPathNodes(notes, selected.id);

  const colorCfg = getPastelConfig(selected.color);
  const isNoteLocked = false;

  // 모바일 상단바: 바로 위 상위 노트(없으면 프로젝트) 이름만 표시
  const parentNode = pathNodes.length > 1 ? pathNodes[pathNodes.length - 2] : null;
  const mobileLocationLabel = parentNode
    ? parentNode.title || '제목 없음'
    : currentProject
      ? `${currentProject.icon ?? ''} ${currentProject.name}`.trim()
      : '노트';
  const mobileShareActions: NoteShareActions = {
    printPreview: () => setPrintPreviewOpen(true),
    copyMarkdown: () => void handleCopyMarkdown(),
    copyHtml: () => void handleCopyHtml(),
    copyPlainText: () => void handleCopyPlainText(),
    exportPdf: () => void handleExportPdf(),
    downloadMarkdown: handleDownloadMarkdown,
    downloadHtml: handleDownloadHtml,
    nativeShare: canNativeShare() ? () => void handleNativeShare() : undefined,
  };

  // ready 이후에만 렌더되므로 content는 블록 JSON이 보장됨 (손상 시 문단 폴백)
  const editorKey = `${selected.id}`;

  return (
    <Stack
      gap={isCompact ? 0 : 'xs'}
      p={isCompact ? 0 : 'md'}
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

      {isCompact && (
        <MobileNoteHeader
          note={selected}
          locationLabel={mobileLocationLabel}
          onBack={onBackToList}
          scrollEl={editorScrollEl}
          locked={isNoteLocked}
          feedback={copyFeedback}
          share={mobileShareActions}
          onOpenHistory={() => setHistoryOpen(true)}
          onTitleChange={(title) => updateTitle(selected.id, title)}
          onColorChange={(colorId) => updateColor(selected.id, colorId)}
          onTogglePin={() => togglePin(selected.id)}
          onToggleFavorite={() => toggleFavorite(selected.id)}
          onTagClick={setActiveTag}
        />
      )}

      {/* 화면용 브레드크럼 및 알람/색상 뱃지 (데스크톱·태블릿) */}
      <div className="no-print" style={isCompact ? { padding: '0 8px' } : undefined}>
        {!isCompact && (
          <>
        <Group justify="space-between" align="center" wrap="nowrap" mb={6}>
          <Group gap={4} wrap="nowrap" style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
            {onBackToList && (
              <Button
                size="compact-xs"
                variant="light"
                color="blue"
                leftSection={<IconArrowLeft size={13} />}
                onClick={onBackToList}
                mr={4}
                style={{ flexShrink: 0 }}
              >
                목록
              </Button>
            )}
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
            {GoogleDriveService.isNoteUnsynced(selected) && (
              <Tooltip label="Google Drive에 아직 동기화되지 않은 변경사항이 있습니다 (동기화 완료 시 자동으로 사라집니다)">
                <Badge
                  size="xs"
                  variant="light"
                  color="orange"
                  leftSection={<IconCloudUpload size={11} />}
                >
                  미동기화
                </Badge>
              </Tooltip>
            )}
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

        <Group justify="space-between" wrap="wrap" gap="xs" mb={6}>
          <TextInput
            value={selected.title}
            onChange={(e) => updateTitle(selected.id, e.currentTarget.value)}
            variant="unstyled"
            size={isCompact ? 'lg' : 'xl'}
            fw={700}
            disabled={isNoteLocked}
            placeholder={isNoteLocked ? '잠긴 노트 (마스터 비밀번호로 잠금 해제 필요)' : '제목 없음 (본문에 #태그 가능)'}
            style={{ flex: 1, minWidth: isCompact ? '100%' : 180 }}
          />
          <Group gap={isCompact ? 4 : 'xs'} wrap="nowrap" style={{ marginLeft: 'auto' }}>
            {/* 복사 성공 안내 피드백 */}
            {copyFeedback && (
              <Badge size="sm" color="teal" variant="filled" leftSection={<IconCheck size={12} />}>
                {copyFeedback}
              </Badge>
            )}

            {/* 인쇄 및 미리보기 버튼 (모바일에서는 공유 메뉴 내 항목으로 통합) */}
            {!isCompact && (
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
            )}

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

            <Divider orientation="vertical" color="var(--bn-border-subtle)" />

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

            {isCompact ? (
              <Tooltip label="편집 히스토리">
                <ActionIcon
                  size="lg"
                  variant="light"
                  color="gray"
                  disabled={isNoteLocked}
                  onClick={() => setHistoryOpen(true)}
                  aria-label="히스토리"
                >
                  <IconHistory size={17} />
                </ActionIcon>
              </Tooltip>
            ) : (
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
            )}
            <Divider orientation="vertical" color="var(--bn-border-subtle)" />
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

        <Group justify="space-between" align="center" wrap="wrap" gap={8} mb={6}>
          <Group gap={5} align="center" wrap="wrap">
            {selected.tags.length === 0 ? (
              <Text size="11.5px" c="dimmed">
                #태그를 본문에 입력하면 자동으로 분류됩니다
              </Text>
            ) : (
              selected.tags.map((t) => (
                <Tooltip key={t} label={`#${t} 태그로 목록 필터링`}>
                  <span
                    className="bn-subtle-tag"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setActiveTag(t)}
                  >
                    #{t}
                  </span>
                </Tooltip>
              ))
            )}
          </Group>
          <Text size="11.5px" c="dimmed">
            생성 {new Date(selected.createdAt).toLocaleString('ko-KR')} · 수정{' '}
            {new Date(selected.updatedAt).toLocaleString('ko-KR')} ·{' '}
            {`${noteBodyText(selected.content).length}자`}
          </Text>
        </Group>
          </>
        )}
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

        {externalChange && externalChange.noteId === selected.id && (
          <Alert color="blue" variant="light" mb={8} title="외부에서 변경된 노트">
            <Group justify="space-between" gap="xs" wrap="wrap">
              <Text size="sm">
                "{externalChange.title || '제목 없음'}" 노트가 외부에서 변경되었습니다. 외부 버전으로 다시 불러올까요?
              </Text>
              <Group gap={6}>
                <Button size="xs" onClick={acceptExternalChange}>
                  다시 불러오기
                </Button>
                <Button size="xs" variant="default" onClick={dismissExternalChange}>
                  현재 내용 유지
                </Button>
              </Group>
            </Group>
          </Alert>
        )}

        {(hasEncryptedNotes || hasLegacyEncryptedText(selected.content)) && (
          <Alert
            color="orange"
            variant="light"
            title="🔒 기존 암호화된 노트 원문 복구 (1회 영구 해제)"
            mb="xs"
          >
            <Stack gap="xs">
              <Text size="xs">
                이전에 설정하셨던 <strong>마스터 비밀번호</strong>를 입력하시면, 암호화되어 있는 모든 노트의 본문과 히스토리를 <strong>즉시 원래 평문으로 영구 복원</strong>하고 저장합니다.
              </Text>
              <Group gap="xs" align="flex-start">
                <PasswordInput
                  placeholder="이전 마스터 비밀번호 입력"
                  value={recoveryPw}
                  onChange={(e) => setRecoveryPw(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRecoverNotes();
                  }}
                  error={recoveryError}
                  size="xs"
                  style={{ flex: 1, maxWidth: 320 }}
                  autoFocus
                />
                <Button
                  size="xs"
                  color="orange"
                  loading={recoveryLoading}
                  leftSection={<IconLockOpen size={14} />}
                  onClick={handleRecoverNotes}
                >
                  모든 노트 원문 복구하기
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}
      </div>

      {hasLegacyEncryptedText(selected.content) ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            backgroundColor: 'var(--bn-surface-list)',
            borderRadius: 8,
          }}
        >
          <Text size="sm" c="dimmed" ta="center">
            상단 주황색 복구 배너에 이전 마스터 비밀번호를 입력하면 이 노트의 원문이 즉시 복원됩니다.
          </Text>
        </div>
      ) : diffTargetSnapshot ? (
        <InlineHistoryDiffView
          currentNote={selected}
          selectedSnapshot={diffTargetSnapshot.selected}
          previousSnapshot={diffTargetSnapshot.previous}
          onRestore={(savedAt) => {
            restoreHistory(selected.id, savedAt);
            setDiffTargetSnapshot(null);
            setHistoryOpen(false);
          }}
          onClose={() => setDiffTargetSnapshot(null)}
        />
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--bn-surface-editor)',
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
              compact={isCompact}
              onScrollContainerReady={setEditorScrollEl}
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
            {selected.history.map((h, idx) => {
              const previous = selected.history[idx + 1] || null;
              const isComparingThis = diffTargetSnapshot?.selected.savedAt === h.savedAt;

              return (
                <Paper
                  key={h.savedAt}
                  withBorder
                  p="xs"
                  radius="sm"
                  style={{
                    backgroundColor: isComparingThis ? 'var(--mantine-color-blue-light)' : 'var(--mantine-color-body)',
                    borderColor: isComparingThis ? 'var(--mantine-color-blue-5)' : undefined,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap" align="flex-start" mb={4}>
                    <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onClick={() => setDiffTargetSnapshot({ selected: h, previous })}>
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm" fw={600} truncate>
                          {h.title || '제목 없음'}
                        </Text>
                        {isComparingThis && (
                          <Badge size="xs" variant="filled" color="blue">
                            비교 중
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {new Date(h.savedAt).toLocaleString('ko-KR')}
                      </Text>
                    </div>
                    <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                      <Button
                        size="compact-xs"
                        variant={isComparingThis ? 'filled' : 'light'}
                        color="blue"
                        leftSection={<IconGitCompare size={13} />}
                        onClick={() => {
                          setDiffTargetSnapshot({ selected: h, previous });
                        }}
                      >
                        {isComparingThis ? '비교 중' : '비교'}
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="gray"
                        onClick={() => {
                          const dateStr = new Date(h.savedAt).toLocaleString('ko-KR');
                          if (confirm(`${dateStr} 버전으로 복원할까요?\n현재 작성 중인 내용은 새로운 히스토리로 보존됩니다.`)) {
                            restoreHistory(selected.id, h.savedAt);
                            setDiffTargetSnapshot(null);
                            setHistoryOpen(false);
                          }
                        }}
                      >
                        복원
                      </Button>
                    </Group>
                  </Group>
                  <Text
                    size="xs"
                    c="dimmed"
                    lineClamp={2}
                    style={{ whiteSpace: 'pre-line', cursor: 'pointer' }}
                    onClick={() => setDiffTargetSnapshot({ selected: h, previous })}
                  >
                    {noteBodyText(h.content).slice(0, 120) || '내용 없음'}
                  </Text>
                </Paper>
              );
            })}
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
