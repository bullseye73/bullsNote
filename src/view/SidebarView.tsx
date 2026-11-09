// VIEW: 좌측 사이드바 (프로젝트/폴더 중심 탐색 + Daily Notes/AI/즐겨찾기/할일 + 하단 달력·태그 팝오버)
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Divider,
  Group,
  Menu,
  Modal,
  NavLink,
  Paper,
  Popover,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
  useComputedColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBrandGoogle,
  IconCalendar,
  IconCalendarEvent,
  IconChevronDown,
  IconChevronRight,
  IconCommand,
  IconDots,
  IconFilterOff,
  IconFolder,
  IconFolderPlus,
  IconHash,
  IconIndentDecrease,
  IconIndentIncrease,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSortAscendingLetters,
  IconSortDescendingNumbers,
  IconSparkles,
  IconStar,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNotes } from '../controller/NotesController';
import {
  MAX_PROJECT_DEPTH,
  Project,
  ProjectTreeNode,
  canSetProjectParent,
  flattenProjectTree,
  getProjectDescendantIds,
} from '../model/Note';
import { TODO_PROJECT_ID } from '../model/TodoService';
import { SHORTCUTS } from '../model/shortcutUtils';
import { SortMenu } from './SortMenu';
import { MiniCalendar } from './MiniCalendar';

const POPULAR_ICONS = [
  '📁',
  '📂',
  '🚀',
  '💡',
  '📝',
  '🎯',
  '📚',
  '💼',
  '🔬',
  '🛠️',
  '🎨',
  '📊',
  '⚡',
  '🌟',
  '🔥',
  '💻',
  '☕',
  '🎮',
  '🌐',
  '🔒',
];

interface SidebarViewProps {
  onOpenGoogleSyncModal?: () => void;
}

export function SidebarView({ onOpenGoogleSyncModal: _onOpenGoogleSyncModal }: SidebarViewProps) {
  const {
    projects,
    sortedProjects,
    projectTree,
    projectSortOption,
    setProjectSortOption,
    selectedProjectId,
    selectProject,
    createProject,
    updateProject,
    setProjectParent,
    indentProject,
    outdentProject,
    deleteProject,
    notes,
    search,
    setSearch,
    searchScope,
    setSearchScope,
    quickFilter,
    setQuickFilter,
    openQuickSearchModal,
    openGeminiModal,
    tagCounts,
    activeTag,
    setActiveTag,
    selectedDate,
    setSelectedDate,
    create,
    showFavoriteOnly,
    setShowFavoriteOnly,
    vaultMode,
    vaultPath,
    vaultError,
    storageError,
    chooseVault,
    resync,
    googleConfig,
    isSyncing,
    syncError,
    openGoogleSyncModal,
    plannerViewActive,
    openPlannerView,
    closePlannerView,
  } = useNotes();

  // 모든 검색/태그/날짜/퀵필터 조건을 일괄 초기화하여 대상 목록을 온전히 표시
  const resetAllFilters = useCallback(() => {
    setSearch('');
    setActiveTag(null);
    setSelectedDate(null);
    setQuickFilter('all');
  }, [setSearch, setActiveTag, setSelectedDate, setQuickFilter]);

  // 오늘 날짜 YYYY-MM-DD 포맷
  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const isDailyTodayActive = selectedDate === todayStr;

  // 태그 클라우드 정렬 및 검색 상태
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = scheme === 'dark';
  const [tagSort, setTagSort] = useState<'count' | 'name'>('count');
  const [tagFilterText, setTagFilterText] = useState('');
  const [calendarPopoverOpened, setCalendarPopoverOpened] = useState(false);
  const [tagPopoverOpened, setTagPopoverOpened] = useState(false);

  const sortedFilteredTags = useMemo(() => {
    let list = [...tagCounts];
    if (tagFilterText.trim()) {
      const q = tagFilterText.trim().toLowerCase();
      list = list.filter((item) => item.tag.toLowerCase().includes(q));
    }
    if (tagSort === 'count') {
      list.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    } else {
      list.sort((a, b) => a.tag.localeCompare(b.tag));
    }
    return list;
  }, [tagCounts, tagSort, tagFilterText]);

  // 프로젝트 생성/수정 모달 상태
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('');
  const [formParentId, setFormParentId] = useState<string | null>(null);

  // 폴더 트리 접기/펼치기 상태 (localStorage 영구 보존)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('bullsnote.projects.collapsed');
      if (saved) return new Set<string>(JSON.parse(saved));
    } catch { }
    return new Set<string>();
  });

  useEffect(() => {
    try {
      localStorage.setItem('bullsnote.projects.collapsed', JSON.stringify([...collapsedProjects]));
    } catch { }
  }, [collapsedProjects]);

  const toggleProjectCollapse = useCallback((projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  // 폴더 드래그 앤 드롭 상태
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [dropTargetProjectId, setDropTargetProjectId] = useState<string | 'ROOT' | null>(null);

  const startCreateProject = (parentId: string | null = null) => {
    setEditingProject(null);
    setFormName('');
    setFormIcon('');
    setFormParentId(parentId);
    openModal();
  };

  const startEditProject = (p: Project) => {
    setEditingProject(p);
    setFormName(p.name);
    setFormIcon(p.icon || '');
    setFormParentId(p.parentId ?? null);
    openModal();
  };

  const handleSaveProject = () => {
    const trimmed = formName.trim();
    if (!trimmed) return;
    if (editingProject) {
      updateProject(editingProject.id, {
        name: trimmed,
        icon: formIcon,
        parentId: formParentId,
      });
    } else {
      createProject(trimmed, formIcon, formParentId);
      // 하위 폴더 생성 시 상위 폴더를 자동으로 펼침
      if (formParentId) {
        setCollapsedProjects((prev) => {
          if (!prev.has(formParentId)) return prev;
          const next = new Set(prev);
          next.delete(formParentId);
          return next;
        });
      }
    }
    closeModal();
  };

  const regularProjects = useMemo(
    () => sortedProjects.filter((p) => p.id !== TODO_PROJECT_ID),
    [sortedProjects]
  );

  // 모달 상위 폴더 드롭다운 선택지 (순환 참조 및 최대 3단계 깊이 초과 후보 제외)
  const parentSelectOptions = useMemo(() => {
    const flat = flattenProjectTree(projectTree);
    const opts: Array<{ value: string; label: string; disabled?: boolean }> = [
      { value: '__ROOT__', label: '최상위 폴더 (루트)' },
    ];
    for (const item of flat) {
      const check = canSetProjectParent(projects, editingProject?.id ?? null, item.project.id);
      if (!check.allowed) continue;
      const prefix = item.depth > 0 ? `${'　'.repeat(item.depth)}└ ` : '';
      const iconText = item.project.icon ? `${item.project.icon} ` : '';
      opts.push({
        value: item.project.id,
        label: `${prefix}${iconText}${item.project.name}`,
      });
    }
    return opts;
  }, [projectTree, projects, editingProject]);

  const user = googleConfig?.user;

  return (
    <Stack gap={8} p="xs" h="100%" style={{ backgroundColor: 'var(--bn-surface-sidebar)' }}>
      {/* 구글 계정 프로필 카드 */}
      {user && (
        <Paper
          p={6}
          radius="md"
          withBorder
          onClick={_onOpenGoogleSyncModal || openGoogleSyncModal}
          style={{
            cursor: 'pointer',
            backgroundColor: 'var(--bn-card-bg)',
            borderColor: 'var(--bn-border-subtle)',
          }}
        >
          <Group gap="xs" wrap="nowrap" justify="space-between">
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
              <Avatar src={user.picture} size={24} radius="xl" color="blue">
                <IconBrandGoogle size={14} />
              </Avatar>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Text size="xs" fw={700} truncate>
                  {user.name || 'Google 사용자'}
                </Text>
                <Text size="10px" c="dimmed" truncate>
                  {user.email}
                </Text>
              </div>
            </Group>
            <Badge
              size="xs"
              variant="light"
              color={syncError ? 'red' : isSyncing ? 'blue' : 'teal'}
            >
              {syncError ? '오류' : isSyncing ? '동기화중' : 'Drive'}
            </Badge>
          </Group>
        </Paper>
      )}

      {/* 상단 검색 입력 + 새 노트 버튼 */}
      <div>
        <Group gap={6} wrap="nowrap">
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            placeholder={searchScope === 'all' ? '전체 노트 검색…' : '현재 폴더 검색…'}
            leftSection={<IconSearch size={13} />}
            rightSection={
              <Group gap={2} wrap="nowrap" mr={4}>
                {search ? (
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => setSearch('')}
                    aria-label="검색어 지우기"
                  >
                    <IconX size={11} />
                  </ActionIcon>
                ) : (
                  <Tooltip label={`전역 퀵 검색 (${SHORTCUTS.quickSearch})`}>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={openQuickSearchModal}
                      aria-label="퀵 검색"
                    >
                      <IconCommand size={12} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            }
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            styles={{
              input: {
                backgroundColor: 'var(--bn-card-hover)',
                borderColor: 'var(--bn-border-subtle)',
              },
            }}
          />
          <Tooltip label={`현재 프로젝트에 새 노트 (${SHORTCUTS.newNote})`}>
            <ActionIcon
              size={30}
              color="blue"
              variant="filled"
              radius="md"
              onClick={() => create()}
              aria-label="새 노트"
            >
              <IconPlus size={15} />
            </ActionIcon>
          </Tooltip>
        </Group>

        {/* 미니 퀵 필터 바 */}
        <Group gap={3} mt={6} wrap="wrap">
          <Tooltip
            label={
              searchScope === 'all'
                ? '모든 프로젝트 검색 중 (클릭 시 현재 프로젝트만)'
                : '선택된 프로젝트만 검색 중 (클릭 시 전체 검색)'
            }
          >
            <Button
              size="compact-xs"
              variant={searchScope === 'all' ? 'light' : 'subtle'}
              color={searchScope === 'all' ? 'blue' : 'gray'}
              onClick={() => setSearchScope(searchScope === 'all' ? 'current' : 'all')}
              styles={{ root: { fontSize: 10.5, paddingLeft: 6, paddingRight: 6, height: 20 } }}
            >
              {searchScope === 'all' ? '🌐 전체' : '📁 현재'}
            </Button>
          </Tooltip>

          <Tooltip label="고정된 노트만 보기">
            <Button
              size="compact-xs"
              variant={quickFilter === 'pinned' ? 'filled' : 'subtle'}
              color={quickFilter === 'pinned' ? 'blue' : 'gray'}
              onClick={() => setQuickFilter(quickFilter === 'pinned' ? 'all' : 'pinned')}
              styles={{ root: { fontSize: 10.5, paddingLeft: 5, paddingRight: 5, height: 20 } }}
            >
              📌
            </Button>
          </Tooltip>

          <Tooltip label="알림 설정된 노트만 보기">
            <Button
              size="compact-xs"
              variant={quickFilter === 'reminder' ? 'filled' : 'subtle'}
              color={quickFilter === 'reminder' ? 'red' : 'gray'}
              onClick={() => setQuickFilter(quickFilter === 'reminder' ? 'all' : 'reminder')}
              styles={{ root: { fontSize: 10.5, paddingLeft: 5, paddingRight: 5, height: 20 } }}
            >
              ⏰
            </Button>
          </Tooltip>

          <Tooltip label="첨부파일 있는 노트만 보기">
            <Button
              size="compact-xs"
              variant={quickFilter === 'attachment' ? 'filled' : 'subtle'}
              color={quickFilter === 'attachment' ? 'teal' : 'gray'}
              onClick={() => setQuickFilter(quickFilter === 'attachment' ? 'all' : 'attachment')}
              styles={{ root: { fontSize: 10.5, paddingLeft: 5, paddingRight: 5, height: 20 } }}
            >
              📎
            </Button>
          </Tooltip>
        </Group>
      </div>

      {/* 고정 퀵 내비게이션: Daily Notes · Gemini AI · 즐겨찾기 · 할일관리 · 플래너 */}
      <Stack gap={2}>
        <NavLink
          label="Daily Notes (오늘)"
          leftSection={<IconCalendarEvent size={15} color="var(--mantine-color-teal-5)" />}
          active={isDailyTodayActive && !plannerViewActive}
          onClick={() => {
            closePlannerView();
            if (isDailyTodayActive) {
              setSelectedDate(null);
            } else {
              setShowFavoriteOnly(false);
              setSelectedDate(todayStr);
            }
          }}
          rightSection={
            isDailyTodayActive && !plannerViewActive ? (
              <Badge size="xs" variant="light" color="teal">
                오늘
              </Badge>
            ) : undefined
          }
          styles={{
            root: { borderRadius: 8, padding: '5px 8px' },
            label: { fontSize: 12.5, fontWeight: 500 },
          }}
        />
        <NavLink
          label="Gemini AI"
          leftSection={<IconSparkles size={15} color="var(--mantine-color-violet-5)" />}
          onClick={() => openGeminiModal('clipboard')}
          rightSection={
            <Text size="10px" c="dimmed">
              {SHORTCUTS.geminiAi}
            </Text>
          }
          styles={{
            root: { borderRadius: 8, padding: '5px 8px' },
            label: { fontSize: 12.5, fontWeight: 500 },
          }}
        />
        <NavLink
          label="즐겨찾기"
          leftSection={<IconStar size={15} color="var(--mantine-color-yellow-5)" />}
          active={showFavoriteOnly && !plannerViewActive}
          onClick={() => {
            closePlannerView();
            const next = !showFavoriteOnly;
            setShowFavoriteOnly(next);
            if (next) {
              resetAllFilters();
            }
          }}
          rightSection={
            <Badge
              size="xs"
              variant={showFavoriteOnly && !plannerViewActive ? 'filled' : 'subtle'}
              color={showFavoriteOnly && !plannerViewActive ? 'yellow' : 'gray'}
            >
              {notes.filter((n) => n.favorite).length}
            </Badge>
          }
          styles={{
            root: { borderRadius: 8, padding: '5px 8px' },
            label: { fontSize: 12.5, fontWeight: 500 },
          }}
        />
        <NavLink
          label="할일관리"
          leftSection={<span style={{ fontSize: 14, lineHeight: 1 }}>📋</span>}
          active={selectedProjectId === TODO_PROJECT_ID && !showFavoriteOnly && !plannerViewActive}
          onClick={() => {
            closePlannerView();
            setShowFavoriteOnly(false);
            resetAllFilters();
            selectProject(TODO_PROJECT_ID);
          }}
          rightSection={
            <Badge
              size="xs"
              variant={
                selectedProjectId === TODO_PROJECT_ID && !showFavoriteOnly && !plannerViewActive
                  ? 'filled'
                  : 'subtle'
              }
              color={
                selectedProjectId === TODO_PROJECT_ID && !showFavoriteOnly && !plannerViewActive
                  ? 'blue'
                  : 'gray'
              }
            >
              {notes.filter((n) => n.projectId === TODO_PROJECT_ID && !n.systemGroupType).length}
            </Badge>
          }
          styles={{
            root: { borderRadius: 8, padding: '5px 8px' },
            label: { fontSize: 12.5, fontWeight: 500 },
          }}
        />
        <NavLink
          label="플래너 (Schedule)"
          leftSection={<span style={{ fontSize: 14, lineHeight: 1 }}>📊</span>}
          active={plannerViewActive}
          onClick={() => {
            resetAllFilters();
            openPlannerView();
          }}
          rightSection={
            <Badge
              size="xs"
              variant={plannerViewActive ? 'filled' : 'light'}
              color={plannerViewActive ? 'orange' : 'gray'}
            >
              간트
            </Badge>
          }
          styles={{
            root: { borderRadius: 8, padding: '5px 8px' },
            label: { fontSize: 12.5, fontWeight: plannerViewActive ? 700 : 500 },
          }}
        />
      </Stack>

      <Divider color="var(--bn-border-subtle)" />

      {/* 폴더 / 프로젝트 탐색 섹션 (최대 3단계 계층 트리 지원) */}
      <Group
        justify="space-between"
        px={4}
        py={2}
        style={{
          borderRadius: 6,
          backgroundColor:
            dropTargetProjectId === 'ROOT' ? 'var(--mantine-color-blue-light)' : undefined,
          outline:
            dropTargetProjectId === 'ROOT'
              ? '1.5px dashed var(--mantine-color-blue-5)'
              : undefined,
          transition: 'all 0.12s ease',
        }}
        onDragOver={(e) => {
          if (!draggingProjectId) return;
          e.preventDefault();
          setDropTargetProjectId('ROOT');
        }}
        onDragLeave={() => {
          if (dropTargetProjectId === 'ROOT') setDropTargetProjectId(null);
        }}
        onDrop={(e) => {
          if (!draggingProjectId) return;
          e.preventDefault();
          setProjectParent(draggingProjectId, null);
          setDraggingProjectId(null);
          setDropTargetProjectId(null);
        }}
      >
        <Tooltip label={draggingProjectId ? '여기에 놓으면 최상위(루트) 폴더로 이동합니다' : '최대 3단계 계층 폴더 관리 (드래그 앤 드롭 지원)'}>
          <Text size="xs" fw={600} c="dimmed" style={{ letterSpacing: '0.2px', cursor: 'default' }}>
            폴더 ({regularProjects.length})
          </Text>
        </Tooltip>
        <Group gap={4}>
          <SortMenu
            sortOption={projectSortOption}
            onChange={setProjectSortOption}
            targetName="프로젝트"
            size="xs"
          />
          <Tooltip label="새 최상위 폴더(프로젝트) 만들기">
            <ActionIcon
              size="xs"
              variant="subtle"
              color="blue"
              onClick={() => startCreateProject(null)}
              aria-label="새 프로젝트"
            >
              <IconPlus size={13} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
        <Stack gap={2}>
          {(() => {
            const renderProjectNode = (
              node: ProjectTreeNode,
              hasPrevSibling: boolean,
            ): React.ReactNode => {
              const proj = node.project;
              const depth = node.depth;
              const hasChildren = node.children.length > 0;
              const isCollapsed = collapsedProjects.has(proj.id);
              const count = notes.filter((n) => (n.projectId || 'default') === proj.id).length;
              const isSelected =
                proj.id === selectedProjectId && !showFavoriteOnly && !plannerViewActive;

              const descendantIds = getProjectDescendantIds(projects, proj.id);
              const subFolderCount = Math.max(0, descendantIds.size - 1);
              const totalNoteCount = notes.filter((n) =>
                descendantIds.has(n.projectId || 'default'),
              ).length;

              const canAddSubFolder = depth < MAX_PROJECT_DEPTH;
              const isDragging = draggingProjectId === proj.id;
              const isDropTarget = dropTargetProjectId === proj.id;

              return (
                <div key={proj.id}>
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      setDraggingProjectId(proj.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', proj.id);
                    }}
                    onDragOver={(e) => {
                      if (!draggingProjectId || draggingProjectId === proj.id) return;
                      const check = canSetProjectParent(projects, draggingProjectId, proj.id);
                      if (!check.allowed) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setDropTargetProjectId(proj.id);
                    }}
                    onDragLeave={(e) => {
                      e.stopPropagation();
                      if (dropTargetProjectId === proj.id) {
                        setDropTargetProjectId(null);
                      }
                    }}
                    onDrop={(e) => {
                      if (!draggingProjectId || draggingProjectId === proj.id) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const res = setProjectParent(draggingProjectId, proj.id);
                      if (!res.success && res.error) {
                        alert(res.error);
                      } else {
                        setCollapsedProjects((prev) => {
                          if (!prev.has(proj.id)) return prev;
                          const next = new Set(prev);
                          next.delete(proj.id);
                          return next;
                        });
                      }
                      setDraggingProjectId(null);
                      setDropTargetProjectId(null);
                    }}
                    onDragEnd={() => {
                      setDraggingProjectId(null);
                      setDropTargetProjectId(null);
                    }}
                    style={{
                      paddingLeft: depth * 14,
                      position: 'relative',
                      opacity: isDragging ? 0.45 : 1,
                      borderRadius: 8,
                      outline: isDropTarget
                        ? '1.5px dashed var(--mantine-color-blue-5)'
                        : undefined,
                      backgroundColor: isDropTarget
                        ? 'var(--mantine-color-blue-light)'
                        : undefined,
                      transition: 'all 0.12s ease',
                    }}
                  >
                    {depth > 0 && (
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          left: (depth - 1) * 14 + 10,
                          top: 2,
                          bottom: 2,
                          width: 1,
                          backgroundColor: 'var(--bn-border-subtle)',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                    <NavLink
                      label={proj.name}
                      leftSection={
                        hasChildren || proj.icon ? (
                          <Group gap={2} wrap="nowrap" style={{ marginRight: -2 }}>
                            {hasChildren && (
                              <ActionIcon
                                size={16}
                                variant="subtle"
                                color="gray"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleProjectCollapse(proj.id);
                                }}
                                aria-label={isCollapsed ? '하위 폴더 펼치기' : '하위 폴더 접기'}
                              >
                                {isCollapsed ? (
                                  <IconChevronRight size={12} />
                                ) : (
                                  <IconChevronDown size={12} />
                                )}
                              </ActionIcon>
                            )}
                            {proj.icon ? (
                              <span style={{ fontSize: 14.5, lineHeight: 1 }}>
                                {proj.icon}
                              </span>
                            ) : null}
                          </Group>
                        ) : undefined
                      }
                      active={isSelected}
                      onClick={() => {
                        setShowFavoriteOnly(false);
                        resetAllFilters();
                        selectProject(proj.id);
                      }}
                      styles={{
                        root: { borderRadius: 8, padding: '5px 8px' },
                        label: {
                          fontSize: 12.8,
                          fontWeight: isSelected ? 600 : 400,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        },
                      }}
                      rightSection={
                        <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                          {hasChildren && isCollapsed && subFolderCount > 0 && (
                            <Tooltip label={`접힌 하위 폴더 ${subFolderCount}개`}>
                              <Badge
                                size="xs"
                                variant="outline"
                                color="blue"
                                style={{ paddingLeft: 4, paddingRight: 4, fontSize: 9.5 }}
                              >
                                +{subFolderCount}
                              </Badge>
                            </Tooltip>
                          )}
                          <Tooltip label={`직속 노트 ${count}개`}>
                            <Badge
                              size="xs"
                              variant={isSelected ? 'light' : 'subtle'}
                              color={isSelected ? 'blue' : 'gray'}
                            >
                              {count}
                            </Badge>
                          </Tooltip>
                          <Menu position="bottom-end" withArrow shadow="md" withinPortal>
                            <Menu.Target>
                              <ActionIcon size="xs" variant="subtle" color="gray" aria-label="폴더 옵션">
                                <IconDots size={13} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                leftSection={<IconFolderPlus size={14} />}
                                disabled={!canAddSubFolder}
                                onClick={() => startCreateProject(proj.id)}
                              >
                                {canAddSubFolder
                                  ? '하위 폴더 추가'
                                  : '하위 폴더 추가 (최대 3단계 제한)'}
                              </Menu.Item>
                              <Menu.Item
                                leftSection={<IconPencil size={14} />}
                                onClick={() => startEditProject(proj)}
                              >
                                이름·아이콘·상위 폴더 수정
                              </Menu.Item>
                              <Menu.Divider />
                              <Menu.Label>계층 위치 변경</Menu.Label>
                              <Menu.Item
                                leftSection={<IconIndentIncrease size={14} />}
                                disabled={!hasPrevSibling || depth >= MAX_PROJECT_DEPTH}
                                onClick={() => indentProject(proj.id)}
                              >
                                들여쓰기 (이전 폴더의 하위로)
                              </Menu.Item>
                              <Menu.Item
                                leftSection={<IconIndentDecrease size={14} />}
                                disabled={depth === 0}
                                onClick={() => outdentProject(proj.id)}
                              >
                                내어쓰기 (상위 단계로)
                              </Menu.Item>
                              {depth > 0 && (
                                <Menu.Item
                                  leftSection={<IconFolder size={14} />}
                                  onClick={() => setProjectParent(proj.id, null)}
                                >
                                  최상위(루트) 폴더로 이동
                                </Menu.Item>
                              )}
                              <Menu.Divider />
                              <Menu.Item
                                color="red"
                                leftSection={<IconTrash size={14} />}
                                disabled={regularProjects.length <= 1}
                                onClick={() => {
                                  if (regularProjects.length <= 1) {
                                    alert('최소 1개의 폴더는 유지되어야 합니다.');
                                    return;
                                  }
                                  let msg = `"${proj.name}" 폴더를 삭제할까요?`;
                                  if (subFolderCount > 0 && totalNoteCount > 0) {
                                    msg = `"${proj.name}" 폴더와 하위 폴더 ${subFolderCount}개 및 소속된 노트 총 ${totalNoteCount}개를 모두 삭제할까요?`;
                                  } else if (subFolderCount > 0) {
                                    msg = `"${proj.name}" 폴더와 하위 폴더 ${subFolderCount}개를 모두 삭제할까요?`;
                                  } else if (count > 0) {
                                    msg = `"${proj.name}" 폴더와 소속된 ${count}개의 노트를 모두 삭제할까요?`;
                                  }
                                  if (confirm(msg)) {
                                    deleteProject(proj.id);
                                  }
                                }}
                              >
                                폴더 삭제{subFolderCount > 0 ? ` (하위 ${subFolderCount}개 포함)` : ''}
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      }
                    />
                  </div>
                  {hasChildren && !isCollapsed && (
                    <Stack gap={2} mt={2}>
                      {node.children.map((child, idx) => renderProjectNode(child, idx > 0))}
                    </Stack>
                  )}
                </div>
              );
            };

            return projectTree.map((node, idx) => renderProjectNode(node, idx > 0));
          })()}
        </Stack>
      </ScrollArea>

      {/* 활성 필터 배너 (날짜 또는 태그 필터 적용 시 한눈에 확인 및 해제) */}
      {(selectedDate || activeTag) && (
        <Group gap={4} wrap="wrap" px={2}>
          {selectedDate && (
            <Badge
              size="sm"
              variant="light"
              color="teal"
              rightSection={
                <ActionIcon
                  size={14}
                  variant="transparent"
                  color="teal"
                  onClick={() => setSelectedDate(null)}
                  aria-label="날짜 필터 해제"
                >
                  <IconX size={10} />
                </ActionIcon>
              }
            >
              📅 {selectedDate}
            </Badge>
          )}
          {activeTag && (
            <Badge
              size="sm"
              variant="light"
              color="blue"
              rightSection={
                <ActionIcon
                  size={14}
                  variant="transparent"
                  color="blue"
                  onClick={() => setActiveTag(null)}
                  aria-label="태그 필터 해제"
                >
                  <IconX size={10} />
                </ActionIcon>
              }
            >
              #{activeTag}
            </Badge>
          )}
        </Group>
      )}

      <Divider color="var(--bn-border-subtle)" />

      {/* 하단 미니멀 푸터: 달력 보기 팝오버 + 태그 필터 팝오버 */}
      <Group gap={6} grow>
        <Popover
          opened={calendarPopoverOpened}
          onChange={setCalendarPopoverOpened}
          position="top-start"
          width={268}
          withArrow
          shadow="lg"
        >
          <Popover.Target>
            <Button
              size="xs"
              variant={selectedDate ? 'light' : 'subtle'}
              color={selectedDate ? 'teal' : 'gray'}
              leftSection={<IconCalendar size={14} />}
              onClick={() => setCalendarPopoverOpened((o) => !o)}
              styles={{ root: { fontWeight: 500 } }}
            >
              달력
            </Button>
          </Popover.Target>
          <Popover.Dropdown p="xs">
            <MiniCalendar />
          </Popover.Dropdown>
        </Popover>

        <Popover
          opened={tagPopoverOpened}
          onChange={setTagPopoverOpened}
          position="top-end"
          width={280}
          withArrow
          shadow="lg"
        >
          <Popover.Target>
            <Button
              size="xs"
              variant={activeTag ? 'light' : 'subtle'}
              color={activeTag ? 'blue' : 'gray'}
              leftSection={<IconHash size={14} />}
              rightSection={
                tagCounts.length > 0 ? (
                  <Badge size="xs" variant="light" color="gray" radius="sm">
                    {tagCounts.length}
                  </Badge>
                ) : undefined
              }
              onClick={() => setTagPopoverOpened((o) => !o)}
              styles={{ root: { fontWeight: 500 } }}
            >
              태그
            </Button>
          </Popover.Target>
          <Popover.Dropdown p="sm">
            {tagCounts.length === 0 ? (
              <Stack align="center" justify="center" py="md" gap="xs">
                <IconHash size={24} color="var(--mantine-color-dimmed)" style={{ opacity: 0.5 }} />
                <Text size="xs" c="dimmed" ta="center">
                  본문에 #태그를 입력하면
                  <br />
                  자동으로 여기에 수집됩니다.
                </Text>
              </Stack>
            ) : (
              <Stack gap={8}>
                <Group justify="space-between" align="center" wrap="nowrap">
                  <Text size="xs" fw={600} c="dimmed">
                    태그 목록 ({tagCounts.length})
                  </Text>
                  <Group gap={3} wrap="nowrap">
                    <Tooltip label="빈도순 정렬">
                      <ActionIcon
                        size="xs"
                        variant={tagSort === 'count' ? 'filled' : 'subtle'}
                        color={tagSort === 'count' ? 'blue' : 'gray'}
                        onClick={() => setTagSort('count')}
                      >
                        <IconSortDescendingNumbers size={13} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="이름순 정렬">
                      <ActionIcon
                        size="xs"
                        variant={tagSort === 'name' ? 'filled' : 'subtle'}
                        color={tagSort === 'name' ? 'blue' : 'gray'}
                        onClick={() => setTagSort('name')}
                      >
                        <IconSortAscendingLetters size={13} />
                      </ActionIcon>
                    </Tooltip>
                    {activeTag && (
                      <Tooltip label="태그 필터 해제">
                        <ActionIcon
                          size="xs"
                          variant="light"
                          color="red"
                          onClick={() => setActiveTag(null)}
                        >
                          <IconFilterOff size={13} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Group>

                {tagCounts.length >= 6 && (
                  <TextInput
                    size="xs"
                    placeholder="태그 검색…"
                    value={tagFilterText}
                    onChange={(e) => setTagFilterText(e.currentTarget.value)}
                    leftSection={<IconSearch size={12} />}
                    rightSection={
                      tagFilterText ? (
                        <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setTagFilterText('')}>
                          <IconX size={10} />
                        </ActionIcon>
                      ) : undefined
                    }
                  />
                )}

                <ScrollArea.Autosize mah={220} type="auto" offsetScrollbars>
                  {sortedFilteredTags.length === 0 ? (
                    <Text size="xs" c="dimmed" ta="center" py="sm">
                      일치하는 태그가 없습니다.
                    </Text>
                  ) : (
                    <Group gap={5} wrap="wrap">
                      {sortedFilteredTags.map(({ tag, count }) => {
                        const isActive = activeTag === tag;
                        return (
                          <span
                            key={tag}
                            className="bn-subtle-tag"
                            onClick={() => setActiveTag(isActive ? null : tag)}
                            style={{
                              cursor: 'pointer',
                              backgroundColor: isActive
                                ? 'var(--mantine-color-blue-6)'
                                : undefined,
                              color: isActive ? '#ffffff' : undefined,
                              borderColor: isActive ? 'var(--mantine-color-blue-6)' : undefined,
                            }}
                          >
                            #{tag}
                            <span
                              style={{
                                fontSize: 10,
                                opacity: isActive ? 0.9 : isDark ? 0.65 : 0.6,
                                marginLeft: 2,
                              }}
                            >
                              {count}
                            </span>
                          </span>
                        );
                      })}
                    </Group>
                  )}
                </ScrollArea.Autosize>
              </Stack>
            )}
          </Popover.Dropdown>
        </Popover>
      </Group>

      {/* 볼트 경로 표시 (활성 시) */}
      {vaultMode ? (
        <Group justify="space-between" wrap="nowrap" px={4}>
          <Group gap={4} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <IconFolder size={13} style={{ flexShrink: 0, opacity: 0.6 }} />
            <Text size="11px" c="dimmed" truncate title={vaultPath}>
              {vaultPath || '저장 폴더 확인 중…'}
            </Text>
          </Group>
          <Group gap={2} wrap="nowrap">
            <Tooltip label="저장 폴더 변경">
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => void chooseVault()}>
                <IconFolder size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="외부 변경 동기화">
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => void resync()}>
                <IconRefresh size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
          {vaultError && (
            <Text size="xs" c="red">
              {vaultError}
            </Text>
          )}
        </Group>
      ) : storageError ? (
        <Text size="xs" c="red" fw={600} style={{ wordBreak: 'break-all' }}>
          {storageError}
        </Text>
      ) : null}

      {/* 프로젝트 생성/수정 모달 */}
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingProject ? '폴더(프로젝트) 수정' : '새 폴더(프로젝트) 만들기'}
        centered
        size="sm"
      >
        <Stack gap="md">
          <TextInput
            label="폴더 이름"
            placeholder="예: 업무 기획, 개인 공부, 프로젝트 A"
            value={formName}
            onChange={(e) => setFormName(e.currentTarget.value)}
            required
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveProject();
              }
            }}
          />

          <Select
            label="상위 폴더 위치 (최대 3단계 계층)"
            description="최상위 폴더로 만들거나 기존 폴더의 하위 폴더로 배치할 수 있습니다."
            data={parentSelectOptions}
            value={formParentId ?? '__ROOT__'}
            onChange={(val) => setFormParentId(!val || val === '__ROOT__' ? null : val)}
            allowDeselect={false}
            size="xs"
          />

          <div>
            <Group justify="space-between" align="center" mb={4}>
              <Text size="sm" fw={500}>
                아이콘 선택 <Text span size="xs" c="dimmed" fw={400}>(선택사항)</Text>
              </Text>
              {formIcon && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => setFormIcon('')}
                >
                  아이콘 없음(해제)
                </Button>
              )}
            </Group>
            <SimpleGrid cols={5} spacing={6} mb={8}>
              {POPULAR_ICONS.map((icon) => (
                <Button
                  key={icon}
                  variant={formIcon === icon ? 'filled' : 'subtle'}
                  color="blue"
                  p={4}
                  h={38}
                  onClick={() => setFormIcon((prev) => (prev === icon ? '' : icon))}
                  style={{ fontSize: 18 }}
                >
                  {icon}
                </Button>
              ))}
            </SimpleGrid>
            <TextInput
              label="직접 이모지 입력 (선택사항)"
              placeholder="비워두면 아이콘 없이 폴더 이름만 표시됩니다 (예: 🪐, ☕)"
              value={formIcon}
              onChange={(e) => setFormIcon(e.currentTarget.value.slice(0, 4))}
              rightSection={
                formIcon ? (
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => setFormIcon('')}
                    aria-label="이모지 지우기"
                  >
                    <IconX size={12} />
                  </ActionIcon>
                ) : undefined
              }
              size="xs"
            />
          </div>

          <Group justify="flex-end" gap="xs" mt="xs">
            <Button variant="default" onClick={closeModal}>
              취소
            </Button>
            <Button color="blue" onClick={handleSaveProject} disabled={!formName.trim()}>
              {editingProject ? '저장' : '만들기'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
