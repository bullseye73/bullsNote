// VIEW root: 통합 타이틀바(Unified Titlebar) + 좌측 사이드바 + 노트 목록 + 에디터 (MVC의 V)
import { useEffect, useState } from 'react';
import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Box,
  Button,
  ColorSchemeScript,
  Drawer,
  Group,
  Kbd,
  MantineProvider,
  Text,
  Tooltip,
  UnstyledButton,
  createTheme,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import '@mantine/core/styles.css';
import './index.css';
import { APP_VERSION } from './model/version';
import { DEFAULT_PROJECT_ID, getProjectPath } from './model/Note';
import { SHORTCUTS } from './model/shortcutUtils';
import { TODO_PROJECT_ID } from './model/TodoService';
import { useDisclosure, useHotkeys, useMediaQuery } from '@mantine/hooks';
import {
  IconBrandGoogleDrive,
  IconCalendarEvent,
  IconCalendarStats,
  IconChecklist,
  IconChevronRight,
  IconFolder,
  IconLayoutSidebarLeftCollapse,
  IconListTree,
  IconMoon,
  IconNotes,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconSun,
} from '@tabler/icons-react';
import { NotesProvider, useNotes } from './controller/NotesController';
import { ErrorBoundary } from './view/ErrorBoundary';
import { NoteEditorView } from './view/NoteEditorView';
import { NoteListView } from './view/NoteListView';
import { PlannerView } from './view/PlannerView';
import { SidebarView } from './view/SidebarView';
import { AlarmModal } from './view/AlarmModal';
import { GoogleSyncModal } from './view/GoogleSyncModal';
import { LoginView } from './view/LoginView';
import { QuickSearchModal } from './view/QuickSearchModal';
import { GeminiAiModal } from './view/GeminiAiModal';
import { SortMenu } from './view/SortMenu';
import { ResizeSplitter, useResizable } from './view/ResizeSplitter';

const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Segoe UI", "Pretendard", "Inter", Ubuntu, system-ui, sans-serif',
  headings: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable", "Segoe UI", "Pretendard", "Inter", Ubuntu, system-ui, sans-serif',
  },
});

function ListPanel() {
  const {
    notes,
    create,
    selectedProject,
    selectedProjectId,
    noteSortOption,
    setNoteSortOption,
    showFavoriteOnly,
    activeTag,
    selectedDate,
  } = useNotes();

  const isTodoBoard = selectedProjectId === TODO_PROJECT_ID && !showFavoriteOnly;
  const projectNotes = notes.filter(
    (n) => !n.systemGroupType && (n.projectId || 'default') === selectedProject?.id,
  );

  const headerTitle = showFavoriteOnly
    ? '즐겨찾기 노트'
    : isTodoBoard
    ? '할일관리 보드'
    : activeTag
    ? `#${activeTag}`
    : selectedDate
    ? `${selectedDate} 노트`
    : selectedProject?.name || '노트 목록';

  const headerIcon = showFavoriteOnly
    ? '⭐'
    : isTodoBoard
    ? '📋'
    : activeTag
    ? '🏷️'
    : selectedDate
    ? '📅'
    : selectedProject?.icon || '';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bn-surface-list)',
      }}
    >
      <Group
        justify="space-between"
        px="sm"
        py={10}
        wrap="nowrap"
        style={{ borderBottom: '1px solid var(--bn-border-subtle)' }}
      >
        <Group gap={6} style={{ minWidth: 0, flex: 1 }}>
          {headerIcon && <span style={{ fontSize: 15, lineHeight: 1 }}>{headerIcon}</span>}
          <span
            style={{
              fontWeight: 600,
              fontSize: 13.5,
              letterSpacing: '-0.2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {headerTitle}
          </span>
          <Badge size="xs" variant="light" color="gray" radius="sm" style={{ fontWeight: 600 }}>
            {projectNotes.length}
          </Badge>
        </Group>
        <Group gap={4} wrap="nowrap">
          <SortMenu
            sortOption={noteSortOption}
            onChange={setNoteSortOption}
            targetName="노트"
            size="xs"
          />
          <Tooltip label={`최상위 새 노트 (${SHORTCUTS.newNote})`}>
            <ActionIcon
              size="sm"
              color="blue"
              variant="subtle"
              onClick={() => create(null)}
              aria-label="새 노트"
            >
              <IconPlus size={15} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <div style={{ flex: 1, minHeight: 0 }}>
        <NoteListView />
      </div>
    </div>
  );
}

function Shell() {
  const [menuOpened, { toggle: toggleMenu }] = useDisclosure(true);
  const [listOpened, { toggle: toggleList }] = useDisclosure(true);
  const [tabletDrawerOpened, setTabletDrawerOpened] = useState(false);
  const [mobilePane, setMobilePane] = useState<'folders' | 'list' | 'editor'>('list');

  // 3단계 반응형 Breakpoint 감지 (Phone < 768px / Pad 768~1080px / Desktop > 1080px)
  const isPhone = Boolean(useMediaQuery('(max-width: 767px)'));
  const isTablet = Boolean(useMediaQuery('(min-width: 768px) and (max-width: 1080px)'));

  const { toggleColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = computedColorScheme === 'dark';

  const {
    projects,
    selected,
    selectedProject,
    selectedProjectId,
    selectProject,
    setShowFavoriteOnly,
    showFavoriteOnly,
    activeTag,
    create,
    openOrCreateDailyNote,
    syncWithGoogleDrive,
    googleConnected,
    googleConfig,
    guestMode,
    isSyncing,
    lastSyncedAt,
    googleSyncModalOpened,
    openGoogleSyncModal,
    closeGoogleSyncModal,
    quickSearchModalOpened,
    openQuickSearchModal,
    closeQuickSearchModal,
    geminiModalOpened,
    geminiModalTab,
    openGeminiModal,
    closeGeminiModal,
    plannerViewActive,
    openPlannerView,
    closePlannerView,
  } = useNotes();

  // 모바일/태블릿 뷰 전환 이벤트 수신 (노트 클릭 시 에디터 전환, 폴더 클릭 시 목록 전환)
  useEffect(() => {
    const handleOpenEditor = () => {
      setMobilePane('editor');
      setTabletDrawerOpened(false);
    };
    const handleOpenList = () => {
      setMobilePane('list');
      setTabletDrawerOpened(false);
    };
    window.addEventListener('bullsnote:mobile-open-editor', handleOpenEditor);
    window.addEventListener('bullsnote:mobile-open-list', handleOpenList);
    return () => {
      window.removeEventListener('bullsnote:mobile-open-editor', handleOpenEditor);
      window.removeEventListener('bullsnote:mobile-open-list', handleOpenList);
    };
  }, []);

  // Android 물리 뒤로가기 및 브라우저 popstate 연동 (Phone 에디터 -> 목록 복귀)
  useEffect(() => {
    if (!isPhone) return;
    if (mobilePane === 'editor') {
      window.history.pushState({ mobilePane: 'editor' }, '');
    }
    const handlePopState = () => {
      if (mobilePane === 'editor') {
        setMobilePane('list');
      } else if (mobilePane === 'folders') {
        setMobilePane('list');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isPhone, mobilePane]);

  // 사이드바(프로젝트) 및 노트 목록 동적 너비 리사이징 (localStorage 영구 보존)
  const sidebar = useResizable({
    initialWidth: 236,
    minWidth: 180,
    maxWidth: 420,
    storageKey: 'bullsnote.sidebar.width',
  });

  const list = useResizable({
    initialWidth: 320,
    minWidth: 220,
    maxWidth: 560,
    storageKey: 'bullsnote.list.width',
  });

  useHotkeys([
    ['mod+N', (e) => { e.preventDefault(); create(null); }],
    ['mod+K', (e) => { e.preventDefault(); openQuickSearchModal(); }],
    ['mod+J', (e) => { e.preventDefault(); openGeminiModal('clipboard'); }],
  ]);

  useEffect(() => {
    document.title = `BullsNote v${APP_VERSION}`;
  }, []);

  // Electron 환경 및 OS 플랫폼 감지 (preload의 window.bullsNote 또는 User-Agent 기반)
  const bullsNoteBridge =
    typeof window !== 'undefined'
      ? (window as unknown as {
          bullsNote?: { platform?: string; setTitleBarTheme?: (dark: boolean) => Promise<boolean> };
        }).bullsNote
      : undefined;

  const isElectron =
    Boolean(bullsNoteBridge) ||
    (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent));

  const isMac =
    bullsNoteBridge?.platform === 'darwin' ||
    (typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform));

  // 다크/라이트 테마 변경 시 Electron 네이티브 타이틀바 오버레이 색상 동기화
  useEffect(() => {
    void bullsNoteBridge?.setTitleBarTheme?.(isDark);
  }, [isDark, bullsNoteBridge]);

  const lastSyncText = lastSyncedAt
    ? `마지막 동기화: ${new Date(lastSyncedAt).toLocaleTimeString()}`
    : '동기화 이력 없음';

  const isTodoBoard = selectedProjectId === TODO_PROJECT_ID && !showFavoriteOnly && !plannerViewActive;
  const projectPath = selectedProject ? getProjectPath(projects, selectedProject.id) : [];
  const formatProjLabel = (p?: { name?: string; icon?: string } | null) =>
    p ? (p.icon ? `${p.icon} ${p.name}` : p.name || '기본 프로젝트') : '기본 프로젝트';
  const projectPathText =
    projectPath.length > 1
      ? projectPath.map((p) => formatProjLabel(p)).join(' / ')
      : formatProjLabel(selectedProject);
  const contextLabel = plannerViewActive
    ? '📊 플래너 (Schedule)'
    : showFavoriteOnly
    ? '⭐ 즐겨찾기'
    : isTodoBoard
    ? '📋 할일관리'
    : activeTag
    ? `#${activeTag}`
    : projectPathText;

  const user = googleConfig?.user;

  if (!googleConnected && !guestMode) {
    return <LoginView />;
  }

  // 1. 스마트폰 (Phone < 768px): 1단 전체화면 뷰 + 하단 탭 네비게이션
  if (isPhone) {
    const regularProjects = projects.filter((p) => p.id !== TODO_PROJECT_ID);
    const defaultRegularId = regularProjects[0]?.id || DEFAULT_PROJECT_ID;
    const isEditorPane = mobilePane === 'editor';

    return (
      <Box
        className="bn-mobile-shell"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100dvh',
          width: '100vw',
          overflow: 'hidden',
          backgroundColor: 'var(--bn-surface-editor)',
        }}
      >
        {/* 모바일 상단 헤더 (Safe Area 대응) — 노트 상세에서는 노트 자체 상단바를 쓰므로 숨김 */}
        {!isEditorPane && (
        <Box
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            backgroundColor: 'var(--bn-surface-titlebar)',
            borderBottom: '1px solid var(--bn-border-subtle)',
            flexShrink: 0,
          }}
        >
          <Group justify="space-between" align="center" px="sm" h={46} wrap="nowrap">
            <Group gap={6} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
              <Text fw={800} size="sm" style={{ letterSpacing: '-0.3px', flexShrink: 0 }}>
                BullsNote
              </Text>
              <Badge size="xs" variant="light" color="blue" radius="sm" style={{ maxWidth: 140 }}>
                {contextLabel}
              </Badge>
            </Group>

            <Group gap={6} wrap="nowrap">
              <ActionIcon
                size="md"
                variant="light"
                color="gray"
                onClick={openQuickSearchModal}
                aria-label="검색"
              >
                <IconSearch size={16} />
              </ActionIcon>
              <ActionIcon
                size="md"
                variant="light"
                color="violet"
                onClick={() => openGeminiModal('clipboard')}
                aria-label="AI 어시스턴트"
              >
                <IconSparkles size={16} />
              </ActionIcon>
              <ActionIcon
                size="md"
                variant="light"
                color="teal"
                onClick={() => {
                  if (googleConnected) {
                    void syncWithGoogleDrive(false);
                  } else {
                    openGoogleSyncModal();
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openGoogleSyncModal();
                }}
                aria-label="Google Drive 동기화"
              >
                {isSyncing ? (
                  <IconRefresh size={16} className="spin-animation" />
                ) : user?.picture ? (
                  <Avatar src={user.picture} size={20} radius="xl" onClick={(e) => { e.stopPropagation(); openGoogleSyncModal(); }} />
                ) : (
                  <IconBrandGoogleDrive size={16} />
                )}
              </ActionIcon>
              <ActionIcon
                size="md"
                variant="subtle"
                color="gray"
                onClick={() => toggleColorScheme()}
                aria-label="테마 전환"
              >
                {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
              </ActionIcon>
            </Group>
          </Group>
        </Box>
        )}

        {/* 모바일 중앙 1단 컨텐츠 영역 */}
        <Box
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: isEditorPane ? 'env(safe-area-inset-top, 0px)' : undefined,
          }}
        >
          <ErrorBoundary title="화면을 표시하지 못했습니다">
            {mobilePane === 'folders' && (
              <Box style={{ flex: 1, minHeight: 0, overflow: 'auto', backgroundColor: 'var(--bn-surface-sidebar)' }}>
                <SidebarView onOpenGoogleSyncModal={openGoogleSyncModal} />
              </Box>
            )}
            {mobilePane === 'list' && (
              <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {plannerViewActive ? <PlannerView /> : <ListPanel />}
              </Box>
            )}
            {mobilePane === 'editor' && (
              <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <NoteEditorView onBackToList={() => setMobilePane('list')} isCompact={true} />
              </Box>
            )}
          </ErrorBoundary>
        </Box>

        {/* 모바일 하단 네비게이션 탭 바 (Safe Area 대응) — 노트 상세에서는 본문 공간 확보를 위해 숨김 */}
        {!isEditorPane && (
        <Box
          className="no-print"
          style={{
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            backgroundColor: 'var(--bn-surface-titlebar)',
            borderTop: '1px solid var(--bn-border-subtle)',
            flexShrink: 0,
          }}
        >
          <Group grow gap={0} h={54} px={4}>
            <UnstyledButton
              onClick={() => setMobilePane('folders')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                height: '100%',
                color: mobilePane === 'folders' ? 'var(--mantine-color-blue-6)' : 'var(--bn-text-muted)',
              }}
            >
              <IconFolder size={19} />
              <Text size="10px" fw={mobilePane === 'folders' ? 700 : 500}>
                폴더/메뉴
              </Text>
            </UnstyledButton>

            <UnstyledButton
              onClick={() => {
                closePlannerView();
                setShowFavoriteOnly(false);
                if (selectedProjectId === TODO_PROJECT_ID) {
                  selectProject(defaultRegularId);
                }
                setMobilePane('list');
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                height: '100%',
                color:
                  mobilePane === 'list' && !isTodoBoard && !plannerViewActive
                    ? 'var(--mantine-color-blue-6)'
                    : 'var(--bn-text-muted)',
              }}
            >
              <IconNotes size={19} />
              <Text size="10px" fw={mobilePane === 'list' && !isTodoBoard && !plannerViewActive ? 700 : 500}>
                노트목록
              </Text>
            </UnstyledButton>

            <UnstyledButton
              onClick={() => {
                closePlannerView();
                setShowFavoriteOnly(false);
                selectProject(TODO_PROJECT_ID);
                setMobilePane('list');
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                height: '100%',
                color:
                  mobilePane === 'list' && isTodoBoard && !plannerViewActive
                    ? 'var(--mantine-color-teal-6)'
                    : 'var(--bn-text-muted)',
              }}
            >
              <IconChecklist size={19} />
              <Text size="10px" fw={mobilePane === 'list' && isTodoBoard && !plannerViewActive ? 700 : 500}>
                할일관리
              </Text>
            </UnstyledButton>

            <UnstyledButton
              onClick={() => {
                openPlannerView();
                setMobilePane('list');
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                height: '100%',
                color:
                  mobilePane === 'list' && plannerViewActive
                    ? 'var(--mantine-color-orange-6)'
                    : 'var(--bn-text-muted)',
              }}
            >
              <IconCalendarStats size={19} />
              <Text size="10px" fw={mobilePane === 'list' && plannerViewActive ? 700 : 500}>
                플래너
              </Text>
            </UnstyledButton>

            <UnstyledButton
              onClick={() => {
                openOrCreateDailyNote();
                setMobilePane('editor');
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                height: '100%',
                color: 'var(--bn-text-muted)',
              }}
            >
              <IconCalendarEvent size={19} />
              <Text size="10px" fw={500}>
                오늘노트
              </Text>
            </UnstyledButton>

            <UnstyledButton
              onClick={() => {
                create(null);
                setMobilePane('editor');
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                height: '100%',
                color: 'var(--mantine-color-blue-6)',
              }}
            >
              <IconPlus size={19} />
              <Text size="10px" fw={600}>
                {isTodoBoard ? '새 할일' : '새 노트'}
              </Text>
            </UnstyledButton>
          </Group>
        </Box>
        )}

        <GoogleSyncModal opened={googleSyncModalOpened} onClose={closeGoogleSyncModal} />
        <QuickSearchModal opened={quickSearchModalOpened} onClose={closeQuickSearchModal} />
        <GeminiAiModal opened={geminiModalOpened} onClose={closeGeminiModal} initialTab={geminiModalTab} />
      </Box>
    );
  }

  // 2. 태블릿(Pad: 768~1080px, 2단 분할 + 폴더 드로어) 및 데스크톱(> 1080px, 3단 리사이저블)
  return (
    <AppShell
      header={{ height: 40 }}
      navbar={
        isTablet
          ? undefined
          : {
              width: sidebar.width,
              breakpoint: 'sm',
              collapsed: { mobile: !menuOpened, desktop: !menuOpened },
            }
      }
      padding={0}
      styles={{
        header: {
          backgroundColor: 'var(--bn-surface-titlebar)',
          borderBottom: '1px solid var(--bn-border-subtle)',
        },
        navbar: {
          backgroundColor: 'var(--bn-surface-sidebar)',
          borderRight: 'none',
        },
        main: {
          backgroundColor: 'var(--bn-surface-editor)',
        },
      }}
    >
      {/* Unified Titlebar (통합 타이틀바 + 브레드크럼 + 핵심 액션) */}
      <AppShell.Header
        className="titlebar-drag-region"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: isElectron && isMac ? 76 : 10,
          // Windows/Linux Electron에서는 우측 창 제어 버튼(최소화·최대화·닫기 약 138px)과 겹치지 않도록 여백 확보
          paddingRight: isElectron && !isMac ? 148 : 12,
        }}
      >
        {/* 좌측: 패널 토글 + 앱 브랜드 + 현재 위치 브레드크럼 */}
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <Group gap={4} wrap="nowrap" className="titlebar-no-drag">
            <Tooltip
              label={
                isTablet
                  ? '폴더 및 메뉴 열기'
                  : menuOpened
                  ? '사이드바 접기'
                  : '사이드바 펼치기'
              }
            >
              <ActionIcon
                size="sm"
                variant={isTablet ? (tabletDrawerOpened ? 'light' : 'subtle') : menuOpened ? 'light' : 'subtle'}
                color={isTablet ? (tabletDrawerOpened ? 'blue' : 'gray') : menuOpened ? 'blue' : 'gray'}
                onClick={() => {
                  if (isTablet) {
                    setTabletDrawerOpened((v) => !v);
                  } else {
                    toggleMenu();
                  }
                }}
                aria-label="사이드바 토글"
              >
                <IconLayoutSidebarLeftCollapse size={15} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={listOpened ? '노트 목록 접기' : '노트 목록 펼치기'}>
              <ActionIcon
                size="sm"
                variant={listOpened ? 'light' : 'subtle'}
                color={listOpened ? 'blue' : 'gray'}
                onClick={toggleList}
                aria-label="노트 목록 토글"
              >
                <IconListTree size={15} />
              </ActionIcon>
            </Tooltip>
          </Group>

          <Group gap={5} wrap="nowrap" style={{ marginLeft: 4 }}>
            <Text fw={700} size="xs" style={{ letterSpacing: '-0.3px' }}>
              BullsNote
            </Text>
            <Badge
              size="xs"
              variant="subtle"
              color="gray"
              radius="sm"
              style={{ fontSize: 10, padding: '0 5px', height: 16 }}
            >
              v{APP_VERSION}
            </Badge>
          </Group>

          {/* 현재 폴더 / 노트 컨텍스트 브레드크럼 */}
          <Group
            gap={4}
            wrap="nowrap"
            visibleFrom="sm"
            style={{
              minWidth: 0,
              marginLeft: 8,
              paddingLeft: 10,
              borderLeft: '1px solid var(--bn-border-subtle)',
            }}
          >
            <Text size="xs" c="dimmed" truncate style={{ maxWidth: 160 }}>
              {contextLabel}
            </Text>
            {selected && (
              <>
                <IconChevronRight size={12} style={{ opacity: 0.45, flexShrink: 0 }} />
                <Text size="xs" fw={500} truncate style={{ maxWidth: 260 }}>
                  {selected.title || '제목 없음'}
                </Text>
              </>
            )}
          </Group>
        </Group>

        {/* 우측: Command Palette 검색바 + AI + 클라우드 + 보안 + 테마 */}
        <Group gap={6} wrap="nowrap" className="titlebar-no-drag" style={{ flexShrink: 0 }}>
          {/* Raycast/Linear 스타일 퀵 검색 트리거 */}
          <Tooltip label={`전역 빠른 검색 (${SHORTCUTS.quickSearch})`}>
            <Button
              size="compact-xs"
              variant="default"
              leftSection={<IconSearch size={13} style={{ opacity: 0.7 }} />}
              rightSection={
                <Kbd size="xs" style={{ fontSize: 10, padding: '1px 4px', borderBottomWidth: 1 }}>
                  {SHORTCUTS.quickSearch}
                </Kbd>
              }
              onClick={openQuickSearchModal}
              styles={{
                root: {
                  height: 26,
                  paddingLeft: 8,
                  paddingRight: 6,
                  backgroundColor: 'var(--bn-card-hover)',
                  borderColor: 'var(--bn-border-subtle)',
                  fontWeight: 500,
                  fontSize: 12,
                },
              }}
            >
              검색
            </Button>
          </Tooltip>

          {/* Gemini AI 어시스턴트 */}
          <Tooltip label={`Gemini AI 어시스턴트 (${SHORTCUTS.geminiAi})`}>
            <Button
              size="compact-xs"
              variant="light"
              color="violet"
              leftSection={<IconSparkles size={13} />}
              onClick={() => openGeminiModal('clipboard')}
              styles={{
                root: {
                  height: 26,
                  paddingLeft: 8,
                  paddingRight: 8,
                  fontSize: 12,
                },
              }}
            >
              AI
            </Button>
          </Tooltip>

          {/* Google Drive 클라우드 동기화 및 계정 프로필 */}
          <Tooltip
            label={
              user
                ? `${user.name || user.email} (${user.email}) · 최근 동기화: ${lastSyncText}`
                : `Google Drive 연동됨 (${lastSyncText})`
            }
          >
            <Button
              size="compact-xs"
              variant="light"
              color="teal"
              leftSection={
                isSyncing ? (
                  <IconRefresh size={13} className="spin-animation" />
                ) : user?.picture ? (
                  <Avatar src={user.picture} size={16} radius="xl" />
                ) : (
                  <IconBrandGoogleDrive size={13} />
                )
              }
              onClick={openGoogleSyncModal}
              styles={{ root: { height: 26, fontSize: 11.5, paddingLeft: 6, paddingRight: 8 } }}
            >
              {isSyncing ? '동기화 중' : user?.name ? user.name.split(' ')[0] : 'Google Drive'}
            </Button>
          </Tooltip>

          {/* 다크/라이트 테마 전환 */}
          <Tooltip label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}>
            <ActionIcon
              size={26}
              variant="subtle"
              color="gray"
              onClick={() => toggleColorScheme()}
              aria-label="테마 전환"
            >
              {isDark ? <IconSun size={14} /> : <IconMoon size={14} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </AppShell.Header>

      {!isTablet && (
        <AppShell.Navbar>
          <SidebarView onOpenGoogleSyncModal={openGoogleSyncModal} />
          {menuOpened && (
            <div style={{ position: 'absolute', top: 0, right: -3, bottom: 0, zIndex: 100 }}>
              <ResizeSplitter
                onMouseDown={sidebar.startResize}
                onDoubleClick={sidebar.resetWidth}
                title="마우스 드래그로 사이드바 너비 조절 (더블클릭 시 기본값)"
              />
            </div>
          )}
        </AppShell.Navbar>
      )}

      {/* 태블릿(Pad) 환경: 좌측 폴더 사이드바를 오버레이 드로어로 제공 */}
      <Drawer
        opened={isTablet && tabletDrawerOpened}
        onClose={() => setTabletDrawerOpened(false)}
        size={272}
        padding={0}
        withCloseButton={false}
        styles={{
          body: {
            height: '100%',
            backgroundColor: 'var(--bn-surface-sidebar)',
          },
        }}
      >
        <SidebarView
          onOpenGoogleSyncModal={() => {
            setTabletDrawerOpened(false);
            openGoogleSyncModal();
          }}
        />
      </Drawer>

      <AppShell.Main h="calc(100vh - 40px)">
        <ErrorBoundary title="화면을 표시하지 못했습니다">
          {plannerViewActive ? (
            <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
              <PlannerView />
            </div>
          ) : (
            <div style={{ display: 'flex', height: '100%' }}>
              {listOpened && (
                <>
                  <div
                    className="no-print"
                    style={{
                      width: isTablet ? 290 : list.width,
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: 0,
                    }}
                  >
                    <ListPanel />
                  </div>
                  {!isTablet && (
                    <div className="no-print">
                      <ResizeSplitter
                        onMouseDown={list.startResize}
                        onDoubleClick={list.resetWidth}
                        title="마우스 드래그로 노트 목록 너비 조절 (더블클릭 시 기본값)"
                      />
                    </div>
                  )}
                </>
              )}
              <div
                className="note-editor-wrapper"
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  overflow: 'hidden',
                  backgroundColor: 'var(--bn-surface-editor)',
                }}
              >
                <NoteEditorView />
              </div>
            </div>
          )}
        </ErrorBoundary>
      </AppShell.Main>

      <GoogleSyncModal opened={googleSyncModalOpened} onClose={closeGoogleSyncModal} />
      <QuickSearchModal opened={quickSearchModalOpened} onClose={closeQuickSearchModal} />
      <GeminiAiModal opened={geminiModalOpened} onClose={closeGeminiModal} initialTab={geminiModalTab} />
    </AppShell>
  );
}

export default function App() {
  return (
    <>
      <ColorSchemeScript defaultColorScheme="auto" />
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <NotesProvider>
          <Shell />
          <AlarmModal />
        </NotesProvider>
      </MantineProvider>
    </>
  );
}
