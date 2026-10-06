// VIEW root: 헤더 + 좌측 메뉴 + 좌측 노트목록 + 에디터 (MVC의 V)
import {
  ActionIcon,
  AppShell,
  Badge,
  Button,
  ColorSchemeScript,
  Divider,
  Group,
  MantineProvider,
  Tooltip,
  createTheme,
} from '@mantine/core';
import '@mantine/core/styles.css';
import './index.css';
import { useDisclosure, useHotkeys } from '@mantine/hooks';
import {
  IconCloudCheck,
  IconCloudOff,
  IconLayoutSidebarLeftCollapse,
  IconListTree,
  IconPlus,
  IconRefresh,
} from '@tabler/icons-react';
import { NotesProvider, useNotes } from './controller/NotesController';
import { ErrorBoundary } from './view/ErrorBoundary';
import { NoteEditorView } from './view/NoteEditorView';
import { NoteListView } from './view/NoteListView';
import { SidebarView } from './view/SidebarView';
import { AlarmModal } from './view/AlarmModal';
import { SupabaseSettingsModal } from './view/SupabaseSettingsModal';
import { SortMenu } from './view/SortMenu';
import { ResizeSplitter, useResizable } from './view/ResizeSplitter';

const theme = createTheme({ primaryColor: 'blue', fontFamily: 'Pretendard, system-ui, sans-serif' });

function ListPanel() {
  const { notes, create, selectedProject, noteSortOption, setNoteSortOption } = useNotes();
  const projectNotes = notes.filter((n) => (n.projectId || 'default') === selectedProject?.id);
  return (
    <>
      <Group justify="space-between" px="sm" pt="sm" pb="xs" wrap="nowrap">
        <Group gap={6} style={{ minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 16 }}>{selectedProject?.icon || '📁'}</span>
          <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedProject?.name || '노트 목록'}
          </span>
          <Badge size="xs" variant="light">
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
          <Tooltip label="최상위 새 노트 (Ctrl+N)">
            <ActionIcon size="sm" color="green" variant="light" onClick={() => create(null)} aria-label="새 노트">
              <IconPlus size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Divider />
      <div style={{ flex: 1, minHeight: 0 }}>
        <NoteListView />
      </div>
    </>
  );
}

function Shell() {
  const [menuOpened, { toggle: toggleMenu }] = useDisclosure(true);
  const [listOpened, { toggle: toggleList }] = useDisclosure(true);
  const [supabaseModalOpened, { open: openSupabaseModal, close: closeSupabaseModal }] = useDisclosure(false);
  const { create, supabaseConnected, isSyncing, lastSyncedAt } = useNotes();

  // 사이드바(프로젝트) 및 노트 목록 동적 너비 리사이징 (localStorage 영구 보존)
  const sidebar = useResizable({
    initialWidth: 248,
    minWidth: 180,
    maxWidth: 480,
    storageKey: 'bullsnote.sidebar.width',
  });

  const list = useResizable({
    initialWidth: 344,
    minWidth: 220,
    maxWidth: 640,
    storageKey: 'bullsnote.list.width',
  });

  useHotkeys([['ctrl+N', (e) => { e.preventDefault(); create(null); }]]);

  const lastSyncText = lastSyncedAt
    ? `마지막 동기화: ${new Date(lastSyncedAt).toLocaleTimeString()}`
    : '동기화 이력 없음';

  return (
    <AppShell
      header={{ height: 44 }}
      navbar={{
        width: sidebar.width,
        breakpoint: 'sm',
        collapsed: { mobile: !menuOpened, desktop: !menuOpened },
      }}
      padding={0}
    >
      <AppShell.Header px="sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Group gap={8} style={{ alignItems: 'center' }}>
          {/* 메뉴 패널 토글: 사이드바 아이콘 */}
          <Tooltip label={menuOpened ? '메뉴 패널 닫기' : '메뉴 패널 열기 (전체노트/태그)'}>
            <ActionIcon
              variant={menuOpened ? 'filled' : 'light'}
              color="blue"
              onClick={toggleMenu}
              aria-label="메뉴 패널 토글"
            >
              <IconLayoutSidebarLeftCollapse size={17} />
            </ActionIcon>
          </Tooltip>
          {/* 목록 패널 토글: 트리 아이콘 (모양·색·라벨로 구분) */}
          <Tooltip label={listOpened ? '노트 목록 패널 닫기' : '노트 목록 패널 열기 (트리)'}>
            <ActionIcon
              variant={listOpened ? 'filled' : 'light'}
              color="green"
              onClick={toggleList}
              aria-label="노트 목록 패널 토글"
            >
              <IconListTree size={17} />
            </ActionIcon>
          </Tooltip>
          <span style={{ fontWeight: 800 }}>BullsNote</span>
          <span style={{ fontSize: 12, opacity: 0.6 }}>MVC · Mantine · Electron (Win/Linux/Mac)</span>
        </Group>

        <Group gap="xs">
          <Tooltip
            label={
              supabaseConnected
                ? `Supabase 클라우드 연동됨 (${lastSyncText}) - 클릭하여 설정`
                : 'Supabase 미연동 (현재 로컬 저장 전용) - 클릭하여 클라우드 연동'
            }
          >
            <Button
              size="xs"
              variant={supabaseConnected ? 'light' : 'subtle'}
              color={supabaseConnected ? 'teal' : 'gray'}
              leftSection={
                isSyncing ? (
                  <IconRefresh size={14} className="spin-animation" />
                ) : supabaseConnected ? (
                  <IconCloudCheck size={14} />
                ) : (
                  <IconCloudOff size={14} />
                )
              }
              onClick={openSupabaseModal}
            >
              {isSyncing
                ? '동기화 중…'
                : supabaseConnected
                ? 'Supabase 연동됨'
                : '로컬 모드 (Supabase 연동)'}
            </Button>
          </Tooltip>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar>
        <SidebarView onOpenSupabaseModal={openSupabaseModal} />
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
      <AppShell.Main h="calc(100vh - 44px)">
        <ErrorBoundary title="화면을 표시하지 못했습니다">
          <div style={{ display: 'flex', height: '100%' }}>
            {listOpened && (
              <>
                <div
                  style={{
                    width: list.width,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                  }}
                >
                  <ListPanel />
                </div>
                <ResizeSplitter
                  onMouseDown={list.startResize}
                  onDoubleClick={list.resetWidth}
                  title="마우스 드래그로 노트 목록 너비 조절 (더블클릭 시 기본값)"
                />
              </>
            )}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto' }}>
              <NoteEditorView />
            </div>
          </div>
        </ErrorBoundary>
      </AppShell.Main>
      <SupabaseSettingsModal opened={supabaseModalOpened} onClose={closeSupabaseModal} />
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
