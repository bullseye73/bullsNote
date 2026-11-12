// 모바일 하단 액션 시트 (⋯ 메뉴, 목차, 상세 설정 등 공용)
// - 엄지가 닿는 하단에서 올라오며, 큰 터치 영역(48px)의 항목 목록 + 자유 콘텐츠 영역을 제공
import { Box, Drawer, Group, Text, UnstyledButton } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import React from 'react';

export interface ActionSheetItem {
  key: string;
  icon?: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  /** 위험 동작 등 강조 색 */
  color?: string;
  /** 토글 상태 표시 (체크) */
  active?: boolean;
  disabled?: boolean;
  /** 항목 실행 후 시트를 닫을지 여부 (기본 true) */
  closeOnClick?: boolean;
}

export interface ActionSheetSection {
  key: string;
  label?: string;
  items: ActionSheetItem[];
}

interface MobileActionSheetProps {
  opened: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  sections?: ActionSheetSection[];
  /** 항목 목록 위에 표시할 자유 콘텐츠 (예: 색상 팔레트, 목차) */
  children?: React.ReactNode;
}

export function MobileActionSheet({ opened, onClose, title, sections = [], children }: MobileActionSheetProps) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size="auto"
      withCloseButton={false}
      padding={0}
      zIndex={400}
      styles={{
        content: {
          height: 'auto',
          flex: 'none',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: '85dvh',
          backgroundColor: 'var(--mantine-color-body)',
        },
        body: { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' },
      }}
    >
      {/* 드래그 핸들 */}
      <Box
        onClick={onClose}
        style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px', cursor: 'pointer' }}
      >
        <Box style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'var(--bn-border-subtle)' }} />
      </Box>

      {title && (
        <Text fw={700} size="sm" px="md" pt={4} pb={8}>
          {title}
        </Text>
      )}

      {children && <Box px="md" pb="xs">{children}</Box>}

      {sections.map((section) => (
        <Box key={section.key} pb={4}>
          {section.label && (
            <Text size="11px" fw={600} c="dimmed" px="md" pt={10} pb={4} tt="uppercase">
              {section.label}
            </Text>
          )}
          {section.items.map((item) => (
            <UnstyledButton
              key={item.key}
              disabled={item.disabled}
              onClick={() => {
                item.onClick();
                if (item.closeOnClick !== false) onClose();
              }}
              style={{
                display: 'flex',
                width: '100%',
                minHeight: 48,
                alignItems: 'center',
                padding: '0 16px',
                gap: 14,
                opacity: item.disabled ? 0.45 : 1,
                color: item.color ?? 'var(--mantine-color-text)',
              }}
            >
              <Box style={{ width: 22, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                {item.icon}
              </Box>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={500} truncate>
                  {item.label}
                </Text>
                {item.description && (
                  <Text size="11px" c="dimmed" truncate>
                    {item.description}
                  </Text>
                )}
              </Box>
              {item.active && (
                <Group gap={0}>
                  <IconCheck size={17} color="var(--mantine-color-blue-6)" />
                </Group>
              )}
            </UnstyledButton>
          ))}
        </Box>
      ))}
    </Drawer>
  );
}
