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
  buildTree,
  computeNextReminderTime,
  createEmptyNote,
  createProjectId,
  getDescendantIds,
  TreeNode,
  SortOption,
  compareProjects,
  compareNotesWithOption,
  markAttachmentDeletedInContent,
  TodoStatus,
} from '../model/Note';
import {
  TODO_PROJECT_ID,
  ensureTodoProjectAndGroups,
  createTodoNotes,
  syncTodoStatusToSourceNote,
  syncSourceChecklistToTodoNotes,
  GROUP_ID_TO_STATUS,
  STATUS_TO_GROUP_ID,
  isSystemGroupNote,
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
import { RealtimeStatus, SupabaseConfig, SupabaseService } from '../model/SupabaseService';
import { CryptoService } from '../model/CryptoService';
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
  /** Supabase 클라우드 연동 상태 */
  supabaseConnected: boolean;
  supabaseConfig: SupabaseConfig;
  realtimeStatus: RealtimeStatus;
  isSyncing: boolean;
  syncError: string | null;
  lastSyncedAt: number | null;
  /** 프로젝트 및 노트 정렬 옵션 */
  projectSortOption: SortOption;
  noteSortOption: SortOption;
  sortedProjects: Project[];
  /** 종단간 암호화(E2EE) 보안 상태 */
  isMasterSet: boolean;
  isUnlocked: boolean;
  securityModalOpened: boolean;
  supabaseModalOpened: boolean;
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
  createProject(name: string, icon?: string): string;
  updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'icon'>>): void;
  deleteProject(id: string): void;
  moveNoteToProject(noteId: string, targetProjectId: string): void;
  saveSupabaseConfig(config: SupabaseConfig): Promise<void>;
  syncWithSupabase(isSilent?: boolean): Promise<void>;
  disconnectSupabase(): void;
  setProjectSortOption(opt: SortOption): void;
  setNoteSortOption(opt: SortOption): void;
  /** 보안 액션 */
  openSecurityModal(): void;
  closeSecurityModal(): void;
  setupMasterPassword(password: string): Promise<boolean>;
  unlockMasterPassword(password: string): Promise<boolean>;
  lockMasterPassword(): void;
  removeMasterPassword(): Promise<boolean>;
  /** Supabase 모달 및 첨부파일 액션 */
  openSupabaseModal(): void;
  closeSupabaseModal(): void;
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
    items: Array<{ id?: string; text: string; checked?: boolean }>
  ): { createdCount: number; duplicateCount: number };
  changeTodoStatus(todoNoteId: string, newStatus: TodoStatus): void;
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
    return list[0]?.id ?? DEFAULT_PROJECT_ID;
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

  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null);

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

  // Supabase 클라우드 연동 상태
  const [supabaseConfig, setSupabaseConfigState] = useState<SupabaseConfig>(() => SupabaseService.getConfig());
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>(() => SupabaseService.getRealtimeStatus());
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const supabaseConnected = supabaseConfig.enabled && Boolean(supabaseConfig.url && supabaseConfig.anonKey);

  useEffect(() => {
    return SupabaseService.subscribeToRealtimeStatus(setRealtimeStatus);
  }, []);

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

  const noteComparator = useCallback(
    (a: Note, b: Note) => compareNotesWithOption(a, b, noteSortOption),
    [noteSortOption],
  );

  // 종단간 암호화(E2EE) 보안 상태 및 핸들러
  const [isMasterSet, setIsMasterSet] = useState<boolean>(() => CryptoService.isMasterPasswordSet());
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => CryptoService.isUnlocked());
  const [securityModalOpened, setSecurityModalOpened] = useState(false);

  // 노트 목록에 암호화된 노트가 포함되어 있다면 마스터 비밀번호가 설정된 것으로 자동 감지
  useEffect(() => {
    if (!isMasterSet) {
      if (notes.some((n) => CryptoService.isEncrypted(n.content))) {
        setIsMasterSet(true);
      }
    }
  }, [notes, isMasterSet]);

  // 앱 기동 시 보안 보호가 설정되어 있고 잠겨있다면 자동으로 비밀번호 입력 모달 오픈
  const initialModalPromptRef = useRef(false);
  useEffect(() => {
    if (!initialModalPromptRef.current && isMasterSet && !isUnlocked) {
      initialModalPromptRef.current = true;
      setSecurityModalOpened(true);
    }
  }, [isMasterSet, isUnlocked]);

  const openSecurityModal = useCallback(() => setSecurityModalOpened(true), []);
  const closeSecurityModal = useCallback(() => setSecurityModalOpened(false), []);

  const setupMasterPassword = useCallback(
    async (password: string): Promise<boolean> => {
      // 기존 암호화된 노트가 있다면 그 salt를 재사용하여 호환성 유지
      const encryptedNote = notes.find((n) => CryptoService.isEncrypted(n.content));
      const existingSalt = encryptedNote ? CryptoService.extractSaltHex(encryptedNote.content) : null;

      await CryptoService.setupMasterPassword(password, existingSalt);
      setIsMasterSet(true);
      setIsUnlocked(true);
      // 현재 메모리에 있는 노트들을 복호화하여 편집 가능한 평문으로 전환
      const decrypted = await CryptoService.decryptNotes(notes);
      setNotes(decrypted);
      // 로컬 저장소에는 암호화하여 저장
      const encrypted = await CryptoService.encryptNotes(decrypted);
      NoteRepository.save(encrypted);
      if (supabaseConnected) {
        const verifier = localStorage.getItem('bullsnote.security.verifier.v1');
        if (verifier) void SupabaseService.uploadSecurityVerifier(verifier);
        await SupabaseService.upsertNotes(decrypted);
      }
      return true;
    },
    [notes, supabaseConnected],
  );

  const unlockMasterPassword = useCallback(
    async (password: string): Promise<boolean> => {
      const encryptedSamples = notes
        .map((n) => n.content)
        .filter((c) => CryptoService.isEncrypted(c));
      const ok = await CryptoService.unlock(password, encryptedSamples);
      if (ok) {
        setIsUnlocked(true);
        setIsMasterSet(true);
        // 모든 암호화된 노트를 복호화하여 상태 갱신
        const decrypted = await CryptoService.decryptNotes(notes);
        setNotes(decrypted);
        if (supabaseConnected) {
          const verifier = localStorage.getItem('bullsnote.security.verifier.v1');
          if (verifier) void SupabaseService.uploadSecurityVerifier(verifier);
        }
        return true;
      }
      return false;
    },
    [notes, supabaseConnected],
  );

  const lockMasterPassword = useCallback(async () => {
    if (isLocalSavePendingRef.current && flushLocalSaveRef.current) {
      if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
      await flushLocalSaveRef.current();
    }
    // 잠그기 전 현재 평문 노트들을 암호화하여 로컬에 저장
    const encrypted = await CryptoService.encryptNotes(notes);
    const res = NoteRepository.save(encrypted);
    if (!res.success) {
      setStorageError(res.error || '저장 실패');
    } else {
      setStorageError('');
    }
    CryptoService.lock();
    setIsUnlocked(false);
    // 메모리 상태도 암호화된 상태로 전환하여 평문 메모리 폐기
    setNotes(encrypted);
  }, [notes]);

  const removeMasterPassword = useCallback(async (): Promise<boolean> => {
    // 현재 복호화된 평문 상태의 노트를 로컬에 그대로 저장
    const decrypted = await CryptoService.decryptNotes(notes);
    setNotes(decrypted);
    const res = NoteRepository.save(decrypted);
    if (!res.success) {
      setStorageError(res.error || '저장 실패');
    } else {
      setStorageError('');
    }
    CryptoService.removeMasterPassword();
    setIsMasterSet(false);
    setIsUnlocked(false);
    if (supabaseConnected) {
      await SupabaseService.upsertNotes(decrypted);
      await SupabaseService.deleteNote('__bullsnote_security_verifier__');
    }
    return true;
  }, [notes, supabaseConnected]);


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
    async (currentNotes: Note[], isMaster: boolean, unlocked: boolean, seq: number) => {
      isLocalSavePendingRef.current = false;
      try {
        let notesToSave = currentNotes;
        if (isMaster) {
          if (unlocked) {
            notesToSave = await CryptoService.encryptNotes(currentNotes);
            // 비동기 암호화 완료 후 자신이 최신 요청인지 순번 확인 (경합 방지)
            if (seq !== localSaveSeqRef.current) {
              return;
            }
          } else {
            // 잠금 상태: 암호문은 암호문, 평문은 평문 보존
            notesToSave = currentNotes;
          }
        }
        const res = NoteRepository.save(notesToSave);
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

  // localStorage 모드: 디바운스(400ms) 및 순번 토큰을 적용하여 영속화 (키 입력마다 전체 재암호화 방지)
  useEffect(() => {
    if (vaultMode) return;

    localSaveSeqRef.current += 1;
    const currentSeq = localSaveSeqRef.current;
    isLocalSavePendingRef.current = true;

    const runSave = () => doLocalSave(notes, isMasterSet, isUnlocked, currentSeq);
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
  }, [notes, vaultMode, isMasterSet, isUnlocked, doLocalSave]);

  useEffect(() => {
    if (vaultMode) return;
    NoteRepository.saveProjects(projects);
  }, [projects, vaultMode]);

  // localStorage 모드: 레거시 마이그레이션 (암호화된 노트는 블록 변환 제외)
  const migratedRef = useRef(false);
  useEffect(() => {
    if (vaultMode || migratedRef.current) return;
    migratedRef.current = true;
    (async () => {
      try {
        const current = NoteRepository.load();
        const needsMigration = current.some(
          (n) => !isBlocksJson(n.content) && !CryptoService.isEncrypted(n.content),
        );
        if (!needsMigration) return;
        const headless = await getHeadless();
        const converted = await Promise.all(
          current.map(async (n) => {
            if (isBlocksJson(n.content) || CryptoService.isEncrypted(n.content)) return n;
            const blocks = await headless.toBlocks(n.content);
            const content = JSON.stringify(blocks);
            return { ...n, content, tags: extractHashtags(n.title, content) };
          }),
        );
        NoteRepository.save(converted);
        setNotes(converted.sort(sortNotes));
        setSelectedId((prev) => prev ?? converted[0]?.id ?? null);
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
        const loadedProjects = sidecarProjects(sidecar);
        setProjects(loadedProjects);
        setSelectedProjectId((prev) =>
          loadedProjects.some((p) => p.id === prev) ? prev : loadedProjects[0]?.id ?? DEFAULT_PROJECT_ID,
        );

        if (files.length === 0 && !sidecar.migratedLs) {
          let current = NoteRepository.load();
          if (current.length === 0) current = seedNotes();
          const migrated = await Promise.all(
            current.map(async (n) => {
              const contentJson = isBlocksJson(n.content)
                ? n.content
                : JSON.stringify(await headless.toBlocks(n.content));
              return { ...n, content: contentJson, tags: extractHashtags(n.title, contentJson) };
            }),
          );
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
          setNotes(migrated.sort(sortNotes));
          setSelectedId((prev) => prev ?? migrated[0]?.id ?? null);
        } else {
          const loaded: Note[] = [];
          for (const f of files) {
            try {
              const text = await vault.read(f.id);
              if (text == null) continue;
              const parsed = parseNoteFile(f.id, text);
              if (!parsed) continue;
              const decryptedBody = await CryptoService.decrypt(parsed.body);
              const withUrls = await swapAssetsToDataUrls(decryptedBody, (name) => vault.readAsset(name));
              const blocks = await headless.toBlocks(withUrls);
              const content = JSON.stringify(blocks);
              loaded.push({
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
          setNotes(loaded.sort(sortNotes));
          setSelectedId((prev) => (loaded.some((n) => n.id === prev) ? prev : loaded[0]?.id ?? null));
        }
      } catch (e) {
        setVaultError(`볼트를 열 수 없습니다: ${e instanceof Error ? e.message : e}`);
        const loaded = NoteRepository.load();
        const finalNotes = loaded.length > 0 ? loaded : seedNotes();
        setNotes(finalNotes.sort(sortNotes));
        setSelectedId((prev) => prev ?? finalNotes[0]?.id ?? null);
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
          let finalBody = body;
          if (CryptoService.isMasterPasswordSet() && CryptoService.isUnlocked()) {
            finalBody = await CryptoService.encrypt(body);
          }
          const text = serializeNoteFile(n, finalBody);
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
          const extProjects = sidecarProjects(sidecar);
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

  // --- Supabase 변경 감지 증분 동기화 큐 (Idle 시 네트워크 0건) ---
  const pendingNotesRef = useRef<Map<string, Note>>(new Map());
  const noteSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueNoteSync = useCallback(
    (note: Note) => {
      if (!supabaseConnected || !supabaseConfig.autoSync || isSyncingRef.current) return;
      pendingNotesRef.current.set(note.id, note);
      if (noteSyncTimerRef.current) clearTimeout(noteSyncTimerRef.current);
      noteSyncTimerRef.current = setTimeout(async () => {
        const notesToSync = Array.from(pendingNotesRef.current.values());
        pendingNotesRef.current.clear();
        if (notesToSync.length > 0) {
          await SupabaseService.upsertNotes(notesToSync);
        }
      }, 1500);
    },
    [supabaseConnected, supabaseConfig.autoSync],
  );

  const queueProjectSync = useCallback(
    (project: Project) => {
      if (!supabaseConnected || !supabaseConfig.autoSync || isSyncingRef.current) return;
      void SupabaseService.upsertProject(project);
    },
    [supabaseConnected, supabaseConfig.autoSync],
  );

  const mutate = useCallback(
    (id: string, fn: (n: Note) => Note) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id === id) {
            // 잠금 상태에서 암호화된 노트는 메타데이터 변경 방지
            if (CryptoService.isEncrypted(n.content)) return n;
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
    // 암호화된 본문인 경우 태그를 재계산하면 ENC:v1:... 암호문에서 본문 태그가 0개로 소실되므로 기존 note.tags 유지
    const tags = CryptoService.isEncrypted(content) ? note.tags : extractHashtags(title, content);
    return { ...note, title, content, tags };
  }, []);

  const select = useCallback((id: string | null) => {
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
      const pNotes = notes.filter((n) => (n.projectId || DEFAULT_PROJECT_ID) === id);
      setSelectedId(pNotes[0]?.id ?? null);
    },
    [notes],
  );

  const createProject = useCallback(
    (name: string, icon = '📁'): string => {
      const id = createProjectId();
      const newProj: Project = {
        id,
        name: name.trim() || '새 프로젝트',
        icon: icon.trim() || '📁',
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
    (id: string, patch: Partial<Pick<Project, 'name' | 'icon'>>) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id === id) {
            const updated = {
              ...p,
              name: patch.name !== undefined ? patch.name.trim() || p.name : p.name,
              icon: patch.icon !== undefined ? patch.icon.trim() || p.icon : p.icon,
              updatedAt: Date.now(),
            };
            queueProjectSync(updated);
            return updated;
          }
          return p;
        }),
      );
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
        if (prev.length <= 1) {
          alert('최소 1개의 프로젝트는 유지되어야 합니다.');
          return prev;
        }
        const remaining = prev.filter((p) => p.id !== id);
        setNotes((prevNotes) => prevNotes.filter((n) => (n.projectId || DEFAULT_PROJECT_ID) !== id));
        if (selectedProjectId === id) {
          const nextProj = remaining[0];
          setSelectedProjectId(nextProj.id);
          const nextNotes = notes.filter((n) => (n.projectId || DEFAULT_PROJECT_ID) === nextProj.id);
          setSelectedId(nextNotes[0]?.id ?? null);
        }
        if (supabaseConnected && supabaseConfig.autoSync) {
          void SupabaseService.deleteProject(id);
        }
        return remaining;
      });
    },
    [selectedProjectId, notes, supabaseConnected, supabaseConfig.autoSync],
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
      let initialColor = 'blue';
      if (parentId) {
        const parent = notes.find((x) => x.id === parentId);
        if (parent?.color) {
          initialColor = parent.color;
        }
      }
      const n = createEmptyNote({
        title: '새 노트',
        projectId: selectedProjectId,
        parentId,
        color: initialColor,
      });
      setNotes((prev) => [n, ...prev]);
      setSelectedId(n.id);
      queueNoteSync(n);
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

  const remove = useCallback(
    (id: string) => {
      const target = notes.find((n) => n.id === id);
      if (target?.systemGroupType) {
        alert(`'${target.title}' 그룹은 할일 관리의 필수 상위 그룹이므로 삭제할 수 없습니다.`);
        return;
      }
      setNotes((prev) => {
        const doomed = getDescendantIds(prev, id);
        const next = prev.filter((n) => !doomed.has(n.id));
        // 끊어진 자식 참조 방지: 삭제된 노트를 부모로 가진 노트는 루트로
        const fixed = next.map((n) =>
          n.parentId && doomed.has(n.parentId) ? { ...n, parentId: null } : n,
        );
        if (selectedId && doomed.has(selectedId)) {
          const siblings = fixed.filter(
            (n) =>
              (n.projectId || DEFAULT_PROJECT_ID) === selectedProjectId &&
              n.parentId === prev.find((x) => x.id === id)?.parentId,
          );
          setSelectedId(siblings[0]?.id ?? fixed[0]?.id ?? null);
        }
        if (supabaseConnected && supabaseConfig.autoSync) {
          for (const doomedId of doomed) {
            void SupabaseService.deleteNote(doomedId);
          }
        }
        return fixed;
      });
    },
    [selectedId, selectedProjectId, supabaseConnected, supabaseConfig.autoSync],
  );

  const updateTitle = useCallback(
    (id: string, title: string) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id === id) {
            // 잠금 상태(암호화된 본문)인 경우 제목 변경 차단 (태그 및 메타데이터 무결성 보호)
            if (CryptoService.isEncrypted(n.content)) return n;
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
            syncRes.updatedNotes.forEach((n) => {
              if (n.projectId === TODO_PROJECT_ID && n.todoMeta?.sourceNoteId === id) {
                queueNoteSync(n);
              }
            });
            return syncRes.updatedNotes;
          }
        }

        return nextList;
      });
    },
    [refreshTags, queueNoteSync],
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
            // 잠금 상태(암호화된 본문)인 경우 알람 설정 변경 차단
            if (CryptoService.isEncrypted(n.content)) return n;
            const updated = { ...n, reminder, updatedAt: Date.now() };
            queueNoteSync(updated);
            return updated;
          }
          return n;
        }),
      );
    },
    [queueNoteSync],
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
          return updated;
        }),
      );
      setActiveAlarmNote((cur) => (cur?.id === id ? null : cur));
    },
    [queueNoteSync],
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
          return updated;
        }),
      );
      setActiveAlarmNote((cur) => (cur?.id === id ? null : cur));
    },
    [queueNoteSync],
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

        // 할일 노트를 다른 할일 그룹(To Do, Doing, Done, Drop)으로 이동하는 경우 상태 동기화 처리
        if (targetNote && targetNote.projectId === TODO_PROJECT_ID && parentId && GROUP_ID_TO_STATUS[parentId]) {
          const newStatus = GROUP_ID_TO_STATUS[parentId];
          if (targetNote.parentId === parentId && targetNote.todoMeta?.status === newStatus) return prev;
          const syncRes = syncTodoStatusToSourceNote(targetNote, newStatus, prev);
          syncRes.updatedNotes.forEach((n) => {
            if (n.id === id || n.id === targetNote.todoMeta?.sourceNoteId) {
              queueNoteSync(n);
            }
          });
          return syncRes.updatedNotes;
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
    [queueNoteSync],
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
        const parent = prev.find((n) => n.id === target.parentId);
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
          const restoredTags = CryptoService.isEncrypted(snap.content)
            ? (snap.tags.length > 0 ? snap.tags : n.tags)
            : (snap.tags.length > 0 ? snap.tags : extractHashtags(snap.title, snap.content));
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

  // 선택된 노트가 현재 프로젝트에 없으면 첫 번째 노트로 동기화
  useEffect(() => {
    if (!ready) return;
    if (selectedId && !currentProjectNotes.some((n) => n.id === selectedId)) {
      setSelectedId(currentProjectNotes[0]?.id ?? null);
    }
  }, [selectedProjectId, ready, selectedId, currentProjectNotes]);

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

  // --- Supabase 동기화 액션 ---
  const syncWithSupabase = useCallback(async (isSilent = false) => {
    if (!SupabaseService.isConnected() || isSyncingRef.current) return;

    // 자동 백그라운드 동기화인 경우, 사용자가 타이핑 중이면 작업 방해 방지를 위해 건너뜀
    if (isSilent && (isLocalSavePendingRef.current || pendingNotesRef.current.size > 0)) {
      return;
    }

    if (!isSilent) {
      setIsSyncing(true);
    }
    isSyncingRef.current = true;
    if (!isSilent) {
      setSyncError(null);
    }

    try {
      const curNotes = notesRef.current;
      const curProjects = projectsRef.current;
      const res = await SupabaseService.syncAll(curNotes, curProjects);
      if (res.success) {
        let syncedNotes = res.notes;
        if (CryptoService.isUnlocked()) {
          syncedNotes = await CryptoService.decryptNotes(syncedNotes);
        }
        if (syncedNotes.some((n) => CryptoService.isEncrypted(n.content)) || CryptoService.isMasterPasswordSet()) {
          setIsMasterSet(true);
        }
        const sortedNotes = syncedNotes.sort(sortNotes);
        setNotes(sortedNotes);
        setProjects(res.projects);
        NoteRepository.save(sortedNotes);
        NoteRepository.saveProjects(res.projects);
        setSupabaseConfigState(SupabaseService.getConfig());

        // 선택 상태 보정: 동기화 후 현재 선택된 프로젝트와 노트가 유효하지 않으면 서버 데이터 기준으로 안전하게 재선택
        const currentProjId = selectedProjectIdRef.current;
        const hasProj = res.projects.some((p) => p.id === currentProjId);
        const nextProjId = hasProj ? currentProjId : res.projects[0]?.id ?? DEFAULT_PROJECT_ID;
        if (nextProjId !== currentProjId) {
          setSelectedProjectId(nextProjId);
        }

        const projectNotes = sortedNotes.filter(
          (n) => (n.projectId || DEFAULT_PROJECT_ID) === nextProjId,
        );
        const currentSelId = selectedIdRef.current;
        const hasNote = projectNotes.some((n) => n.id === currentSelId);
        if (!hasNote) {
          setSelectedId(projectNotes[0]?.id ?? sortedNotes[0]?.id ?? null);
        }
      } else {
        if (!isSilent) {
          setSyncError(res.error || '동기화 중 오류가 발생했습니다.');
        }
      }
    } catch (err: unknown) {
      if (!isSilent) {
        setSyncError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!isSilent) {
        setIsSyncing(false);
      }
      isSyncingRef.current = false;
    }
  }, []);

  const saveSupabaseConfig = useCallback(async (newConfig: SupabaseConfig) => {
    SupabaseService.saveConfig(newConfig);
    setSupabaseConfigState(newConfig);
  }, []);

  const disconnectSupabase = useCallback(() => {
    const disabledConfig: SupabaseConfig = {
      ...supabaseConfig,
      enabled: false,
    };
    SupabaseService.saveConfig(disabledConfig);
    setSupabaseConfigState(disabledConfig);
    setSyncError(null);
  }, [supabaseConfig]);

  // Supabase 최초 기동 시 1회만 클라우드 데이터와 양방향 동기화
  const initialSupabaseSyncedRef = useRef(false);
  useEffect(() => {
    if (!ready || initialSupabaseSyncedRef.current) return;
    if (supabaseConfig.enabled && SupabaseService.isConnected()) {
      initialSupabaseSyncedRef.current = true;
      void syncWithSupabase();
    }
  }, [ready, supabaseConfig.enabled, syncWithSupabase]);

  // --- Supabase Realtime 리스너: 다른 기기에서 DB 변경 시 즉각 자동 반영 ---
  useEffect(() => {
    if (!ready || !supabaseConnected || !supabaseConfig.autoSync) return;

    const unsubscribe = SupabaseService.subscribeToRealtime(async (change) => {
      if (change.type === 'sync_needed') {
        void syncWithSupabase(true);
        return;
      }

      if (change.type === 'project') {
        if (change.action === 'DELETE') {
          setProjects((prev) => {
            const next = prev.filter((p) => p.id !== change.id);
            NoteRepository.saveProjects(next);
            return next;
          });
          if (selectedProjectIdRef.current === change.id) {
            setSelectedProjectId(DEFAULT_PROJECT_ID);
          }
        } else {
          setProjects((prev) => {
            const exists = prev.some((p) => p.id === change.project.id);
            const next = exists
              ? prev.map((p) => (p.id === change.project.id ? change.project : p))
              : [...prev, change.project];
            NoteRepository.saveProjects(next);
            return next;
          });
        }
        SupabaseService.updateLastSyncedAt();
        setSupabaseConfigState(SupabaseService.getConfig());
        return;
      }

      if (change.type === 'note') {
        if (change.action === 'DELETE') {
          const doomedId = change.id;
          setNotes((prev) => {
            const next = prev.filter((n) => n.id !== doomedId);
            NoteRepository.save(next);
            return next;
          });
          if (selectedIdRef.current === doomedId) {
            const remaining = notesRef.current.filter((n) => n.id !== doomedId);
            setSelectedId(remaining[0]?.id ?? null);
          }
          SupabaseService.updateLastSyncedAt();
          setSupabaseConfigState(SupabaseService.getConfig());
          return;
        }

        // INSERT 또는 UPDATE
        const remoteNote = change.note;
        if (remoteNote.id === '__bullsnote_security_verifier__') return;

        // 로컬에서 사용자가 방금 입력 중인 노트인 경우 덮어쓰기 방지
        if (pendingNotesRef.current.has(remoteNote.id)) {
          return;
        }

        setNotes((prev) => {
          const local = prev.find((n) => n.id === remoteNote.id);
          // 로컬 노트가 더 최신이거나 같으면 무시
          if (local && local.updatedAt >= remoteNote.updatedAt) {
            return prev;
          }
          const next = local
            ? prev.map((n) => (n.id === remoteNote.id ? remoteNote : n))
            : [remoteNote, ...prev];
          const sorted = next.sort(sortNotes);
          NoteRepository.save(sorted);
          return sorted;
        });

        SupabaseService.updateLastSyncedAt();
        setSupabaseConfigState(SupabaseService.getConfig());
      }
    });

    return () => {
      unsubscribe();
    };
  }, [ready, supabaseConnected, supabaseConfig.autoSync, syncWithSupabase]);

  // --- 다중 기기 자동 동기화 트리거: 포커스, 탭 가시성, 네트워크 재연결, 30초 주기 하이브리드 폴링 ---
  useEffect(() => {
    if (!ready || !supabaseConnected || !supabaseConfig.autoSync) return;

    // 1. 창 포커스 복귀 시 (다른 기기에서 수정한 뒤 이 기기로 돌아왔을 때)
    const onFocus = () => void syncWithSupabase(true);

    // 2. 브라우저 탭 활성화 시
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncWithSupabase(true);
      }
    };

    // 3. 인터넷 재연결 시 (오프라인 -> 온라인)
    const onOnline = () => void syncWithSupabase(true);

    // 4. 웹소켓 유실 및 백그라운드 대비 30초 주기 무소음 동기화
    const syncInterval = setInterval(() => {
      void syncWithSupabase(true);
    }, 30000);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
    };
  }, [ready, supabaseConnected, supabaseConfig.autoSync, syncWithSupabase]);

  const [supabaseModalOpened, setSupabaseModalOpened] = useState(false);
  const openSupabaseModal = useCallback(() => setSupabaseModalOpened(true), []);
  const closeSupabaseModal = useCallback(() => setSupabaseModalOpened(false), []);

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
          await SupabaseService.deleteAttachment(att.storagePath);
        } catch (e) {
          console.warn('[Supabase] 첨부파일 삭제 예외:', e);
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
    (sourceNote: Note, items: Array<{ id?: string; text: string; checked?: boolean }>) => {
      // 1. 할일관리 프로젝트 및 상위 그룹 보장
      const ensured = ensureTodoProjectAndGroups(projectsRef.current, notesRef.current);
      if (ensured.created) {
        setProjects(ensured.projects);
        ensured.projects.forEach((p) => queueProjectSync(p));
        ensured.notes.forEach((n) => {
          if (n.systemGroupType) queueNoteSync(n);
        });
      }

      // 2. 할일 노트들 생성
      const { newNotes, duplicateCount } = createTodoNotes(sourceNote, items, ensured.notes);
      if (newNotes.length > 0) {
        setNotes((prev) => {
          // ensured notes 중 새로 추가된 그룹 노트들도 포함
          const existingIds = new Set(prev.map((n) => n.id));
          const missingGroupNotes = ensured.notes.filter((n) => !existingIds.has(n.id));
          return [...newNotes, ...missingGroupNotes, ...prev];
        });
        newNotes.forEach((n) => queueNoteSync(n));
      }
      return { createdCount: newNotes.length, duplicateCount };
    },
    [queueProjectSync, queueNoteSync],
  );

  const changeTodoStatus = useCallback(
    (todoNoteId: string, newStatus: TodoStatus) => {
      setNotes((prev) => {
        const todoNote = prev.find((n) => n.id === todoNoteId);
        if (!todoNote) return prev;
        // 시스템 그룹 노트(Doing, To Do, Done, Drop)는 상태를 변경할 수 없음
        if (isSystemGroupNote(todoNote)) return prev;
        // 이미 해당 상태이면 불필요한 재연산 방지
        const currentStatus = todoNote.todoMeta?.status || GROUP_ID_TO_STATUS[todoNote.parentId || ''] || 'todo';
        if (currentStatus === newStatus && todoNote.parentId === STATUS_TO_GROUP_ID[newStatus]) return prev;

        const { updatedNotes } = syncTodoStatusToSourceNote(todoNote, newStatus, prev);
        const updated = updatedNotes.find((n) => n.id === todoNoteId);
        if (updated) queueNoteSync(updated);
        if (todoNote.todoMeta?.sourceNoteId) {
          const updatedSource = updatedNotes.find((n) => n.id === todoNote.todoMeta?.sourceNoteId);
          if (updatedSource) queueNoteSync(updatedSource);
        }
        return updatedNotes;
      });
    },
    [queueNoteSync],
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
      supabaseConnected,
      supabaseConfig,
      realtimeStatus,
      isSyncing,
      syncError,
      lastSyncedAt: supabaseConfig.lastSyncedAt,
      projectSortOption,
      noteSortOption,
      sortedProjects,
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
      deleteProject,
      moveNoteToProject,
      saveSupabaseConfig,
      syncWithSupabase,
      disconnectSupabase,
      isMasterSet,
      isUnlocked,
      securityModalOpened,
      openSecurityModal,
      closeSecurityModal,
      setupMasterPassword,
      unlockMasterPassword,
      lockMasterPassword,
      removeMasterPassword,
      supabaseModalOpened,
      openSupabaseModal,
      closeSupabaseModal,
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
      supabaseConnected,
      supabaseConfig,
      realtimeStatus,
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
      deleteProject,
      moveNoteToProject,
      saveSupabaseConfig,
      syncWithSupabase,
      disconnectSupabase,
      projectSortOption,
      noteSortOption,
      sortedProjects,
      setProjectSortOption,
      setNoteSortOption,
      isMasterSet,
      isUnlocked,
      securityModalOpened,
      openSecurityModal,
      closeSecurityModal,
      setupMasterPassword,
      unlockMasterPassword,
      lockMasterPassword,
      removeMasterPassword,
      supabaseModalOpened,
      openSupabaseModal,
      closeSupabaseModal,
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
