import type { Point } from '../domain/types';

/**
 * Build an SVG path string that smoothly curves through `points` using
 * Catmull-Rom-to-Bezier conversion. The result is a series of cubic Bezier
 * segments — the curve passes through every input point.
 *
 * `closed` joins the last point back to the first via an additional segment.
 */
export function smoothPath(points: Point[], closed: boolean): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  if (points.length === 2) {
    const [a, b] = points;
    return `M ${a!.x} ${a!.y} L ${b!.x} ${b!.y}`;
  }

  const n = points.length;
  const get = (i: number): Point => {
    if (closed) {
      const k = ((i % n) + n) % n;
      return points[k]!;
    }
    return points[Math.max(0, Math.min(n - 1, i))]!;
  };

  const start = points[0]!;
  let d = `M ${start.x} ${start.y}`;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  if (closed) d += ' Z';
  return d;
}
