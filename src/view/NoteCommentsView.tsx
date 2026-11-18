// VIEW: 노트 하단 댓글(코멘트) 및 하위 댓글(스레드) 패널 컴포넌트
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Collapse,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCornerDownRight,
  IconMessageCircle,
  IconPencil,
  IconRotateClockwise,
  IconSend,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { Note, NoteComment } from '../model/Note';
import { formatRelativeTime } from '../model/dateUtils';
import { useNotes } from '../controller/NotesController';

interface NoteCommentsViewProps {
  note: Note;
  compact?: boolean;
  disabled?: boolean;
  /** 상단 헤더 '댓글' 버튼 클릭 시 증가하는 신호 (패널 펼침 + 스크롤 + 입력창 포커스) */
  focusSignal?: number;
}

interface CommentThread {
  root: NoteComment;
  replies: NoteComment[];
}

function formatFullDateTime(ts: number): string {
  return new Date(ts).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NoteCommentsView({
  note,
  compact = false,
  disabled = false,
  focusSignal = 0,
}: NoteCommentsViewProps) {
  const { addComment, updateComment, deleteComment, toggleCommentResolved, googleConfig } = useNotes();
  const comments = useMemo(() => note.comments || [], [note.comments]);
  const unresolvedCount = useMemo(() => comments.filter((c) => !c.resolved).length, [comments]);
  const resolvedCount = comments.length - unresolvedCount;

  const [opened, setOpened] = useState(comments.length > 0);
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<'all' | 'open'>('all');
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevNoteIdRef = useRef(note.id);
  const lastFocusSignalRef = useRef(focusSignal);

  // 노트 전환 시 댓글 유무에 따라 펼침 상태 및 편집/답글 상태 초기화
  useEffect(() => {
    if (prevNoteIdRef.current !== note.id) {
      prevNoteIdRef.current = note.id;
      setOpened((note.comments || []).length > 0);
      setEditingId(null);
      setEditingText('');
      setReplyingToId(null);
      setReplyDraft('');
      setDraft('');
      setFilter('all');
    }
  }, [note.id, note.comments]);

  // 헤더 '댓글' 버튼 클릭 시 펼치고 스크롤 + 포커스
  useEffect(() => {
    if (focusSignal === lastFocusSignalRef.current) return;
    lastFocusSignalRef.current = focusSignal;
    setOpened(true);
    requestAnimationFrame(() => {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(() => {
        inputRef.current?.focus();
      }, 120);
    });
  }, [focusSignal]);

  const threads = useMemo<CommentThread[]>(() => {
    const sorted = [...comments].sort((a, b) => a.createdAt - b.createdAt);
    const ids = new Set(sorted.map((c) => c.id));
    const roots: NoteComment[] = [];
    const repliesMap = new Map<string, NoteComment[]>();

    for (const c of sorted) {
      if (c.parentId && ids.has(c.parentId)) {
        const list = repliesMap.get(c.parentId) || [];
        list.push(c);
        repliesMap.set(c.parentId, list);
      } else {
        roots.push(c);
      }
    }

    const built = roots.map((root) => ({
      root,
      replies: repliesMap.get(root.id) || [],
    }));

    if (filter === 'open') {
      return built
        .filter((t) => !t.root.resolved || t.replies.some((r) => !r.resolved))
        .map((t) => ({
          root: t.root,
          replies: t.replies.filter((r) => !r.resolved),
        }));
    }
    return built;
  }, [comments, filter]);

  const handleSubmit = () => {
    if (disabled) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    addComment(note.id, trimmed, googleConfig?.user?.name, null);
    setDraft('');
    setOpened(true);
  };

  const handleReplySubmit = (rootId: string) => {
    if (disabled) return;
    const trimmed = replyDraft.trim();
    if (!trimmed) return;
    addComment(note.id, trimmed, googleConfig?.user?.name, rootId);
    setReplyDraft('');
    setReplyingToId(null);
  };

  const startEdit = (comment: NoteComment) => {
    if (disabled) return;
    setEditingId(comment.id);
    setEditingText(comment.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  const saveEdit = (commentId: string) => {
    if (disabled) return;
    const trimmed = editingText.trim();
    if (!trimmed) return;
    updateComment(note.id, commentId, trimmed);
    setEditingId(null);
    setEditingText('');
  };

  const renderCommentCard = (comment: NoteComment, threadRootId: string, isReply: boolean) => {
    const isEditing = editingId === comment.id;
    const isEdited = comment.updatedAt > comment.createdAt;
    const authorLabel = comment.author || '나';
    const initial = authorLabel.slice(0, 1).toUpperCase();

    return (
      <Paper
        key={comment.id}
        p={isReply ? '6px 10px' : 'xs'}
        radius="sm"
        withBorder
        style={{
          backgroundColor: isReply ? 'var(--bn-surface-list)' : 'var(--bn-surface-editor)',
          borderColor: 'var(--bn-border-subtle)',
          opacity: comment.resolved ? 0.68 : 1,
        }}
      >
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          <Group gap={8} align="center" wrap="nowrap" style={{ minWidth: 0 }}>
            <Avatar size={isReply ? 18 : 22} radius="xl" color={comment.resolved ? 'gray' : 'teal'}>
              {initial}
            </Avatar>
            <Text size="xs" fw={600} truncate>
              {authorLabel}
            </Text>
            <Tooltip label={formatFullDateTime(comment.createdAt)}>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {formatRelativeTime(comment.createdAt, now)}
              </Text>
            </Tooltip>
            {isEdited && (
              <Tooltip label={`수정됨: ${formatFullDateTime(comment.updatedAt)}`}>
                <Text size="11px" c="dimmed" style={{ flexShrink: 0 }}>
                  (수정됨)
                </Text>
              </Tooltip>
            )}
            {comment.resolved && (
              <Badge size="xs" variant="light" color="teal">
                해결됨
              </Badge>
            )}
          </Group>

          {!disabled && !isEditing && (
            <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
              <Tooltip label="답글 달기">
                <ActionIcon
                  size="xs"
                  variant={replyingToId === threadRootId && !isReply ? 'light' : 'subtle'}
                  color={replyingToId === threadRootId && !isReply ? 'teal' : 'gray'}
                  aria-label="답글 달기"
                  onClick={() => {
                    setReplyingToId((cur) => (cur === threadRootId ? null : threadRootId));
                    setReplyDraft('');
                  }}
                >
                  <IconCornerDownRight size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={comment.resolved ? '다시 열기' : '해결됨으로 표시'}>
                <ActionIcon
                  size="xs"
                  variant={comment.resolved ? 'light' : 'subtle'}
                  color={comment.resolved ? 'teal' : 'gray'}
                  aria-label={comment.resolved ? '다시 열기' : '해결됨으로 표시'}
                  onClick={() => toggleCommentResolved(note.id, comment.id)}
                >
                  {comment.resolved ? <IconRotateClockwise size={13} /> : <IconCheck size={13} />}
                </ActionIcon>
              </Tooltip>
              <Tooltip label="댓글 수정">
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  aria-label="댓글 수정"
                  onClick={() => startEdit(comment)}
                >
                  <IconPencil size={13} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={isReply ? '답글 삭제' : '댓글 삭제 (하위 답글 포함)'}>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  aria-label={isReply ? '답글 삭제' : '댓글 삭제'}
                  onClick={() => deleteComment(note.id, comment.id)}
                >
                  <IconTrash size={13} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
        </Group>

        {isEditing ? (
          <Stack gap={6} mt={6}>
            <Textarea
              value={editingText}
              onChange={(e) => setEditingText(e.currentTarget.value)}
              autosize
              minRows={1}
              maxRows={6}
              size="xs"
              autoFocus
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  saveEdit(comment.id);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
            />
            <Group justify="flex-end" gap={6}>
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<IconX size={12} />}
                onClick={cancelEdit}
              >
                취소
              </Button>
              <Button
                size="compact-xs"
                color="teal"
                disabled={!editingText.trim()}
                leftSection={<IconCheck size={12} />}
                onClick={() => saveEdit(comment.id)}
              >
                저장
              </Button>
            </Group>
          </Stack>
        ) : (
          <Text
            size="sm"
            mt={6}
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              textDecoration: comment.resolved ? 'line-through' : undefined,
            }}
          >
            {comment.content}
          </Text>
        )}
      </Paper>
    );
  };

  return (
    <Paper
      ref={containerRef}
      withBorder
      p={compact ? 'xs' : 'sm'}
      radius="md"
      className="comments-container"
      style={{
        backgroundColor: 'var(--bn-surface-list)',
        borderColor: 'var(--bn-border-subtle)',
      }}
    >
      <Group
        justify="space-between"
        wrap="nowrap"
        style={{ cursor: 'pointer' }}
        onClick={() => setOpened((o) => !o)}
      >
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <Badge
            size="sm"
            variant="light"
            color="teal"
            leftSection={<IconMessageCircle size={13} />}
          >
            댓글
          </Badge>
          <Badge size="xs" variant="light" color={comments.length > 0 ? 'teal' : 'gray'} circle>
            {comments.length}
          </Badge>
          <Text size="xs" c="dimmed" truncate>
            {comments.length === 0
              ? '메모나 후속 의견을 댓글로 남겨보세요'
              : resolvedCount > 0
                ? `미해결 ${unresolvedCount} · 해결됨 ${resolvedCount}`
                : `${comments.length}개의 댓글`}
          </Text>
        </Group>

        <Group gap={6} wrap="nowrap">
          {opened && resolvedCount > 0 && (
            <div onClick={(e) => e.stopPropagation()}>
              <SegmentedControl
                size="xs"
                value={filter}
                onChange={(v) => setFilter(v as 'all' | 'open')}
                data={[
                  { label: `전체 ${comments.length}`, value: 'all' },
                  { label: `미해결 ${unresolvedCount}`, value: 'open' },
                ]}
              />
            </div>
          )}
          <Tooltip label={opened ? '댓글 접기' : '댓글 펼치기'}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={opened ? '댓글 접기' : '댓글 펼치기'}
              onClick={(e) => {
                e.stopPropagation();
                setOpened((o) => !o);
              }}
            >
              {opened ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Collapse in={opened}>
        <Stack gap="xs" mt="sm">
          {threads.length > 0 ? (
            <Stack gap={8}>
              {threads.map(({ root, replies }) => (
                <Stack key={root.id} gap={6}>
                  {renderCommentCard(root, root.id, false)}

                  {(replies.length > 0 || replyingToId === root.id) && (
                    <Stack
                      gap={6}
                      ml={compact ? 'sm' : 'lg'}
                      pl="sm"
                      style={{
                        borderLeft: '2px solid var(--bn-border-subtle)',
                      }}
                    >
                      {replies.map((reply) => renderCommentCard(reply, root.id, true))}

                      {!disabled && replyingToId === root.id && (
                        <Group align="flex-end" gap="xs" wrap="nowrap">
                          <Textarea
                            value={replyDraft}
                            onChange={(e) => setReplyDraft(e.currentTarget.value)}
                            placeholder="답글을 입력하세요... (⌘+Enter 등록, Esc 취소)"
                            autosize
                            minRows={1}
                            maxRows={4}
                            size="xs"
                            autoFocus
                            style={{ flex: 1 }}
                            onKeyDown={(e) => {
                              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                e.preventDefault();
                                handleReplySubmit(root.id);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setReplyingToId(null);
                                setReplyDraft('');
                              }
                            }}
                          />
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            onClick={() => {
                              setReplyingToId(null);
                              setReplyDraft('');
                            }}
                          >
                            취소
                          </Button>
                          <Button
                            size="compact-xs"
                            color="teal"
                            variant="light"
                            disabled={!replyDraft.trim()}
                            leftSection={<IconSend size={12} />}
                            onClick={() => handleReplySubmit(root.id)}
                          >
                            답글
                          </Button>
                        </Group>
                      )}
                    </Stack>
                  )}
                </Stack>
              ))}
            </Stack>
          ) : (
            comments.length > 0 && (
              <Text size="xs" c="dimmed" ta="center" py={4}>
                미해결 댓글이 없습니다.
              </Text>
            )
          )}

          {!disabled && (
            <Group align="flex-end" gap="xs" wrap="nowrap" mt={2}>
              <Textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.currentTarget.value)}
                placeholder="댓글을 입력하세요... (⌘+Enter 또는 Ctrl+Enter로 등록)"
                autosize
                minRows={1}
                maxRows={5}
                size="xs"
                style={{ flex: 1 }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <Button
                size="xs"
                color="teal"
                variant="light"
                disabled={!draft.trim()}
                leftSection={<IconSend size={13} />}
                onClick={handleSubmit}
              >
                등록
              </Button>
            </Group>
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}
