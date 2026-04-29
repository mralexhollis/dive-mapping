import { useEffect, useRef } from 'react';
import { useSiteStore } from '../state/useSiteStore';

const MIN_SCALE = 0.05;
const MAX_SCALE = 50;
const WHEEL_FACTOR = 1.0015;

/**
 * Attaches mouse-wheel zoom and middle/right/space-drag pan to a node.
 * Touch (1- and 2-finger) is also handled. Scroll wheel zooms toward the cursor.
 */
export function usePanZoom(target: React.RefObject<SVGSVGElement | null>) {
  const setViewport = useSiteStore((s) => s.setViewport);
  const stateRef = useRef({
    panning: false,
    lastX: 0,
    lastY: 0,
    pinchDist: 0,
    pinchScale: 1,
    pinchOriginX: 0,
    pinchOriginY: 0,
  });

  useEffect(() => {
    const el = target.current;
    if (!el) return;

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const factor = Math.pow(WHEEL_FACTOR, -ev.deltaY);
      setViewport((v) => {
        const newScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
        const realFactor = newScale / v.scale;
        return {
          scale: newScale,
          x: cx - (cx - v.x) * realFactor,
          y: cy - (cy - v.y) * realFactor,
        };
      });
    };

    const onMouseDown = (ev: MouseEvent) => {
      // Middle-click or right-click pans. Left-click is reserved for tools.
      if (ev.button === 1 || ev.button === 2) {
        ev.preventDefault();
        stateRef.current.panning = true;
        stateRef.current.lastX = ev.clientX;
        stateRef.current.lastY = ev.clientY;
      }
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!stateRef.current.panning) return;
      const dx = ev.clientX - stateRef.current.lastX;
      const dy = ev.clientY - stateRef.current.lastY;
      stateRef.current.lastX = ev.clientX;
      stateRef.current.lastY = ev.clientY;
      setViewport((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    };

    const onMouseUp = () => {
      stateRef.current.panning = false;
    };

    const onContextMenu = (ev: Event) => ev.preventDefault();

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length === 1) {
        stateRef.current.panning = true;
        stateRef.current.lastX = ev.touches[0]!.clientX;
        stateRef.current.lastY = ev.touches[0]!.clientY;
      } else if (ev.touches.length === 2) {
        stateRef.current.panning = false;
        const t0 = ev.touches[0]!;
        const t1 = ev.touches[1]!;
        stateRef.current.pinchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        stateRef.current.pinchOriginX = (t0.clientX + t1.clientX) / 2;
        stateRef.current.pinchOriginY = (t0.clientY + t1.clientY) / 2;
      }
    };

    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      if (ev.touches.length === 1 && stateRef.current.panning) {
        const t = ev.touches[0]!;
        const dx = t.clientX - stateRef.current.lastX;
        const dy = t.clientY - stateRef.current.lastY;
        stateRef.current.lastX = t.clientX;
        stateRef.current.lastY = t.clientY;
        setViewport((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      } else if (ev.touches.length === 2) {
        const t0 = ev.touches[0]!;
        const t1 = ev.touches[1]!;
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        if (stateRef.current.pinchDist === 0) {
          stateRef.current.pinchDist = dist;
          return;
        }
        const factor = dist / stateRef.current.pinchDist;
        stateRef.current.pinchDist = dist;
        const rect = el.getBoundingClientRect();
        const cx = (t0.clientX + t1.clientX) / 2 - rect.left;
        const cy = (t0.clientY + t1.clientY) / 2 - rect.top;
        setViewport((v) => {
          const newScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
          const realFactor = newScale / v.scale;
          return {
            scale: newScale,
            x: cx - (cx - v.x) * realFactor,
            y: cy - (cy - v.y) * realFactor,
          };
        });
      }
    };

    const onTouchEnd = () => {
      stateRef.current.panning = false;
      stateRef.current.pinchDist = 0;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [target, setViewport]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
