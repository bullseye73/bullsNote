// CONTROLLER: 상태 + 유스케이스 (MVC의 C). View는 이 컨텍스트만 호출.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECTS,
  HISTORY_INTERVAL_MS,
  MAX_HISTORY,
  Note,
  NoteAttachment,
  NoteReminder,
  NoteSnapshot,
  Project,
  ProjectTreeNode,
  buildProjectTree,
  buildTree,
  canSetProjectParent,
  computeNextReminderTime,
  createEmptyNote,
  createProjectId,
  getDescendantIds,
  getProjectDescendantIds,
  TreeNode,
  SortOption,
  compareProjects,
  compareNotesWithOption,
  markAttachmentDeletedInContent,
  TodoStatus,
} from '../model/Note';
import {
  TODO_PROJECT_ID,
  TODO_GROUP_TODO_ID,
  ExtractedChecklistItem,
  ensureTodoProjectAndGroups,
  createTodoNotes,
  syncTodoStatusToSourceNote,
  syncSourceChecklistToTodoNotes,
  GROUP_ID_TO_STATUS,
  STATUS_TO_GROUP_ID,
  isSystemGroupNote,
  getEffectiveTodoStatus,
} from '../model/TodoService';
import { playChimeSound } from '../model/sound';
import { NoteRepository, seedNotes } from '../model/NoteRepository';
import { extractHashtags, extractHashtagsFromText, isBlocksJson, noteBodyText, parseBlocks } from '../model/HashtagService';
import {
  parseNoteFile,
  serializeNoteFile,
  sidecarHistories,
  sidecarProjects,
  swapAssetsToDataUrls,
  swapDataUrlsToAssets,
} from '../model/FileVault';
import type { VaultApi } from '../electron';
import { GoogleDriveConfig, GoogleDriveService, GoogleUserInfo } from '../model/GoogleDriveService';
import { GoogleCalendarService } from '../model/GoogleCalendarService';
import { hasAnyEncryptedNotes, hasLegacyEncryptedText, recoverEncryptedNotes } from '../model/LegacyDecryptor';
import { parseSearchQuery, searchNotes } from '../model/SearchService';
import { formatDateIso } from '../model/dateUtils';
import { GeminiService } from '../model/GeminiService';

function getVault(): VaultApi | null {
  return window.bullsNote?.vault ?? null;
}

type Headless = { toBlocks(md: string): Promise<unknown[]>; toMarkdown(contentJson: string): string };
let headlessCache: Headless | null = null;
async function getHeadless(): Promise<Headless> {
  if (headlessCache) return headlessCache;
  const { BlockNoteEditor } = await import('@blocknote/core');
  const editor = BlockNoteEditor.create();
  headlessCache = {
    toBlocks: async (md: string) => {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(md);
        if (Array.isArray(blocks) && blocks.length > 0) return blocks;
      } catch {
        /* fallthrough */
      }
      return [{ type: 'paragraph', content: md || '' }];
    },
    toMarkdown: (contentJson: string) => {
      try {
        const blocks = parseBlocks(contentJson);
        if (blocks) return editor.blocksToMarkdownLossy(blocks as never);
      } catch {
        /* fallthrough */
      }
      return '';
    },
  };
  return headlessCache;
}

export interface NotesState {
  projects: Project[];
  selectedProjectId: string;
  selectedProject: Project | null;
  notes: Note[];
  /** 레거시 -> 블록 마이그레이션 완료 여부 (완료 전 에디터 렌더 금지) */
  ready: boolean;
  selectedId: string | null;
  selected: Note | null;
  search: string;
  searchTokens: string[];
  searchScope: 'all' | 'current';
  quickFilter: 'all' | 'favorite' | 'pinned' | 'reminder' | 'attachment';
  quickSearchModalOpened: boolean;
  activeTag: string | null;
  selectedDate: string | null;
  showFavoriteOnly: boolean;
  tagCounts: Array<{ tag: string; count: number }>;
  /** 검색/필터 중이면 평탄 리스트, 아니면 트리 */
  tree: TreeNode[];
  flat: Note[];
  isFiltering: boolean;
  vaultMode: boolean;
  vaultPath: string;
  vaultError: string;
  storageError: string;
  activeAlarmNote: Note | null;
  /** Google Drive 클라우드 연동 상태 */
  googleConnected: boolean;
  googleConfig: GoogleDriveConfig;
  guestMode: boolean;
  isSyncing: boolean;
  syncError: string | null;
  lastSyncedAt: number | null;
  /** 프로젝트 및 노트 정렬 옵션 */
  projectSortOption: SortOption;
  noteSortOption: SortOption;
  sortedProjects: Project[];
  projectTree: ProjectTreeNode[];
  hasEncryptedNotes: boolean;
  googleSyncModalOpened: boolean;
  geminiModalOpened: boolean;
  geminiModalTab: 'clipboard' | 'prompt' | 'settings';
}

export interface NotesActions {
  select(id: string | null): void;
  create(parentId?: string | null): void;
  duplicate(id: string): void;
  remove(id: string): void;
  updateTitle(id: string, title: string): void;
  updateContent(id: string, content: string): void;
  updateColor(id: string, color: string): void;
  setReminder(id: string, reminder: NoteReminder | null): void;
  dismissReminder(id: string): void;
  snoozeReminder(id: string, minutes?: number): void;
  closeAlarmModal(): void;
  togglePin(id: string): void;
  toggleFavorite(id: string): void;
  setParent(id: string, parentId: string | null): void;
  indent(id: string): void;
  outdent(id: string): void;
  restoreHistory(id: string, savedAt: number): void;
  setSearch(v: string): void;
  setSearchScope(scope: 'all' | 'current'): void;
  setQuickFilter(filter: 'all' | 'favorite' | 'pinned' | 'reminder' | 'attachment'): void;
  openQuickSearchModal(): void;
  closeQuickSearchModal(): void;
  setActiveTag(t: string | null): void;
  setSelectedDate(date: string | null): void;
  openOrCreateDailyNote(dateStr?: string): string;
  setShowFavoriteOnly(v: boolean): void;
  exportAll(): void;
  importFromFile(file: File): Promise<void>;
  chooseVault(): Promise<void>;
  resync(): Promise<void>;
  selectProject(id: string): void;
  createProject(name: string, icon?: string, parentId?: string | null): string;
  updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'icon' | 'parentId'>>): void;
  setProjectParent(id: string, parentId: string | null): { success: boolean; error?: string };
  indentProject(id: string): void;
  outdentProject(id: string): void;
  deleteProject(id: string): void;
  moveNoteToProject(noteId: string, targetProjectId: string): void;
  saveGoogleConfig(config: Partial<GoogleDriveConfig>): void;
  syncWithGoogleDrive(isSilent?: boolean): Promise<void>;
  loginGoogle(): Promise<{ success: boolean; error?: string; user?: GoogleUserInfo }>;
  importMobileSyncCode(code: string): Promise<{ success: boolean; error?: string; user?: GoogleUserInfo }>;
  logoutGoogle(): void;
  enterGuestMode(): void;
  setProjectSortOption(opt: SortOption): void;
  setNoteSortOption(opt: SortOption): void;
  /** 기존 암호화된 노트 평문 복구 */
  decryptAllLegacyNotes(password: string): Promise<{ success: boolean; count: number }>;
  /** Google Drive 모달 및 첨부파일 액션 */
  openGoogleSyncModal(): void;
  closeGoogleSyncModal(): void;
  addAttachment(noteId: string, attachment: NoteAttachment): void;
  removeAttachment(noteId: string, attachmentId: string): Promise<void>;
  /** Gemini AI 액션 */
  openGeminiModal(tab?: 'clipboard' | 'prompt' | 'settings'): void;
  closeGeminiModal(): void;
  createNoteFromGemini(params: { title?: string; markdown: string; prompt?: string }): Promise<string>;
  createNoteFromClipboard(): Promise<{ success: boolean; noteId?: string; error?: string }>;
  /** 할일 관리 액션 */
  createTodosFromChecklist(
    sourceNote: Note,
    items: ExtractedChecklistItem[]
  ): { createdCount: number; updatedCount: number; duplicateCount: number };
  changeTodoStatus(todoNoteId: string, newStatus: TodoStatus, moveToGroupRoot?: boolean): void;
}

const Ctx = createContext<(NotesState & NotesActions) | null>(null);

function sortNotes(a: Note, b: Note): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.updatedAt - a.updatedAt;
}

/** 변경 전 상태를 히스토리에 push (스로틀 + 상한) */
function withHistory(note: Note, force = false): Note {
  const now = Date.now();
  const last = note.history[0];
  if (!force && last && now - last.savedAt < HISTORY_INTERVAL_MS) return note;
  const snap: NoteSnapshot = { title: note.title, content: note.content, tags: note.tags, savedAt: now };
  return { ...note, history: [snap, ...note.history].slice(0, MAX_HISTORY) };
}

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(() => {
    const list = NoteRepository.loadProjects();
    const loadedNotes = NoteRepository.load();
    const { projects: ensured } = ensureTodoProjectAndGroups(list, loadedNotes);
    return ensured;
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    const list = NoteRepository.loadProjects();
    const regular = list.filter((p) => p.id !== TODO_PROJECT_ID);
    return regular[0]?.id ?? list[0]?.id ?? DEFAULT_PROJECT_ID;
  });

  const [notes, setNotes] = useState<Note[]>(() => {
    let loaded = NoteRepository.load();
    if (loaded.length === 0) {
      loaded = seedNotes();
    }
    const currentProjects = NoteRepository.loadProjects();
    const { notes: ensured } = ensureTodoProjectAndGroups(currentProjects, loaded);
    return ensured.sort(sortNotes);
  });

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const initialProjNotes = notes.filter(
      (n) => !isSystemGroupNote(n) && (n.projectId || DEFAULT_PROJECT_ID) === selectedProjectId,
    );
    return initialProjNotes[0]?.id ?? null;
  });

  // 최신 상태를 비동기 리스너에서 참조하기 위한 Ref
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const selectedProjectIdRef = useRef(selectedProjectId);
  selectedProjectIdRef.current = selectedProjectId;

  const [ready, setReady] = useState(false);
  const [vaultPath, setVaultPath] = useState('');
  const [vaultError, setVaultError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [vaultGen, setVaultGen] = useState(0);
  const vaultInitGenRef = useRef(-1);
  const [search, setSearch] = useState('');
  const [searchScope, setSearchScopeState] = useState<'all' | 'current'>(() => {
    try {
      const saved = localStorage.getItem('bullsnote.search.scope');
      if (saved === 'all' || saved === 'current') return saved;
    } catch {}
    return 'all';
  });
  const [quickFilter, setQuickFilter] = useState<'all' | 'favorite' | 'pinned' | 'reminder' | 'attachment'>('all');
  const [quickSearchModalOpened, setQuickSearchModalOpened] = useState(false);

  const setSearchScope = useCallback((scope: 'all' | 'current') => {
    setSearchScopeState(scope);
    try {
      localStorage.setItem('bullsnote.search.scope', scope);
    } catch {}
  }, []);

  const openQuickSearchModal = useCallback(() => setQuickSearchModalOpened(true), []);
  const closeQuickSearchModal = useCallback(() => setQuickSearchModalOpened(false), []);

  const searchTokens = useMemo(() => parseSearchQuery(search).tokens, [search]);

  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showFavoriteOnly, setShowFavoriteOnly] = useState(false);
  const [activeAlarmNote, setActiveAlarmNote] = useState<Note | null>(null);
  const triggeredAlarmsRef = useRef<Set<string>>(new Set());

  // localStorage 모드 영속화 추적 (디바운스, 순번 토큰, 즉시 flush)
  const localSaveSeqRef = useRef(0);
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLocalSavePendingRef = useRef(false);
  const flushLocalSaveRef = useRef<(() => Promise<void>) | null>(null);

  // Google Drive 클라우드 연동 상태
  const [googleConfig, setGoogleConfigState] = useState<GoogleDriveConfig>(() => GoogleDriveService.getConfig());
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const syncWithGoogleDriveRef = useRef<(isSilent?: boolean) => Promise<void>>(() => Promise.resolve());
  const [syncError, setSyncError] = useState<string | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const enterGuestMode = useCallback(() => setGuestMode(true), []);
  const googleConnected = GoogleDriveService.isConnected();

  // 프로젝트 및 노트 정렬 상태 (localStorage 영구 보존)
  const [projectSortOption, setProjectSortOptionState] = useState<SortOption>(() => {
    try {
      const saved = localStorage.getItem('bullsnote.sort.projects');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.field === 'string') return parsed;
      }
    } catch {}
    return { field: 'none', order: 'asc' };
  });

  const [noteSortOption, setNoteSortOptionState] = useState<SortOption>(() => {
    try {
      const saved = localStorage.getItem('bullsnote.sort.notes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.field === 'string') return parsed;
      }
    } catch {}
    return { field: 'none', order: 'desc' };
  });

  const setProjectSortOption = useCallback((opt: SortOption) => {
    setProjectSortOptionState(opt);
    try {
      localStorage.setItem('bullsnote.sort.projects', JSON.stringify(opt));
    } catch {}
  }, []);

  const setNoteSortOption = useCallback((opt: SortOption) => {
    setNoteSortOptionState(opt);
    try {
      localStorage.setItem('bullsnote.sort.notes', JSON.stringify(opt));
    } catch {}
  }, []);

  const sortedProjects = useMemo(() => {
    if (projectSortOption.field === 'none') return projects;
    return [...projects].sort((a, b) => compareProjects(a, b, projectSortOption));
  }, [projects, projectSortOption]);

  const projectTree = useMemo(() => {
    const regular = projects.filter((p) => p.id !== TODO_PROJECT_ID);
    const sortFn =
      projectSortOption.field === 'none'
        ? undefined
        : (a: Project, b: Project) => compareProjects(a, b, projectSortOption);
    return buildProjectTree(regular, sortFn);
  }, [projects, projectSortOption]);

  const noteComparator = useCallback(
    (a: Note, b: Note) => compareNotesWithOption(a, b, noteSortOption),
    [noteSortOption],
  );

  // 주기적으로 알람 감지 (5초 주기)
  useEffect(() => {
    if (!ready) return;

    const checkAlarms = () => {
      const now = Date.now();
      for (const n of notes) {
        if (!n.reminder || n.reminder.dismissed) continue;
        const triggerTime = n.reminder.snoozedUntil ?? n.reminder.targetAt;
        if (triggerTime <= now) {
          const alarmKey = `${n.id}-${triggerTime}`;
          if (!triggeredAlarmsRef.current.has(alarmKey)) {
            triggeredAlarmsRef.current.add(alarmKey);
            playChimeSound();
            const notifApi = window.bullsNote?.notification;
            if (notifApi?.show) {
              const snippet = noteBodyText(n.content).slice(0, 100);
              notifApi.show({
                title: `🔔 [BullsNote 알람] ${n.title || '제목 없음'}`,
                body: snippet || '설정된 알람 시각이 되었습니다.',
                noteId: n.id,
              });
            }
            setActiveAlarmNote(n);
            break;
          }
        }
      }
    };

    checkAlarms();
    const interval = setInterval(checkAlarms, 5000);
    return () => clearInterval(interval);
  }, [notes, ready]);

  // OS 시스템 알림 또는 내부 링크 클릭 시 해당 노트로 이동
  useEffect(() => {
    const handleCustomNav = (e: Event) => {
      const customEvent = e as CustomEvent<{ noteId: string }>;
      if (customEvent.detail?.noteId) {
        setSelectedId(customEvent.detail.noteId);
      }
    };
    window.addEventListener('bullsnote:navigate-note', handleCustomNav);

    const notifApi = window.bullsNote?.notification;
    let notifCleanup: (() => void) | undefined;
    if (notifApi?.onOpenNote) {
      notifCleanup = notifApi.onOpenNote((targetId) => {
        setSelectedId(targetId);
        setActiveAlarmNote((cur) => (cur?.id === targetId ? null : cur));
      });
    }

    return () => {
      window.removeEventListener('bullsnote:navigate-note', handleCustomNav);
      if (notifCleanup) notifCleanup();
    };
  }, []);

  const vaultMode = getVault() !== null;
  // 파일 기준 동기화 추적
  const lastSavedRef = useRef(new Map<string, string>());
  const lastWrittenRef = useRef(new Map<string, number>());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavePendingRef = useRef(false);
  const flushSaveRef = useRef<(() => Promise<void>) | null>(null);

  const doLocalSave = useCallback(
    async (currentNotes: Note[], seq: number) => {
      isLocalSavePendingRef.current = false;
      try {
        const res = NoteRepository.save(currentNotes);
        if (seq === localSaveSeqRef.current) {
          if (res.success) {
            setStorageError('');
          } else {
            setStorageError(res.error || '저장소 저장 실패');
          }
        }
      } catch (err) {
        if (seq === localSaveSeqRef.current) {
          const msg = `저장 실패: ${err instanceof Error ? err.message : String(err)}`;
          setStorageError(msg);
        }
      }
    },
    [],
  );

  // localStorage 모드: 디바운스(400ms) 및 순번 토큰을 적용하여 영속화
  useEffect(() => {
    if (vaultMode) return;

    localSaveSeqRef.current += 1;
    const currentSeq = localSaveSeqRef.current;
    isLocalSavePendingRef.current = true;

    const runSave = () => doLocalSave(notes, currentSeq);
    flushLocalSaveRef.current = runSave;

    if (localSaveTimerRef.current) {
      clearTimeout(localSaveTimerRef.current);
    }
    localSaveTimerRef.current = setTimeout(() => {
      void runSave();
    }, 400);

    return () => {
      if (localSaveTimerRef.current) {
        clearTimeout(localSaveTimerRef.current);
      }
    };
  }, [notes, vaultMode, doLocalSave]);

  useEffect(() => {
    if (vaultMode) return;
    NoteRepository.saveProjects(projects);
  }, [projects, vaultMode]);

  // localStorage 모드: 레거시 마이그레이션 (암호문은 복구 전까지 JSON 블록으로 감싸지 않도록 보존)
  const migratedRef = useRef(false);
  useEffect(() => {
    if (vaultMode || migratedRef.current) return;
    migratedRef.current = true;
    (async () => {
      try {
        const current = NoteRepository.load();
        const needsMigration = current.some(
          (n) => !isBlocksJson(n.content) && !hasLegacyEncryptedText(n.content),
        );
        if (!needsMigration) return;
        const headless = await getHeadless();
        const converted = await Promise.all(
          current.map(async (n) => {
            if (isBlocksJson(n.content) || hasLegacyEncryptedText(n.content)) return n;
            const blocks = await headless.toBlocks(n.content);
            const content = JSON.stringify(blocks);
            return { ...n, content, tags: extractHashtags(n.title, content) };
          }),
        );
        NoteRepository.save(converted);
        const sortedConverted = converted.sort(sortNotes);
        setNotes(sortedConverted);
        setSelectedId((prev) => {
          if (prev && !isSystemGroupNote(prev)) return prev;
          const projNotes = sortedConverted.filter(
            (n) => !isSystemGroupNote(n) && (n.projectId || DEFAULT_PROJECT_ID) === selectedProjectIdRef.current,
          );
          return projNotes[0]?.id ?? null;
        });
      } catch {
        /* 파서 실패 시 기존 포맷 유지 */
      } finally {
        setReady(true);
      }
    })();
  }, [vaultMode]);

  // 파일 볼트 모드: 초기 로드 (파일 우선, localStorage는 1회 이관)
  useEffect(() => {
    if (!vaultMode || vaultInitGenRef.current === vaultGen) return;
    vaultInitGenRef.current = vaultGen;
    (async () => {
      const vault = getVault()!;
      try {
        const vp = await vault.getPath();
        setVaultPath(vp);
        const headless = await getHeadless();
        const { files } = await vault.list();
        const sidecar = await vault.readSidecar();
        const histories = sidecarHistories(sidecar);
        const rawProjects = sidecarProjects(sidecar);
        const { projects: loadedProjects } = ensureTodoProjectAndGroups(rawProjects, []);
        setProjects(loadedProjects);
        setSelectedProjectId((prev) =>
          loadedProjects.some((p) => p.id === prev) ? prev : loadedProjects[0]?.id ?? DEFAULT_PROJECT_ID,
        );

        if (files.length === 0 && !sidecar.migratedLs) {
          let current = NoteRepository.load();
          if (current.length === 0) current = seedNotes();
          const migratedRaw = await Promise.all(
            current.map(async (n) => {
              const contentJson = isBlocksJson(n.content)
                ? n.content
                : JSON.stringify(await headless.toBlocks(n.content));
              return { ...n, content: contentJson, tags: extractHashtags(n.title, contentJson) };
            }),
          );
          const { notes: migrated } = ensureTodoProjectAndGroups(loadedProjects, migratedRaw);
          for (const n of migrated) {
            const body = await swapDataUrlsToAssets(
              headless.toMarkdown(n.content),
              n.id,
              (name, b64) => vault.writeAsset(name, b64),
            );
            const text = serializeNoteFile(n, body);
            await vault.write(n.id, text);
            lastSavedRef.current.set(n.id, text);
          }
          await vault.writeSidecar({
            migratedLs: true,
            projects: loadedProjects,
            histories: Object.fromEntries(migrated.map((n) => [n.id, n.history])),
          });
          const sortedMigrated = migrated.sort(sortNotes);
          setNotes(sortedMigrated);
          setSelectedId((prev) => {
            if (prev && !isSystemGroupNote(prev) && sortedMigrated.some((n) => n.id === prev)) return prev;
            const projNotes = sortedMigrated.filter(
              (n) => !isSystemGroupNote(n) && (n.projectId || DEFAULT_PROJECT_ID) === selectedProjectIdRef.current,
            );
            return projNotes[0]?.id ?? null;
          });
        } else {
          const loadedRaw: Note[] = [];
          for (const f of files) {
            try {
              const text = await vault.read(f.id);
              if (text == null) continue;
              const parsed = parseNoteFile(f.id, text);
              if (!parsed) continue;
              const withUrls = await swapAssetsToDataUrls(parsed.body, (name) => vault.readAsset(name));
              const blocks = await headless.toBlocks(withUrls);
              const content = JSON.stringify(blocks);
              loadedRaw.push({
                id: parsed.id,
                title: parsed.title,
                projectId: parsed.projectId,
                color: parsed.color || 'blue',
                reminder: parsed.reminder || null,
                content,
                tags: extractHashtags(parsed.title, content),
                pinned: parsed.pinned,
                favorite: parsed.favorite,
                parentId: parsed.parentId,
                attachments: parsed.attachments,
                todoMeta: parsed.todoMeta,
                systemGroupType: parsed.systemGroupType,
                syncedAt: GoogleDriveService.getNoteSyncedAt(parsed.id) ?? undefined,
                history: histories[parsed.id] ?? [],
                createdAt: parsed.createdAt,
                updatedAt: parsed.updatedAt,
              });
              lastSavedRef.current.set(f.id, text);
              lastWrittenRef.current.set(f.id, f.mtimeMs);
            } catch {
              /* 손상 파일 건너뜀 */
            }
          }
          const { notes: loaded } = ensureTodoProjectAndGroups(loadedProjects, loadedRaw);
          const sortedLoaded = loaded.sort(sortNotes);
          setNotes(sortedLoaded);
          setSelectedId((prev) => {
            if (prev && !isSystemGroupNote(prev) && sortedLoaded.some((n) => n.id === prev)) return prev;
            const projNotes = sortedLoaded.filter(
              (n) => !isSystemGroupNote(n) && (n.projectId || DEFAULT_PROJECT_ID) === selectedProjectIdRef.current,
            );
            return projNotes[0]?.id ?? null;
          });
        }
      } catch (e) {
        setVaultError(`볼트를 열 수 없습니다: ${e instanceof Error ? e.message : e}`);
        const loaded = NoteRepository.load();
        const finalNotes = loaded.length > 0 ? loaded : seedNotes();
        const sortedFinal = finalNotes.sort(sortNotes);
        setNotes(sortedFinal);
        setSelectedId((prev) => {
          if (prev && !isSystemGroupNote(prev)) return prev;
          const projNotes = sortedFinal.filter(
            (n) => !isSystemGroupNote(n) && (n.projectId || DEFAULT_PROJECT_ID) === selectedProjectIdRef.current,
          );
          return projNotes[0]?.id ?? null;
        });
      } finally {
        setReady(true);
      }
    })();
  }, [vaultMode, vaultGen]);

  // 파일 볼트 모드: 변경분 디바운스 저장 + 삭제 반영 + 프로젝트 & 히스토리 sidecar
  useEffect(() => {
    if (!vaultMode || !ready) return;
    isSavePendingRef.current = true;

    const doSave = async () => {
      const vault = getVault()!;
      try {
        const headless = await getHeadless();
        const seen = new Set<string>();
        for (const n of notes) {
          seen.add(n.id);
          const body = await swapDataUrlsToAssets(
            headless.toMarkdown(n.content),
            n.id,
            (name, b64) => vault.writeAsset(name, b64),
          );
          const text = serializeNoteFile(n, body);
          if (lastSavedRef.current.get(n.id) !== text) {
            await vault.write(n.id, text);
            lastSavedRef.current.set(n.id, text);
            const { files } = await vault.list();
            const f = files.find((x) => x.id === n.id);
            if (f) lastWrittenRef.current.set(n.id, f.mtimeMs);
          }
        }
        for (const id of [...lastSavedRef.current.keys()]) {
          if (!seen.has(id)) {
            await vault.delete(id);
            lastSavedRef.current.delete(id);
            lastWrittenRef.current.delete(id);
          }
        }
        const prev = (await vault.readSidecar()) as Record<string, unknown>;
        await vault.writeSidecar({
          ...prev,
          projects,
          histories: Object.fromEntries(notes.map((n) => [n.id, n.history])),
        });
        setVaultError('');
      } catch (e) {
        setVaultError(`저장 실패: ${e instanceof Error ? e.message : e}`);
      } finally {
        isSavePendingRef.current = false;
      }
    };

    flushSaveRef.current = doSave;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void doSave();
    }, 1200);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [notes, projects, vaultMode, ready]);

  // 창 닫기/새로고침 시 미저장 데이터 강제 플러시
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isSavePendingRef.current && flushSaveRef.current) {
        void flushSaveRef.current();
      }
      if (isLocalSavePendingRef.current && flushLocalSaveRef.current) {
        void flushLocalSaveRef.current();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // 파일 볼트 모드: 외부 변경 감지 (폴링 + 포커스)
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const pollExternal = useCallback(async () => {
    const vault = getVault();
    if (!vault) return;
    if (isSavePendingRef.current) return;
    try {
      const headless = await getHeadless();
      const { files } = await vault.list();
      const byId = new Map(files.map((f) => [f.id, f]));
      const deleted = [...lastSavedRef.current.keys()].filter((id) => !byId.has(id));
      if (deleted.length > 0) {
        const doomed = new Set(deleted);
        setNotes((prev) => prev.filter((n) => !doomed.has(n.id)));
        if (selectedIdRef.current && doomed.has(selectedIdRef.current)) {
          setSelectedId(null);
        }
        for (const id of deleted) {
          lastSavedRef.current.delete(id);
          lastWrittenRef.current.delete(id);
        }
      }
      for (const f of files) {
        const known = lastSavedRef.current.has(f.id);
        if (!known) {
          const text = await vault.read(f.id);
          if (text == null) continue;
          const parsed = parseNoteFile(f.id, text);
          if (!parsed) continue;
          const withUrls = await swapAssetsToDataUrls(parsed.body, (name) => vault.readAsset(name));
          const blocks = await headless.toBlocks(withUrls);
          const content = JSON.stringify(blocks);
          const sidecar = (await vault.readSidecar()) as Record<string, unknown>;
          const histories = sidecarHistories(sidecar);
          const rawExtProjects = sidecarProjects(sidecar);
          const { projects: extProjects } = ensureTodoProjectAndGroups(rawExtProjects, []);
          setProjects(extProjects);
          setNotes((prev) => {
            if (prev.some((n) => n.id === f.id)) return prev;
            return [
              ...prev,
              {
                id: parsed.id,
                title: parsed.title,
                projectId: parsed.projectId,
                color: parsed.color || 'blue',
                reminder: parsed.reminder || null,
                content,
                tags: extractHashtags(parsed.title, content),
                pinned: parsed.pinned,
                favorite: parsed.favorite,
                parentId: parsed.parentId,
                attachments: parsed.attachments,
                todoMeta: parsed.todoMeta,
                systemGroupType: parsed.systemGroupType,
                syncedAt: GoogleDriveService.getNoteSyncedAt(parsed.id) ?? undefined,
                history: histories[parsed.id] ?? [],
                createdAt: parsed.createdAt,
                updatedAt: parsed.updatedAt,
              },
            ].sort(sortNotes);
          });
          lastSavedRef.current.set(f.id, text);
          lastWrittenRef.current.set(f.id, f.mtimeMs);
        } else if ((lastWrittenRef.current.get(f.id) ?? 0) < f.mtimeMs) {
          const text = await vault.read(f.id);
          if (text == null || text === lastSavedRef.current.get(f.id)) {
            lastWrittenRef.current.set(f.id, f.mtimeMs);
            continue;
          }
          const parsed = parseNoteFile(f.id, text);
          if (!parsed) continue;
          const withUrls = await swapAssetsToDataUrls(parsed.body, (name) => vault.readAsset(name));
          const blocks = await headless.toBlocks(withUrls);
          const content = JSON.stringify(blocks);
          const apply = () =>
            setNotes((prev) =>
              prev.map((n) =>
                n.id === f.id
                  ? {
                      ...n,
                      title: parsed.title,
                      projectId: parsed.projectId,
                      color: parsed.color || 'blue',
                      reminder: parsed.reminder || null,
                      content,
                      tags: extractHashtags(parsed.title, content),
                      pinned: parsed.pinned,
                      favorite: parsed.favorite,
                      parentId: parsed.parentId,
                      attachments: parsed.attachments ?? n.attachments,
                      todoMeta: parsed.todoMeta ?? n.todoMeta,
                      systemGroupType: parsed.systemGroupType ?? n.systemGroupType,
                      updatedAt: parsed.updatedAt,
                    }
                  : n,
              ),
            );
          if (selectedIdRef.current === f.id) {
            if (confirm(`"${parsed.title}" 노트가 외부에서 변경되었습니다. 외부 버전으로 다시 불러올까요?`)) {
              apply();
              lastSavedRef.current.set(f.id, text);
            }
          } else {
            apply();
            lastSavedRef.current.set(f.id, text);
          }
          lastWrittenRef.current.set(f.id, f.mtimeMs);
        }
      }
    } catch (e) {
      setVaultError(`동기화 확인 실패: ${e instanceof Error ? e.message : e}`);
    }
  }, []);

  useEffect(() => {
    if (!vaultMode || !ready) return;
    const t = setInterval(() => void pollExternal(), 8000);
    const onFocus = () => void pollExternal();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [vaultMode, ready, pollExternal]);

  const chooseVault = useCallback(async () => {
    const vault = getVault();
    if (!vault) return;
    const p = await vault.pickDir();
    if (!p) return;
    setVaultPath(p);
    lastSavedRef.current.clear();
    lastWrittenRef.current.clear();
    setReady(false);
    setVaultGen((g) => g + 1);
  }, []);

  const resync = useCallback(async () => {
    await pollExternal();
  }, [pollExternal]);

  // --- Google Drive 변경 감지 동기화 큐 (디바운스 2초, Idle 시 트래픽 0건) ---
  const pendingNotesRef = useRef<Map<string, Note>>(new Map());
  const noteSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueNoteSync = useCallback(
    (note: Note) => {
      if (!GoogleDriveService.isConnected() || !googleConfig.autoSync || isSyncingRef.current) return;
      pendingNotesRef.current.set(note.id, note);
      if (noteSyncTimerRef.current) clearTimeout(noteSyncTimerRef.current);
      noteSyncTimerRef.current = setTimeout(async () => {
        pendingNotesRef.current.clear();
        void syncWithGoogleDriveRef.current(true);
      }, 2000);
    },
    [googleConfig.autoSync],
  );

  const queueProjectSync = useCallback((_project?: Project) => {
    if (!GoogleDriveService.isConnected() || !googleConfig.autoSync || isSyncingRef.current) return;
    if (noteSyncTimerRef.current) clearTimeout(noteSyncTimerRef.current);
    noteSyncTimerRef.current = setTimeout(async () => {
      void syncWithGoogleDriveRef.current(true);
    }, 2000);
  }, [googleConfig.autoSync]);

  const mutate = useCallback(
    (id: string, fn: (n: Note) => Note) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id === id) {
            const updated = { ...fn(n), updatedAt: Date.now() };
            queueNoteSync(updated);
            return updated;
          }
          return n;
        }),
      );
    },
    [queueNoteSync],
  );

  const refreshTags = useCallback((note: Note, title: string, content: string): Note => {
    const tags = extractHashtags(title, content);
    return { ...note, title, content, tags };
  }, []);

  const select = useCallback((id: string | null) => {
    // 할일관리 시스템 그룹(To Do, Doing, Done, Drop)은 컨테이너이므로 에디터 노트로 선택하지 않음
    if (id && isSystemGroupNote(id)) {
      return;
    }
    // 노트 전환 시 미저장된 로컬 변경 즉시 flush
    if (isLocalSavePendingRef.current && flushLocalSaveRef.current) {
      if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
      void flushLocalSaveRef.current();
    }
    // 타 프로젝트 노트 선택 시 프로젝트 자동 전환
    if (id) {
      const targetNote = notesRef.current.find((n) => n.id === id);
      if (targetNote && (targetNote.projectId || DEFAULT_PROJECT_ID) !== selectedProjectIdRef.current) {
        setSelectedProjectId(targetNote.projectId || DEFAULT_PROJECT_ID);
      }
    }
    setSelectedId(id);
    if (id && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bullsnote:mobile-open-editor'));
    }
  }, []);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId],
  );

  const selectProject = useCallback(
    (id: string) => {
      setSelectedProjectId(id);
      setActiveTag(null);
      setSelectedDate(null);
      const pNotes = notes.filter(
        (n) => !isSystemGroupNote(n) && (n.projectId || DEFAULT_PROJECT_ID) === id,
      );
      setSelectedId(pNotes[0]?.id ?? null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bullsnote:mobile-open-list'));
      }
    },
    [notes],
  );

  const createProject = useCallback(
    (name: string, icon = '', parentId: string | null = null): string => {
      const check = canSetProjectParent(projectsRef.current, null, parentId);
      const validParentId = check.allowed ? parentId : null;
      const id = createProjectId();
      const newProj: Project = {
        id,
        name: name.trim() || '새 프로젝트',
        icon: icon.trim(),
        parentId: validParentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setProjects((prev) => [...prev, newProj]);
      setSelectedProjectId(id);
      setSelectedId(null);
      queueProjectSync(newProj);
      return id;
    },
    [queueProjectSync],
  );

  const updateProject = useCallback(
    (id: string, patch: Partial<Pick<Project, 'name' | 'icon' | 'parentId'>>) => {
      setProjects((prev) => {
        if (patch.parentId !== undefined) {
          const check = canSetProjectParent(prev, id, patch.parentId ?? null);
          if (!check.allowed) {
            alert(check.reason || '상위 폴더를 변경할 수 없습니다.');
            return prev;
          }
        }
        return prev.map((p) => {
          if (p.id === id) {
            const updated: Project = {
              ...p,
              name: patch.name !== undefined ? patch.name.trim() || p.name : p.name,
              icon: patch.icon !== undefined ? patch.icon.trim() : p.icon,
              parentId: patch.parentId !== undefined ? patch.parentId ?? null : p.parentId ?? null,
              updatedAt: Date.now(),
            };
            queueProjectSync(updated);
            return updated;
          }
          return p;
        });
      });
    },
    [queueProjectSync],
  );

  const setProjectParent = useCallback(
    (id: string, parentId: string | null): { success: boolean; error?: string } => {
      const check = canSetProjectParent(projectsRef.current, id, parentId);
      if (!check.allowed) {
        return { success: false, error: check.reason };
      }
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id === id) {
            if ((p.parentId ?? null) === (parentId ?? null)) return p;
            const updated: Project = {
              ...p,
              parentId: parentId ?? null,
              updatedAt: Date.now(),
            };
            queueProjectSync(updated);
            return updated;
          }
          return p;
        }),
      );
      return { success: true };
    },
    [queueProjectSync],
  );

  const indentProject = useCallback(
    (id: string) => {
      setProjects((prev) => {
        const regular = prev.filter((p) => p.id !== TODO_PROJECT_ID);
        const sortFn =
          projectSortOption.field === 'none'
            ? undefined
            : (a: Project, b: Project) => compareProjects(a, b, projectSortOption);
        const treeNodes = buildProjectTree(regular, sortFn);

        let prevSiblingId: string | null = null;
        const findSibling = (list: ProjectTreeNode[]): boolean => {
          for (let i = 0; i < list.length; i++) {
            if (list[i].project.id === id) {
              if (i > 0) prevSiblingId = list[i - 1].project.id;
              return true;
            }
            if (findSibling(list[i].children)) return true;
          }
          return false;
        };
        findSibling(treeNodes);
        if (!prevSiblingId) return prev;

        const check = canSetProjectParent(prev, id, prevSiblingId);
        if (!check.allowed) {
          alert(check.reason || '더 이상 하위 단계로 들여쓰기할 수 없습니다.');
          return prev;
        }

        return prev.map((p) => {
          if (p.id === id) {
            const updated: Project = { ...p, parentId: prevSiblingId, updatedAt: Date.now() };
            queueProjectSync(updated);
            return updated;
          }
          return p;
        });
      });
    },
    [projectSortOption, queueProjectSync],
  );

  const outdentProject = useCallback(
    (id: string) => {
      setProjects((prev) => {
        const target = prev.find((p) => p.id === id);
        if (!target || !target.parentId) return prev;
        const parent = prev.find((p) => p.id === target.parentId);
        const nextParentId = parent?.parentId ?? null;
        return prev.map((p) => {
          if (p.id === id) {
            const updated: Project = { ...p, parentId: nextParentId, updatedAt: Date.now() };
            queueProjectSync(updated);
            return updated;
          }
          return p;
        });
      });
    },
    [queueProjectSync],
  );

  const deleteProject = useCallback(
    (id: string) => {
      if (id === TODO_PROJECT_ID) {
        alert('할일관리 프로젝트는 기본 시스템 프로젝트이므로 삭제할 수 없습니다.');
        return;
      }
      setProjects((prev) => {
        const doomedProjectIds = getProjectDescendantIds(prev, id);
        const remainingRegular = prev.filter(
          (p) => p.id !== TODO_PROJECT_ID && !doomedProjectIds.has(p.id),
        );
        if (remainingRegular.length < 1) {
          alert('최소 1개의 일반 폴더(프로젝트)는 유지되어야 합니다.');
          return prev;
        }
        const remaining = prev.filter((p) => !doomedProjectIds.has(p.id));
        const doomedNotes = notesRef.current.filter((n) =>
          doomedProjectIds.has(n.projectId || DEFAULT_PROJECT_ID),
        );
        setNotes((prevNotes) =>
          prevNotes.filter((n) => !doomedProjectIds.has(n.projectId || DEFAULT_PROJECT_ID)),
        );
        if (doomedProjectIds.has(selectedProjectId)) {
          const nextProj = remainingRegular[0] ?? remaining[0];
          setSelectedProjectId(nextProj.id);
          const nextNotes = notesRef.current.filter(
            (n) => (n.projectId || DEFAULT_PROJECT_ID) === nextProj.id,
          );
          setSelectedId(nextNotes[0]?.id ?? null);
        }
        if (GoogleDriveService.isConnected() && googleConfig.autoSync) {
          for (const pid of doomedProjectIds) {
            GoogleDriveService.recordDeletedProject(pid);
          }
          for (const dn of doomedNotes) {
            GoogleDriveService.recordDeletedNote(dn.id);
          }
          queueProjectSync();
        }
        return remaining;
      });
    },
    [selectedProjectId, googleConfig.autoSync, queueProjectSync],
  );

  const moveNoteToProject = useCallback(
    (noteId: string, targetProjectId: string) => {
      setNotes((prev) => {
        const targetIds = getDescendantIds(prev, noteId);
        return prev.map((n) => {
          if (targetIds.has(n.id)) {
            const isRoot = n.id === noteId;
            const updated = {
              ...n,
              projectId: targetProjectId,
              parentId: isRoot ? null : n.parentId,
              updatedAt: Date.now(),
            };
            queueNoteSync(updated);
            return updated;
          }
          return n;
        });
      });
    },
    [queueNoteSync],
  );

  const create = useCallback(
    (parentId: string | null = null) => {
      const isTodoProj = selectedProjectId === TODO_PROJECT_ID;
      const effectiveParentId = isTodoProj && !parentId ? TODO_GROUP_TODO_ID : parentId;
      let initialColor = 'blue';
      if (effectiveParentId) {
        const parent = notes.find((x) => x.id === effectiveParentId);
        if (parent?.color) {
          initialColor = parent.color;
        }
      }
      const todoStatus =
        isTodoProj && effectiveParentId ? GROUP_ID_TO_STATUS[effectiveParentId] || 'todo' : undefined;
      const n = createEmptyNote({
        title: isTodoProj ? '새 할일' : '새 노트',
        projectId: selectedProjectId,
        parentId: effectiveParentId,
        color: initialColor,
        todoMeta: todoStatus ? { status: todoStatus } : undefined,
      });
      setNotes((prev) => [n, ...prev]);
      setSelectedId(n.id);
      queueNoteSync(n);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bullsnote:mobile-open-editor'));
      }
    },
    [selectedProjectId, notes, queueNoteSync],
  );

  const duplicate = useCallback(
    (id: string) => {
      setNotes((prev) => {
        const src = prev.find((n) => n.id === id);
        if (!src) return prev;
        const copy: Note = {
          ...src,
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
          projectId: src.projectId || selectedProjectId,
          title: `${src.title} (복사본)`,
          history: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        queueNoteSync(copy);
        return [copy, ...prev];
      });
    },
    [selectedProjectId, queueNoteSync],
  );

  const openOrCreateDailyNote = useCallback(
    (targetDateStr?: string): string => {
      const todayStr = formatDateIso(new Date());
      const dateStr = targetDateStr || todayStr;
      const monthStr = dateStr.slice(0, 7); // e.g. "2026-10"

      // 1. "Daily Note" 프로젝트 찾기 (또는 생성)
      let dailyProj = projects.find(
        (p) =>
          p.name.trim().toLowerCase() === 'daily note' ||
          p.name.trim().toLowerCase() === 'daily notes' ||
          p.name.trim() === '데일리 노트'
      );
      let dailyProjId = dailyProj?.id;

      if (!dailyProj) {
        dailyProjId = createProjectId();
        const newProj: Project = {
          id: dailyProjId,
          name: 'Daily Note',
          icon: '📅',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setProjects((prev) => [...prev, newProj]);
        queueProjectSync(newProj);
        dailyProj = newProj;
      }

      // 2. YYYY-MM 부모 노트 찾기 (또는 생성)
      let monthNote = notes.find(
        (n) =>
          (n.projectId || DEFAULT_PROJECT_ID) === dailyProjId &&
          n.parentId === null &&
          n.title.trim() === monthStr
      );

      let currentNotes = notes;

      if (!monthNote) {
        const newMonthNote = createEmptyNote({
          title: monthStr,
          projectId: dailyProjId,
          parentId: null,
          color: 'purple',
        });
        monthNote = newMonthNote;
        currentNotes = [newMonthNote, ...currentNotes];
        setNotes((prev) => [newMonthNote, ...prev]);
        queueNoteSync(newMonthNote);
      }

      // 3. YYYY-MM-DD 데일리 노트 찾기 (또는 생성)
      const dayNote = currentNotes.find(
        (n) =>
          (n.projectId || DEFAULT_PROJECT_ID) === dailyProjId &&
          n.title.trim() === dateStr
      );

      if (dayNote) {
        setSelectedProjectId(dailyProjId!);
        setSelectedDate(null);
        select(dayNote.id);
        return dayNote.id;
      }

      // 새로 생성 (타겟 날짜의 정오를 생성 시각으로 지정)
      const targetDate = new Date(`${dateStr}T12:00:00`);
      const noteCreatedAt = isNaN(targetDate.getTime()) ? Date.now() : targetDate.getTime();

      const newDayNote = createEmptyNote({
        title: dateStr,
        projectId: dailyProjId,
        parentId: monthNote.id,
        color: 'blue',
        createdAt: noteCreatedAt,
        updatedAt: Date.now(),
      });

      setNotes((prev) => [newDayNote, ...prev]);
      setSelectedProjectId(dailyProjId!);
      setSelectedDate(null);
      select(newDayNote.id);
      queueNoteSync(newDayNote);
      return newDayNote.id;
    },
    [projects, notes, select, queueProjectSync, queueNoteSync],
  );

  /** 노트/할일 알람을 Google Calendar 일정으로 백그라운드 동기화 (모바일 푸시 알림 연동) */
  const syncNoteReminderWithCalendar = useCallback(
    (note: Note, prevCalendarEventId?: string | null) => {
      if (!GoogleDriveService.isConnected()) return;

      const isTodoDrop = note.projectId === TODO_PROJECT_ID && note.todoMeta?.status === 'drop';
      const reminder = note.reminder;
      const shouldDelete = !reminder || reminder.syncToCalendar === false || isTodoDrop;

      if (shouldDelete) {
        const eventIdToDelete = prevCalendarEventId || reminder?.calendarEventId;
        if (eventIdToDelete) {
          void GoogleCalendarService.deleteReminderEvent(eventIdToDelete);
        }
        if (reminder && (reminder.calendarEventId || reminder.calendarHtmlLink || reminder.calendarSyncError)) {
          setNotes((prev) =>
            prev.map((n) => {
              if (n.id !== note.id || !n.reminder) return n;
              const cleaned: Note = {
                ...n,
                reminder: {
                  ...n.reminder,
                  calendarEventId: null,
                  calendarHtmlLink: null,
                  calendarSyncError: null,
                },
              };
              queueNoteSync(cleaned);
              return cleaned;
            }),
          );
        }
        return;
      }

      void GoogleCalendarService.upsertReminderEvent(note, reminder).then((res) => {
        setNotes((prev) =>
          prev.map((n) => {
            if (n.id !== note.id || !n.reminder) return n;
            const nextEventId = res.eventId ?? n.reminder.calendarEventId ?? null;
            const nextHtmlLink = res.htmlLink ?? n.reminder.calendarHtmlLink ?? null;
            const nextError = res.error ?? null;
            if (
              n.reminder.calendarEventId === nextEventId &&
              n.reminder.calendarHtmlLink === nextHtmlLink &&
              (n.reminder.calendarSyncError ?? null) === nextError
            ) {
              return n;
            }
            const updated: Note = {
              ...n,
              reminder: {
                ...n.reminder,
                calendarEventId: nextEventId,
                calendarHtmlLink: nextHtmlLink,
                calendarSyncError: nextError,
              },
            };
            queueNoteSync(updated);
            return updated;
          }),
        );
      });
    },
    [queueNoteSync],
  );

  const remove = useCallback(
    (id: string) => {
      const target = notesRef.current.find((n) => n.id === id);
      if (isSystemGroupNote(target)) {
        alert(`'${target?.title || '시스템'}' 그룹은 할일 관리의 필수 상위 그룹이므로 삭제할 수 없습니다.`);
        return;
      }
      setNotes((prev) => {
        const currentTarget = prev.find((n) => n.id === id);
        if (!currentTarget || isSystemGroupNote(currentTarget)) return prev;

        const doomed = getDescendantIds(prev, id);
        // 삭제되는 노트에 연동된 Google Calendar 일정이 있으면 함께 삭제
        if (GoogleDriveService.isConnected()) {
          for (const n of prev) {
            if (doomed.has(n.id) && n.reminder?.calendarEventId) {
              void GoogleCalendarService.deleteReminderEvent(n.reminder.calendarEventId);
            }
          }
        }
        const next = prev.filter((n) => !doomed.has(n.id));
        // 끊어진 자식 참조 방지: 삭제된 노트를 부모로 가진 노트는 루트(또는 할일 기본 그룹)로 복구
        const fixed = next.map((n) =>
          n.parentId && doomed.has(n.parentId)
            ? { ...n, parentId: n.projectId === TODO_PROJECT_ID ? TODO_GROUP_TODO_ID : null }
            : n,
        );
        if (selectedId && doomed.has(selectedId)) {
          const siblings = fixed.filter(
            (n) =>
              !isSystemGroupNote(n) &&
              (n.projectId || DEFAULT_PROJECT_ID) === selectedProjectId &&
              n.parentId === currentTarget.parentId,
          );
          const projectRemaining = fixed.filter(
            (n) => !isSystemGroupNote(n) && (n.projectId || DEFAULT_PROJECT_ID) === selectedProjectId,
          );
          setSelectedId(siblings[0]?.id ?? projectRemaining[0]?.id ?? null);
        }
        // 연결/자동동기화 상태와 무관하게 삭제 이력을 항상 기록하여 다음 동기화 시 부활 방지
        for (const doomedId of doomed) {
          GoogleDriveService.recordDeletedNote(doomedId);
        }
        NoteRepository.save(fixed);
        if (GoogleDriveService.isConnected() && googleConfig.autoSync) {
          queueProjectSync();
        }
        return fixed;
      });
    },
    [selectedId, selectedProjectId, googleConfig.autoSync, queueProjectSync],
  );

  const updateTitle = useCallback(
    (id: string, title: string) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id === id) {
            // 내용 변경이 없으면 updatedAt 갱신 및 동기화 스킵
            if (n.title === title) return n;
            const updated = { ...refreshTags(withHistory(n), title, n.content), updatedAt: Date.now() };
            queueNoteSync(updated);
            return updated;
          }
          return n;
        }),
      );
    },
    [refreshTags, queueNoteSync],
  );

  const updateContent = useCallback(
    (id: string, content: string) => {
      setNotes((prev) => {
        let updatedTarget: Note | undefined;
        const nextList = prev.map((n) => {
          if (n.id === id) {
            // 내용 변경이 없으면 updatedAt 갱신, 히스토리 스냅샷 및 동기화 스킵
            if (n.content === content) return n;
            const updated = { ...refreshTags(withHistory(n), n.title, content), updatedAt: Date.now() };
            queueNoteSync(updated);
            updatedTarget = updated;
            return updated;
          }
          return n;
        });

        // 일반 노트의 체크리스트 항목이 체크/해제되었을 때, 연결된 할일 노트의 상태를 자동 동기화
        if (updatedTarget && updatedTarget.projectId !== TODO_PROJECT_ID) {
          const syncRes = syncSourceChecklistToTodoNotes(updatedTarget, content, nextList);
          if (syncRes.changed) {
            const prevMap = new Map(nextList.map((item) => [item.id, item]));
            syncRes.updatedNotes.forEach((n) => {
              if (n.projectId === TODO_PROJECT_ID && n.todoMeta?.sourceNoteId === id) {
                queueNoteSync(n);
                const prevTodo = prevMap.get(n.id);
                if (prevTodo && prevTodo.todoMeta?.status !== n.todoMeta?.status && n.reminder) {
                  syncNoteReminderWithCalendar(n, n.reminder.calendarEventId);
                }
              }
            });
            return syncRes.updatedNotes;
          }
        }

        return nextList;
      });
    },
    [refreshTags, queueNoteSync, syncNoteReminderWithCalendar],
  );

  const updateColor = useCallback(
    (id: string, color: string) => {
      setNotes((prev) => {
        // 부모 노드의 색상 변경 시 모든 자손(자식, 손자 등) 노드의 색상도 함께 연동 변경
        const targetIds = getDescendantIds(prev, id);
        return prev.map((n) => {
          if (targetIds.has(n.id)) {
            if (n.color === color) return n;
            const updated = { ...n, color, updatedAt: Date.now() };
            queueNoteSync(updated);
            return updated;
          }
          return n;
        });
      });
    },
    [queueNoteSync],
  );

  const setReminder = useCallback(
    (id: string, reminder: NoteReminder | null) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id === id) {
            const prevEventId = n.reminder?.calendarEventId ?? null;
            const prevHtmlLink = n.reminder?.calendarHtmlLink ?? null;
            const mergedReminder: NoteReminder | null = reminder
              ? {
                  ...reminder,
                  syncToCalendar: reminder.syncToCalendar ?? true,
                  calendarEventId:
                    reminder.syncToCalendar === false
                      ? null
                      : (reminder.calendarEventId ?? prevEventId),
                  calendarHtmlLink:
                    reminder.syncToCalendar === false
                      ? null
                      : (reminder.calendarHtmlLink ?? prevHtmlLink),
                  calendarSyncError: null,
                }
              : null;
            const updated: Note = { ...n, reminder: mergedReminder, updatedAt: Date.now() };
            queueNoteSync(updated);
            syncNoteReminderWithCalendar(updated, prevEventId);
            return updated;
          }
          return n;
        }),
      );
    },
    [queueNoteSync, syncNoteReminderWithCalendar],
  );

  const dismissReminder = useCallback(
    (id: string) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id || !n.reminder) return n;
          let updated: Note;
          if (n.reminder.repeat !== 'none') {
            const nextTime = computeNextReminderTime(n.reminder.targetAt, n.reminder.repeat);
            updated = {
              ...n,
              reminder: {
                ...n.reminder,
                targetAt: nextTime,
                repeat: n.reminder.repeat,
                dismissed: false,
                snoozedUntil: null,
              },
              updatedAt: Date.now(),
            };
          } else {
            updated = {
              ...n,
              reminder: {
                ...n.reminder,
                dismissed: true,
                snoozedUntil: null,
              },
              updatedAt: Date.now(),
            };
          }
          queueNoteSync(updated);
          syncNoteReminderWithCalendar(updated, n.reminder.calendarEventId);
          return updated;
        }),
      );
      setActiveAlarmNote((cur) => (cur?.id === id ? null : cur));
    },
    [queueNoteSync, syncNoteReminderWithCalendar],
  );

  const snoozeReminder = useCallback(
    (id: string, minutes = 5) => {
      const snoozeMs = Date.now() + minutes * 60 * 1000;
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id || !n.reminder) return n;
          const updated = {
            ...n,
            reminder: {
              ...n.reminder,
              snoozedUntil: snoozeMs,
            },
            updatedAt: Date.now(),
          };
          queueNoteSync(updated);
          syncNoteReminderWithCalendar(updated, n.reminder.calendarEventId);
          return updated;
        }),
      );
      setActiveAlarmNote((cur) => (cur?.id === id ? null : cur));
    },
    [queueNoteSync, syncNoteReminderWithCalendar],
  );

  const closeAlarmModal = useCallback(() => {
    setActiveAlarmNote(null);
  }, []);

  const togglePin = useCallback(
    (id: string) =>
      mutate(id, (n) => {
        if (isSystemGroupNote(n)) return n;
        return { ...n, pinned: !n.pinned };
      }),
    [mutate],
  );
  const toggleFavorite = useCallback(
    (id: string) =>
      mutate(id, (n) => {
        if (isSystemGroupNote(n)) return n;
        return { ...n, favorite: !n.favorite };
      }),
    [mutate],
  );

  const setParent = useCallback(
    (id: string, parentId: string | null) => {
      setNotes((prev) => {
        if (parentId === id) return prev;
        // 사이클 방지: 자손을 부모로 지정 불가
        if (parentId && getDescendantIds(prev, id).has(parentId)) return prev;
        if (parentId && !prev.some((n) => n.id === parentId)) return prev;

        const targetNote = prev.find((n) => n.id === id);
        // 시스템 그룹 노트 자체는 부모를 변경할 수 없음
        if (isSystemGroupNote(targetNote)) return prev;

        // 할일 노트를 다른 할일 그룹(To Do, Doing, Done, Drop) 또는 다른 할일 카드의 하위로 이동하는 경우
        if (targetNote && targetNote.projectId === TODO_PROJECT_ID && parentId) {
          if (GROUP_ID_TO_STATUS[parentId]) {
            const newStatus = GROUP_ID_TO_STATUS[parentId];
            if (targetNote.parentId === parentId && targetNote.todoMeta?.status === newStatus) return prev;
            const syncRes = syncTodoStatusToSourceNote(targetNote, newStatus, prev, {
              moveToGroupRoot: true,
            });
            const changedSet = new Set(syncRes.changedNoteIds);
            syncRes.updatedNotes.forEach((n) => {
              if (changedSet.has(n.id)) {
                queueNoteSync(n);
                if (n.projectId === TODO_PROJECT_ID && n.reminder) {
                  syncNoteReminderWithCalendar(n, n.reminder.calendarEventId);
                }
              }
            });
            return syncRes.updatedNotes;
          }

          const parentNote = prev.find((n) => n.id === parentId);
          if (parentNote && parentNote.projectId === TODO_PROJECT_ID) {
            const newStatus = getEffectiveTodoStatus(parentNote, prev);
            const movedTarget: Note = {
              ...targetNote,
              parentId,
              updatedAt: Date.now(),
            };
            const listWithMovedParent = prev.map((n) => (n.id === id ? movedTarget : n));
            const syncRes = syncTodoStatusToSourceNote(movedTarget, newStatus, listWithMovedParent, {
              moveToGroupRoot: false,
            });
            const changedSet = new Set(syncRes.changedNoteIds);
            syncRes.updatedNotes.forEach((n) => {
              if (changedSet.has(n.id)) {
                queueNoteSync(n);
                if (n.projectId === TODO_PROJECT_ID && n.reminder) {
                  syncNoteReminderWithCalendar(n, n.reminder.calendarEventId);
                }
              }
            });
            return syncRes.updatedNotes;
          }
        }

        const parentColor = parentId ? prev.find((n) => n.id === parentId)?.color : null;
        const targetIds = parentColor ? getDescendantIds(prev, id) : null;

        return prev.map((n) => {
          if (n.id === id) {
            const updated = {
              ...n,
              parentId,
              color: parentColor || n.color,
              updatedAt: Date.now(),
            };
            queueNoteSync(updated);
            return updated;
          }
          if (targetIds && targetIds.has(n.id) && parentColor) {
            const updated = { ...n, color: parentColor, updatedAt: Date.now() };
            queueNoteSync(updated);
            return updated;
          }
          return n;
        });
      });
    },
    [queueNoteSync, syncNoteReminderWithCalendar],
  );

  /** 이전 형제를 부모로 (들여쓰기) */
  const indent = useCallback(
    (id: string) => {
      setNotes((prev) => {
        const target = prev.find((n) => n.id === id);
        if (!target) return prev;
        if (isSystemGroupNote(target)) return prev;
        const siblings = prev
          .filter(
            (n) =>
              (n.projectId || DEFAULT_PROJECT_ID) === (target.projectId || DEFAULT_PROJECT_ID) &&
              (n.parentId ?? null) === (target.parentId ?? null),
          )
          .sort(sortNotes);
        const idx = siblings.findIndex((n) => n.id === id);
        if (idx <= 0) return prev;
        const newParent = siblings[idx - 1];
        if (getDescendantIds(prev, id).has(newParent.id)) return prev;
        return prev.map((n) => {
          if (n.id === id) {
            const updated = { ...n, parentId: newParent.id, updatedAt: Date.now() };
            queueNoteSync(updated);
            return updated;
          }
          return n;
        });
      });
    },
    [queueNoteSync],
  );

  /** 부모의 형제로 (내어쓰기) */
  const outdent = useCallback(
    (id: string) => {
      setNotes((prev) => {
        const target = prev.find((n) => n.id === id);
        if (!target || !target.parentId) return prev;
        if (isSystemGroupNote(target)) return prev;
        // 할일 관리의 최상위 상태 그룹(To Do, Doing, Done, Drop) 직속 카드는 그룹 밖(루트)으로 내어쓰기 불가
        if (isSystemGroupNote(target.parentId)) return prev;
        const parent = prev.find((n) => n.id === target.parentId);
        if (!parent || isSystemGroupNote(parent)) return prev;
        const grandParent = parent?.parentId ?? null;
        return prev.map((n) => {
          if (n.id === id) {
            const updated = { ...n, parentId: grandParent, updatedAt: Date.now() };
            queueNoteSync(updated);
            return updated;
          }
          return n;
        });
      });
    },
    [queueNoteSync],
  );

  /** 히스토리 스냅샷으로 복원 (현재 상태는 강제 저장) */
  const restoreHistory = useCallback(
    (id: string, savedAt: number) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const snap = n.history.find((h) => h.savedAt === savedAt);
          if (!snap) return n;
          const cur: Note = withHistory(n, true);
          const restoredTags = snap.tags.length > 0 ? snap.tags : extractHashtags(snap.title, snap.content);
          const updated = {
            ...refreshTags(cur, snap.title, snap.content),
            tags: restoredTags,
            updatedAt: Date.now(),
          };
          queueNoteSync(updated);
          return updated;
        }),
      );
    },
    [refreshTags, queueNoteSync],
  );

  const exportAll = useCallback(() => {
    const blob = new Blob([NoteRepository.exportJson(notes, projects)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bullsnote-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [notes, projects]);

  const importFromFile = useCallback(async (file: File) => {
    const text = await file.text();
    const imported = NoteRepository.importJson(text);
    if (imported.projects && imported.projects.length > 0) {
      setProjects((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        const fresh = imported.projects!.filter((p) => !ids.has(p.id));
        return [...prev, ...fresh];
      });
    }
    setNotes((prev) => {
      const ids = new Set(prev.map((n) => n.id));
      const fresh = imported.notes.filter((n) => !ids.has(n.id));
      return [...fresh, ...prev].sort(sortNotes);
    });
  }, []);

  // 현재 선택된 프로젝트의 노트들
  const currentProjectNotes = useMemo(
    () => notes.filter((n) => (n.projectId || DEFAULT_PROJECT_ID) === selectedProjectId),
    [notes, selectedProjectId],
  );

  // 선택된 노트가 현재 프로젝트에 없으면 첫 번째 일반 노트로 동기화 (시스템 그룹 노트 제외)
  useEffect(() => {
    if (!ready) return;
    if (selectedId && isSystemGroupNote(selectedId)) {
      const selectable = currentProjectNotes.filter((n) => !isSystemGroupNote(n));
      setSelectedId(selectable[0]?.id ?? null);
      return;
    }
    if (selectedId && !currentProjectNotes.some((n) => n.id === selectedId)) {
      const stillExistsInAll = notes.some((n) => n.id === selectedId);
      if (
        stillExistsInAll &&
        (showFavoriteOnly || selectedDate !== null || search.trim() !== '' || quickFilter !== 'all')
      ) {
        return;
      }
      const selectable = currentProjectNotes.filter((n) => !isSystemGroupNote(n));
      setSelectedId(selectable[0]?.id ?? null);
    }
  }, [
    selectedProjectId,
    ready,
    selectedId,
    currentProjectNotes,
    notes,
    showFavoriteOnly,
    selectedDate,
    search,
    quickFilter,
  ]);

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of currentProjectNotes) for (const t of n.tags) map.set(t, (map.get(t) ?? 0) + 1);
    return [...map.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  }, [currentProjectNotes]);

  const isFiltering =
    search.trim() !== '' ||
    activeTag !== null ||
    selectedDate !== null ||
    showFavoriteOnly ||
    quickFilter !== 'all' ||
    (searchScope === 'all' && search.trim() !== '');

  const flat = useMemo(() => {
    // 1. 검색 쿼리가 입력된 경우 고도화된 검색 엔진(초성, 다중단어 AND, 연산자, 관련도 랭킹) 사용
    if (search.trim() !== '') {
      const searchResults = searchNotes(notes, search, projects, {
        scope: searchScope,
        selectedProjectId,
      });

      return searchResults
        .map((r) => r.note)
        .filter((n) => !isSystemGroupNote(n))
        .filter((n) => (showFavoriteOnly ? n.favorite : true))
        .filter((n) => (activeTag ? n.tags.includes(activeTag) : true))
        .filter((n) => {
          if (!selectedDate) return true;
          return formatDateIso(new Date(n.createdAt || 0)) === selectedDate;
        })
        .filter((n) => {
          if (quickFilter === 'favorite') return n.favorite;
          if (quickFilter === 'pinned') return n.pinned;
          if (quickFilter === 'reminder') return Boolean(n.reminder && !n.reminder.dismissed);
          if (quickFilter === 'attachment') return Boolean(n.attachments && n.attachments.length > 0);
          return true;
        });
    }

    // 2. 검색 쿼리 없이 필터(즐겨찾기, 태그, 날짜, 퀵필터)만 활성화된 경우
    const isDateFiltered = selectedDate !== null;
    const isQuickFiltered = quickFilter !== 'all';
    const isFavFiltered = showFavoriteOnly;
    const pool =
      (searchScope === 'all' && (isQuickFiltered || isDateFiltered)) || isFavFiltered
        ? notes
        : currentProjectNotes;

    return pool
      .filter((n) => !isSystemGroupNote(n))
      .filter((n) => (showFavoriteOnly ? n.favorite : true))
      .filter((n) => (activeTag ? n.tags.includes(activeTag) : true))
      .filter((n) => {
        if (!selectedDate) return true;
        return formatDateIso(new Date(n.createdAt || 0)) === selectedDate;
      })
      .filter((n) => {
        if (quickFilter === 'favorite') return n.favorite;
        if (quickFilter === 'pinned') return n.pinned;
        if (quickFilter === 'reminder') return Boolean(n.reminder && !n.reminder.dismissed);
        if (quickFilter === 'attachment') return Boolean(n.attachments && n.attachments.length > 0);
        return true;
      })
      .sort(noteComparator);
  }, [
    notes,
    currentProjectNotes,
    projects,
    search,
    searchScope,
    selectedProjectId,
    activeTag,
    selectedDate,
    showFavoriteOnly,
    quickFilter,
    noteComparator,
  ]);

  const tree = useMemo(
    () => buildTree(isFiltering ? flat : currentProjectNotes, noteComparator),
    [isFiltering, flat, currentProjectNotes, noteComparator],
  );

  // --- Google Drive 동기화 액션 ---
  const syncWithGoogleDrive = useCallback(async (isSilent = false) => {
    if (!GoogleDriveService.isConnected()) return;

    // 이미 동기화가 진행 중인 경우, 사용자가 수동으로 버튼을 눌렀다면 로딩 표시만 활성화하고 대기
    if (isSyncingRef.current) {
      if (!isSilent) {
        setIsSyncing(true);
      }
      return;
    }

    // 자동 백그라운드 동기화인 경우, 사용자가 타이핑 중이면 작업 방해 방지를 위해 건너뜀
    if (isSilent && (isLocalSavePendingRef.current || pendingNotesRef.current.size > 0)) {
      return;
    }

    if (!isSilent) {
      setIsSyncing(true);
      setSyncError(null);
    }
    isSyncingRef.current = true;

    try {
      const curNotes = notesRef.current;
      const curProjects = projectsRef.current;
      const res = await GoogleDriveService.syncAll(curNotes, curProjects);
      if (res.success) {
        setSyncError(null);
        setGoogleConfigState(GoogleDriveService.getConfig());
        if (!res.hasRemoteChanges) {
          return;
        }
        const latestLocalMap = new Map(notesRef.current.map((n) => [n.id, n]));
        const reconciledNotes = res.notes.map((syncedNote) => {
          const latestLocal = latestLocalMap.get(syncedNote.id);
          if (latestLocal && latestLocal.updatedAt > syncedNote.updatedAt) {
            return { ...latestLocal, syncedAt: syncedNote.syncedAt };
          }
          return syncedNote;
        });
        const ensured = ensureTodoProjectAndGroups(res.projects, reconciledNotes);
        const sortedNotes = ensured.notes.sort(sortNotes);
        const nextProjects = ensured.projects;
        setNotes(sortedNotes);
        setProjects(nextProjects);
        NoteRepository.saveProjects(nextProjects);
        setGoogleConfigState(GoogleDriveService.getConfig());

        // 선택 상태 보정: 동기화 후 현재 선택된 프로젝트와 노트가 유효하지 않으면 서버 데이터 기준으로 안전하게 재선택
        const currentProjId = selectedProjectIdRef.current;
        const hasProj =
          currentProjId === TODO_PROJECT_ID || nextProjects.some((p) => p.id === currentProjId);
        const regularProjects = nextProjects.filter((p) => p.id !== TODO_PROJECT_ID);
        const nextProjId = hasProj
          ? currentProjId
          : regularProjects[0]?.id ?? nextProjects[0]?.id ?? DEFAULT_PROJECT_ID;
        if (nextProjId !== currentProjId) {
          setSelectedProjectId(nextProjId);
        }

        // 선택 상태 보정:
        // - 현재 노트가 선택되어 있지 않은 경우(빈 폴더 조회 등): 강제로 다른 폴더의 노트를 선택하지 않고 null 유지
        // - 현재 선택된 노트가 동기화 후에도 전체 노트 목록에 존재하면(검색/즐겨찾기/날짜/태그 필터 등 포함) 그대로 유지
        // - 원격에서 삭제되어 더 이상 존재하지 않는 경우에만 현재 폴더의 첫 일반 노트로 폴백
        const currentSelId = selectedIdRef.current;
        if (currentSelId !== null) {
          const stillExists =
            !isSystemGroupNote(currentSelId) && sortedNotes.some((n) => n.id === currentSelId);
          if (!stillExists) {
            const projectNotes = sortedNotes.filter(
              (n) => !isSystemGroupNote(n) && (n.projectId || DEFAULT_PROJECT_ID) === nextProjId,
            );
            setSelectedId(projectNotes[0]?.id ?? null);
          }
        }
      } else {
        setSyncError(res.error || 'Google Drive 동기화 중 오류가 발생했습니다.');
      }
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, []);

  syncWithGoogleDriveRef.current = syncWithGoogleDrive;

  const saveGoogleConfig = useCallback((patch: Partial<GoogleDriveConfig>) => {
    const updated = GoogleDriveService.saveConfig(patch);
    setGoogleConfigState(updated);
  }, []);

  const loginGoogle = useCallback(async () => {
    const res = await GoogleDriveService.login();
    if (res.success) {
      setGoogleConfigState(GoogleDriveService.getConfig());
      void syncWithGoogleDrive(false);
    }
    return res;
  }, [syncWithGoogleDrive]);

  const importMobileSyncCode = useCallback(
    async (code: string) => {
      const res = await GoogleDriveService.importMobileSyncCode(code);
      if (res.success) {
        setGoogleConfigState(GoogleDriveService.getConfig());
        void syncWithGoogleDrive(false);
      }
      return res;
    },
    [syncWithGoogleDrive],
  );

  const logoutGoogle = useCallback(() => {
    GoogleDriveService.logout();
    setGoogleConfigState(GoogleDriveService.getConfig());
    setGuestMode(false);
    setSyncError(null);
  }, []);

  // Google Drive 최초 기동 시 1회만 클라우드 데이터와 양방향 동기화
  const initialGoogleSyncedRef = useRef(false);
  useEffect(() => {
    if (!ready || initialGoogleSyncedRef.current) return;
    if (googleConfig.enabled && GoogleDriveService.isConnected()) {
      initialGoogleSyncedRef.current = true;
      void syncWithGoogleDrive(true);
    }
  }, [ready, googleConfig.enabled, syncWithGoogleDrive]);

  // --- Google Drive 다중 기기 자동 동기화 트리거 및 사용자 설정 주기별 폴링 ---
  useEffect(() => {
    if (!ready || !googleConnected || !googleConfig.autoSync) return;

    // 1. 창 포커스 복귀 시
    const onFocus = async () => {
      if (await GoogleDriveService.hasRemoteChangesQuick()) {
        void syncWithGoogleDrive(true);
      }
    };

    // 2. 브라우저 탭 활성화 시
    const onVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        if (await GoogleDriveService.hasRemoteChangesQuick()) {
          void syncWithGoogleDrive(true);
        }
      }
    };

    // 3. 인터넷 재연결 시 (오프라인 -> 온라인)
    const onOnline = () => void syncWithGoogleDrive(true);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);

    // 4. 사용자가 설정한 주기(pollingIntervalMs)로 백그라운드 초경량 헤더 체크
    let syncInterval: ReturnType<typeof setInterval> | null = null;
    const intervalMs = googleConfig.pollingIntervalMs;
    if (intervalMs && intervalMs > 0) {
      syncInterval = setInterval(async () => {
        if (
          document.visibilityState === 'visible' &&
          !isLocalSavePendingRef.current &&
          pendingNotesRef.current.size === 0
        ) {
          const hasRemote = await GoogleDriveService.hasRemoteChangesQuick();
          if (hasRemote) {
            void syncWithGoogleDrive(true);
          }
        }
      }, intervalMs);
    }

    return () => {
      if (syncInterval) clearInterval(syncInterval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
    };
  }, [ready, googleConnected, googleConfig.autoSync, googleConfig.pollingIntervalMs, syncWithGoogleDrive]);

  const [googleSyncModalOpened, setGoogleSyncModalOpened] = useState(false);
  const openGoogleSyncModal = useCallback(() => setGoogleSyncModalOpened(true), []);
  const closeGoogleSyncModal = useCallback(() => setGoogleSyncModalOpened(false), []);

  const addAttachment = useCallback(
    (noteId: string, attachment: NoteAttachment) => {
      mutate(noteId, (n) => ({
        ...n,
        attachments: [...(n.attachments || []), attachment],
      }));
    },
    [mutate]
  );

  const removeAttachment = useCallback(
    async (noteId: string, attachmentId: string) => {
      const targetNote = notes.find((n) => n.id === noteId);
      const att = targetNote?.attachments?.find((a) => a.id === attachmentId);
      if (att && att.storagePath) {
        try {
          await GoogleDriveService.deleteAttachment(att.storagePath);
        } catch (e) {
          console.warn('[GoogleDrive] 첨부파일 삭제 예외:', e);
        }
      }
      mutate(noteId, (n) => {
        const nextAttachments = (n.attachments || []).filter((a) => a.id !== attachmentId);
        const nextContent = att ? markAttachmentDeletedInContent(n.content, att) : n.content;
        return {
          ...n,
          content: nextContent,
          attachments: nextAttachments,
        };
      });
    },
    [notes, mutate]
  );

  const [geminiModalOpened, setGeminiModalOpened] = useState(false);
  const [geminiModalTab, setGeminiModalTab] = useState<'clipboard' | 'prompt' | 'settings'>('clipboard');

  const openGeminiModal = useCallback((tab: 'clipboard' | 'prompt' | 'settings' = 'clipboard') => {
    setGeminiModalTab(tab);
    setGeminiModalOpened(true);
  }, []);

  const closeGeminiModal = useCallback(() => {
    setGeminiModalOpened(false);
  }, []);

  const createNoteFromGemini = useCallback(
    async (params: { title?: string; markdown: string; prompt?: string }): Promise<string> => {
      const headless = await getHeadless();
      const extracted = GeminiService.extractTitleAndContent(params.markdown);
      const noteTitle = params.title?.trim() || extracted.title || 'Gemini AI 노트';
      const bodyMarkdown = extracted.markdownBody;

      // 마크다운을 BlockNote 블록으로 파싱
      const blocks = await headless.toBlocks(bodyMarkdown);
      const contentJson = JSON.stringify(blocks);

      // 1. "Gemini AI" 프로젝트 찾기 (또는 자동 생성)
      let geminiProj = projects.find(
        (p) =>
          p.name.trim().toLowerCase() === 'gemini ai' ||
          p.name.trim().toLowerCase() === 'ai notes' ||
          p.name.trim() === 'Gemini AI'
      );
      let geminiProjId = geminiProj?.id;

      if (!geminiProj) {
        geminiProjId = createProjectId();
        const newProj: Project = {
          id: geminiProjId,
          name: 'Gemini AI',
          icon: '✨',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setProjects((prev) => [...prev, newProj]);
        queueProjectSync(newProj);
        geminiProj = newProj;
      }

      // 2. 태그 추출 및 기본 태그 결합
      const autoTags = extractHashtagsFromText(bodyMarkdown);
      const combinedTags = Array.from(new Set(['gemini', 'ai', ...autoTags]));

      // 3. 새 노트 생성
      const newNote = createEmptyNote({
        title: noteTitle,
        projectId: geminiProjId,
        parentId: null,
        color: 'purple',
      });
      newNote.content = contentJson;
      newNote.tags = combinedTags;

      setNotes((prev) => [newNote, ...prev]);
      queueNoteSync(newNote);

      // 프로젝트 및 노트 선택 전환
      setSelectedProjectId(geminiProjId!);
      setSelectedDate(null);
      select(newNote.id);

      return newNote.id;
    },
    [projects, queueProjectSync, queueNoteSync, select]
  );

  const createNoteFromClipboard = useCallback(async (): Promise<{ success: boolean; noteId?: string; error?: string }> => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        return { success: false, error: '클립보드에 복사된 텍스트가 없습니다.' };
      }
      const noteId = await createNoteFromGemini({ markdown: text });
      return { success: true, noteId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `클립보드 접근 실패: ${msg}` };
    }
  }, [createNoteFromGemini]);

  const createTodosFromChecklist = useCallback(
    (sourceNote: Note, items: ExtractedChecklistItem[]) => {
      // 1. 할일관리 프로젝트 및 상위 그룹 보장
      const ensured = ensureTodoProjectAndGroups(projectsRef.current, notesRef.current);
      if (ensured.created) {
        setProjects(ensured.projects);
        ensured.projects.forEach((p) => {
          if (p.id === TODO_PROJECT_ID) queueProjectSync(p);
        });
        ensured.notes.forEach((n) => {
          if (n.systemGroupType) queueNoteSync(n);
        });
      }

      // 2. 할일 노트들 생성 및 이미 등록된 할일 노트 업데이트
      const { newNotes, updatedNotes, updatedCount, duplicateCount } = createTodoNotes(
        sourceNote,
        items,
        ensured.notes,
      );
      if (newNotes.length > 0 || updatedNotes.length > 0) {
        const updatedMap = new Map(updatedNotes.map((n) => [n.id, n]));
        setNotes((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const missingGroupNotes = ensured.notes.filter((n) => !existingIds.has(n.id));
          const mergedPrev = prev.map((n) => updatedMap.get(n.id) || n);
          return [...newNotes, ...missingGroupNotes, ...mergedPrev];
        });
        newNotes.forEach((n) => queueNoteSync(n));
        updatedNotes.forEach((n) => queueNoteSync(n));
      }
      return { createdCount: newNotes.length, updatedCount, duplicateCount };
    },
    [queueProjectSync, queueNoteSync],
  );

  const changeTodoStatus = useCallback(
    (todoNoteId: string, newStatus: TodoStatus, moveToGroupRoot = false) => {
      setNotes((prev) => {
        const todoNote = prev.find((n) => n.id === todoNoteId);
        if (!todoNote) return prev;
        // 시스템 그룹 노트(Doing, To Do, Done, Drop)는 상태를 변경할 수 없음
        if (isSystemGroupNote(todoNote)) return prev;
        // 이미 해당 상태이고 그룹 루트 이동 요청이 아니면 불필요한 재연산 방지
        const currentStatus = getEffectiveTodoStatus(todoNote, prev);
        const targetGroupId = STATUS_TO_GROUP_ID[newStatus];
        if (
          currentStatus === newStatus &&
          (!moveToGroupRoot || todoNote.parentId === targetGroupId) &&
          todoNote.todoMeta?.status === newStatus
        ) {
          return prev;
        }

        const { updatedNotes, changedNoteIds } = syncTodoStatusToSourceNote(
          todoNote,
          newStatus,
          prev,
          { moveToGroupRoot },
        );
        const changedSet = new Set(changedNoteIds);
        updatedNotes.forEach((n) => {
          if (changedSet.has(n.id)) {
            queueNoteSync(n);
            if (n.projectId === TODO_PROJECT_ID && n.reminder) {
              syncNoteReminderWithCalendar(n, n.reminder.calendarEventId);
            }
          }
        });
        return updatedNotes;
      });
    },
    [queueNoteSync, syncNoteReminderWithCalendar],
  );

  const hasEncryptedNotes = useMemo(() => hasAnyEncryptedNotes(notes), [notes]);

  const decryptAllLegacyNotes = useCallback(
    async (password: string): Promise<{ success: boolean; count: number }> => {
      const res = await recoverEncryptedNotes(notesRef.current, password);
      if (!res.success) {
        return { success: false, count: 0 };
      }

      // 복호화된 본문 중 마크다운/일반 텍스트가 있으면 BlockNote JSON으로 안전하게 변환
      const headless = await getHeadless();
      const normalized = await Promise.all(
        res.notes.map(async (n) => {
          if (!isBlocksJson(n.content) && !hasLegacyEncryptedText(n.content)) {
            const blocks = await headless.toBlocks(n.content);
            const contentJson = JSON.stringify(blocks);
            return { ...n, content: contentJson, tags: extractHashtags(n.title, contentJson) };
          }
          return n;
        }),
      );

      setNotes(normalized);
      NoteRepository.save(normalized);
      if (GoogleDriveService.isConnected()) {
        void syncWithGoogleDriveRef.current(false);
      }
      return { success: true, count: res.recoveredCount };
    },
    [],
  );

  const selected = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);

  const value = useMemo(
    () => ({
      projects,
      selectedProjectId,
      selectedProject,
      notes,
      ready,
      selectedId,
      selected,
      search,
      searchTokens,
      searchScope,
      setSearchScope,
      quickFilter,
      setQuickFilter,
      quickSearchModalOpened,
      openQuickSearchModal,
      closeQuickSearchModal,
      activeTag,
      selectedDate,
      setSelectedDate,
      openOrCreateDailyNote,
      showFavoriteOnly,
      tagCounts,
      tree,
      flat,
      isFiltering,
      vaultMode,
      vaultPath,
      vaultError,
      storageError,
      activeAlarmNote,
      googleConnected,
      googleConfig,
      guestMode,
      enterGuestMode,
      isSyncing,
      syncError,
      lastSyncedAt: googleConfig.lastSyncedAt,
      projectSortOption,
      noteSortOption,
      sortedProjects,
      projectTree,
      hasEncryptedNotes,
      decryptAllLegacyNotes,
      setProjectSortOption,
      setNoteSortOption,
      select,
      create,
      duplicate,
      remove,
      updateTitle,
      updateContent,
      updateColor,
      setReminder,
      dismissReminder,
      snoozeReminder,
      closeAlarmModal,
      togglePin,
      toggleFavorite,
      setParent,
      indent,
      outdent,
      restoreHistory,
      setSearch,
      setActiveTag,
      setShowFavoriteOnly,
      exportAll,
      importFromFile,
      chooseVault,
      resync,
      selectProject,
      createProject,
      updateProject,
      setProjectParent,
      indentProject,
      outdentProject,
      deleteProject,
      moveNoteToProject,
      saveGoogleConfig,
      syncWithGoogleDrive,
      loginGoogle,
      importMobileSyncCode,
      logoutGoogle,
      googleSyncModalOpened,
      openGoogleSyncModal,
      closeGoogleSyncModal,
      addAttachment,
      removeAttachment,
      geminiModalOpened,
      geminiModalTab,
      openGeminiModal,
      closeGeminiModal,
      createNoteFromGemini,
      createNoteFromClipboard,
      createTodosFromChecklist,
      changeTodoStatus,
    }),
    [
      projects,
      selectedProjectId,
      selectedProject,
      notes,
      ready,
      selectedId,
      selected,
      search,
      searchTokens,
      searchScope,
      setSearchScope,
      quickFilter,
      setQuickFilter,
      quickSearchModalOpened,
      openQuickSearchModal,
      closeQuickSearchModal,
      activeTag,
      showFavoriteOnly,
      tagCounts,
      tree,
      flat,
      isFiltering,
      vaultMode,
      vaultPath,
      vaultError,
      storageError,
      activeAlarmNote,
      googleConnected,
      googleConfig,
      guestMode,
      enterGuestMode,
      isSyncing,
      syncError,
      select,
      create,
      duplicate,
      remove,
      updateTitle,
      updateContent,
      updateColor,
      setReminder,
      dismissReminder,
      snoozeReminder,
      closeAlarmModal,
      togglePin,
      toggleFavorite,
      setParent,
      indent,
      outdent,
      restoreHistory,
      exportAll,
      importFromFile,
      chooseVault,
      resync,
      selectProject,
      createProject,
      updateProject,
      setProjectParent,
      indentProject,
      outdentProject,
      deleteProject,
      moveNoteToProject,
      saveGoogleConfig,
      syncWithGoogleDrive,
      loginGoogle,
      importMobileSyncCode,
      logoutGoogle,
      projectSortOption,
      noteSortOption,
      sortedProjects,
      projectTree,
      hasEncryptedNotes,
      decryptAllLegacyNotes,
      setProjectSortOption,
      setNoteSortOption,
      googleSyncModalOpened,
      openGoogleSyncModal,
      closeGoogleSyncModal,
      addAttachment,
      removeAttachment,
      selectedDate,
      openOrCreateDailyNote,
      geminiModalOpened,
      geminiModalTab,
      openGeminiModal,
      closeGeminiModal,
      createNoteFromGemini,
      createNoteFromClipboard,
      createTodosFromChecklist,
      changeTodoStatus,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotes(): NotesState & NotesActions {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('NotesProvider 외부에서 useNotes 호출');
  return ctx;
}
