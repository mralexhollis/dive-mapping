import { Delaunay } from 'd3-delaunay';
import type { ContourLine, DepthSounding, Point, UUID } from './types';

export interface GenerateOptions {
  /** Contour depths to draw (e.g. [2, 4, 6, 8, 10]). */
  depths: number[];
  /**
   * Minimum vertices per output polyline. Tiny single-segment fragments are
   * dropped — they're usually noise from a single triangle on the hull.
   */
  minVertices?: number;
  /** Quantum used to chain polyline segments. Should match coord precision. */
  joinEpsilon?: number;
  /** id → string factory; defaults to crypto.randomUUID. */
  idFn?: () => UUID;
}

interface Segment {
  a: Point;
  b: Point;
}

const DEFAULT_MIN_VERTICES = 2;
const DEFAULT_JOIN_EPS = 1e-3;

/**
 * Generate `ContourLine`s at the given depths from a scattered set of
 * soundings. The output is tagged `origin: 'derived'`.
 *
 * Empty input or a single sounding returns an empty list.
 */
export function generateContours(
  soundings: DepthSounding[],
  opts: GenerateOptions,
): ContourLine[] {
  if (soundings.length < 3) return [];
  const minVertices = opts.minVertices ?? DEFAULT_MIN_VERTICES;
  const joinEps = opts.joinEpsilon ?? DEFAULT_JOIN_EPS;
  const idFn = opts.idFn ?? (() => crypto.randomUUID());

  const points = soundings.map((s) => [s.x, s.y] as [number, number]);
  const depths = soundings.map((s) => s.depth);
  const delaunay = Delaunay.from(points);
  const tris = delaunay.triangles;

  const result: ContourLine[] = [];
  // Perturb each level by a tiny epsilon so a sounding sitting exactly on a
  // contour depth doesn't create an "ambiguous" triangle with no crossings.
  const LEVEL_EPS = 1e-9;
  for (const rawLevel of opts.depths) {
    const level = rawLevel + LEVEL_EPS;
    const segments: Segment[] = [];
    for (let t = 0; t < tris.length; t += 3) {
      const i0 = tris[t]!;
      const i1 = tris[t + 1]!;
      const i2 = tris[t + 2]!;
      const triPoints: Point[] = [
        { x: points[i0]![0], y: points[i0]![1] },
        { x: points[i1]![0], y: points[i1]![1] },
        { x: points[i2]![0], y: points[i2]![1] },
      ];
      const triDepths = [depths[i0]!, depths[i1]!, depths[i2]!];
      const crossings = triangleCrossings(triPoints, triDepths, level);
      if (crossings.length === 2) {
        segments.push({ a: crossings[0]!, b: crossings[1]! });
      }
    }
    const polylines = chainSegments(segments, joinEps);
    for (const poly of polylines) {
      if (poly.points.length < minVertices) continue;
      result.push({
        id: idFn(),
        depth: rawLevel,
        points: poly.points,
        closed: poly.closed,
        origin: 'derived',
      });
    }
  }
  return result;
}

function triangleCrossings(pts: Point[], zs: number[], level: number): Point[] {
  const edges: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 0],
  ];
  const out: Point[] = [];
  for (const [i, j] of edges) {
    const zi = zs[i]!;
    const zj = zs[j]!;
    const di = zi - level;
    const dj = zj - level;
    // Crossing only if the level is strictly between the two depths.
    if ((di > 0 && dj < 0) || (di < 0 && dj > 0)) {
      const t = di / (di - dj);
      const pi = pts[i]!;
      const pj = pts[j]!;
      out.push({
        x: pi.x + t * (pj.x - pi.x),
        y: pi.y + t * (pj.y - pi.y),
      });
    }
  }
  return out;
}

interface Polyline {
  points: Point[];
  closed: boolean;
}

/**
 * Chain segments into polylines by matching shared endpoints within
 * `eps`. Greedy O(n²); fine for the segment counts we expect (≤ a few k).
 */
function chainSegments(segments: Segment[], eps: number): Polyline[] {
  const remaining = segments.map((s) => ({ ...s, used: false }));
  const out: Polyline[] = [];
  const same = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

  for (let i = 0; i < remaining.length; i++) {
    const seed = remaining[i]!;
    if (seed.used) continue;
    seed.used = true;
    const points: Point[] = [seed.a, seed.b];

    // Extend forward.
    let extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < remaining.length; j++) {
        const seg = remaining[j]!;
        if (seg.used) continue;
        const tail = points[points.length - 1]!;
        if (same(tail, seg.a)) {
          points.push(seg.b);
          seg.used = true;
          extended = true;
          break;
        }
        if (same(tail, seg.b)) {
          points.push(seg.a);
          seg.used = true;
          extended = true;
          break;
        }
      }
    }

    // Extend backward.
    extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < remaining.length; j++) {
        const seg = remaining[j]!;
        if (seg.used) continue;
        const head = points[0]!;
        if (same(head, seg.a)) {
          points.unshift(seg.b);
          seg.used = true;
          extended = true;
          break;
        }
        if (same(head, seg.b)) {
          points.unshift(seg.a);
          seg.used = true;
          extended = true;
          break;
        }
      }
    }

    const closed = points.length >= 3 && same(points[0]!, points[points.length - 1]!);
    if (closed) points.pop();
    out.push({ points, closed });
  }
  return out;
}

/**
 * Replace any existing derived contours in `existing` with `derived`,
 * preserving manual contours unchanged.
 */
export function mergeContours(
  existing: ContourLine[],
  derived: ContourLine[],
): ContourLine[] {
  const manual = existing.filter((c) => c.origin === 'manual');
  return [...manual, ...derived];
}
