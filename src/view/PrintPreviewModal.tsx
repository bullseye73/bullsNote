// VIEW: 인쇄 및 PDF 내보내기 전 A4 용지 규격 실시간 미리보기 모달
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { IconFileTypePdf, IconPrinter, IconX } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
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
  const [includeHeader, setIncludeHeader] = useState(true);
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');

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
          <IconPrinter size={20} color="var(--mantine-color-blue-6)" />
          <Text fw={700} size="md">
            인쇄 및 PDF 미리보기
          </Text>
        </Group>
      }
      centered
      padding="md"
      styles={{
        body: { backgroundColor: '#f3f4f6', padding: '16px' },
      }}
    >
      <Stack gap="md">
        {/* 상단 컨트롤 바 */}
        <Group justify="space-between" align="center" bg="white" p="xs" style={{ borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <Group gap="lg">
            <Switch
              label="문서 메타정보(일시/태그) 포함"
              checked={includeHeader}
              onChange={(e) => setIncludeHeader(e.currentTarget.checked)}
              size="sm"
            />
            <Group gap="xs">
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
              variant="filled"
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
              style={{
                width: '100%',
                maxWidth: '740px',
                minHeight: '880px',
                backgroundColor: '#ffffff',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                borderRadius: '4px',
                padding: '48px 40px',
                color: '#1a1a1a',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: fontSize === 'large' ? '16px' : '14px',
                lineHeight: 1.6,
                boxSizing: 'border-box',
              }}
            >
              {/* 문서 헤더 */}
              <Title
                order={1}
                style={{
                  fontSize: fontSize === 'large' ? '28px' : '24px',
                  fontWeight: 800,
                  margin: 0,
                  color: '#111827',
                  borderBottom: '2px solid #374151',
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
                    color: '#6b7280',
                    margin: '12px 0 24px 0',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #e5e7eb',
                  }}
                >
                  <span>생성: {new Date(note.createdAt).toLocaleString('ko-KR')}</span>
                  <span>수정: {new Date(note.updatedAt).toLocaleString('ko-KR')}</span>
                  {note.tags.length > 0 && (
                    <span>
                      태그:{' '}
                      {note.tags.map((t) => (
                        <Badge key={t} size="xs" variant="light" color="gray" ml={4}>
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
