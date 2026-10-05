// CONTROLLER: 상태 + 유스케이스 (MVC의 C). View는 이 컨텍스트만 호출.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  HISTORY_INTERVAL_MS,
  MAX_HISTORY,
  Note,
  NoteSnapshot,
  buildTree,
  createEmptyNote,
  getDescendantIds,
  TreeNode,
} from '../model/Note';
import { NoteRepository, seedNotes } from '../model/NoteRepository';
import { extractHashtags, extractHashtagsFromText, isBlocksJson, noteBodyText, parseBlocks } from '../model/HashtagService';
import {
  parseNoteFile,
  serializeNoteFile,
  sidecarHistories,
  swapAssetsToDataUrls,
  swapDataUrlsToAssets,
} from '../model/FileVault';
import type { VaultApi } from '../electron';

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
  notes: Note[];
  /** 레거시 -> 블록 마이그레이션 완료 여부 (완료 전 에디터 렌더 금지) */
  ready: boolean;
  selectedId: string | null;
  selected: Note | null;
  search: string;
  activeTag: string | null;
  showFavoriteOnly: boolean;
  tagCounts: Array<{ tag: string; count: number }>;
  /** 검색/필터 중이면 평탄 리스트, 아니면 트리 */
  tree: TreeNode[];
  flat: Note[];
  isFiltering: boolean;
  vaultMode: boolean;
  vaultPath: string;
  vaultError: string;
}

interface NotesActions {
  select(id: string | null): void;
  create(parentId?: string | null): void;
  duplicate(id: string): void;
  remove(id: string): void;
  updateTitle(id: string, title: string): void;
  updateContent(id: string, content: string): void;
  togglePin(id: string): void;
  toggleFavorite(id: string): void;
  setParent(id: string, parentId: string | null): void;
  indent(id: string): void;
  outdent(id: string): void;
  restoreHistory(id: string, savedAt: number): void;
  setSearch(v: string): void;
  setActiveTag(t: string | null): void;
  setShowFavoriteOnly(v: boolean): void;
  exportAll(): void;
  importFromFile(file: File): Promise<void>;
  chooseVault(): Promise<void>;
  resync(): Promise<void>;
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
  const [notes, setNotes] = useState<Note[]>(() => {
    const loaded = NoteRepository.load();
    if (loaded.length > 0) return loaded.sort(sortNotes);
    const seed = seedNotes();
    NoteRepository.save(seed);
    return seed;
  });
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null);
  const [ready, setReady] = useState(false);
  const [vaultPath, setVaultPath] = useState('');
  const [vaultError, setVaultError] = useState('');
  const [vaultGen, setVaultGen] = useState(0);
  const vaultInitGenRef = useRef(-1);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showFavoriteOnly, setShowFavoriteOnly] = useState(false);

  const vaultMode = getVault() !== null;
  // 파일 기준 동기화 추적
  const lastSavedRef = useRef(new Map<string, string>());
  const lastWrittenRef = useRef(new Map<string, number>());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // localStorage 모드: 기존 동작 유지
  useEffect(() => {
    if (vaultMode) return;
    NoteRepository.save(notes);
  }, [notes, vaultMode]);

  // localStorage 모드: 레거시 마이그레이션
  const migratedRef = useRef(false);
  useEffect(() => {
    if (vaultMode || migratedRef.current) return;
    migratedRef.current = true;
    (async () => {
      try {
        const current = NoteRepository.load();
        if (!current.some((n) => !isBlocksJson(n.content))) return;
        const headless = await getHeadless();
        const converted = await Promise.all(
          current.map(async (n) => {
            if (isBlocksJson(n.content)) return n;
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
              const withUrls = await swapAssetsToDataUrls(parsed.body, (name) => vault.readAsset(name));
              const blocks = await headless.toBlocks(withUrls);
              const content = JSON.stringify(blocks);
              loaded.push({
                id: parsed.id,
                title: parsed.title,
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
          setSelectedId((prev) => (loaded.some((n) => n.id === prev) ? prev : (loaded[0]?.id ?? null)));
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

  // 파일 볼트 모드: 변경분 디바운스 저장 + 삭제 반영 + 히스토리 sidecar
  useEffect(() => {
    if (!vaultMode || !ready) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void (async () => {
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
            histories: Object.fromEntries(notes.map((n) => [n.id, n.history])),
          });
          setVaultError('');
        } catch (e) {
          setVaultError(`저장 실패: ${e instanceof Error ? e.message : e}`);
        }
      })();
    }, 1200);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [notes, vaultMode, ready]);

  // 파일 볼트 모드: 외부 변경 감지 (폴링 + 포커스)
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const pollExternal = useCallback(async () => {
    const vault = getVault();
    if (!vault) return;
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
          setNotes((prev) => {
            if (prev.some((n) => n.id === f.id)) return prev;
            return [
              ...prev,
              {
                id: parsed.id,
                title: parsed.title,
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

  const mutate = useCallback((id: string, fn: (n: Note) => Note) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...fn(n), updatedAt: Date.now() } : n)));
  }, []);

  const refreshTags = useCallback((note: Note, title: string, content: string): Note => {
    return { ...note, title, content, tags: extractHashtags(title, content) };
  }, []);

  const select = useCallback((id: string | null) => setSelectedId(id), []);

  const create = useCallback((parentId: string | null = null) => {
    const n = createEmptyNote({ title: '새 노트', parentId });
    setNotes((prev) => [n, ...prev]);
    setSelectedId(n.id);
  }, []);

  const duplicate = useCallback((id: string) => {
    setNotes((prev) => {
      const src = prev.find((n) => n.id === id);
      if (!src) return prev;
      const copy: Note = {
        ...src,
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        title: `${src.title} (복사본)`,
        history: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return [copy, ...prev];
    });
  }, []);

  const remove = useCallback(
    (id: string) => {
      setNotes((prev) => {
        const doomed = getDescendantIds(prev, id);
        const next = prev.filter((n) => !doomed.has(n.id));
        // 끊어진 자식 참조 방지: 삭제된 노트를 부모로 가진 노트는 루트로
        const fixed = next.map((n) =>
          n.parentId && doomed.has(n.parentId) ? { ...n, parentId: null } : n,
        );
        if (selectedId && doomed.has(selectedId)) {
          const siblings = fixed.filter((n) => n.parentId === prev.find((x) => x.id === id)?.parentId);
          setSelectedId(siblings[0]?.id ?? fixed[0]?.id ?? null);
        }
        return fixed;
      });
    },
    [selectedId],
  );

  const updateTitle = useCallback(
    (id: string, title: string) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...refreshTags(withHistory(n), title, n.content), updatedAt: Date.now() } : n,
        ),
      );
    },
    [refreshTags],
  );

  const updateContent = useCallback(
    (id: string, content: string) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...refreshTags(withHistory(n), n.title, content), updatedAt: Date.now() } : n,
        ),
      );
    },
    [refreshTags],
  );

  const togglePin = useCallback((id: string) => mutate(id, (n) => ({ ...n, pinned: !n.pinned })), [mutate]);
  const toggleFavorite = useCallback(
    (id: string) => mutate(id, (n) => ({ ...n, favorite: !n.favorite })),
    [mutate],
  );

  const setParent = useCallback(
    (id: string, parentId: string | null) => {
      setNotes((prev) => {
        if (parentId === id) return prev;
        // 사이클 방지: 자손을 부모로 지정 불가
        if (parentId && getDescendantIds(prev, id).has(parentId)) return prev;
        if (parentId && !prev.some((n) => n.id === parentId)) return prev;
        return prev.map((n) => (n.id === id ? { ...n, parentId, updatedAt: Date.now() } : n));
      });
    },
    [],
  );

  /** 이전 형제를 부모로 (들여쓰기) */
  const indent = useCallback((id: string) => {
    setNotes((prev) => {
      const target = prev.find((n) => n.id === id);
      if (!target) return prev;
      const siblings = prev.filter((n) => (n.parentId ?? null) === (target.parentId ?? null)).sort(sortNotes);
      const idx = siblings.findIndex((n) => n.id === id);
      if (idx <= 0) return prev;
      const newParent = siblings[idx - 1];
      if (getDescendantIds(prev, id).has(newParent.id)) return prev;
      return prev.map((n) => (n.id === id ? { ...n, parentId: newParent.id, updatedAt: Date.now() } : n));
    });
  }, []);

  /** 부모의 형제로 (내어쓰기) */
  const outdent = useCallback((id: string) => {
    setNotes((prev) => {
      const target = prev.find((n) => n.id === id);
      if (!target || !target.parentId) return prev;
      const parent = prev.find((n) => n.id === target.parentId);
      const grandParent = parent?.parentId ?? null;
      return prev.map((n) => (n.id === id ? { ...n, parentId: grandParent, updatedAt: Date.now() } : n));
    });
  }, []);

  /** 히스토리 스냅샷으로 복원 (현재 상태는 강제 저장) */
  const restoreHistory = useCallback((id: string, savedAt: number) => {
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        const snap = n.history.find((h) => h.savedAt === savedAt);
        if (!snap) return n;
        const cur: Note = withHistory(n, true);
        return {
          ...refreshTags(cur, snap.title, snap.content),
          tags: snap.tags.length > 0 ? snap.tags : extractHashtags(snap.title, snap.content),
          updatedAt: Date.now(),
        };
      }),
    );
  }, [refreshTags]);

  const exportAll = useCallback(() => {
    const blob = new Blob([NoteRepository.exportJson(notes)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bullsnote-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [notes]);

  const importFromFile = useCallback(async (file: File) => {
    const text = await file.text();
    const imported = NoteRepository.importJson(text);
    setNotes((prev) => {
      const ids = new Set(prev.map((n) => n.id));
      const fresh = imported.filter((n) => !ids.has(n.id));
      return [...fresh, ...prev].sort(sortNotes);
    });
  }, []);

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) for (const t of n.tags) map.set(t, (map.get(t) ?? 0) + 1);
    return [...map.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  }, [notes]);

  const isFiltering = search.trim() !== '' || activeTag !== null || showFavoriteOnly;

  const flat = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes
      .filter((n) => (showFavoriteOnly ? n.favorite : true))
      .filter((n) => (activeTag ? n.tags.includes(activeTag) : true))
      .filter((n) => {
        if (!q) return true;
        return (
          n.title.toLowerCase().includes(q) ||
          noteBodyText(n.content).toLowerCase().includes(q) ||
          n.tags.some((t) => t.includes(q))
        );
      })
      .sort(sortNotes);
  }, [notes, search, activeTag, showFavoriteOnly]);

  const tree = useMemo(() => buildTree(isFiltering ? flat : notes), [isFiltering, flat, notes]);

  const selected = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);

  const value = useMemo(
    () => ({
      notes,
      ready,
      selectedId,
      selected,
      search,
      activeTag,
      showFavoriteOnly,
      tagCounts,
      tree,
      flat,
      isFiltering,
      vaultMode,
      vaultPath,
      vaultError,
      select,
      create,
      duplicate,
      remove,
      updateTitle,
      updateContent,
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
    }),
    [
      notes,
      ready,
      selectedId,
      selected,
      search,
      activeTag,
      showFavoriteOnly,
      tagCounts,
      tree,
      flat,
      isFiltering,
      vaultMode,
      vaultPath,
      vaultError,
      select,
      create,
      duplicate,
      remove,
      updateTitle,
      updateContent,
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
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotes(): NotesState & NotesActions {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('NotesProvider 외부에서 useNotes 호출');
  return ctx;
}
