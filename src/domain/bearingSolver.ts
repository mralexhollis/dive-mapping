/**
 * Solver that triangulates POI positions from a graph of bearings.
 *
 * Given a list of POIs and bearings between them, plus an anchor POI whose
 * position is treated as known, this places every other reachable POI by
 * intersecting bearing rays where possible (two bearings to the same target
 * from already-placed POIs uniquely determine a position) and falling back
 * to the bearing's `distanceM` hint (or a default) when only one ray is
 * available.
 *
 * Pure — no React or store coupling.
 */

import { distance } from './geometry';
import type { Bearing, POI, Point, UUID } from './types';

export interface SolverOptions {
  /** UUID of the POI anchored at its existing position (or origin if none). */
  anchorId?: UUID;
  /** Used when triangulation isn't possible AND the bearing has no distanceM. */
  fallbackDistanceM?: number;
}

export interface SolverResult {
  /** Computed world-space position for each placed POI. */
  positions: Map<UUID, Point>;
  /** Final straight-line distance per bearing, derived from the placements. */
  distances: Map<UUID, number>;
  /** POIs that couldn't be placed (disconnected from the anchor). */
  unsolved: UUID[];
  /** Bearings whose endpoint distance had to be approximated, not triangulated. */
  approximated: UUID[];
}

/** Convert a compass bearing (0° = up, CW) into a unit vector in y-down coords. */
function bearingToUnit(deg: number): Point {
  const θ = (deg * Math.PI) / 180;
  return { x: Math.sin(θ), y: -Math.cos(θ) };
}

/**
 * Intersect two rays in 2D. Returns the meeting point if the rays cross
 * with both parameters positive (i.e., they actually point AT each other);
 * null otherwise (parallel or diverging rays).
 */
function intersectRays(
  pa: Point,
  da: Point,
  pb: Point,
  db: Point,
): Point | null {
  // [ da.x  -db.x ] [ t ]   [ pb.x - pa.x ]
  // [ da.y  -db.y ] [ s ] = [ pb.y - pa.y ]
  const det = -da.x * db.y + db.x * da.y;
  if (Math.abs(det) < 1e-9) return null;
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const t = (-db.y * dx + db.x * dy) / det;
  const s = (-da.y * dx + da.x * dy) / det;
  // Discard solutions where either ray points AWAY from the intersection.
  if (t < 0 || s < 0) return null;
  return { x: pa.x + t * da.x, y: pa.y + t * da.y };
}

/** Lookup helper: bearing from `fromId` to `toId` in degrees, taking into
 * account the optional explicit reverse stored on the bearing. */
function outboundDeg(b: Bearing, fromId: UUID): number {
  if (b.fromId === fromId) return b.bearingDeg;
  return b.reverseBearingDeg ?? (b.bearingDeg + 180) % 360;
}

export function solveBearingGraph(
  pois: POI[],
  bearings: Bearing[],
  options: SolverOptions = {},
): SolverResult {
  const fallback = options.fallbackDistanceM ?? 30;
  const result: SolverResult = {
    positions: new Map(),
    distances: new Map(),
    unsolved: [],
    approximated: [],
  };

  if (pois.length === 0) return result;

  // Build undirected adjacency. Each bearing produces two entries — one
  // pointing FROM the source POI, one pointing FROM the target POI.
  const adj = new Map<
    UUID,
    Array<{ otherId: UUID; outDeg: number; bearingId: UUID }>
  >();
  const addEntry = (
    fromId: UUID,
    otherId: UUID,
    outDeg: number,
    bearingId: UUID,
  ) => {
    const list = adj.get(fromId) ?? [];
    list.push({ otherId, outDeg, bearingId });
    adj.set(fromId, list);
  };
  for (const b of bearings) {
    addEntry(b.fromId, b.toId, outboundDeg(b, b.fromId), b.id);
    addEntry(b.toId, b.fromId, outboundDeg(b, b.toId), b.id);
  }

  // Anchor selection: requested → first POI with a position → first POI.
  const anchorId =
    (options.anchorId && pois.some((p) => p.id === options.anchorId)
      ? options.anchorId
      : undefined) ??
    pois.find((p) => p.position)?.id ??
    pois[0]!.id;
  const anchor = pois.find((p) => p.id === anchorId)!;
  result.positions.set(anchorId, anchor.position ?? { x: 0, y: 0 });

  // BFS from the anchor.
  const queue: UUID[] = [anchorId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentPos = result.positions.get(currentId)!;
    const neighbours = adj.get(currentId) ?? [];

    for (const n of neighbours) {
      if (result.positions.has(n.otherId)) continue;
      const dirFromCurrent = bearingToUnit(n.outDeg);

      // Look for another already-placed POI that has a bearing to the same
      // unplaced target — its bearing ray + ours will triangulate.
      let triangulated: Point | null = null;
      const targetAdj = adj.get(n.otherId) ?? [];
      for (const t of targetAdj) {
        if (t.otherId === currentId) continue;
        const zPos = result.positions.get(t.otherId);
        if (!zPos) continue;
        // Bearing FROM Z TO target: look up Z's outbound entry whose
        // otherId is our target.
        const zAdj = adj.get(t.otherId) ?? [];
        const zToTarget = zAdj.find((e) => e.otherId === n.otherId);
        if (!zToTarget) continue;
        const dirFromZ = bearingToUnit(zToTarget.outDeg);
        const meet = intersectRays(currentPos, dirFromCurrent, zPos, dirFromZ);
        if (meet) {
          triangulated = meet;
          break;
        }
      }

      let placed = triangulated;
      if (!placed) {
        const bearing = bearings.find((b) => b.id === n.bearingId);
        const d = bearing?.distanceM ?? fallback;
        placed = {
          x: currentPos.x + dirFromCurrent.x * d,
          y: currentPos.y + dirFromCurrent.y * d,
        };
        result.approximated.push(n.bearingId);
      }

      result.positions.set(n.otherId, placed);
      queue.push(n.otherId);
    }
  }

  // Final per-bearing distance based on resolved positions.
  for (const b of bearings) {
    const a = result.positions.get(b.fromId);
    const c = result.positions.get(b.toId);
    if (a && c) result.distances.set(b.id, distance(a, c));
  }

  // POIs not reached from the anchor.
  for (const p of pois) {
    if (!result.positions.has(p.id)) result.unsolved.push(p.id);
  }

  return result;
}
