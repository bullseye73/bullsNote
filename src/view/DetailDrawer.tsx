// VIEW: 오른쪽 상세 패널 — 오늘·할일·타임라인 화면에서 화면 전환 없이 할일/노트 본문을 편집
import { Drawer } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { NoteEditorView } from './NoteEditorView';

export function DetailDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const isPhone = Boolean(useMediaQuery('(max-width: 767px)'));
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={isPhone ? '100%' : 'min(760px, 58%)'}
      padding={0}
      withCloseButton={false}
      styles={{
        body: {
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bn-surface-editor)',
          paddingTop: isPhone ? 'env(safe-area-inset-top, 0px)' : undefined,
        },
      }}
    >
      {/* 닫기는 에디터 상단의 "← 목록"(onBackToList) 버튼, 바깥 클릭, Esc로 */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <NoteEditorView onBackToList={onClose} isCompact={isPhone} />
      </div>
    </Drawer>
  );
}
