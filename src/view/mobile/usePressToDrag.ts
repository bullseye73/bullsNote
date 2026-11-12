// 마우스·터치 공용 "눌러서 드래그 시작" 재사용 훅
// - 마우스: 왼쪽 버튼을 누르는 즉시 시작
// - 터치/펜: 길게 누르면(기본 350ms) 시작. 그 전에 손가락이 움직이면 스크롤로 보고 취소
import { useCallback, useEffect, useRef } from 'react';

interface PressToDragOptions {
  /** 터치 길게 누르기 판정 시간(ms) */
  delay?: number;
  /** 길게 누르는 동안 허용하는 손가락 이동량(px) */
  tolerance?: number;
}

export function usePressToDrag({ delay = 350, tolerance = 8 }: PressToDragOptions = {}) {
  const cleanupRef = useRef<(() => void) | null>(null);

  const cancelPending = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  /** onStart(시작 clientX)를 받아 요소의 onPointerDown 핸들러를 만든다 */
  return useCallback(
    (onStart: (clientX: number, pointerType: string) => void) => (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        e.stopPropagation();
        onStart(e.clientX, 'mouse');
        return;
      }
      e.stopPropagation();
      cancelPending();
      const startX = e.clientX;
      const startY = e.clientY;
      const pointerType = e.pointerType;

      const onMove = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > tolerance) cancelPending();
      };
      const timer = setTimeout(() => {
        cancelPending();
        try {
          navigator.vibrate?.(12);
        } catch {
          /* 진동 미지원 기기 무시 */
        }
        onStart(startX, pointerType);
      }, delay);

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', cancelPending);
      window.addEventListener('pointercancel', cancelPending);
      cleanupRef.current = () => {
        clearTimeout(timer);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', cancelPending);
        window.removeEventListener('pointercancel', cancelPending);
      };
    },
    [cancelPending, delay, tolerance]
  );
}
