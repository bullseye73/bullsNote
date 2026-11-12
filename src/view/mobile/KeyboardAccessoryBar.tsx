// 모바일 편집 중에만 화면 하단(키보드 바로 위)에 붙는 보조 도구 막대
// - 포커스 범위(scope) 안에서 편집이 시작되면 나타나고, 편집이 끝나면 사라진다
import { ActionIcon, Box, Portal } from '@mantine/core';
import { IconKeyboardHide } from '@tabler/icons-react';
import React, { useState } from 'react';
import { useFocusWithin } from './useFocusWithin';
import { useKeyboardInset } from './useKeyboardInset';

interface KeyboardAccessoryBarProps {
  /** 이 요소 안에 포커스가 있을 때만 표시 */
  scope: HTMLElement | null;
  children: React.ReactNode;
}

export const KEYBOARD_ACCESSORY_HEIGHT = 48;

export function KeyboardAccessoryBar({ scope, children }: KeyboardAccessoryBarProps) {
  const [barEl, setBarEl] = useState<HTMLDivElement | null>(null);
  const editing = useFocusWithin([scope, barEl]);
  const keyboardInset = useKeyboardInset(editing);

  const dismissKeyboard = () => {
    const active = document.activeElement as HTMLElement | null;
    active?.blur?.();
  };

  return (
    <Portal>
      <Box
        ref={setBarEl}
        className="no-print bn-keyboard-accessory"
        data-visible={editing ? 'true' : 'false'}
        // 버튼 탭 시 에디터 선택 영역(포커스)이 사라지지 않도록 기본 동작 차단
        onMouseDown={(e) => e.preventDefault()}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: keyboardInset > 0 ? keyboardInset : 0,
          paddingBottom: keyboardInset > 0 ? 0 : 'env(safe-area-inset-bottom, 0px)',
          zIndex: 300,
          display: editing ? 'flex' : 'none',
          alignItems: 'center',
          height: 'auto',
          minHeight: KEYBOARD_ACCESSORY_HEIGHT,
          backgroundColor: 'var(--bn-surface-titlebar)',
          borderTop: '1px solid var(--bn-border-subtle)',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.06)',
        }}
      >
        <Box style={{ flex: 1, minWidth: 0 }}>{children}</Box>
        <ActionIcon
          size={40}
          variant="subtle"
          color="blue"
          onClick={dismissKeyboard}
          aria-label="편집 완료 (키보드 닫기)"
          style={{ flexShrink: 0, marginRight: 4, borderLeft: '1px solid var(--bn-border-subtle)', borderRadius: 0 }}
        >
          <IconKeyboardHide size={20} />
        </ActionIcon>
      </Box>
    </Portal>
  );
}
