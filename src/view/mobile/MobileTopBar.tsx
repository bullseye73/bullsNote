// 모바일 상세 화면 공용 한 줄 상단바: [← 뒤로] [제목/위치] [우측 액션들]
import { ActionIcon, Box, Group, Text } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import React from 'react';

interface MobileTopBarProps {
  onBack?: () => void;
  backLabel?: string;
  /** 가운데 표시할 텍스트 (폴더명 또는 스크롤 시 노트 제목) */
  title?: React.ReactNode;
  /** 하단 경계선에 표시할 노트 색상 */
  accentColor?: string;
  actions?: React.ReactNode;
}

export const MOBILE_TOP_BAR_HEIGHT = 48;

export function MobileTopBar({ onBack, backLabel = '뒤로', title, accentColor, actions }: MobileTopBarProps) {
  return (
    <Group
      className="no-print"
      justify="space-between"
      align="center"
      wrap="nowrap"
      gap={4}
      h={MOBILE_TOP_BAR_HEIGHT}
      style={{
        flexShrink: 0,
        borderBottom: '1px solid var(--bn-border-subtle)',
        backgroundColor: 'var(--mantine-color-body)',
        // 노트 색상을 하단 경계선 위에 가늘게 표시
        boxShadow: accentColor ? `inset 0 -2px 0 ${accentColor}` : undefined,
      }}
    >
      <Group gap={2} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
        {onBack && (
          <ActionIcon
            size={40}
            variant="subtle"
            color="blue"
            onClick={onBack}
            aria-label={backLabel}
            style={{ flexShrink: 0 }}
          >
            <IconChevronLeft size={24} />
          </ActionIcon>
        )}
        <Box style={{ minWidth: 0, flex: 1 }}>
          {typeof title === 'string' ? (
            <Text size="sm" fw={600} truncate>
              {title}
            </Text>
          ) : (
            title
          )}
        </Box>
      </Group>
      {actions && (
        <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
          {actions}
        </Group>
      )}
    </Group>
  );
}
