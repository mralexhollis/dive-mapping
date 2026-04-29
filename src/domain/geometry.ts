import type { Point } from './types';

const TAU = Math.PI * 2;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Normalise a degree value into [0, 360). */
export function normaliseDeg(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/**
 * Convert a compass bearing (CW from north) and distance into an SVG-space
 * vector (y grows downward; 0° → up).
 */
export function bearingToVector(bearingDeg: number, distance = 1): Point {
  const θ = toRad(normaliseDeg(bearingDeg));
  return {
    x: Math.sin(θ) * distance,
    y: -Math.cos(θ) * distance,
  };
}

/** Inverse of `bearingToVector`. Returns degrees in [0, 360). */
export function vectorToBearing(v: Point): number {
  if (v.x === 0 && v.y === 0) return 0;
  // atan2(x, -y) treats north (0,-1) as 0° and runs CW.
  const rad = Math.atan2(v.x, -v.y);
  const deg = toDeg(rad);
  return normaliseDeg(deg);
}

export function reverseBearing(deg: number): number {
  return normaliseDeg(deg + 180);
}

/**
 * Smallest angular delta between two bearings, in [0, 180].
 */
export function bearingDelta(a: number, b: number): number {
  const diff = Math.abs(normaliseDeg(a) - normaliseDeg(b));
  return diff > 180 ? 360 - diff : diff;
}

/**
 * True iff `forward` and `reverse` describe a consistent bidirectional
 * bearing pair within `toleranceDeg`. e.g. 240° / 60° → true.
 */
export function bearingsConsistent(
  forward: number,
  reverse: number,
  toleranceDeg = 2,
): boolean {
  return bearingDelta(reverseBearing(forward), reverse) <= toleranceDeg;
}

/** Euclidean distance between two points. */
export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Add `b` to `a`. */
export function addPoint(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Closest point on segment AB to point P. */
export function projectOntoSegment(p: Point, a: Point, b: Point): Point {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2));
  return { x: a.x + abx * t, y: a.y + aby * t };
}

export interface NearestSegment {
  /** Where to splice the new point so it sits between segment-i and segment-(i+1). */
  insertIdx: number;
  /** Closest point on the path to `target`. */
  point: Point;
  /** Distance from `target` to that point. */
  distance: number;
}

/**
 * Nearest segment of a polyline (closed or open) to an arbitrary `target`.
 * Returns the index where a new point should be spliced and the projected
 * coordinates on that segment.
 */
export function nearestSegment(points: Point[], closed: boolean, target: Point): NearestSegment | null {
  if (points.length < 2) return null;
  let bestIdx = 0;
  let bestPoint = points[0]!;
  let bestDist = Infinity;
  const segCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < segCount; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const proj = projectOntoSegment(target, a, b);
    const d = distance(proj, target);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = proj;
      bestIdx = i + 1;
    }
  }
  return { insertIdx: bestIdx, point: bestPoint, distance: bestDist };
}

/** Centroid (arithmetic mean) of a list of points. */
export function centroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

export const _internal = { TAU, toRad, toDeg };
