// 모바일 가상 키보드가 가리는 화면 하단 높이(px)를 visualViewport 로 계산하는 재사용 훅
// - iOS Safari/PWA 는 키보드가 열려도 레이아웃 뷰포트가 줄지 않으므로 fixed 요소를 키보드 위로 올릴 때 사용
import { useEffect, useState } from 'react';

export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!enabled || !vv) {
      setInset(0);
      return;
    }
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(Math.max(0, Math.round(covered)));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return inset;
}
