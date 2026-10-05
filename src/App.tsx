// VIEW root: 헤더 + 좌측 메뉴 + 좌측 노트목록 + 에디터 (MVC의 V)
import {
  ActionIcon,
  AppShell,
  Badge,
  ColorSchemeScript,
  Divider,
  Group,
  MantineProvider,
  Tooltip,
  createTheme,
} from '@mantine/core';
import '@mantine/core/styles.css';
import { useDisclosure, useHotkeys } from '@mantine/hooks';
import { IconLayoutSidebarLeftCollapse, IconListTree, IconPlus } from '@tabler/icons-react';
import { NotesProvider, useNotes } from './controller/NotesController';
import { ErrorBoundary } from './view/ErrorBoundary';
import { NoteEditorView } from './view/NoteEditorView';
import { NoteListView } from './view/NoteListView';
import { SidebarView } from './view/SidebarView';

const theme = createTheme({ primaryColor: 'blue', fontFamily: 'Pretendard, system-ui, sans-serif' });

function ListPanel() {
  const { notes, create } = useNotes();
  return (
    <>
      <Group justify="space-between" px="sm" pt="sm" pb="xs" wrap="nowrap">
        <Group gap={6}>
          <IconListTree size={16} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>노트 목록</span>
          <Badge size="xs" variant="light">
            {notes.length}
          </Badge>
        </Group>
        <Tooltip label="최상위 새 노트 (Ctrl+N)">
          <ActionIcon size="sm" color="green" variant="light" onClick={() => create(null)} aria-label="새 노트">
            <IconPlus size={14} />
          </ActionIcon>
        </Tooltip>
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
  const { create } = useNotes();

  useHotkeys([['ctrl+N', (e) => { e.preventDefault(); create(null); }]]);

  return (
    <AppShell
      header={{ height: 44 }}
      navbar={{ width: 248, breakpoint: 'sm', collapsed: { mobile: !menuOpened, desktop: !menuOpened } }}
      padding={0}
    >
      <AppShell.Header px="sm" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
      </AppShell.Header>
      <AppShell.Navbar>
        <SidebarView />
      </AppShell.Navbar>
      <AppShell.Main h="calc(100vh - 44px)">
        <ErrorBoundary title="화면을 표시하지 못했습니다">
          <div style={{ display: 'flex', height: '100%' }}>
            {listOpened && (
              <div
                style={{
                  width: 344,
                  flexShrink: 0,
                  borderRight: '1px solid var(--mantine-color-gray-3)',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                }}
              >
                <ListPanel />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto' }}>
              <NoteEditorView />
            </div>
          </div>
        </ErrorBoundary>
      </AppShell.Main>
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
        </NotesProvider>
      </MantineProvider>
    </>
  );
}
