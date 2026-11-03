// VIEW: 인쇄 및 PDF 내보내기 전 A4 용지 규격 실시간 미리보기 모달 (다크/라이트 테마 연동 지원)
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
  useComputedColorScheme,
} from '@mantine/core';
import { IconFileTypePdf, IconPrinter, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { BlockNoteEditor } from '@blocknote/core';
import { Note } from '../model/Note';
import { noteBodyText } from '../model/HashtagService';

type AnyEditor = BlockNoteEditor<any, any, any>;

interface PrintPreviewModalProps {
  opened: boolean;
  onClose: () => void;
  note: Note;
  editor: AnyEditor | null;
  onPrint: () => void;
  onExportPdf: () => void;
}

export function PrintPreviewModal({
  opened,
  onClose,
  note,
  editor,
  onPrint,
  onExportPdf,
}: PrintPreviewModalProps) {
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = computedColorScheme === 'dark';

  const [includeHeader, setIncludeHeader] = useState(true);
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');
  const [sheetMode, setSheetMode] = useState<'theme' | 'paper'>('theme');

  useEffect(() => {
    if (opened) {
      setSheetMode('theme');
    }
  }, [opened]);

  const isSheetDark = sheetMode === 'theme' && isDark;

  // 에디터의 HTML 변환 결과
  const bodyHtml = useMemo(() => {
    if (editor) {
      try {
        return editor.blocksToHTMLLossy(editor.document);
      } catch (err) {
        console.error('HTML 변환 실패:', err);
      }
    }
    const plain = noteBodyText(note.content);
    return `<p>${plain.replace(/\n/g, '<br/>')}</p>`;
  }, [editor, note.content]);

  const handlePrintClick = () => {
    onClose();
    // 모달 딤이 사라진 후 인쇄 창 호출
    setTimeout(() => {
      onPrint();
    }, 150);
  };

  const handleExportPdfClick = () => {
    onClose();
    // 모달 딤이 사라진 후 PDF 생성 실행
    setTimeout(() => {
      onExportPdf();
    }, 150);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="920px"
      title={
        <Group gap="xs">
          <IconPrinter size={20} color="var(--mantine-color-blue-5)" />
          <Text fw={700} size="md">
            인쇄 및 PDF 미리보기
          </Text>
        </Group>
      }
      centered
      padding="md"
      styles={{
        header: {
          backgroundColor: 'var(--bn-surface-list)',
          borderBottom: '1px solid var(--bn-border-subtle)',
        },
        content: {
          backgroundColor: 'var(--bn-surface-sidebar)',
          border: '1px solid var(--bn-border-subtle)',
        },
        body: {
          backgroundColor: 'var(--bn-surface-sidebar)',
          padding: '16px',
        },
      }}
    >
      <Stack gap="md">
        {/* 상단 컨트롤 바 */}
        <Group
          justify="space-between"
          align="center"
          p="xs"
          style={{
            borderRadius: 8,
            backgroundColor: 'var(--bn-surface-list)',
            border: '1px solid var(--bn-border-subtle)',
          }}
        >
          <Group gap="md" wrap="wrap">
            <Switch
              label="문서 메타정보(일시/태그) 포함"
              checked={includeHeader}
              onChange={(e) => setIncludeHeader(e.currentTarget.checked)}
              size="xs"
            />
            <Group gap={6}>
              <Text size="xs" c="dimmed">
                글자 크기:
              </Text>
              <SegmentedControl
                size="xs"
                value={fontSize}
                onChange={(v) => setFontSize(v as 'normal' | 'large')}
                data={[
                  { label: '보통', value: 'normal' },
                  { label: '크게', value: 'large' },
                ]}
              />
            </Group>
            {isDark && (
              <Group gap={6}>
                <Text size="xs" c="dimmed">
                  미리보기 배경:
                </Text>
                <SegmentedControl
                  size="xs"
                  value={sheetMode}
                  onChange={(v) => setSheetMode(v as 'theme' | 'paper')}
                  data={[
                    { label: '다크 테마', value: 'theme' },
                    { label: '흰색 용지', value: 'paper' },
                  ]}
                />
              </Group>
            )}
          </Group>

          <Group gap="xs">
            <Button
              variant="filled"
              color="blue"
              size="xs"
              leftSection={<IconPrinter size={15} />}
              onClick={handlePrintClick}
            >
              인쇄하기
            </Button>
            <Button
              variant="light"
              color="red"
              size="xs"
              leftSection={<IconFileTypePdf size={15} />}
              onClick={handleExportPdfClick}
            >
              PDF로 저장
            </Button>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClose} aria-label="닫기">
              <IconX size={16} />
            </ActionIcon>
          </Group>
        </Group>

        {/* A4 용지 스타일 미리보기 시트 */}
        <ScrollArea.Autosize mah="70vh" type="auto" offsetScrollbars>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '16px 8px 32px 8px',
            }}
          >
            <div
              className="a4-preview-sheet"
              data-sheet-theme={isSheetDark ? 'dark' : 'light'}
              style={{
                width: '100%',
                maxWidth: '740px',
                minHeight: '880px',
                backgroundColor: isSheetDark ? '#202023' : '#ffffff',
                border: isSheetDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)',
                boxShadow: isSheetDark
                  ? '0 8px 30px rgba(0, 0, 0, 0.45)'
                  : '0 4px 20px rgba(0, 0, 0, 0.08)',
                borderRadius: '8px',
                padding: '48px 40px',
                color: isSheetDark ? '#e4e4e7' : '#1a1a1a',
                fontFamily: 'var(--bn-font-sans)',
                fontSize: fontSize === 'large' ? '16px' : '14px',
                lineHeight: 1.65,
                boxSizing: 'border-box',
                transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
              }}
            >
              {/* 문서 헤더 */}
              <Title
                order={1}
                style={{
                  fontSize: fontSize === 'large' ? '28px' : '24px',
                  fontWeight: 800,
                  margin: 0,
                  color: isSheetDark ? '#fafafa' : '#111827',
                  borderBottom: isSheetDark
                    ? '2px solid rgba(255, 255, 255, 0.16)'
                    : '2px solid #374151',
                  paddingBottom: 12,
                }}
              >
                {note.title || '제목 없음'}
              </Title>

              {includeHeader && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '16px',
                    fontSize: '12px',
                    color: isSheetDark ? '#a1a1aa' : '#6b7280',
                    margin: '12px 0 24px 0',
                    paddingBottom: '12px',
                    borderBottom: isSheetDark
                      ? '1px solid rgba(255, 255, 255, 0.08)'
                      : '1px solid #e5e7eb',
                  }}
                >
                  <span>생성: {new Date(note.createdAt).toLocaleString('ko-KR')}</span>
                  <span>수정: {new Date(note.updatedAt).toLocaleString('ko-KR')}</span>
                  {note.tags.length > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      태그:
                      {note.tags.map((t) => (
                        <Badge
                          key={t}
                          size="xs"
                          variant="light"
                          color={isSheetDark ? 'blue' : 'gray'}
                        >
                          #{t}
                        </Badge>
                      ))}
                    </span>
                  )}
                </div>
              )}

              {/* 문서 본문 (HTML 렌더링) */}
              <div
                className="print-preview-content"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
                style={{
                  marginTop: includeHeader ? 0 : 20,
                  wordBreak: 'break-word',
                }}
              />
            </div>
          </div>
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
}
