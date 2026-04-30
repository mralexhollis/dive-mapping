import { useEffect, useRef, useState, type ReactNode } from 'react';

export type SplitDirection = 'row' | 'column';

interface ResizableSplitProps {
  direction: SplitDirection;
  /** First child's size, in pixels. The second child takes the remainder. */
  firstSize: number;
  setFirstSize: (next: number) => void;
  minFirst?: number;
  maxFirst?: number;
  /** Min size for the second pane; the first pane is clamped accordingly. */
  minSecond?: number;
  /** Children must be exactly two elements: the panes. */
  children: [ReactNode, ReactNode];
  className?: string;
}

/**
 * Two-pane resizable split. The user drags the divider between them. Sizes
 * are reported via the `setFirstSize` callback so the parent can persist
 * them (e.g. to localStorage) without this component owning state.
 */
export default function ResizableSplit({
  direction,
  firstSize,
  setFirstSize,
  minFirst = 120,
  maxFirst,
  minSecond = 120,
  children,
  className = '',
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Dragging is tracked via a ref so a fast pointerdown → pointermove
  // sequence doesn't lose the gesture to React's render batching.
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  // While dragging, keep the cursor consistent across the whole document
  // even if the pointer slips off the divider.
  useEffect(() => {
    if (!dragging) return;
    const cursor = direction === 'row' ? 'col-resize' : 'row-resize';
    const prev = document.body.style.cursor;
    document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = prev;
      document.body.style.userSelect = '';
    };
  }, [dragging, direction]);

  const onPointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    draggingRef.current = true;
    setDragging(true);
  };

  const onPointerMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const total = direction === 'row' ? rect.width : rect.height;
    const offset = direction === 'row' ? ev.clientX - rect.left : ev.clientY - rect.top;
    const max = maxFirst ?? total - minSecond;
    const next = Math.max(minFirst, Math.min(max, offset));
    setFirstSize(next);
  };

  const onPointerUp = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    (ev.currentTarget as Element).releasePointerCapture(ev.pointerId);
    draggingRef.current = false;
    setDragging(false);
  };

  const isRow = direction === 'row';
  const containerClass = isRow ? 'flex flex-row' : 'flex flex-col';
  const firstStyle = isRow
    ? { width: firstSize, minWidth: 0 }
    : { height: firstSize, minHeight: 0 };
  const handleClass = isRow
    ? 'w-1 cursor-col-resize hover:bg-water-300'
    : 'h-1 cursor-row-resize hover:bg-water-300';
  const handleVisualClass = dragging ? 'bg-water-400' : 'bg-water-200';

  return (
    <div ref={containerRef} className={`${containerClass} min-h-0 min-w-0 ${className}`}>
      <div style={firstStyle} className={isRow ? 'shrink-0' : 'shrink-0 min-h-0 flex flex-col'}>
        {children[0]}
      </div>
      <div
        role="separator"
        aria-orientation={isRow ? 'vertical' : 'horizontal'}
        aria-label={isRow ? 'Resize columns' : 'Resize rows'}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`shrink-0 ${handleClass} ${handleVisualClass}`}
      />
      <div className={isRow ? 'flex-1 min-w-0' : 'flex-1 min-h-0 flex flex-col'}>
        {children[1]}
      </div>
    </div>
  );
}
