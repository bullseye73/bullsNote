// VIEW: Google Drive Storage 연동 노트 첨부파일 관리 컴포넌트
import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Collapse,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Tooltip,
  useComputedColorScheme,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconChevronDown,
  IconChevronUp,
  IconCloudUpload,
  IconDownload,
  IconFile,
  IconFileTypeDoc,
  IconFileTypePdf,
  IconFileTypeXls,
  IconFileTypeZip,
  IconPaperclip,
  IconPhoto,
  IconPlus,
  IconSettings,
  IconTrash,
} from '@tabler/icons-react';
import { Note, NoteAttachment } from '../model/Note';
import { useNotes } from '../controller/NotesController';
import { GoogleDriveService } from '../model/GoogleDriveService';

interface NoteAttachmentsViewProps {
  note: Note;
  onAttachmentDeleted?: (att: NoteAttachment) => void;
}

/** 파일 크기 포맷 (Byte -> KB / MB) */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 확장자별 적절한 아이콘 및 색상 반환 */
function getFileIcon(fileName: string, mimeType?: string) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();

  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return <IconFileTypePdf size={20} color="var(--mantine-color-red-6)" />;
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return <IconFileTypeXls size={20} color="var(--mantine-color-teal-6)" />;
  }
  if (['doc', 'docx', 'txt', 'hwp'].includes(ext)) {
    return <IconFileTypeDoc size={20} color="var(--mantine-color-blue-6)" />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return <IconFileTypeZip size={20} color="var(--mantine-color-orange-6)" />;
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
    return <IconPhoto size={20} color="var(--mantine-color-grape-6)" />;
  }
  return <IconFile size={20} color="var(--mantine-color-gray-6)" />;
}

export function NoteAttachmentsView({ note, onAttachmentDeleted }: NoteAttachmentsViewProps) {
  const {
    googleConnected,
    openGoogleSyncModal,
    addAttachment,
    removeAttachment,
  } = useNotes();
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = computedColorScheme === 'dark';

  const attachments = note.attachments || [];
  const totalBytes = attachments.reduce((sum, a) => sum + (a.size || 0), 0);

  const [opened, setOpened] = useState(attachments.length > 0);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 노트가 변경될 때 파일 유무에 따라 자동 접기/펼치기
  useEffect(() => {
    setOpened((note.attachments || []).length > 0);
  }, [note.id]);

  // 파일 업로드 처리
  const handleFileUpload = async (files: FileList | File[]) => {
    if (!googleConnected) {
      openGoogleSyncModal();
      return;
    }

    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);
    try {
      for (const file of fileArray) {
        if (file.size > 50 * 1024 * 1024) {
          alert(`"${file.name}" 파일이 50MB 용량 제한을 초과했습니다.`);
          continue;
        }
        const att = await GoogleDriveService.uploadAttachment(note.id, file);
        addAttachment(note.id, att);
      }
    } catch (err) {
      console.error('파일 업로드 오류:', err);
      alert(`파일 업로드 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 파일 다운로드 처리 (브라우저 다운로드 강제 실행)
  const handleDownload = async (att: NoteAttachment) => {
    setDownloadingId(att.id);
    try {
      let blob: Blob;
      if (googleConnected && att.storagePath) {
        blob = await GoogleDriveService.downloadAttachment(att.storagePath);
      } else {
        // storagePath가 없거나 오프라인일 때 URL fetch 폴백
        const res = await fetch(att.url);
        blob = await res.blob();
      }

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = att.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('파일 다운로드 실패:', err);
      // 최종 폴백: 직접 새 창 열기
      window.open(att.url, '_blank');
    } finally {
      setDownloadingId(null);
    }
  };

  // 파일 삭제 처리
  const handleDelete = async (att: NoteAttachment) => {
    if (window.confirm(`"${att.name}" 첨부파일을 삭제하시겠습니까?`)) {
      await removeAttachment(note.id, att.id);
      onAttachmentDeleted?.(att);
    }
  };

  return (
    <Paper
      withBorder
      p="xs"
      radius="md"
      className="note-attachments-container"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files) {
          void handleFileUpload(e.dataTransfer.files);
        }
      }}
      style={{
        backgroundColor: 'var(--bn-surface-list)',
        borderColor: isDragOver
          ? 'var(--mantine-color-teal-5)'
          : 'var(--bn-border-subtle)',
        transition: 'all 0.2s ease',
      }}
    >
      <input
        type="file"
        multiple
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) void handleFileUpload(e.target.files);
        }}
      />

      {/* 헤더 바 */}
      <Group justify="space-between" wrap="nowrap">
        <Group
          gap="xs"
          wrap="nowrap"
          style={{ cursor: 'pointer', flex: 1 }}
          onClick={() => setOpened((o) => !o)}
        >
          <Badge
            size="sm"
            variant="light"
            color="teal"
            leftSection={<IconPaperclip size={13} />}
          >
            첨부파일
          </Badge>
          <Badge size="xs" variant="light" color="teal" circle>
            {attachments.length}
          </Badge>
          {attachments.length > 0 && (
            <Text size="xs" c="dimmed">
              총 {formatFileSize(totalBytes)}
            </Text>
          )}
        </Group>

        <Group gap="xs" wrap="nowrap">
          {uploading && (
            <Group gap={6} wrap="nowrap">
              <Loader size="xs" color="teal" />
              <Text size="xs" c="teal" fw={500}>
                업로드 중...
              </Text>
            </Group>
          )}

          {googleConnected ? (
            <Button
              size="compact-xs"
              variant="light"
              color="teal"
              leftSection={<IconPlus size={13} />}
              loading={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              파일 첨부
            </Button>
          ) : (
            <Tooltip label="클라우드 파일 업로드를 위해 Google Drive 연동이 필요합니다">
              <Button
                size="compact-xs"
                variant="subtle"
                color="orange"
                leftSection={<IconAlertCircle size={13} />}
                onClick={openGoogleSyncModal}
              >
                Google Drive 연동 필요
              </Button>
            </Tooltip>
          )}

          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => setOpened((o) => !o)}
          >
            {opened ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </ActionIcon>
        </Group>
      </Group>

      {/* 내용 영역 */}
      <Collapse in={opened} mt="xs">
        {/* Google Drive 미연동 시 안내 배너 */}
        {!googleConnected && (
          <Paper
            p="xs"
            mb="xs"
            radius="sm"
            style={{
              backgroundColor: isDark ? 'rgba(253, 126, 20, 0.12)' : 'var(--mantine-color-orange-0)',
              border: `1px solid ${isDark ? 'rgba(253, 126, 20, 0.3)' : 'var(--mantine-color-orange-2)'}`,
            }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs" wrap="nowrap">
                <IconAlertCircle size={18} color="var(--mantine-color-orange-5)" />
                <Text size="xs" c={isDark ? 'orange.2' : 'orange.9'}>
                  파일 첨부 및 클라우드 동기화는 <strong>Google Drive 연동</strong> 상태에서 제공됩니다.
                </Text>
              </Group>
              <Button
                size="compact-xs"
                variant="light"
                color="orange"
                leftSection={<IconSettings size={12} />}
                onClick={openGoogleSyncModal}
              >
                연동 설정
              </Button>
            </Group>
          </Paper>
        )}

        {attachments.length === 0 ? (
          <div
            style={{
              padding: '16px 12px',
              textAlign: 'center',
              border: `1px dashed ${
                isDragOver
                  ? 'var(--mantine-color-teal-5)'
                  : isDark
                  ? 'rgba(255, 255, 255, 0.12)'
                  : 'rgba(0, 0, 0, 0.12)'
              }`,
              borderRadius: 6,
              backgroundColor: isDragOver
                ? isDark
                  ? 'rgba(18, 184, 134, 0.1)'
                  : 'var(--mantine-color-teal-0)'
                : 'transparent',
            }}
          >
            <IconCloudUpload size={22} color="var(--mantine-color-dimmed)" style={{ marginBottom: 4 }} />
            <Text size="xs" c="dimmed">
              {googleConnected
                ? '첨부된 파일이 없습니다. 파일을 여기에 드래그하거나 [파일 첨부] 버튼을 누르세요 (최대 50MB).'
                : 'Google 계정을 연동하면 자유롭게 파일을 첨부하고 다른 기기에서 다운로드할 수 있습니다.'}
            </Text>
          </div>
        ) : (
          <Stack gap={6}>
            {attachments.map((att) => (
              <Paper
                key={att.id}
                p="xs"
                radius="md"
                className="attachment-file-card"
                style={{
                  border: '1px solid var(--bn-border-subtle)',
                  backgroundColor: 'var(--bn-card-bg)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    {getFileIcon(att.name, att.type)}
                    <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
                      <Text size="sm" fw={500} truncate title={att.name}>
                        {att.name}
                      </Text>
                      <Group gap="xs">
                        <Text size="xs" c="dimmed">
                          {formatFileSize(att.size)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          · {new Date(att.createdAt).toLocaleDateString('ko-KR')}
                        </Text>
                      </Group>
                    </Stack>
                  </Group>

                  <Group gap={6} wrap="nowrap">
                    <Tooltip label="파일 다운로드">
                      <ActionIcon
                        size="md"
                        variant="light"
                        color="blue"
                        loading={downloadingId === att.id}
                        onClick={() => void handleDownload(att)}
                        aria-label="다운로드"
                      >
                        <IconDownload size={16} />
                      </ActionIcon>
                    </Tooltip>

                    <Tooltip label="첨부파일 삭제">
                      <ActionIcon
                        size="md"
                        variant="subtle"
                        color="red"
                        onClick={() => void handleDelete(att)}
                        aria-label="삭제"
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        )}
      </Collapse>
    </Paper>
  );
}
