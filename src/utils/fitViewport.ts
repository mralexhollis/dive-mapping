import type { Site } from '../domain/types';
import { layoutSite } from '../domain/layout';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

/**
 * Compute a viewport that places `worldRect` (in unrotated world coords)
 * centred and zoomed to fit a canvas of size `canvasSize`. Accounts for the
 * map's screen-bearing rotation so the print area fills the visible canvas
 * regardless of north orientation.
 */
export function fitViewportToWorldRect(
  worldRect: Rect,
  canvasSize: { width: number; height: number },
  northBearingDeg: number,
  pad = 0.06,
): Viewport {
  if (canvasSize.width <= 0 || canvasSize.height <= 0) {
    return { x: 0, y: 0, scale: 1 };
  }
  // Apply the world→screen rotation (rotate by -northDeg around the origin)
  // to all four corners, then take the axis-aligned bounding box of the
  // rotated rectangle. That bbox is what we need to fit on screen.
  const θ = (-northBearingDeg * Math.PI) / 180;
  const cos = Math.cos(θ);
  const sin = Math.sin(θ);
  const corners = [
    { x: worldRect.x, y: worldRect.y },
    { x: worldRect.x + worldRect.width, y: worldRect.y },
    { x: worldRect.x + worldRect.width, y: worldRect.y + worldRect.height },
    { x: worldRect.x, y: worldRect.y + worldRect.height },
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    const rx = cos * c.x - sin * c.y;
    const ry = sin * c.x + cos * c.y;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w === 0 || h === 0) return { x: 0, y: 0, scale: 1 };
  const padFactor = 1 + pad * 2;
  const scaleX = canvasSize.width / (w * padFactor);
  const scaleY = canvasSize.height / (h * padFactor);
  const scale = Math.min(scaleX, scaleY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    x: canvasSize.width / 2 - cx * scale,
    y: canvasSize.height / 2 - cy * scale,
    scale,
  };
}

/**
 * Returns the print area to fit when opening the viewer:
 * 1. The user-set `meta.printArea` if defined.
 * 2. Otherwise an auto-bbox around all entities, plus a margin.
 * 3. `null` if there's no content yet.
 */
export function resolveDefaultPrintArea(site: Site): Rect | null {
  if (site.meta.printArea) return site.meta.printArea;
  const layout = layoutSite(site);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const pos of layout.positions.values()) include(pos.x, pos.y);
  for (const pos of layout.subPoiPositions.values()) include(pos.x, pos.y);
  for (const s of site.layers.measurements.soundings) include(s.x, s.y);
  for (const c of site.layers.depth.contours) {
    for (const p of c.points) include(p.x, p.y);
  }
  for (const l of site.layers.depth.labels ?? []) include(l.x, l.y);
  for (const sh of site.layers.waterBody.shoreline) {
    for (const p of sh.points) include(p.x, p.y);
  }
  for (const it of site.layers.illustrations.items) {
    include(it.x, it.y);
    include(it.x + it.width, it.y + it.height);
  }
  for (const n of site.layers.notes.notes) {
    if (n.position) include(n.position.x, n.position.y);
  }
  if (!Number.isFinite(minX)) return null;
  const w = maxX - minX;
  const h = maxY - minY;
  const margin = Math.max(20, Math.max(w, h) * 0.1);
  return {
    x: minX - margin,
    y: minY - margin,
    width: w + margin * 2,
    height: h + margin * 2,
  };
}
