// VIEW: 마우스 드래그 너비 조절 훅 및 스플리터 구분선 컴포넌트
import { useCallback, useRef, useState } from 'react';

interface UseResizableOptions {
  initialWidth: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
}

export function useResizable({
  initialWidth,
  minWidth = 180,
  maxWidth = 600,
  storageKey,
}: UseResizableOptions) {
  const [width, setWidth] = useState<number>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = Number(saved);
          if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
            return parsed;
          }
        }
      } catch {}
    }
    return initialWidth;
  });

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = width;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const delta = ev.clientX - startXRef.current;
        const next = Math.max(minWidth, Math.min(maxWidth, Math.round(startWidthRef.current + delta)));
        setWidth(next);
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, String(next));
          } catch {}
        }
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [width, minWidth, maxWidth, storageKey],
  );

  const resetWidth = useCallback(() => {
    setWidth(initialWidth);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, String(initialWidth));
      } catch {}
    }
  }, [initialWidth, storageKey]);

  return { width, startResize, resetWidth };
}

interface ResizeSplitterProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  title?: string;
}

export function ResizeSplitter({
  onMouseDown,
  onDoubleClick,
  title = '마우스 드래그로 너비 조절 (더블클릭 시 기본값 복원)',
}: ResizeSplitterProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      style={{
        width: 7,
        marginLeft: -3,
        marginRight: -4,
        cursor: 'col-resize',
        zIndex: 20,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        height: '100%',
        transition: 'background-color 0.15s ease',
        backgroundColor: hovered ? 'rgba(34, 139, 230, 0.15)' : 'transparent',
      }}
    >
      <div
        style={{
          width: hovered ? 2 : 1,
          height: '100%',
          backgroundColor: hovered ? 'var(--mantine-color-blue-6, #228be6)' : 'var(--mantine-color-gray-3, #dee2e6)',
          transition: 'all 0.15s ease',
        }}
      />
    </div>
  );
}
