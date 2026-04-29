import { describe, expect, it } from 'vitest';
import { layoutSite } from './layout';
import { emptySite } from './types';
import type { Bearing, POI, Site, SubPOI } from './types';

const closeTo = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

function makeSite(pois: POI[], bearings: Bearing[], subPoi: SubPOI[] = []): Site {
  const s = emptySite('test');
  s.layers.poi.pois = pois;
  s.layers.poi.bearings = bearings;
  s.layers.subPoi.items = subPoi;
  return s;
}

const poi = (id: string, extras: Partial<POI> = {}): POI => ({
  id,
  name: id,
  type: 'wreck',
  ...extras,
});

const bearing = (
  id: string,
  fromId: string,
  toId: string,
  bearingDeg: number,
  distanceM = 10,
): Bearing => ({ id, fromId, toId, bearingDeg, distanceM });

describe('layoutSite', () => {
  it('places a single POI at the origin', () => {
    const s = makeSite([poi('a')], []);
    const r = layoutSite(s);
    const pos = r.positions.get('a')!;
    expect(pos).toEqual({ x: 0, y: 0 });
  });

  it('lays out two POIs along a 90° bearing', () => {
    const s = makeSite([poi('a'), poi('b')], [bearing('e1', 'a', 'b', 90, 10)]);
    const r = layoutSite(s);
    const a = r.positions.get('a')!;
    const b = r.positions.get('b')!;
    expect(closeTo(b.x - a.x, 10)).toBe(true);
    expect(closeTo(b.y - a.y, 0)).toBe(true);
  });

  it('closes a consistent triangle with zero residual', () => {
    // Equilateral-ish triangle: A → B at 90°/10, A → C at 30°/10, B → C at 330°/10
    // 30° from origin: (sin 30, -cos 30) * 10 = (5, -8.66...)
    // 90° from origin: (10, 0)
    // From B=(10,0) at 330°: (sin 330, -cos 330) * 10 = (-5, -8.66...) → C=(5,-8.66)
    const s = makeSite(
      [poi('a'), poi('b'), poi('c')],
      [
        bearing('e1', 'a', 'b', 90, 10),
        bearing('e2', 'a', 'c', 30, 10),
        bearing('e3', 'b', 'c', 330, 10),
      ],
    );
    const r = layoutSite(s);
    expect(r.warnings).toEqual([]);
    expect(r.residuals.size).toBe(0);
  });

  it('reports residual when an edge is inconsistent with the others', () => {
    const s = makeSite(
      [poi('a'), poi('b'), poi('c')],
      [
        bearing('e1', 'a', 'b', 90, 10),
        bearing('e2', 'a', 'c', 30, 10),
        bearing('e3', 'b', 'c', 0, 10), // wrong; should be 330
      ],
    );
    const r = layoutSite(s);
    expect(r.residuals.size).toBeGreaterThan(0);
    const offending = Math.max(
      r.residuals.get('b') ?? 0,
      r.residuals.get('c') ?? 0,
    );
    expect(offending).toBeGreaterThan(0.5);
  });

  it('respects manual position overrides', () => {
    const s = makeSite(
      [poi('a', { position: { x: 100, y: 50 } }), poi('b')],
      [bearing('e1', 'a', 'b', 0, 5)],
    );
    const r = layoutSite(s);
    expect(r.positions.get('a')).toEqual({ x: 100, y: 50 });
    const b = r.positions.get('b')!;
    expect(closeTo(b.x, 100)).toBe(true);
    expect(closeTo(b.y, 45)).toBe(true);
  });

  it('lays out disconnected components separately', () => {
    const s = makeSite(
      [poi('a'), poi('b'), poi('c'), poi('d')],
      [bearing('e1', 'a', 'b', 90, 10), bearing('e2', 'c', 'd', 90, 10)],
    );
    const r = layoutSite(s);
    expect(r.positions.size).toBe(4);
    // Components should not overlap.
    const a = r.positions.get('a')!;
    const c = r.positions.get('c')!;
    expect(Math.abs(a.x - c.x)).toBeGreaterThan(50);
  });

  it('places sub-POIs at parent + offset', () => {
    const sub: SubPOI = {
      id: 's1',
      parentId: 'a',
      name: 'fish',
      category: 'fish',
      offset: { x: 5, y: -3 },
    };
    const s = makeSite(
      [poi('a', { position: { x: 10, y: 20 } })],
      [],
      [sub],
    );
    const r = layoutSite(s);
    expect(r.subPoiPositions.get('s1')).toEqual({ x: 15, y: 17 });
  });

  it('warns about a sub-POI with a missing parent', () => {
    const sub: SubPOI = {
      id: 's1',
      parentId: 'ghost',
      name: 'fish',
      category: 'fish',
      offset: { x: 0, y: 0 },
    };
    const s = makeSite([poi('a')], [], [sub]);
    const r = layoutSite(s);
    expect(r.warnings.some((w) => w.includes('ghost'))).toBe(true);
  });

  it('warns about a bearing with a missing endpoint', () => {
    const s = makeSite([poi('a')], [bearing('e1', 'a', 'ghost', 90, 10)]);
    const r = layoutSite(s);
    expect(r.warnings.some((w) => w.includes('e1'))).toBe(true);
  });
});
