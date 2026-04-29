import type { Point } from '../domain/types';
import { useSiteStore, type Viewport } from '../state/useSiteStore';

export function clientToWorld(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  viewport: Viewport,
): Point {
  const rect = svg.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  // Undo translate + scale.
  const rx = (sx - viewport.x) / viewport.scale;
  const ry = (sy - viewport.y) / viewport.scale;
  // Undo the screen-bearing rotation. The forward transform applies
  // rotate(-northDeg); the inverse is rotate(+northDeg).
  const northDeg = useSiteStore.getState().site.meta.northBearingDeg ?? 0;
  if (northDeg === 0) return { x: rx, y: ry };
  const θ = (northDeg * Math.PI) / 180;
  const cos = Math.cos(θ);
  const sin = Math.sin(θ);
  return {
    x: rx * cos - ry * sin,
    y: rx * sin + ry * cos,
  };
}
