// VIEW: 좌측 사이드바 (프로젝트 CRUD + 검색/태그/볼트)
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Menu,
  Modal,
  NavLink,
  ScrollArea,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconCalendar,
  IconCloud,
  IconCloudCheck,
  IconCloudOff,
  IconCommand,
  IconDots,
  IconFolder,
  IconHash,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconStar,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useState, useCallback } from 'react';
import { useNotes } from '../controller/NotesController';
import { Project } from '../model/Note';
import { TODO_PROJECT_ID } from '../model/TodoService';
import { APP_VERSION } from '../model/version';
import { SHORTCUTS } from '../model/shortcutUtils';
import { SortMenu } from './SortMenu';
import { MiniCalendar } from './MiniCalendar';
import { HorizontalResizeSplitter, useResizableHeight } from './ResizeSplitter';

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
  onOpenSupabaseModal?: () => void;
}

export function SidebarView({ onOpenSupabaseModal }: SidebarViewProps) {
  const {
    projects,
    sortedProjects,
    projectSortOption,
    setProjectSortOption,
    selectedProjectId,
    selectProject,
    createProject,
    updateProject,
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
    supabaseConnected,
    realtimeStatus,
    isSyncing,
    syncWithSupabase,
    lastSyncedAt,
  } = useNotes();

  // 모든 검색/태그/날짜/퀵필터 조건을 일괄 초기화하여 대상 목록을 온전히 표시
  const resetAllFilters = useCallback(() => {
    setSearch('');
    setActiveTag(null);
    setSelectedDate(null);
    setQuickFilter('all');
  }, [setSearch, setActiveTag, setSelectedDate, setQuickFilter]);

  // 프로젝트 영역 높이 동적 조절 (기본 180px, 최소 70px, 최대 500px, localStorage 영속 저장)
  const projectSection = useResizableHeight({
    initialHeight: 180,
    minHeight: 70,
    maxHeight: 500,
    storageKey: 'bullsnote.sidebar.projectHeight',
  });

  // 프로젝트 생성/수정 모달 상태
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('📁');

  const startCreateProject = () => {
    setEditingProject(null);
    setFormName('');
    setFormIcon('📁');
    openModal();
  };

  const startEditProject = (p: Project) => {
    setEditingProject(p);
    setFormName(p.name);
    setFormIcon(p.icon || '📁');
    openModal();
  };

  const handleSaveProject = () => {
    const trimmed = formName.trim();
    if (!trimmed) return;
    if (editingProject) {
      updateProject(editingProject.id, { name: trimmed, icon: formIcon });
    } else {
      createProject(trimmed, formIcon);
    }
    closeModal();
  };

  return (
    <Stack gap="xs" p="sm" h="100%">
      <Group justify="space-between">
        <Group gap={6} align="center">
          <Text fw={800} size="lg">
            BullsNote
          </Text>
          <Badge size="xs" variant="light" color="blue" radius="sm">
            v{APP_VERSION}
          </Badge>
        </Group>
        <Group gap={6} align="center">
          {onOpenSupabaseModal && (
            <Tooltip label={supabaseConnected ? 'Supabase 클라우드 동기화 설정' : 'Supabase 클라우드 연동'}>
              <ActionIcon
                color={supabaseConnected ? 'teal' : 'gray'}
                variant="light"
                onClick={onOpenSupabaseModal}
                aria-label="클라우드 설정"
              >
                {supabaseConnected ? <IconCloudCheck size={16} /> : <IconCloud size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label={`Gemini AI 어시스턴트 (${SHORTCUTS.geminiAiText})`}>
            <ActionIcon color="violet" variant="light" onClick={() => openGeminiModal('clipboard')} aria-label="Gemini AI">
              <IconSparkles size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={`현재 프로젝트에 새 노트 (${SHORTCUTS.newNote})`}>
            <ActionIcon color="blue" variant="filled" onClick={() => create()} aria-label="새 노트">
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* 고도화된 검색 바 및 퀵 필터 칩 */}
      <div>
        <TextInput
          placeholder={searchScope === 'all' ? '전체 검색 (제목/본문/태그)' : '현재 프로젝트 검색'}
          leftSection={<IconSearch size={14} />}
          rightSection={
            <Group gap={2} wrap="nowrap" mr={4}>
              {search ? (
                <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setSearch('')} aria-label="검색어 지우기">
                  <IconX size={12} />
                </ActionIcon>
              ) : (
                <Tooltip label={`전역 퀵 검색 (${SHORTCUTS.quickSearch})`}>
                  <ActionIcon size="xs" variant="light" color="blue" onClick={openQuickSearchModal} aria-label="퀵 검색">
                    <IconCommand size={12} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          }
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />

        {/* 퀵 필터 및 범위 토글 칩 */}
        <Group gap={4} mt={6} wrap="wrap">
          <Tooltip label={searchScope === 'all' ? '현재: 모든 프로젝트 검색 중 (클릭하여 현재 프로젝트만)' : '현재: 선택된 프로젝트만 검색 중 (클릭하여 전체 검색)'}>
            <Button
              size="compact-xs"
              variant={searchScope === 'all' ? 'filled' : 'light'}
              color="blue"
              onClick={() => setSearchScope(searchScope === 'all' ? 'current' : 'all')}
              styles={{ root: { fontSize: 10, paddingLeft: 6, paddingRight: 6 } }}
            >
              {searchScope === 'all' ? '🌐 전체' : '📁 현재'}
            </Button>
          </Tooltip>

          <Tooltip label="즐겨찾기 필터">
            <Button
              size="compact-xs"
              variant={quickFilter === 'favorite' ? 'filled' : 'subtle'}
              color={quickFilter === 'favorite' ? 'yellow' : 'gray'}
              onClick={() => setQuickFilter(quickFilter === 'favorite' ? 'all' : 'favorite')}
              styles={{ root: { fontSize: 10, paddingLeft: 6, paddingRight: 6 } }}
            >
              ⭐
            </Button>
          </Tooltip>

          <Tooltip label="고정된 노트 필터">
            <Button
              size="compact-xs"
              variant={quickFilter === 'pinned' ? 'filled' : 'subtle'}
              color={quickFilter === 'pinned' ? 'blue' : 'gray'}
              onClick={() => setQuickFilter(quickFilter === 'pinned' ? 'all' : 'pinned')}
              styles={{ root: { fontSize: 10, paddingLeft: 6, paddingRight: 6 } }}
            >
              📌
            </Button>
          </Tooltip>

          <Tooltip label="알림 설정된 노트 필터">
            <Button
              size="compact-xs"
              variant={quickFilter === 'reminder' ? 'filled' : 'subtle'}
              color={quickFilter === 'reminder' ? 'red' : 'gray'}
              onClick={() => setQuickFilter(quickFilter === 'reminder' ? 'all' : 'reminder')}
              styles={{ root: { fontSize: 10, paddingLeft: 6, paddingRight: 6 } }}
            >
              ⏰
            </Button>
          </Tooltip>

          <Tooltip label="첨부파일 있는 노트 필터">
            <Button
              size="compact-xs"
              variant={quickFilter === 'attachment' ? 'filled' : 'subtle'}
              color={quickFilter === 'attachment' ? 'teal' : 'gray'}
              onClick={() => setQuickFilter(quickFilter === 'attachment' ? 'all' : 'attachment')}
              styles={{ root: { fontSize: 10, paddingLeft: 6, paddingRight: 6 } }}
            >
              📎
            </Button>
          </Tooltip>
          <Tooltip label="할일 관리 (할일 프로젝트로 바로 이동)">
            <Button
              size="compact-xs"
              variant={selectedProjectId === TODO_PROJECT_ID && !showFavoriteOnly ? 'filled' : 'subtle'}
              color={selectedProjectId === TODO_PROJECT_ID && !showFavoriteOnly ? 'blue' : 'gray'}
              onClick={() => {
                setShowFavoriteOnly(false);
                resetAllFilters();
                selectProject(TODO_PROJECT_ID);
              }}
              styles={{ root: { fontSize: 10, paddingLeft: 6, paddingRight: 6 } }}
            >
              📋
            </Button>
          </Tooltip>
        </Group>
      </div>

      {/* 프로젝트 목록 섹션 */}
      {(() => {
        const regularProjects = sortedProjects.filter((p) => p.id !== TODO_PROJECT_ID);
        return (
          <>
            <Group justify="space-between" mt={4} px={4}>
              <Text size="xs" fw={700} c="dimmed">
                프로젝트 ({regularProjects.length})
              </Text>
              <Group gap={4}>
                <SortMenu
                  sortOption={projectSortOption}
                  onChange={setProjectSortOption}
                  targetName="프로젝트"
                  size="xs"
                />
                <Tooltip label="새 프로젝트 만들기">
                  <ActionIcon size="xs" variant="light" color="blue" onClick={startCreateProject} aria-label="새 프로젝트">
                    <IconPlus size={13} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>

            <ScrollArea style={{ height: projectSection.height }} type="auto">
              <Stack gap={2}>
                {regularProjects.map((proj) => {
                  const count = notes.filter((n) => (n.projectId || 'default') === proj.id).length;
                  const isSelected = proj.id === selectedProjectId && !showFavoriteOnly;
                  return (
                    <NavLink
                      key={proj.id}
                      label={proj.name}
                      leftSection={<span style={{ fontSize: 16 }}>{proj.icon || '📁'}</span>}
                      active={isSelected}
                      onClick={() => {
                        setShowFavoriteOnly(false);
                        resetAllFilters();
                        selectProject(proj.id);
                      }}
                      rightSection={
                        <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                          <Badge size="xs" variant={isSelected ? 'filled' : 'light'} color={isSelected ? 'blue' : 'gray'}>
                            {count}
                          </Badge>
                          <Menu position="bottom-end" withArrow shadow="md" withinPortal>
                            <Menu.Target>
                              <ActionIcon size="xs" variant="subtle" color="gray" aria-label="프로젝트 옵션">
                                <IconDots size={13} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => startEditProject(proj)}>
                                이름 및 아이콘 수정
                              </Menu.Item>
                              <Menu.Divider />
                              <Menu.Item
                                color="red"
                                leftSection={<IconTrash size={14} />}
                                disabled={projects.length <= 1}
                                onClick={() => {
                                  if (projects.length <= 1) {
                                    alert('최소 1개의 프로젝트는 유지되어야 합니다.');
                                    return;
                                  }
                                  const msg =
                                    count > 0
                                      ? `"${proj.name}" 프로젝트와 소속된 ${count}개의 노트를 모두 삭제할까요?`
                                      : `"${proj.name}" 프로젝트를 삭제할까요?`;
                                  if (confirm(msg)) {
                                    deleteProject(proj.id);
                                  }
                                }}
                              >
                                프로젝트 삭제
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      }
                    />
                  );
                })}
              </Stack>
            </ScrollArea>
          </>
        );
      })()}

      {/* 즐겨찾기 & 할일관리 고정 시스템 내비게이션 (즐겨찾기와 동일한 UX) */}
      <Stack gap={2}>
        <NavLink
          label="즐겨찾기"
          leftSection={<IconStar size={16} color="var(--mantine-color-yellow-5)" />}
          active={showFavoriteOnly}
          onClick={() => {
            const next = !showFavoriteOnly;
            setShowFavoriteOnly(next);
            if (next) {
              resetAllFilters();
            }
          }}
          rightSection={
            <Badge size="xs" variant={showFavoriteOnly ? 'filled' : 'light'} color="yellow">
              {notes.filter((n) => n.favorite).length}
            </Badge>
          }
          style={{ borderRadius: 6 }}
        />
        <NavLink
          label="할일관리"
          leftSection={<span style={{ fontSize: 16 }}>📋</span>}
          active={selectedProjectId === TODO_PROJECT_ID && !showFavoriteOnly}
          onClick={() => {
            setShowFavoriteOnly(false);
            resetAllFilters();
            selectProject(TODO_PROJECT_ID);
          }}
          rightSection={
            <Badge size="xs" variant={selectedProjectId === TODO_PROJECT_ID && !showFavoriteOnly ? 'filled' : 'light'} color="blue">
              {notes.filter((n) => n.projectId === TODO_PROJECT_ID && !n.systemGroupType).length}
            </Badge>
          }
          style={{ borderRadius: 6 }}
        />
      </Stack>

      {/* 프로젝트 영역과 달력/태그 영역 사이 수직 리사이즈 스플리터 */}
      <div style={{ padding: '2px 0' }}>
        <HorizontalResizeSplitter
          onMouseDown={projectSection.startResize}
          onDoubleClick={projectSection.resetHeight}
          title="마우스 드래그로 프로젝트와 달력 영역의 높이를 조절합니다 (더블클릭 시 기본값 복원)"
        />
      </div>
      <Tabs
        defaultValue="calendar"
        variant="pills"
        radius="sm"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <Tabs.List grow mb={4}>
          <Tabs.Tab value="calendar" leftSection={<IconCalendar size={13} />}>
            달력
          </Tabs.Tab>
          <Tabs.Tab
            value="tags"
            leftSection={<IconHash size={13} />}
            rightSection={
              tagCounts.length > 0 ? (
                <Badge size="xs" variant="light">
                  {tagCounts.length}
                </Badge>
              ) : undefined
            }
          >
            태그
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="calendar" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <MiniCalendar />
        </Tabs.Panel>

        <Tabs.Panel value="tags" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <ScrollArea h="100%" type="auto">
            <Stack gap={2}>
              {tagCounts.length === 0 && (
                <Text size="sm" c="dimmed">
                  본문에 #태그를 입력하면 자동 수집됩니다.
                </Text>
              )}
              {tagCounts.map(({ tag, count }) => (
                <NavLink
                  key={tag}
                  label={`#${tag}`}
                  description={`${count}개`}
                  active={activeTag === tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  rightSection={
                    <Badge size="xs" variant="light">
                      {count}
                    </Badge>
                  }
                />
              ))}
              {activeTag && (
                <NavLink label="태그 필터 해제" onClick={() => setActiveTag(null)} color="red" />
              )}
            </Stack>
          </ScrollArea>
        </Tabs.Panel>
      </Tabs>

      {vaultMode ? (
        <>
          <Divider />
          <Stack gap={2}>
            <Group gap={4} wrap="nowrap">
              <IconFolder size={14} style={{ flexShrink: 0 }} />
              <Text size="xs" c="dimmed" truncate title={vaultPath}>
                {vaultPath || '저장 폴더 확인 중…'}
              </Text>
            </Group>
            <Group gap={4}>
              <Tooltip label="저장 폴더 변경 (OneDrive/Dropbox 안 폴더를 지정하면 기기 간 동기화)">
                <ActionIcon size="sm" variant="light" onClick={() => void chooseVault()} aria-label="저장 폴더 변경">
                  <IconFolder size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="지금 외부 변경 확인">
                <ActionIcon size="sm" variant="light" onClick={() => void resync()} aria-label="지금 동기화">
                  <IconRefresh size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {vaultError && (
              <Text size="xs" c="red">
                {vaultError}
              </Text>
            )}
          </Stack>
        </>
      ) : storageError ? (
        <Text size="xs" c="red" fw={600} style={{ wordBreak: 'break-all' }}>
          {storageError}
        </Text>
      ) : null}



      {/* 프로젝트 생성/수정 모달 */}
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingProject ? '프로젝트 수정' : '새 프로젝트 만들기'}
        centered
        size="sm"
      >
        <Stack gap="md">
          <TextInput
            label="프로젝트 이름"
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

          <div>
            <Text size="sm" fw={500} mb={4}>
              아이콘 선택
            </Text>
            <SimpleGrid cols={5} spacing={6} mb={8}>
              {POPULAR_ICONS.map((icon) => (
                <Button
                  key={icon}
                  variant={formIcon === icon ? 'filled' : 'subtle'}
                  color="blue"
                  p={4}
                  h={38}
                  onClick={() => setFormIcon(icon)}
                  style={{ fontSize: 18 }}
                >
                  {icon}
                </Button>
              ))}
            </SimpleGrid>
            <TextInput
              label="직접 이모지 입력"
              placeholder="예: 🪐, ☕"
              value={formIcon}
              onChange={(e) => setFormIcon(e.currentTarget.value.slice(0, 4) || '📁')}
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
