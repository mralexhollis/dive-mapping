import { describe, expect, it } from 'vitest';
import { generateContours, mergeContours } from './contours';
import type { ContourLine, DepthSounding } from './types';

let counter = 0;
const idFn = () => `c${++counter}`;

const sounding = (x: number, y: number, depth: number): DepthSounding => ({
  id: `s-${x}-${y}`,
  x,
  y,
  depth,
});

/** 5×5 grid sloping linearly from depth = x (so the y=2 contour is x≈2). */
function slopedGrid(): DepthSounding[] {
  const pts: DepthSounding[] = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      pts.push(sounding(i, j, i));
    }
  }
  return pts;
}

describe('generateContours', () => {
  it('returns empty for fewer than 3 soundings', () => {
    expect(generateContours([], { depths: [1] })).toEqual([]);
    expect(generateContours([sounding(0, 0, 1)], { depths: [1] })).toEqual([]);
  });

  it('produces a contour at the requested depth on a sloped grid', () => {
    const result = generateContours(slopedGrid(), { depths: [2], idFn });
    expect(result.length).toBeGreaterThan(0);
    const main = result.reduce((a, b) => (a.points.length >= b.points.length ? a : b));
    expect(main.depth).toBe(2);
    expect(main.origin).toBe('derived');
    // All points along x≈2.
    for (const p of main.points) {
      expect(Math.abs(p.x - 2)).toBeLessThan(0.01);
    }
  });

  it('produces multiple contours when given multiple depths', () => {
    const result = generateContours(slopedGrid(), { depths: [1, 2, 3], idFn });
    const depths = new Set(result.map((c) => c.depth));
    expect(depths.has(1)).toBe(true);
    expect(depths.has(2)).toBe(true);
    expect(depths.has(3)).toBe(true);
  });
});

describe('mergeContours', () => {
  it('preserves manual contours and replaces derived ones', () => {
    const manual: ContourLine = {
      id: 'm1',
      depth: 5,
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      origin: 'manual',
    };
    const oldDerived: ContourLine = {
      id: 'd-old',
      depth: 5,
      points: [],
      origin: 'derived',
    };
    const newDerived: ContourLine = {
      id: 'd-new',
      depth: 5,
      points: [{ x: 2, y: 2 }],
      origin: 'derived',
    };
    const merged = mergeContours([manual, oldDerived], [newDerived]);
    expect(merged).toContain(manual);
    expect(merged).toContain(newDerived);
    expect(merged).not.toContain(oldDerived);
  });
});
