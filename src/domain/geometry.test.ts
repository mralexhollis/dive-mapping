import { describe, expect, it } from 'vitest';
import {
  bearingDelta,
  bearingToVector,
  bearingsConsistent,
  normaliseDeg,
  reverseBearing,
  vectorToBearing,
} from './geometry';

const closeTo = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe('normaliseDeg', () => {
  it('wraps negatives into [0, 360)', () => {
    expect(normaliseDeg(-10)).toBe(350);
    expect(normaliseDeg(370)).toBe(10);
    expect(normaliseDeg(720)).toBe(0);
  });
});

describe('bearingToVector', () => {
  it('maps cardinal bearings correctly', () => {
    const cases: [number, [number, number]][] = [
      [0, [0, -1]],
      [90, [1, 0]],
      [180, [0, 1]],
      [270, [-1, 0]],
    ];
    for (const [deg, [ex, ey]] of cases) {
      const v = bearingToVector(deg, 1);
      expect(closeTo(v.x, ex)).toBe(true);
      expect(closeTo(v.y, ey)).toBe(true);
    }
  });

  it('scales by distance', () => {
    const v = bearingToVector(90, 5);
    expect(closeTo(v.x, 5)).toBe(true);
    expect(closeTo(v.y, 0)).toBe(true);
  });
});

describe('vectorToBearing', () => {
  it('inverts bearingToVector', () => {
    for (const deg of [0, 30, 90, 145, 180, 240, 359]) {
      const v = bearingToVector(deg, 3);
      expect(closeTo(vectorToBearing(v), deg, 1e-6)).toBe(true);
    }
  });

  it('returns 0 for the zero vector', () => {
    expect(vectorToBearing({ x: 0, y: 0 })).toBe(0);
  });
});

describe('reverseBearing', () => {
  it('flips by 180°', () => {
    expect(reverseBearing(60)).toBe(240);
    expect(reverseBearing(240)).toBe(60);
    expect(reverseBearing(0)).toBe(180);
  });
});

describe('bearingDelta', () => {
  it('returns the smallest angular distance', () => {
    expect(bearingDelta(10, 350)).toBe(20);
    expect(bearingDelta(0, 180)).toBe(180);
    expect(bearingDelta(90, 91)).toBe(1);
  });
});

describe('bearingsConsistent', () => {
  it('passes for an exact reverse pair', () => {
    expect(bearingsConsistent(240, 60)).toBe(true);
  });

  it('passes within tolerance', () => {
    expect(bearingsConsistent(240, 61, 2)).toBe(true);
    expect(bearingsConsistent(240, 64, 2)).toBe(false);
  });

  it('flags an inconsistent pair', () => {
    expect(bearingsConsistent(240, 50)).toBe(false);
  });
});
