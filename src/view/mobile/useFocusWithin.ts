// 지정한 영역들 중 하나에 포커스가 있는지 추적하는 재사용 훅
// - 툴바 버튼, 드롭다운 메뉴, 모달로 포커스가 잠깐 이동해도 "편집 중" 상태가 끊기지 않도록
//   포커스 아웃 후 짧은 지연을 두고 실제 activeElement 를 다시 확인한다.
import { useEffect, useState } from 'react';

/** 포털로 렌더되지만 편집 흐름의 일부로 간주할 요소 (메뉴·팝오버·모달) */
const TRANSIENT_FOCUS_SELECTOR =
  '[role="menu"], [role="dialog"], [role="listbox"], .mantine-Menu-dropdown, .mantine-Popover-dropdown';

export function useFocusWithin(
  scopes: Array<HTMLElement | null>,
  { enabled = true, settleMs = 120 }: { enabled?: boolean; settleMs?: number } = {}
): boolean {
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setFocused(false);
      return;
    }
    const isInside = (node: Element | null) =>
      Boolean(
        node &&
          (scopes.some((s) => s && s.contains(node)) || node.closest(TRANSIENT_FOCUS_SELECTOR))
      );

    let timer: ReturnType<typeof setTimeout> | undefined;
    let current = scopes.some((s) => s && document.activeElement && s.contains(document.activeElement));
    const set = (next: boolean) => {
      current = next;
      setFocused(next);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (scopes.some((s) => s && s.contains(e.target as Node))) {
        if (timer) clearTimeout(timer);
        set(true);
      }
    };
    const onFocusOut = () => {
      if (!current) return; // 편집 중이 아닐 때의 다른 포커스 이동은 무시
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => set(isInside(document.activeElement)), settleMs);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    set(current); // 이미 포커스가 들어가 있는 상태로 마운트된 경우 반영
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, settleMs, ...scopes]);

  return focused;
}
