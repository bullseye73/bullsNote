// VIEW: 좌측 사이드바 (프로젝트 CRUD + 검색/태그/볼트/가져오기내보내기)
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
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconDots,
  IconDownload,
  IconFolder,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconStar,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { Project } from '../model/Note';

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

export function SidebarView() {
  const {
    projects,
    selectedProjectId,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
    notes,
    search,
    setSearch,
    tagCounts,
    activeTag,
    setActiveTag,
    create,
    showFavoriteOnly,
    setShowFavoriteOnly,
    exportAll,
    importFromFile,
    vaultMode,
    vaultPath,
    vaultError,
    chooseVault,
    resync,
  } = useNotes();

  const fileRef = useRef<HTMLInputElement>(null);

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
        <Text fw={800} size="lg">
          BullsNote
        </Text>
        <Tooltip label="현재 프로젝트에 새 노트 (Ctrl+N)">
          <ActionIcon color="blue" variant="filled" onClick={() => create()} aria-label="새 노트">
            <IconPlus size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <TextInput
        placeholder="검색 (제목/본문/태그)"
        leftSection={<IconSearch size={14} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />

      {/* 프로젝트 목록 섹션 */}
      <Group justify="space-between" mt={4} px={4}>
        <Text size="xs" fw={700} c="dimmed">
          프로젝트 ({projects.length})
        </Text>
        <Tooltip label="새 프로젝트 만들기">
          <ActionIcon size="xs" variant="light" color="blue" onClick={startCreateProject} aria-label="새 프로젝트">
            <IconPlus size={13} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <ScrollArea.Autosize mah={180} type="auto">
        <Stack gap={2}>
          {projects.map((proj) => {
            const count = notes.filter((n) => (n.projectId || 'default') === proj.id).length;
            const isSelected = proj.id === selectedProjectId;
            return (
              <NavLink
                key={proj.id}
                label={proj.name}
                leftSection={<span style={{ fontSize: 16 }}>{proj.icon || '📁'}</span>}
                active={isSelected}
                onClick={() => selectProject(proj.id)}
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
      </ScrollArea.Autosize>

      <NavLink
        label="즐겨찾기"
        leftSection={<IconStar size={15} />}
        active={showFavoriteOnly}
        onClick={() => setShowFavoriteOnly(!showFavoriteOnly)}
      />

      <Divider label="해시태그" />
      <ScrollArea style={{ flex: 1 }} type="auto">
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

      <Divider />
      {vaultMode ? (
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
      ) : (
        <Text size="xs" c="dimmed">
          브라우저 모드: localStorage 저장 (Electron 앱에서 파일 저장 지원)
        </Text>
      )}
      <Group justify="space-between">
        <Tooltip label="JSON 내보내기">
          <ActionIcon variant="light" onClick={exportAll} aria-label="내보내기">
            <IconDownload size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="JSON 가져오기">
          <ActionIcon variant="light" onClick={() => fileRef.current?.click()} aria-label="가져오기">
            <IconUpload size={16} />
          </ActionIcon>
        </Tooltip>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) importFromFile(f).catch((err) => alert(`가져오기 실패: ${err}`));
            e.currentTarget.value = '';
          }}
        />
      </Group>

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
