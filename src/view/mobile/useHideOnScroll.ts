// 스크롤 방향에 따라 상단 크롬(헤더) 숨김 여부를 계산하는 재사용 훅
// - 아래로 스크롤하면 숨김, 위로 스크롤하거나 최상단 근처면 표시
import { useEffect, useState } from 'react';

interface HideOnScrollOptions {
  /** 방향 전환으로 인정할 최소 스크롤 변화량(px) */
  threshold?: number;
  /** 이 위치(px)보다 위에서는 항상 표시 */
  revealTop?: number;
  /** false면 항상 표시(비활성) */
  enabled?: boolean;
}

export function useHideOnScroll(
  el: HTMLElement | null,
  { threshold = 8, revealTop = 24, enabled = true }: HideOnScrollOptions = {}
): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!el || !enabled) {
      setHidden(false);
      return;
    }
    let lastTop = el.scrollTop;
    let ticking = false;
    let current = false;
    // 헤더가 접히고 펼쳐지면 컨테이너 높이가 바뀌어 scrollTop 이 튈 수 있으므로
    // 상태 전환 직후 잠시 판정을 멈춰 숨김↔표시 반복(떨림)을 막는다
    let lockedUntil = 0;

    const apply = (next: boolean) => {
      if (next !== current) {
        current = next;
        lockedUntil = performance.now() + 300;
        setHidden(next);
      }
    };

    const evaluate = () => {
      ticking = false;
      const top = el.scrollTop;
      if (performance.now() < lockedUntil) {
        lastTop = top;
        return;
      }
      if (top <= revealTop) {
        apply(false);
      } else if (top - lastTop > threshold) {
        apply(true);
      } else if (lastTop - top > threshold) {
        apply(false);
      } else {
        return; // 변화량이 작으면 기준점 유지
      }
      lastTop = top;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(evaluate);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [el, threshold, revealTop, enabled]);

  return hidden;
}
