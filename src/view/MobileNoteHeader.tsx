// VIEW: 모바일 노트 상세 헤더
// - 한 줄 상단바(뒤로 · 위치/제목 · 알림 · 즐겨찾기 · ⋯) + 스크롤 시 접히는 제목/메타 영역
// - 자주 쓰지 않는 동작(공유·내보내기·색상·히스토리·고정)은 ⋯ 하단 시트로 이동
import { ActionIcon, Badge, Box, Collapse, Group, Text, Textarea } from '@mantine/core';
import {
  IconBell,
  IconCloudUpload,
  IconCode,
  IconCopy,
  IconDots,
  IconDownload,
  IconEye,
  IconFileTypePdf,
  IconHistory,
  IconListTree,
  IconMarkdown,
  IconPin,
  IconShare,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Note, PASTEL_COLORS, getPastelConfig } from '../model/Note';
import { noteBodyText } from '../model/HashtagService';
import { GoogleDriveService } from '../model/GoogleDriveService';
import { ReminderPopover } from './ReminderPopover';
import { MobileTopBar } from './mobile/MobileTopBar';
import { MobileActionSheet, type ActionSheetSection } from './mobile/MobileActionSheet';
import { useHideOnScroll } from './mobile/useHideOnScroll';

export interface NoteShareActions {
  printPreview: () => void;
  copyMarkdown: () => void;
  copyHtml: () => void;
  copyPlainText: () => void;
  exportPdf: () => void;
  downloadMarkdown: () => void;
  downloadHtml: () => void;
  /** 기기 공유를 지원하지 않으면 undefined */
  nativeShare?: () => void;
}

interface MobileNoteHeaderProps {
  note: Note;
  /** 상단바에 표시할 현재 위치(상위 노트 또는 프로젝트 이름) */
  locationLabel: string;
  onBack?: () => void;
  scrollEl: HTMLDivElement | null;
  locked?: boolean;
  feedback?: string | null;
  share: NoteShareActions;
  onOpenHistory: () => void;
  onTitleChange: (title: string) => void;
  onColorChange: (colorId: string) => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  onTagClick: (tag: string) => void;
}

const formatShortDateTime = (ts: number) =>
  new Date(ts).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function MobileNoteHeader({
  note,
  locationLabel,
  onBack,
  scrollEl,
  locked = false,
  feedback,
  share,
  onOpenHistory,
  onTitleChange,
  onColorChange,
  onTogglePin,
  onToggleFavorite,
  onTagClick,
}: MobileNoteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const chromeHidden = useHideOnScroll(scrollEl);
  const colorCfg = getPastelConfig(note.color);


  const charCount = useMemo(() => noteBodyText(note.content).length, [note.content]);
  const unsynced = GoogleDriveService.isNoteUnsynced(note);
  const activeReminder = note.reminder && !note.reminder.dismissed ? note.reminder : null;

  const sections: ActionSheetSection[] = [
    {
      key: 'note',
      items: [
        {
          key: 'pin',
          icon: <IconPin size={19} />,
          label: note.pinned ? '상단 고정 해제' : '상단 고정',
          active: note.pinned,
          disabled: locked,
          onClick: onTogglePin,
        },
        {
          key: 'history',
          icon: <IconHistory size={19} />,
          label: '편집 히스토리',
          description: `${note.history.length}개 저장됨`,
          disabled: locked,
          onClick: onOpenHistory,
        },
      ],
    },
    {
      key: 'share',
      label: '공유 · 내보내기',
      items: [
        ...(share.nativeShare
          ? [{ key: 'native', icon: <IconShare size={19} />, label: '공유…', onClick: share.nativeShare }]
          : []),
        { key: 'print', icon: <IconEye size={19} />, label: '인쇄 / PDF 미리보기', onClick: share.printPreview },
        { key: 'md', icon: <IconMarkdown size={19} />, label: '마크다운 복사', onClick: share.copyMarkdown },
        { key: 'html', icon: <IconCode size={19} />, label: '서식 있는 텍스트(HTML) 복사', onClick: share.copyHtml },
        { key: 'text', icon: <IconCopy size={19} />, label: '일반 텍스트 복사', onClick: share.copyPlainText },
        { key: 'pdf', icon: <IconFileTypePdf size={19} />, label: 'PDF 파일로 저장', onClick: share.exportPdf },
        { key: 'mdfile', icon: <IconDownload size={19} />, label: '마크다운 파일(.md) 저장', onClick: share.downloadMarkdown },
        { key: 'htmlfile', icon: <IconDownload size={19} />, label: 'HTML 파일(.html) 저장', onClick: share.downloadHtml },
      ].map((item) => ({ ...item, disabled: locked })),
    },
  ];

  return (
    <Box className="no-print" style={{ flexShrink: 0 }}>
      <MobileTopBar
        onBack={onBack}
        backLabel="목록으로"
        accentColor={colorCfg.border}
        title={
          <Text size="sm" fw={600} truncate c={chromeHidden ? undefined : 'dimmed'}>
            {chromeHidden ? note.title || '제목 없음' : locationLabel}
          </Text>
        }
        actions={
          <>
            {feedback && (
              <Badge size="sm" color="teal" variant="filled">
                {feedback}
              </Badge>
            )}
            <ReminderPopover note={note} disabled={locked} appearance="bar" />
            <ActionIcon
              size={40}
              variant="subtle"
              color="yellow"
              disabled={locked}
              onClick={onToggleFavorite}
              aria-label={note.favorite ? '즐겨찾기 해제' : '즐겨찾기 등록'}
            >
              {note.favorite ? <IconStarFilled size={21} /> : <IconStar size={21} />}
            </ActionIcon>
            <ActionIcon
              size={40}
              variant="subtle"
              color="gray"
              onClick={() => setMenuOpen(true)}
              aria-label="더보기"
            >
              <IconDots size={21} />
            </ActionIcon>
          </>
        }
      />

      {/* 스크롤 내리면 접히는 제목 + 한 줄 메타 */}
      <Collapse in={!chromeHidden} transitionDuration={160}>
        <Box px={6} pt={10} pb={6}>
          <Textarea
            value={note.title}
            onChange={(e) => onTitleChange(e.currentTarget.value.replace(/\n/g, ' '))}
            onKeyDown={(e) => {
              // 제목은 한 줄 텍스트: 엔터는 입력 종료
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            variant="unstyled"
            autosize
            minRows={1}
            maxRows={3}
            disabled={locked}
            placeholder="제목 없음"
            styles={{
              input: { fontSize: 22, fontWeight: 700, lineHeight: 1.3, padding: 0, letterSpacing: '-0.3px' },
            }}
          />
          <Group gap={6} mt={6} wrap="wrap" align="center">
            <Box
              component="span"
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                backgroundColor: colorCfg.border,
                flexShrink: 0,
              }}
            />
            <Text size="12px" c="dimmed">
              {formatShortDateTime(note.updatedAt)} 수정 · {charCount.toLocaleString()}자
            </Text>
            {unsynced && (
              <Badge size="xs" variant="light" color="orange" leftSection={<IconCloudUpload size={10} />}>
                미동기화
              </Badge>
            )}
            {activeReminder && (
              <Badge size="xs" variant="light" color="blue" leftSection={<IconBell size={10} />}>
                {formatShortDateTime(activeReminder.targetAt)}
                {activeReminder.repeat !== 'none' ? ' 반복' : ''}
              </Badge>
            )}
            {note.tags.map((t) => (
              <span key={t} className="bn-subtle-tag" style={{ cursor: 'pointer' }} onClick={() => onTagClick(t)}>
                #{t}
              </span>
            ))}
          </Group>
        </Box>
      </Collapse>

      <MobileActionSheet opened={menuOpen} onClose={() => setMenuOpen(false)} sections={sections}>
        <Text size="11px" fw={600} c="dimmed" pb={8}>
          노트 색상 · {colorCfg.name}
        </Text>
        <Group gap={10} wrap="wrap" pb={6}>
          {Object.values(PASTEL_COLORS).map((c) => {
            const isCurrent = (note.color || 'blue') === c.id;
            return (
              <ActionIcon
                key={c.id}
                size={32}
                radius="xl"
                disabled={locked}
                aria-label={c.name}
                onClick={() => onColorChange(c.id)}
                style={{
                  backgroundColor: c.bg,
                  border: `2px solid ${c.border}`,
                  boxShadow: isCurrent ? `0 0 0 2px var(--mantine-color-body), 0 0 0 4px ${c.textColor}` : undefined,
                }}
              />
            );
          })}
        </Group>
      </MobileActionSheet>

    </Box>
  );
}
