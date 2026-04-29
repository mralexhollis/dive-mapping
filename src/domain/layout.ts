import {
  addPoint,
  bearingToVector,
  distance as dist,
  reverseBearing,
} from './geometry';
import type {
  Bearing,
  POI,
  Point,
  Site,
  SubPOI,
  UUID,
} from './types';

export interface LayoutOptions {
  /** Distance used when an edge has no explicit `distanceM`. */
  unitDistance?: number;
  /** Horizontal offset applied between disconnected components. */
  componentSpread?: number;
}

export interface LayoutResult {
  /** Resolved XY for every POI in the POI layer. */
  positions: Map<UUID, Point>;
  /** Resolved XY for every SubPOI (parent.position + offset). */
  subPoiPositions: Map<UUID, Point>;
  /** Per-POI residual error: how far edges land from where they "should". */
  residuals: Map<UUID, number>;
  /** Human-readable issues found while solving. */
  warnings: string[];
}

interface DirectedEdge {
  toId: UUID;
  bearingDeg: number;
  distance: number;
  bearingId: UUID;
}

const DEFAULT_UNIT = 30;
const DEFAULT_SPREAD = 200;

function buildAdjacency(
  bearings: Bearing[],
  unit: number,
): Map<UUID, DirectedEdge[]> {
  const adj = new Map<UUID, DirectedEdge[]>();
  const push = (k: UUID, e: DirectedEdge) => {
    const arr = adj.get(k);
    if (arr) arr.push(e);
    else adj.set(k, [e]);
  };
  for (const b of bearings) {
    const d = b.distanceM ?? unit;
    push(b.fromId, {
      toId: b.toId,
      bearingDeg: b.bearingDeg,
      distance: d,
      bearingId: b.id,
    });
    const reverseDeg = b.reverseBearingDeg ?? reverseBearing(b.bearingDeg);
    push(b.toId, {
      toId: b.fromId,
      bearingDeg: reverseDeg,
      distance: d,
      bearingId: b.id,
    });
  }
  return adj;
}

function findComponents(
  pois: POI[],
  adj: Map<UUID, DirectedEdge[]>,
): UUID[][] {
  const seen = new Set<UUID>();
  const components: UUID[][] = [];
  for (const p of pois) {
    if (seen.has(p.id)) continue;
    const comp: UUID[] = [];
    const queue: UUID[] = [p.id];
    seen.add(p.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      comp.push(id);
      for (const e of adj.get(id) ?? []) {
        if (!seen.has(e.toId)) {
          seen.add(e.toId);
          queue.push(e.toId);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

function pickAnchor(
  componentIds: UUID[],
  poiById: Map<UUID, POI>,
): { id: UUID; position?: Point } {
  for (const id of componentIds) {
    const p = poiById.get(id);
    if (p?.position) return { id, position: p.position };
  }
  return { id: componentIds[0] };
}

/**
 * Compute XY positions for every POI in the bearing graph.
 * The function is pure: same `Site` in → same result out.
 */
export function layoutSite(site: Site, opts: LayoutOptions = {}): LayoutResult {
  const unit = opts.unitDistance ?? DEFAULT_UNIT;
  const spread = opts.componentSpread ?? DEFAULT_SPREAD;
  const positions = new Map<UUID, Point>();
  const residuals = new Map<UUID, number>();
  const warnings: string[] = [];

  const pois = site.layers.poi.pois;
  const bearings = site.layers.poi.bearings;
  const poiById = new Map(pois.map((p) => [p.id, p] as const));
  const validBearings = bearings.filter((b) => {
    if (!poiById.has(b.fromId) || !poiById.has(b.toId)) {
      warnings.push(`Bearing ${b.id} references missing POI`);
      return false;
    }
    return true;
  });
  const adj = buildAdjacency(validBearings, unit);
  const components = findComponents(pois, adj);

  components.forEach((compIds, idx) => {
    const { id: anchorId, position: anchorPos } = pickAnchor(compIds, poiById);
    const offsetX = anchorPos ? 0 : idx * spread;
    const start = anchorPos ?? { x: offsetX, y: 0 };
    positions.set(anchorId, start);

    // BFS from anchor.
    const queue: UUID[] = [anchorId];
    const visited = new Set<UUID>([anchorId]);
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentPos = positions.get(currentId)!;
      for (const edge of adj.get(currentId) ?? []) {
        if (visited.has(edge.toId)) continue;
        visited.add(edge.toId);
        const neighbour = poiById.get(edge.toId)!;
        if (neighbour.position) {
          positions.set(edge.toId, neighbour.position);
        } else {
          const v = bearingToVector(edge.bearingDeg, edge.distance);
          positions.set(edge.toId, addPoint(currentPos, v));
        }
        queue.push(edge.toId);
      }
    }
  });

  // Residuals: for each edge, compare computed delta to bearing+distance.
  for (const b of validBearings) {
    const from = positions.get(b.fromId);
    const to = positions.get(b.toId);
    if (!from || !to) continue;
    const expected = bearingToVector(b.bearingDeg, b.distanceM ?? unit);
    const actual = { x: to.x - from.x, y: to.y - from.y };
    const err = dist(expected, actual);
    if (err > 1e-6) {
      residuals.set(b.fromId, Math.max(residuals.get(b.fromId) ?? 0, err));
      residuals.set(b.toId, Math.max(residuals.get(b.toId) ?? 0, err));
    }
  }

  // Sub-POIs.
  const subPoiPositions = resolveSubPoiPositions(site.layers.subPoi.items, positions, warnings);

  return { positions, subPoiPositions, residuals, warnings };
}

function resolveSubPoiPositions(
  items: SubPOI[],
  positions: Map<UUID, Point>,
  warnings: string[],
): Map<UUID, Point> {
  const out = new Map<UUID, Point>();
  for (const sub of items) {
    const parent = positions.get(sub.parentId);
    if (!parent) {
      warnings.push(`Sub-POI ${sub.id} parent ${sub.parentId} not laid out`);
      continue;
    }
    out.set(sub.id, addPoint(parent, sub.offset));
  }
  return out;
}
