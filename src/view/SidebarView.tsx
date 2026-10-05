// VIEW: 좌측 사이드바 (검색/태그/볼트/가져오기내보내기)
import { ActionIcon, Badge, Divider, Group, NavLink, ScrollArea, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconDownload, IconFolder, IconPlus, IconRefresh, IconSearch, IconStar, IconTag, IconUpload } from '@tabler/icons-react';
import { useRef } from 'react';
import { useNotes } from '../controller/NotesController';

export function SidebarView() {
  const {
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

  return (
    <Stack gap="xs" p="sm" h="100%">
      <Group justify="space-between">
        <Text fw={800} size="lg">
          BullsNote
        </Text>
        <Tooltip label="새 노트 (Ctrl+N)">
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

      <NavLink
        label="전체 노트"
        leftSection={<IconTag size={15} />}
        active={activeTag === null && !showFavoriteOnly}
        onClick={() => {
          setActiveTag(null);
          setShowFavoriteOnly(false);
        }}
      />
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
      <Text size="xs" c="dimmed">
        Win / Linux / Mac 빌드 지원 (Electron)
      </Text>
    </Stack>
  );
}
