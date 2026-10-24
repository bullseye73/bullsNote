// VIEW: Cmd+K / Ctrl+K 전역 퀵 서치 커맨드 팔레트 (Spotlight 스타일)
import {
  ActionIcon,
  Badge,
  Card,
  Chip,
  Divider,
  Group,
  Kbd,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconBellRinging,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconFolder,
  IconPaperclip,
  IconPin,
  IconSearch,
  IconStar,
  IconX,
} from '@tabler/icons-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNotes } from '../controller/NotesController';
import { getPastelConfig, getPathTitles } from '../model/Note';
import { SHORTCUTS } from '../model/shortcutUtils';
import { parseSearchQuery, searchNotes } from '../model/SearchService';
import { HighlightText } from './HighlightText';

interface QuickSearchModalProps {
  opened: boolean;
  onClose: () => void;
}

export function QuickSearchModal({ opened, onClose }: QuickSearchModalProps) {
  const {
    notes,
    projects,
    selectedProjectId,
    select,
    searchScope,
    setSearchScope,
  } = useNotes();

  const [query, setQuery] = useState('');
  const [localScope, setLocalScope] = useState<'all' | 'current'>(searchScope);
  const [filterFav, setFilterFav] = useState(false);
  const [filterPin, setFilterPin] = useState(false);
  const [filterReminder, setFilterReminder] = useState(false);
  const [filterAttachment, setFilterAttachment] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // 모달 열릴 때마다 초기화 및 포커스
  useEffect(() => {
    if (opened) {
      setQuery('');
      setLocalScope(searchScope);
      setFilterFav(false);
      setFilterPin(false);
      setFilterReminder(false);
      setFilterAttachment(false);
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [opened, searchScope]);

  // 검색 쿼리에 필터 칩 상태 합성
  const effectiveQuery = useMemo(() => {
    let q = query;
    if (filterFav && !q.includes('is:fav')) q += ' is:fav';
    if (filterPin && !q.includes('is:pin')) q += ' is:pin';
    if (filterReminder && !q.includes('has:reminder') && !q.includes('has:alarm')) q += ' has:reminder';
    if (filterAttachment && !q.includes('has:file') && !q.includes('has:attachment')) q += ' has:file';
    return q.trim();
  }, [query, filterFav, filterPin, filterReminder, filterAttachment]);

  const parsed = useMemo(() => parseSearchQuery(effectiveQuery), [effectiveQuery]);

  // 검색 결과 계산
  const results = useMemo(() => {
    return searchNotes(notes, effectiveQuery, projects, {
      scope: localScope,
      selectedProjectId,
    });
  }, [notes, effectiveQuery, projects, localScope, selectedProjectId]);

  // 검색 결과 개수 변경 시 선택 인덱스 보정
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (results.length === 0) return 0;
      return Math.min(prev, results.length - 1);
    });
  }, [results.length]);

  // 선택된 아이템으로 자동 스크롤
  useEffect(() => {
    const el = itemRefs.current.get(selectedIndex);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  const handleSelectNote = (id: string) => {
    select(id);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        results.length > 0 ? (prev - 1 + results.length) % results.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelectNote(results[selectedIndex].note.id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      centered
      withCloseButton={false}
      padding={0}
      styles={{
        content: {
          overflow: 'hidden',
          borderRadius: 12,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.22)',
        },
        body: {
          padding: 0,
        },
      }}
    >
      <Stack gap={0}>
        {/* 상단 검색 입력란 */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <TextInput
            ref={inputRef}
            size="md"
            variant="unstyled"
            placeholder="노트 검색... (초성 'ㅎㅇ', tag:태그, project:프로젝트, is:fav)"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            leftSection={<IconSearch size={20} color="var(--mantine-color-blue-6)" />}
            rightSection={
              query ? (
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setQuery('')}>
                  <IconX size={14} />
                </ActionIcon>
              ) : (
                <Kbd size="xs">Esc</Kbd>
              )
            }
            styles={{
              input: {
                fontSize: 16,
                fontWeight: 500,
              },
            }}
          />

          {/* 퀵 필터 칩 툴바 */}
          <Group gap={6} mt={8} wrap="wrap">
            {/* 프로젝트 범위 토글 칩 */}
            <Chip
              size="xs"
              checked={localScope === 'all'}
              onChange={() => {
                const next = localScope === 'all' ? 'current' : 'all';
                setLocalScope(next);
                setSearchScope(next);
              }}
              variant="outline"
              color="blue"
            >
              {localScope === 'all' ? '🌐 전체 프로젝트' : `📁 ${currentProject?.name || '현재 프로젝트'}`}
            </Chip>

            <Chip
              size="xs"
              checked={filterFav}
              onChange={() => setFilterFav((v) => !v)}
              variant="outline"
              color="yellow"
            >
              ⭐ 즐겨찾기
            </Chip>

            <Chip
              size="xs"
              checked={filterPin}
              onChange={() => setFilterPin((v) => !v)}
              variant="outline"
              color="blue"
            >
              📌 고정됨
            </Chip>

            <Chip
              size="xs"
              checked={filterReminder}
              onChange={() => setFilterReminder((v) => !v)}
              variant="outline"
              color="red"
            >
              ⏰ 알림 있음
            </Chip>

            <Chip
              size="xs"
              checked={filterAttachment}
              onChange={() => setFilterAttachment((v) => !v)}
              variant="outline"
              color="teal"
            >
              📎 파일 첨부
            </Chip>
          </Group>
        </div>

        {/* 결과 카운트 안내 헤더 */}
        <Group justify="space-between" px="md" py={6} bg="var(--mantine-color-gray-0)" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <Text size="xs" c="dimmed" fw={600}>
            {effectiveQuery ? `검색 결과: ${results.length}건` : `최근 수정된 노트 (${results.length}건)`}
          </Text>
          {effectiveQuery && parsed.tokens.length > 0 && (
            <Group gap={4}>
              <Text size="11px" c="dimmed">
                매칭 키워드:
              </Text>
              {parsed.tokens.map((t, idx) => (
                <Badge key={idx} size="xs" variant="light" color="blue">
                  {t}
                </Badge>
              ))}
            </Group>
          )}
        </Group>

        {/* 검색 결과 리스트 */}
        <ScrollArea.Autosize mah={420} type="auto">
          {results.length === 0 ? (
            <Stack align="center" justify="center" py={40} gap="xs">
              <IconAlertCircle size={32} color="var(--mantine-color-dimmed)" />
              <Text size="sm" c="dimmed" fw={600}>
                일치하는 노트를 찾을 수 없습니다.
              </Text>
              <Text size="xs" c="dimmed" ta="center" style={{ maxWidth: 360 }}>
                💡 팁: 초성 검색(예: &apos;ㅎㅇ&apos;), 연산자(<code>tag:기획</code>, <code>is:fav</code>, <code>project:업무</code>)를 활용해보세요.
              </Text>
            </Stack>
          ) : (
            <Stack gap={2} p="xs">
              {results.map((item, index) => {
                const note = item.note;
                const isSelected = index === selectedIndex;
                const cfg = getPastelConfig(note.color);
                const proj = projects.find((p) => p.id === (note.projectId || 'default'));
                const path = getPathTitles(notes, note.id);

                return (
                  <Card
                    key={note.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(index, el);
                      else itemRefs.current.delete(index);
                    }}
                    p="xs"
                    radius="sm"
                    withBorder
                    onClick={() => handleSelectNote(note.id)}
                    style={{
                      cursor: 'pointer',
                      borderLeft: isSelected ? `5px solid ${cfg.border}` : `3px solid ${cfg.border}`,
                      backgroundColor: isSelected
                        ? cfg.bg || 'var(--mantine-color-blue-light)'
                        : undefined,
                      borderColor: isSelected ? cfg.border : 'var(--mantine-color-default-border)',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Group gap={6} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                        {/* 프로젝트 배지 */}
                        <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                          {proj?.icon || '📁'} {proj?.name || '기본 프로젝트'}
                        </Badge>

                        {/* 상위 트리 경로 */}
                        {path.length > 1 && (
                          <Text size="xs" c="dimmed" truncate style={{ flexShrink: 1, maxWidth: 120 }}>
                            {path.slice(0, -1).join(' / ')} /
                          </Text>
                        )}

                        {/* 노트 제목 (하이라이트 포함) */}
                        <Text size="sm" fw={700} truncate style={{ flex: 1, color: isSelected ? cfg.textColor : undefined }}>
                          <HighlightText text={note.title || '제목 없음'} tokens={parsed.tokens} />
                        </Text>
                      </Group>

                      {/* 상태 아이콘들 */}
                      <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                        {note.pinned && <IconPin size={13} color="#228be6" />}
                        {note.favorite && <IconStar size={13} color="#fab005" fill="#fab005" />}
                        {note.reminder && !note.reminder.dismissed && (
                          <IconBellRinging size={13} color="#fa5252" />
                        )}
                        {note.attachments && note.attachments.length > 0 && (
                          <IconPaperclip size={13} color="#40c057" />
                        )}
                        <Text size="11px" c="dimmed" ml={4}>
                          {new Date(note.updatedAt).toLocaleDateString()}
                        </Text>
                        {isSelected && <IconChevronRight size={14} color="var(--mantine-color-blue-6)" />}
                      </Group>
                    </Group>

                    {/* 본문 문맥 스니펫 (하이라이트 포함) */}
                    <Text size="xs" c="dimmed" mt={4} lineClamp={2} style={{ wordBreak: 'break-all' }}>
                      <HighlightText text={item.snippet} tokens={parsed.tokens} />
                    </Text>

                    {/* 태그 목록 배지 */}
                    {note.tags.length > 0 && (
                      <Group gap={4} mt={6}>
                        {note.tags.slice(0, 4).map((tag, tIdx) => (
                          <Badge key={tIdx} size="xs" variant="outline" color="gray">
                            #<HighlightText text={tag} tokens={parsed.tokens} />
                          </Badge>
                        ))}
                        {note.tags.length > 4 && (
                          <Text size="10px" c="dimmed">
                            +{note.tags.length - 4}개
                          </Text>
                        )}
                      </Group>
                    )}
                  </Card>
                );
              })}
            </Stack>
          )}
        </ScrollArea.Autosize>

        {/* 하단 단축키 가이드 풋터 */}
        <Group justify="space-between" px="md" py={8} bg="var(--mantine-color-gray-1)" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <Group gap={12}>
            <Group gap={4}>
              <Kbd size="xs">↑</Kbd>
              <Kbd size="xs">↓</Kbd>
              <Text size="xs" c="dimmed">
                이동
              </Text>
            </Group>
            <Group gap={4}>
              <Kbd size="xs">Enter</Kbd>
              <Text size="xs" c="dimmed">
                열기
              </Text>
            </Group>
            <Group gap={4}>
              <Kbd size="xs">Esc</Kbd>
              <Text size="xs" c="dimmed">
                닫기
              </Text>
            </Group>
          </Group>

          <Text size="xs" c="dimmed">
            전역 단축키: <Kbd size="xs">{SHORTCUTS.quickSearch}</Kbd>
          </Text>
        </Group>
      </Stack>
    </Modal>
  );
}
