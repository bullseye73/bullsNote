// VIEW: 좌측 사이드바 (프로젝트/폴더 중심 탐색 + Daily Notes/AI/즐겨찾기/할일 + 하단 달력·태그 팝오버)
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Menu,
  Modal,
  NavLink,
  Popover,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
  useComputedColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconCalendar,
  IconCalendarEvent,
  IconCommand,
  IconDots,
  IconFilterOff,
  IconFolder,
  IconHash,
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
import { useState, useCallback, useMemo } from 'react';
import { useNotes } from '../controller/NotesController';
import { Project } from '../model/Note';
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
  onOpenSupabaseModal?: () => void;
}

export function SidebarView({ onOpenSupabaseModal: _onOpenSupabaseModal }: SidebarViewProps) {
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

  const regularProjects = useMemo(
    () => sortedProjects.filter((p) => p.id !== TODO_PROJECT_ID),
    [sortedProjects]
  );

  return (
    <Stack gap={8} p="xs" h="100%" style={{ backgroundColor: 'var(--bn-surface-sidebar)' }}>
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

      {/* 고정 퀵 내비게이션: Daily Notes · Gemini AI · 즐겨찾기 · 할일관리 */}
      <Stack gap={2}>
        <NavLink
          label="Daily Notes (오늘)"
          leftSection={<IconCalendarEvent size={15} color="var(--mantine-color-teal-5)" />}
          active={isDailyTodayActive}
          onClick={() => {
            if (isDailyTodayActive) {
              setSelectedDate(null);
            } else {
              setShowFavoriteOnly(false);
              setSelectedDate(todayStr);
            }
          }}
          rightSection={
            isDailyTodayActive ? (
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
          active={showFavoriteOnly}
          onClick={() => {
            const next = !showFavoriteOnly;
            setShowFavoriteOnly(next);
            if (next) {
              resetAllFilters();
            }
          }}
          rightSection={
            <Badge
              size="xs"
              variant={showFavoriteOnly ? 'filled' : 'subtle'}
              color={showFavoriteOnly ? 'yellow' : 'gray'}
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
          active={selectedProjectId === TODO_PROJECT_ID && !showFavoriteOnly}
          onClick={() => {
            setShowFavoriteOnly(false);
            resetAllFilters();
            selectProject(TODO_PROJECT_ID);
          }}
          rightSection={
            <Badge
              size="xs"
              variant={selectedProjectId === TODO_PROJECT_ID && !showFavoriteOnly ? 'filled' : 'subtle'}
              color={selectedProjectId === TODO_PROJECT_ID && !showFavoriteOnly ? 'blue' : 'gray'}
            >
              {notes.filter((n) => n.projectId === TODO_PROJECT_ID && !n.systemGroupType).length}
            </Badge>
          }
          styles={{
            root: { borderRadius: 8, padding: '5px 8px' },
            label: { fontSize: 12.5, fontWeight: 500 },
          }}
        />
      </Stack>

      <Divider color="var(--bn-border-subtle)" />

      {/* 폴더 / 프로젝트 탐색 섹션 (flex: 1 최대화) */}
      <Group justify="space-between" px={4}>
        <Text size="xs" fw={600} c="dimmed" style={{ letterSpacing: '0.2px' }}>
          폴더 ({regularProjects.length})
        </Text>
        <Group gap={4}>
          <SortMenu
            sortOption={projectSortOption}
            onChange={setProjectSortOption}
            targetName="프로젝트"
            size="xs"
          />
          <Tooltip label="새 폴더(프로젝트) 만들기">
            <ActionIcon
              size="xs"
              variant="subtle"
              color="blue"
              onClick={startCreateProject}
              aria-label="새 프로젝트"
            >
              <IconPlus size={13} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto" offsetScrollbars>
        <Stack gap={2}>
          {regularProjects.map((proj) => {
            const count = notes.filter((n) => (n.projectId || 'default') === proj.id).length;
            const isSelected = proj.id === selectedProjectId && !showFavoriteOnly;
            return (
              <NavLink
                key={proj.id}
                label={proj.name}
                leftSection={<span style={{ fontSize: 15, lineHeight: 1 }}>{proj.icon || '📁'}</span>}
                active={isSelected}
                onClick={() => {
                  setShowFavoriteOnly(false);
                  resetAllFilters();
                  selectProject(proj.id);
                }}
                styles={{
                  root: { borderRadius: 8, padding: '6px 8px' },
                  label: { fontSize: 13, fontWeight: isSelected ? 600 : 400 },
                }}
                rightSection={
                  <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                    <Badge
                      size="xs"
                      variant={isSelected ? 'light' : 'subtle'}
                      color={isSelected ? 'blue' : 'gray'}
                    >
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
