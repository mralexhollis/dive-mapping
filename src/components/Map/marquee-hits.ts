import type { LayerKey, Point, Site, UUID } from '../../domain/types';
import type { Selection } from '../../state/useSiteStore';

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
}

export function segmentIntersectsRect(a: Point, b: Point, r: Rect): boolean {
  // If either endpoint is inside, hit.
  if (pointInRect(a, r) || pointInRect(b, r)) return true;
  // Otherwise check the four edges of the rect.
  const corners = [
    { x: r.minX, y: r.minY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
    { x: r.minX, y: r.maxY },
  ];
  for (let i = 0; i < 4; i++) {
    const c = corners[i]!;
    const d = corners[(i + 1) % 4]!;
    if (segmentsIntersect(a, b, c, d)) return true;
  }
  return false;
}

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross({ x: p2.x - p1.x, y: p2.y - p1.y }, { x: p3.x - p1.x, y: p3.y - p1.y });
  const d2 = cross({ x: p2.x - p1.x, y: p2.y - p1.y }, { x: p4.x - p1.x, y: p4.y - p1.y });
  const d3 = cross({ x: p4.x - p3.x, y: p4.y - p3.y }, { x: p1.x - p3.x, y: p1.y - p3.y });
  const d4 = cross({ x: p4.x - p3.x, y: p4.y - p3.y }, { x: p2.x - p3.x, y: p2.y - p3.y });
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * Collect every item across the given layer keys whose geometry intersects
 * the marquee. The POI layout map is needed for POIs / sub-POIs / bearings.
 */
export function hitsInRect(
  site: Site,
  layerKeys: LayerKey[],
  rect: Rect,
  positions: Map<UUID, Point>,
  subPoiPositions: Map<UUID, Point>,
): Selection[] {
  const out: Selection[] = [];
  for (const key of layerKeys) {
    out.push(...hitsForLayer(site, key, rect, positions, subPoiPositions));
  }
  return out;
}

function hitsForLayer(
  site: Site,
  activeLayer: LayerKey,
  rect: Rect,
  positions: Map<UUID, Point>,
  subPoiPositions: Map<UUID, Point>,
): Selection[] {
  const out: Selection[] = [];
  switch (activeLayer) {
    case 'waterBody':
      for (const sh of site.layers.waterBody.shoreline) {
        if (sh.points.some((p) => pointInRect(p, rect))) {
          out.push({ kind: 'shoreline', id: sh.id });
        }
      }
      break;
    case 'depth':
      for (const c of site.layers.depth.contours) {
        if (c.points.some((p) => pointInRect(p, rect))) {
          out.push({ kind: 'contour', id: c.id });
        }
      }
      for (const l of site.layers.depth.labels ?? []) {
        if (pointInRect({ x: l.x, y: l.y }, rect)) {
          out.push({ kind: 'depthLabel', id: l.id });
        }
      }
      break;
    case 'measurements':
      for (const s of site.layers.measurements.soundings) {
        if (pointInRect({ x: s.x, y: s.y }, rect)) out.push({ kind: 'sounding', id: s.id });
      }
      break;
    case 'poi':
      for (const p of site.layers.poi.pois) {
        const pos = positions.get(p.id);
        if (pos && pointInRect(pos, rect)) out.push({ kind: 'poi', id: p.id });
      }
      for (const b of site.layers.poi.bearings) {
        const a = positions.get(b.fromId);
        const c = positions.get(b.toId);
        if (a && c && segmentIntersectsRect(a, c, rect)) {
          out.push({ kind: 'bearing', id: b.id });
        }
      }
      break;
    case 'subPoi':
      for (const s of site.layers.subPoi.items) {
        const pos = subPoiPositions.get(s.id);
        if (pos && pointInRect(pos, rect)) out.push({ kind: 'subpoi', id: s.id });
      }
      break;
    case 'illustrations':
    case 'references':
      for (const it of site.layers[activeLayer].items) {
        const bbox: Rect = {
          minX: it.x,
          minY: it.y,
          maxX: it.x + it.width,
          maxY: it.y + it.height,
        };
        if (rectsOverlap(bbox, rect)) out.push({ kind: 'illustration', id: it.id });
      }
      if (activeLayer === 'illustrations') {
        for (const ln of site.layers.illustrations.lines ?? []) {
          for (let i = 0; i < ln.points.length - 1; i++) {
            const a = ln.points[i]!;
            const b = ln.points[i + 1]!;
            if (segmentIntersectsRect(a, b, rect)) {
              out.push({ kind: 'illustrationLine', id: ln.id });
              break;
            }
          }
        }
      }
      break;
    case 'notes':
      for (const n of site.layers.notes.notes) {
        const pos =
          n.position ??
          (n.attachTo?.kind === 'poi'
            ? positions.get(n.attachTo.id)
            : n.attachTo?.kind === 'subpoi'
            ? subPoiPositions.get(n.attachTo.id)
            : null);
        if (pos && pointInRect(pos, rect)) out.push({ kind: 'note', id: n.id });
      }
      break;
  }
  return out;
}

/** Returns the keys of layers that are visible and unlocked. */
export function selectableLayers(site: Site): LayerKey[] {
  return (Object.keys(site.layers) as LayerKey[]).filter((k) => {
    const l = site.layers[k];
    return l.visible && !l.locked;
  });
}
