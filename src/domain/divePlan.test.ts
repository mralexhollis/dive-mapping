import { describe, expect, it } from 'vitest';
import {
  defaultGasPlan,
  divePlanSummary,
  equivalentAirDepthM,
  gasConsumedBar,
  maxOperatingDepthM,
  segmentDistanceM,
  turnPressure,
  MAX_ASCENT_RATE_M_PER_MIN,
} from './divePlan';
import { emptySite, FO2_AIR } from './types';
import type { Route, Site, Stop } from './types';

const closeTo = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

function makeRoute(overrides: Partial<Route> = {}): Route {
  const now = new Date().toISOString();
  return {
    id: 'r1',
    name: 'Test',
    objective: 'tour',
    color: '#dc2626',
    visible: true,
    locked: false,
    opacity: 1,
    waypoints: [],
    stops: [],
    gas: defaultGasPlan(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function stopAt(waypointId: string, durationMin: number, kind: Stop['kind'] = 'rest'): Stop {
  return { id: `stop-${waypointId}-${durationMin}`, waypointId, kind, durationMin };
}

function withSite(routes: Route[]): Site {
  const s = emptySite('Test site');
  s.routes = routes;
  return s;
}

describe('segmentDistanceM', () => {
  it('returns euclidean distance scaled by metres-per-unit', () => {
    expect(closeTo(segmentDistanceM({ x: 0, y: 0 }, { x: 3, y: 4 }, 1), 5)).toBe(true);
    expect(closeTo(segmentDistanceM({ x: 0, y: 0 }, { x: 3, y: 4 }, 2), 10)).toBe(true);
  });
});

describe('gasConsumedBar', () => {
  it('uses the (1 + depth/10) ata factor', () => {
    // 20m for 10 min, no transit (distance 0). SAC 20 L/min, 11.1 L cylinder.
    // litres = 20 × (1 + 20/10) × 10 = 600; bar = 600 / 11.1 ≈ 54.05.
    const gas = { ...defaultGasPlan(), transitSpeedMPerMin: 9, sacLPerMin: 20, cylinderL: 11.1 };
    const bar = gasConsumedBar(0, 20, gas, 10);
    expect(bar).toBeGreaterThan(53);
    expect(bar).toBeLessThan(55);
  });
});

describe('turnPressure', () => {
  it('rules of thirds, half, all-usable produce expected values', () => {
    // 207 start, 50 reserve → usable = 157. Thirds turn = 207 - 157/3 ≈ 154.67.
    expect(closeTo(turnPressure(207, 50, 'thirds'), 207 - 157 / 3, 1e-3)).toBe(true);
    expect(closeTo(turnPressure(207, 50, 'half'), 207 - 157 / 2, 1e-3)).toBe(true);
    expect(turnPressure(207, 50, 'all-usable')).toBe(50);
  });
});

describe('maxOperatingDepthM', () => {
  it('matches the PPO2 1.4 formula for common Nitrox mixes', () => {
    // MOD = (PPO2/FO2 - 1) * 10. EAN32 at 1.4 → (4.375 - 1) * 10 = 33.75 m.
    expect(closeTo(maxOperatingDepthM(0.32), 33.75, 1e-6)).toBe(true);
    // Air at 1.4 → (1.4/0.21 - 1) * 10 ≈ 56.67 m.
    expect(closeTo(maxOperatingDepthM(0.21), (1.4 / 0.21 - 1) * 10, 1e-6)).toBe(true);
  });
});

describe('equivalentAirDepthM', () => {
  it('returns actual depth for air, and a shallower EAD for Nitrox', () => {
    // Air → identity.
    expect(equivalentAirDepthM(20, 0.21)).toBe(20);
    // EAN32 at 30 m → ((1-0.32)/0.79) * (30+10) - 10 ≈ 24.43 m.
    expect(closeTo(equivalentAirDepthM(30, 0.32), (0.68 / 0.79) * 40 - 10, 1e-6)).toBe(true);
    // EAN32 EAD must be strictly shallower than the actual depth.
    expect(equivalentAirDepthM(30, 0.32)).toBeLessThan(30);
  });
});

describe('divePlanSummary', () => {
  it('totals distance, finds turn segment, and flags ceiling violations on ascent', () => {
    // 0 m → 40 m → 0 m, with a 40-min stop at WP 2. 40 min at 40 m on air
    // saturates fast tissues well past their surface M-values, so the
    // straight ascent back to WP 3 (0 m) breaches the Bühlmann ceiling.
    const wp1 = { id: 'a', kind: 'free' as const, x: 0, y: 0, depthM: 0 };
    const wp2 = { id: 'b', kind: 'free' as const, x: 30, y: 0, depthM: 40 };
    const wp3 = { id: 'c', kind: 'free' as const, x: 60, y: 0, depthM: 0 };
    const route = makeRoute({
      waypoints: [wp1, wp2, wp3],
      stops: [stopAt('b', 40, 'rest')],
    });
    const site = withSite([route]);

    const s = divePlanSummary(route, site);
    expect(s.segments.length).toBe(2);
    expect(closeTo(s.totalDistanceM, 60, 1e-6)).toBe(true);
    expect(s.warnings.some((w) => w.kind === 'ceiling-violation')).toBe(true);
    expect(s.ceilingViolations.length).toBeGreaterThan(0);
    // The ceiling samples should rise above the surface during the deep stop.
    expect(s.ceilingSamples.some((p) => p.ceilingM > 0)).toBe(true);
    expect(typeof s.turnAtSegmentIdx === 'number' || s.turnAtSegmentIdx === null).toBe(true);
  });

  it('does not flag ceiling violations for a short shallow dive that stays within ZHL-16C limits', () => {
    // 10 m for 20 min, then a clean ascent. Raw ZHL-16C never produces a
    // ceiling at 10 m, so there should be no violations.
    const wp1 = { id: 'a', kind: 'free' as const, x: 0, y: 0, depthM: 0 };
    const wp2 = { id: 'b', kind: 'free' as const, x: 30, y: 0, depthM: 10 };
    const wp3 = { id: 'c', kind: 'free' as const, x: 60, y: 0, depthM: 0 };
    const route = makeRoute({
      waypoints: [wp1, wp2, wp3],
      stops: [stopAt('b', 20, 'rest')],
    });
    const s = divePlanSummary(route, withSite([route]));
    expect(s.warnings.some((w) => w.kind === 'ceiling-violation')).toBe(false);
    expect(s.ceilingViolations).toEqual([]);
    expect(s.ceilingSamples.every((p) => p.ceilingM === 0)).toBe(true);
  });

  it('reports rapid ascent/descent, but not at the limit', () => {
    const wp1 = { id: 'a', kind: 'free' as const, x: 0, y: 0, depthM: 5 };
    const wp2 = { id: 'b', kind: 'free' as const, x: 0, y: 0, depthM: 35 };
    const wp3 = { id: 'c', kind: 'free' as const, x: 0, y: 0, depthM: 5 };
    // A → B: 5m → 35m in 1 min total (transit 0 + 1-min stop) — descent rate 30 m/min.
    // B → C: 35m → 5m in 2 min total (transit 0 + 2-min stop) — ascent rate 15 m/min.
    const route = makeRoute({
      waypoints: [wp1, wp2, wp3],
      stops: [stopAt('b', 1), stopAt('c', 2)],
      gas: { ...defaultGasPlan(), transitSpeedMPerMin: 9 },
    });
    const site = withSite([route]);

    const s = divePlanSummary(route, site);
    expect(s.segments[0]!.rapidDescent).toBe(true);
    expect(s.segments[1]!.rapidAscent).toBe(true);
    expect(s.warnings.some((w) => w.kind === 'rapid-descent' && w.segmentIdx === 0)).toBe(true);
    expect(s.warnings.some((w) => w.kind === 'rapid-ascent' && w.segmentIdx === 1)).toBe(true);

    // 0m → 9m descending in 1 min = exactly MAX_ASCENT_RATE_M_PER_MIN; should
    // not trigger the rapid-ascent flag in the reverse direction.
    const slow1 = { id: 'x', kind: 'free' as const, x: 0, y: 0, depthM: 9 };
    const slow2 = { id: 'y', kind: 'free' as const, x: 0, y: 0, depthM: 0 };
    const slowRoute = makeRoute({
      id: 'r2',
      waypoints: [slow1, slow2],
      stops: [stopAt('y', 1)],
    });
    const slowSite = withSite([slowRoute]);
    const slowSummary = divePlanSummary(slowRoute, slowSite);
    expect(slowSummary.segments[0]!.verticalRateMPerMin).toBe(-MAX_ASCENT_RATE_M_PER_MIN);
    expect(slowSummary.segments[0]!.rapidAscent).toBe(false);
  });

  it('flags MOD-exceeded when segment depth crosses the gas mix MOD', () => {
    // EAN36 has MOD ≈ 28.9 m at PPO2 1.4. A 32 m waypoint blows past that.
    const wp1 = { id: 'a', kind: 'free' as const, x: 0, y: 0, depthM: 10 };
    const wp2 = { id: 'b', kind: 'free' as const, x: 50, y: 0, depthM: 32 };
    const route = makeRoute({
      waypoints: [wp1, wp2],
      stops: [stopAt('b', 1)],
      gas: { ...defaultGasPlan(), fo2: 0.36 },
    });
    const site = withSite([route]);

    const s = divePlanSummary(route, site);
    expect(s.segments[0]!.modExceeded).toBe(true);
    expect(s.warnings.some((w) => w.kind === 'mod-exceeded' && w.segmentIdx === 0)).toBe(true);
    // Sanity: same route on air should not trigger MOD (air's MOD is 56.7 m).
    const airRoute = makeRoute({
      ...route,
      id: 'r-air',
      gas: { ...defaultGasPlan(), fo2: FO2_AIR },
    });
    const airSummary = divePlanSummary(airRoute, withSite([airRoute]));
    expect(airSummary.segments[0]!.modExceeded).toBe(false);
  });

  it('respects an override gas plan (used by viewer-side "Plan this dive")', () => {
    const wp1 = { id: 'a', kind: 'free' as const, x: 0, y: 0, depthM: 10 };
    const wp2 = { id: 'b', kind: 'free' as const, x: 30, y: 0, depthM: 10 };
    const route = makeRoute({
      waypoints: [wp1, wp2],
      stops: [stopAt('b', 5)],
      gas: defaultGasPlan(),
    });
    const site = withSite([route]);

    // With default gas the route fits comfortably; with a tiny cylinder it won't.
    const tinyTank = { ...defaultGasPlan(), cylinderL: 1.0, startBarPressure: 50 };
    const overridden = divePlanSummary(route, site, tinyTank);
    const baseline = divePlanSummary(route, site);
    expect(overridden.totalAirBar).toBeGreaterThan(baseline.totalAirBar);
    expect(overridden.warnings.some((w) => w.kind === 'reserve')).toBe(true);
  });
});
