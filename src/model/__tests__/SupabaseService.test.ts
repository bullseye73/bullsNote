import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyNote, Project } from '../Note';

const { mockSignInWithOAuth, mockExchangeCodeForSession, mockCreateClient } = vi.hoisted(() => {
  const mockSignInWithOAuth = vi.fn();
  const mockExchangeCodeForSession = vi.fn();
  const mockCreateClient = vi.fn(() => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
      exchangeCodeForSession: mockExchangeCodeForSession,
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }));
  return { mockSignInWithOAuth, mockExchangeCodeForSession, mockCreateClient };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

import {
  SUPABASE_CONFIG_STORAGE_KEY,
  formatSupabaseError,
  getSupabaseClient,
  mergeNotesWithRemote,
  mergeProjectsWithRemote,
  resolvePrimarySyncEngine,
  resolveSupabaseConfig,
  saveSupabaseConfig,
  signInWithGoogle,
} from '../SupabaseService';

describe('SupabaseService', () => {
  let lsStore: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    lsStore = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => lsStore.get(k) ?? null,
        setItem: (k: string, v: string) => {
          lsStore.set(k, v);
        },
        removeItem: (k: string) => {
          lsStore.delete(k);
        },
      },
      configurable: true,
    });
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  describe('resolveSupabaseConfig & getSupabaseClient', () => {
    it('환경 변수(env)가 설정되어 있으면 env 소스로 반환한다', () => {
      const cfg = resolveSupabaseConfig({
        VITE_SUPABASE_URL: 'https://env-proj.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'env-anon-key',
      });
      expect(cfg).toEqual({
        url: 'https://env-proj.supabase.co',
        anonKey: 'env-anon-key',
        source: 'env',
      });
    });

    it('환경 변수가 비어 있으면 localStorage 설정을 반환한다', () => {
      lsStore.set(
        SUPABASE_CONFIG_STORAGE_KEY,
        JSON.stringify({ url: 'https://ls-proj.supabase.co', anonKey: 'ls-key' }),
      );
      const cfg = resolveSupabaseConfig({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' });
      expect(cfg).toEqual({
        url: 'https://ls-proj.supabase.co',
        anonKey: 'ls-key',
        source: 'localStorage',
      });
    });

    it('설정이 전혀 없으면 null을 반환하고 getSupabaseClient()도 null을 반환한다', () => {
      saveSupabaseConfig('', '');
      const cfg = resolveSupabaseConfig({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' });
      expect(cfg).toBeNull();
      expect(getSupabaseClient()).toBeNull();
    });
  });

  describe('mergeNotesWithRemote', () => {
    it('Last-Write-Wins(updatedAt) 기준으로 충돌을 해결하고 로컬이 최신이면 toPush에 포함한다', () => {
      const localNewer = { ...createEmptyNote({ id: 'n1', title: '로컬 최신' }), updatedAt: 2000 };
      const localOlder = { ...createEmptyNote({ id: 'n2', title: '로컬 구버전' }), updatedAt: 1000 };
      const localOnly = { ...createEmptyNote({ id: 'n3', title: '로컬 전용' }), updatedAt: 1500 };

      const remoteRows = [
        {
          id: 'n1',
          data: { ...createEmptyNote({ id: 'n1', title: '원격 구버전' }), updatedAt: 1000 },
          updated_at: 1000,
          deleted: false,
        },
        {
          id: 'n2',
          data: { ...createEmptyNote({ id: 'n2', title: '원격 최신' }), updatedAt: 3000 },
          updated_at: 3000,
          deleted: false,
        },
        {
          id: 'n4',
          data: { ...createEmptyNote({ id: 'n4', title: '원격 신규' }), updatedAt: 2500 },
          updated_at: 2500,
          deleted: false,
        },
      ];

      const res = mergeNotesWithRemote([localNewer, localOlder, localOnly], remoteRows);
      const byId = new Map(res.notes.map((n) => [n.id, n]));

      expect(byId.get('n1')?.title).toBe('로컬 최신');
      expect(byId.get('n2')?.title).toBe('원격 최신');
      expect(byId.get('n3')?.title).toBe('로컬 전용');
      expect(byId.get('n4')?.title).toBe('원격 신규');
      expect(res.toPush.map((n) => n.id)).toEqual(['n1', 'n3']);
    });

    it('원격 삭제 툼스톤(deleted: true)이 로컬 updatedAt보다 최신이면 로컬 노트를 제거한다', () => {
      const localToDelete = { ...createEmptyNote({ id: 'del-1', title: '삭제될 노트' }), updatedAt: 1000 };
      const localRestored = { ...createEmptyNote({ id: 'keep-1', title: '수정되어 유지' }), updatedAt: 5000 };

      const remoteRows = [
        { id: 'del-1', data: localToDelete, updated_at: 2000, deleted: true },
        { id: 'keep-1', data: localRestored, updated_at: 3000, deleted: true },
      ];

      const res = mergeNotesWithRemote([localToDelete, localRestored], remoteRows);
      expect(res.notes.map((n) => n.id)).toEqual(['keep-1']);
      expect(res.toPush.map((n) => n.id)).toEqual(['keep-1']);
    });

    it('병합 후 dedupeSeedTodos를 적용해 중복 초기 할일을 제거한다', () => {
      const seedFixed = {
        ...createEmptyNote({
          id: 'seed-todo-1',
          title: '빠른 입력(⌘N)으로 할일 하나 추가해 보기',
          createdAt: 2000,
        }),
        updatedAt: 2000,
      };
      const seedDup = {
        ...createEmptyNote({
          id: 'rand-seed-dup',
          title: '빠른 입력(⌘N)으로 할일 하나 추가해 보기',
          createdAt: 1000,
        }),
        updatedAt: 1000,
      };

      const res = mergeNotesWithRemote([seedDup], [
        { id: 'seed-todo-1', data: seedFixed, updated_at: 2000, deleted: false },
      ]);

      expect(res.notes.map((n) => n.id)).toEqual(['seed-todo-1']);
      expect(res.removedSeedIds).toEqual(['rand-seed-dup']);
    });
  });

  describe('mergeProjectsWithRemote', () => {
    it('프로젝트도 LWW 및 삭제 툼스톤을 반영하여 병합한다', () => {
      const p1: Project = { id: 'p1', name: '로컬 최신 폴더', icon: '📁', createdAt: 1000, updatedAt: 3000 };
      const p2: Project = { id: 'p2', name: '삭제될 폴더', icon: '📁', createdAt: 1000, updatedAt: 1000 };

      const res = mergeProjectsWithRemote([p1, p2], [
        {
          id: 'p1',
          data: { id: 'p1', name: '원격 구버전', icon: '📁', createdAt: 1000, updatedAt: 1500 },
          updated_at: 1500,
          deleted: false,
        },
        {
          id: 'p2',
          data: p2,
          updated_at: 2000,
          deleted: true,
        },
        {
          id: 'p3',
          data: { id: 'p3', name: '원격 새 폴더', icon: '🚀', createdAt: 1000, updatedAt: 2500 },
          updated_at: 2500,
          deleted: false,
        },
      ]);

      expect(res.projects.map((p) => p.id)).toEqual(['p1', 'p3']);
      expect(res.projects[0].name).toBe('로컬 최신 폴더');
      expect(res.toPush.map((p) => p.id)).toEqual(['p1']);
    });
  });

  describe('formatSupabaseError', () => {
    it('주요 Supabase Auth 오류를 한국어로 변환한다', () => {
      expect(formatSupabaseError({ message: 'Invalid login credentials' })).toContain('이메일 또는 비밀번호');
      expect(formatSupabaseError({ message: 'Email not confirmed' })).toContain('이메일 인증');
      expect(formatSupabaseError({ message: 'User already registered' })).toContain('이미 가입된 이메일');
      expect(formatSupabaseError({ message: 'Password should be at least 6 characters' })).toContain('최소 6자');
      expect(formatSupabaseError(new Error('Failed to fetch'))).toContain('네트워크 연결');
    });
  });

  describe('resolvePrimarySyncEngine', () => {
    it('Supabase 사용자가 로그인되어 있으면 Google Drive 활성화 여부와 무관하게 supabase를 반환한다', () => {
      expect(resolvePrimarySyncEngine({ id: 'u1', email: 'a@b.com' }, false)).toBe('supabase');
      expect(resolvePrimarySyncEngine({ id: 'u1', email: 'a@b.com' }, true)).toBe('supabase');
      expect(resolvePrimarySyncEngine({ id: 'u1', email: 'a@b.com' })).toBe('supabase');
    });

    it('Supabase 미로그인 상태에서는 Google Drive 활성화 여부와 무관하게 local을 반환한다 (Drive 자동 동기화 비활성화)', () => {
      expect(resolvePrimarySyncEngine(null, true)).toBe('local');
      expect(resolvePrimarySyncEngine(undefined, true)).toBe('local');
      expect(resolvePrimarySyncEngine(null, false)).toBe('local');
      expect(resolvePrimarySyncEngine(undefined, undefined)).toBe('local');
    });
  });

  describe('signInWithGoogle (PKCE Loopback & Web Redirect)', () => {
    it('Electron 환경에서는 루프백 서버 준비 -> OAuth URL 생성 -> 콜백 대기 -> exchangeCodeForSession 순서로 PKCE 로그인을 완료한다', async () => {
      saveSupabaseConfig('https://test-proj.supabase.co', 'test-anon-key');
      const prepareSupabaseLoopback = vi.fn().mockResolvedValue({
        success: true,
        callbackUrl: 'http://127.0.0.1:54321/auth/callback',
      });
      const awaitSupabaseCallback = vi.fn().mockResolvedValue({
        success: true,
        code: 'pkce-auth-code',
      });

      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { origin: 'http://localhost:5190', pathname: '/' },
          bullsNote: {
            googleAuth: {
              prepareSupabaseLoopback,
              awaitSupabaseCallback,
            },
          },
        },
        configurable: true,
      });

      mockSignInWithOAuth.mockResolvedValue({
        data: { url: 'https://test-proj.supabase.co/auth/v1/authorize?provider=google' },
        error: null,
      });
      mockExchangeCodeForSession.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'tester@gmail.com',
            user_metadata: { full_name: '홍길동' },
            app_metadata: { provider: 'google' },
          },
        },
        error: null,
      });

      const res = await signInWithGoogle();

      expect(mockCreateClient).toHaveBeenCalledWith(
        'https://test-proj.supabase.co',
        'test-anon-key',
        expect.objectContaining({
          auth: expect.objectContaining({
            flowType: 'pkce',
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          }),
        }),
      );
      expect(prepareSupabaseLoopback).toHaveBeenCalledTimes(1);
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'http://127.0.0.1:54321/auth/callback',
          skipBrowserRedirect: true,
        },
      });
      expect(awaitSupabaseCallback).toHaveBeenCalledWith(
        'https://test-proj.supabase.co/auth/v1/authorize?provider=google',
      );
      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('pkce-auth-code');
      expect(res).toEqual({
        success: true,
        user: {
          id: 'user-123',
          email: 'tester@gmail.com',
          name: '홍길동',
          avatarUrl: undefined,
          provider: 'google',
        },
      });
    });

    it('Electron 루프백 콜백이 실패하면 exchangeCodeForSession을 호출하지 않고 오류를 반환한다', async () => {
      saveSupabaseConfig('https://test-proj.supabase.co', 'test-anon-key');
      const prepareSupabaseLoopback = vi.fn().mockResolvedValue({
        success: true,
        callbackUrl: 'http://127.0.0.1:54321/auth/callback',
      });
      const awaitSupabaseCallback = vi.fn().mockResolvedValue({
        success: false,
        error: '사용자가 로그인을 취소했습니다.',
      });

      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { origin: 'http://localhost:5190', pathname: '/' },
          bullsNote: {
            googleAuth: {
              prepareSupabaseLoopback,
              awaitSupabaseCallback,
            },
          },
        },
        configurable: true,
      });

      mockSignInWithOAuth.mockResolvedValue({
        data: { url: 'https://test-proj.supabase.co/auth/v1/authorize?provider=google' },
        error: null,
      });

      const res = await signInWithGoogle();

      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
      expect(res).toEqual({ success: false, error: '사용자가 로그인을 취소했습니다.' });
    });

    it('웹/모바일 PWA 환경에서는 기본 리디렉션 OAuth 흐름을 사용한다', async () => {
      saveSupabaseConfig('https://test-proj.supabase.co', 'test-anon-key');
      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { origin: 'https://bullseye73.github.io', pathname: '/bullsNote/' },
        },
        configurable: true,
      });

      mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });

      const res = await signInWithGoogle();

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'https://bullseye73.github.io/bullsNote/',
        },
      });
      expect(res).toEqual({ success: true });
    });
  });
});
