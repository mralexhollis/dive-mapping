import {
  ceilingDepthM,
  initialTissueLoadings,
  stepTissueLoadings,
} from './buhlmann';
import { distance } from './geometry';
import {
  FO2_AIR,
  PPO2_MAX_WORKING,
  type GasPlan,
  type GasRulePolicy,
  type POI,
  type Point,
  type Route,
  type Site,
  type Stop,
  type UUID,
  type Waypoint,
} from './types';

export const MAX_ASCENT_RATE_M_PER_MIN = 9;
export const MAX_DESCENT_RATE_M_PER_MIN = 18;

/** Step size for Bühlmann integration along the planned depth profile. */
const CEILING_SAMPLE_DT_MIN = 0.1;

export function defaultGasPlan(): GasPlan {
  return {
    sacLPerMin: 20,
    cylinderL: 12,
    startBarPressure: 210,
    reserveBarPressure: 50,
    rulePolicy: 'thirds',
    transitSpeedMPerMin: 9,
    fo2: FO2_AIR,
  };
}

/**
 * Maximum operating depth (MOD) in metres for a given gas mix at a given
 * partial-pressure-of-O2 ceiling. Below the smallest practical FO2 the
 * formula returns Infinity (any depth is fine — but the app clamps FO2 to
 * `FO2_MIN` so this only fires for unusual data).
 */
export function maxOperatingDepthM(fo2: number, ppo2Max = PPO2_MAX_WORKING): number {
  if (!Number.isFinite(fo2) || fo2 <= 0) return Infinity;
  return (ppo2Max / fo2 - 1) * 10;
}

/**
 * Equivalent air depth (EAD) in metres for a Nitrox mix breathed at a given
 * actual depth. Used to look up an NDL from the air RDP table — a Nitrox
 * mix at 20 m has the same nitrogen loading as air at the (shallower) EAD.
 * Returns the actual depth unchanged for FO2 ≤ 0.21 (air or hypoxic).
 *
 * EAD = (1 − FO2) / 0.79 × (depth + 10) − 10
 */
export function equivalentAirDepthM(actualDepthM: number, fo2: number): number {
  if (!Number.isFinite(fo2) || fo2 <= FO2_AIR) return actualDepthM;
  const ead = ((1 - fo2) / 0.79) * (actualDepthM + 10) - 10;
  return Math.max(0, ead);
}

export function segmentDistanceM(
  a: Point,
  b: Point,
  scaleMetersPerUnit: number,
): number {
  return distance(a, b) * scaleMetersPerUnit;
}

function poiById(pois: POI[], id: UUID): POI | undefined {
  return pois.find((p) => p.id === id);
}

/**
 * World-space position of a waypoint. POI-ref waypoints inherit their
 * referenced POI's `position`; free waypoints carry their own `{x, y}`.
 * Returns null if the reference can't be resolved.
 */
export function waypointPosition(wp: Waypoint, sitePOIs: POI[]): Point | null {
  if (wp.kind === 'free') return { x: wp.x, y: wp.y };
  const ref = poiById(sitePOIs, wp.poiRefId);
  if (!ref?.position) return null;
  return { ...ref.position };
}

export function waypointDepth(wp: Waypoint, sitePOIs: POI[]): number | undefined {
  if (wp.kind === 'free') return wp.depthM;
  const override = wp.depthOverrideM;
  if (typeof override === 'number') return override;
  const ref = poiById(sitePOIs, wp.poiRefId);
  return ref?.depth;
}

export function segmentAvgDepth(
  a: Waypoint,
  b: Waypoint,
  sitePOIs: POI[],
): number {
  const da = waypointDepth(a, sitePOIs);
  const db = waypointDepth(b, sitePOIs);
  const va = typeof da === 'number' ? da : 0;
  const vb = typeof db === 'number' ? db : 0;
  return (va + vb) / 2;
}

/**
 * Segment time = transit time (distance ÷ speed) + total time of any stops
 * attached to the destination waypoint.
 */
export function segmentTimeMin(
  distanceM: number,
  transitSpeedMPerMin: number,
  stopsAtDestMin = 0,
): number {
  const transit = transitSpeedMPerMin > 0 ? distanceM / transitSpeedMPerMin : 0;
  return transit + stopsAtDestMin;
}

/** Total stop duration (in minutes) attached to a given waypoint. */
export function stopsAtWaypointMin(stops: Stop[], waypointId: UUID): number {
  let total = 0;
  for (const s of stops) {
    if (s.waypointId === waypointId) total += Math.max(0, s.durationMin);
  }
  return total;
}

/**
 * Air consumed during a segment, expressed in cylinder bar drop. Uses the
 * standard surface-equivalent formula: SAC × (1 + depth/10) × time gives
 * litres consumed at the surface; divide by cylinder L to get bar.
 */
export function gasConsumedBar(
  distanceM: number,
  depthM: number,
  gas: GasPlan,
  stopsAtDestMin = 0,
): number {
  const timeMin = segmentTimeMin(distanceM, gas.transitSpeedMPerMin, stopsAtDestMin);
  const ata = 1 + Math.max(0, depthM) / 10;
  const litres = gas.sacLPerMin * ata * timeMin;
  return litres / gas.cylinderL;
}

export function turnPressure(
  startBar: number,
  reserveBar: number,
  policy: GasRulePolicy,
): number {
  const usable = Math.max(0, startBar - reserveBar);
  switch (policy) {
    case 'thirds':
      return startBar - usable / 3;
    case 'half':
      return startBar - usable / 2;
    case 'all-usable':
      return reserveBar;
  }
}

export type DivePlanWarningKind =
  | 'ceiling-violation'
  | 'reserve'
  | 'unresolved-poi'
  | 'no-depth'
  | 'rapid-ascent'
  | 'rapid-descent'
  | 'mod-exceeded';

export interface DivePlanWarning {
  kind: DivePlanWarningKind;
  segmentIdx?: number;
  message: string;
}

export interface DivePlanSegmentMetrics {
  fromId: UUID;
  toId: UUID;
  distanceM: number;
  fromDepthM: number;
  toDepthM: number;
  avgDepthM: number;
  /** Deepest point hit during the segment — the larger of from/to depth. */
  maxDepthM: number;
  timeMin: number;
  /** Vertical rate in m/min — positive = descending, negative = ascending. */
  verticalRateMPerMin: number;
  airBar: number;
  cumulativeAirBar: number;
  remainingAirBar: number;
  rapidAscent: boolean;
  rapidDescent: boolean;
  /** True when the segment's max depth exceeds the gas mix's MOD. */
  modExceeded: boolean;
}

/**
 * One sample of the planned dive's depth profile and the Bühlmann deco
 * ceiling at that moment. `ceilingM` is 0 until tissue loadings make the
 * ceiling rise from the surface; `violation` is true wherever the planned
 * depth is shallower than the ceiling.
 */
export interface CeilingSample {
  tMin: number;
  depthM: number;
  ceilingM: number;
  violation: boolean;
}

export interface CeilingViolationRange {
  startMin: number;
  endMin: number;
  /** Largest difference (ceiling − depth) seen during the breach, in metres. */
  maxBreachM: number;
}

export interface DivePlanSummary {
  totalDistanceM: number;
  totalTimeMin: number;
  totalAirBar: number;
  remainingBar: number;
  turnPressureBar: number;
  /** Index of the first segment whose cumulative consumption crosses the turn pressure. */
  turnAtSegmentIdx: number | null;
  /** Maximum operating depth in metres at PPO2 1.4 for the route's gas mix. */
  modM: number;
  warnings: DivePlanWarning[];
  segments: DivePlanSegmentMetrics[];
  /**
   * Bühlmann ZHL-16C ceiling sampled along the planned profile (every
   * {@link CEILING_SAMPLE_DT_MIN} minutes). Empty when there are no segments.
   */
  ceilingSamples: CeilingSample[];
  /** Consolidated time ranges where the planned depth was above the ceiling. */
  ceilingViolations: CeilingViolationRange[];
}

/**
 * Build a per-segment dive metrics summary for a route. Pure / deterministic;
 * safe to call on every render. The gas plan can be overridden — used by the
 * viewer's "Plan this dive" panel to evaluate the route against the diver's
 * own SAC/cylinder/pressure without modifying the route.
 */
export function divePlanSummary(
  route: Route,
  site: Site,
  gasOverride?: GasPlan,
): DivePlanSummary {
  const pois = site.layers.poi.pois;
  const scale = site.meta.scaleMetersPerUnit ?? 1;
  const gas = gasOverride ?? route.gas;
  const stops = route.stops ?? [];
  const segments: DivePlanSegmentMetrics[] = [];
  const warnings: DivePlanWarning[] = [];

  let cumulativeAirBar = 0;
  let totalDistanceM = 0;
  let totalTimeMin = 0;
  let turnAtSegmentIdx: number | null = null;
  const turnBar = turnPressure(
    gas.startBarPressure,
    gas.reserveBarPressure,
    gas.rulePolicy,
  );
  // Default to air for legacy/incomplete data so existing routes keep behaving
  // exactly as they did before fo2 was added.
  const fo2 = Number.isFinite(gas.fo2) ? gas.fo2 : FO2_AIR;
  const modM = maxOperatingDepthM(fo2);

  for (let i = 0; i < route.waypoints.length - 1; i++) {
    const a = route.waypoints[i]!;
    const b = route.waypoints[i + 1]!;

    const aPos = waypointPosition(a, pois);
    const bPos = waypointPosition(b, pois);
    if (!aPos || !bPos) {
      warnings.push({
        kind: 'unresolved-poi',
        segmentIdx: i,
        message: `Segment ${i + 1}: a waypoint references a POI that no longer exists or has no position.`,
      });
      continue;
    }

    const aDepth = waypointDepth(a, pois);
    const bDepth = waypointDepth(b, pois);
    if (aDepth == null || bDepth == null) {
      warnings.push({
        kind: 'no-depth',
        segmentIdx: i,
        message: `Segment ${i + 1}: missing depth on a waypoint — depth treated as 0 m for math.`,
      });
    }
    const fromDepthM = aDepth ?? 0;
    const toDepthM = bDepth ?? 0;
    const avgDepthM = (fromDepthM + toDepthM) / 2;
    const maxDepthM = Math.max(fromDepthM, toDepthM);

    const distanceM = segmentDistanceM(aPos, bPos, scale);
    const stopsAtDest = stopsAtWaypointMin(stops, b.id);
    const timeMin = segmentTimeMin(distanceM, gas.transitSpeedMPerMin, stopsAtDest);
    const airBar = gasConsumedBar(distanceM, avgDepthM, gas, stopsAtDest);
    cumulativeAirBar += airBar;
    const remainingAirBar = gas.startBarPressure - cumulativeAirBar;

    const verticalRateMPerMin = timeMin > 0 ? (toDepthM - fromDepthM) / timeMin : 0;
    const rapidAscent = -verticalRateMPerMin > MAX_ASCENT_RATE_M_PER_MIN;
    const rapidDescent = verticalRateMPerMin > MAX_DESCENT_RATE_M_PER_MIN;
    const modExceeded = Number.isFinite(modM) && maxDepthM > modM;

    if (rapidAscent) {
      warnings.push({
        kind: 'rapid-ascent',
        segmentIdx: i,
        message: `Segment ${i + 1}: ascent rate ${(-verticalRateMPerMin).toFixed(1)} m/min exceeds limit ${MAX_ASCENT_RATE_M_PER_MIN} m/min.`,
      });
    }
    if (rapidDescent) {
      warnings.push({
        kind: 'rapid-descent',
        segmentIdx: i,
        message: `Segment ${i + 1}: descent rate ${verticalRateMPerMin.toFixed(1)} m/min exceeds limit ${MAX_DESCENT_RATE_M_PER_MIN} m/min.`,
      });
    }
    if (modExceeded) {
      warnings.push({
        kind: 'mod-exceeded',
        segmentIdx: i,
        message: `Segment ${i + 1}: depth ${maxDepthM.toFixed(1)} m exceeds MOD ${modM.toFixed(1)} m at ${(fo2 * 100).toFixed(0)}% O₂.`,
      });
    }

    if (turnAtSegmentIdx == null && gas.startBarPressure - cumulativeAirBar <= turnBar) {
      turnAtSegmentIdx = i;
    }

    segments.push({
      fromId: a.id,
      toId: b.id,
      distanceM,
      fromDepthM,
      toDepthM,
      avgDepthM,
      maxDepthM,
      timeMin,
      verticalRateMPerMin,
      airBar,
      cumulativeAirBar,
      remainingAirBar,
      rapidAscent,
      rapidDescent,
      modExceeded,
    });

    totalDistanceM += distanceM;
    totalTimeMin += timeMin;
  }

  const totalAirBar = cumulativeAirBar;
  const remainingBar = gas.startBarPressure - totalAirBar;
  if (remainingBar < gas.reserveBarPressure) {
    warnings.push({
      kind: 'reserve',
      message: `Plan ends below reserve: ${remainingBar.toFixed(0)} bar remaining vs ${gas.reserveBarPressure} bar reserve.`,
    });
  }

  // Bühlmann ZHL-16C ceiling simulation along the planned profile. Runs
  // after segment metrics are known so the time-depth function is fully
  // determined; pushes any violation ranges as warnings.
  const { samples: ceilingSamples, violations: ceilingViolations } =
    simulateCeilingProfile(segments, stops, fo2);
  for (const v of ceilingViolations) {
    warnings.push({
      kind: 'ceiling-violation',
      message: `Deco ceiling breached from ${v.startMin.toFixed(1)} to ${v.endMin.toFixed(1)} min — ascent reached up to ${v.maxBreachM.toFixed(1)} m above the ceiling.`,
    });
  }

  return {
    totalDistanceM,
    totalTimeMin,
    totalAirBar,
    remainingBar,
    turnPressureBar: turnBar,
    turnAtSegmentIdx,
    modM,
    warnings,
    segments,
    ceilingSamples,
    ceilingViolations,
  };
}

/**
 * Simulate the Bühlmann ZHL-16C deco ceiling along the planned profile.
 *
 * Builds a piecewise-linear depth(t) function from the segments + stops,
 * then samples it every {@link CEILING_SAMPLE_DT_MIN} minutes. At each
 * sample, applies a Haldane integration step to the 16 tissue compartments
 * and computes the ceiling depth.
 *
 * Returns regularly-spaced samples for the chart, plus consolidated time
 * ranges where the planned depth rose above the ceiling (= violations).
 */
function simulateCeilingProfile(
  segments: DivePlanSegmentMetrics[],
  stops: Stop[],
  fo2: number,
): { samples: CeilingSample[]; violations: CeilingViolationRange[] } {
  if (segments.length === 0) return { samples: [], violations: [] };

  // Build (tMin, depthM) breakpoints: start, then per segment a transit
  // endpoint and (if there's a stop at the destination waypoint) a stop
  // endpoint.
  const breakpoints: Array<{ t: number; depth: number }> = [];
  breakpoints.push({ t: 0, depth: segments[0]!.fromDepthM });
  let t = 0;
  for (const seg of segments) {
    const stopMin = stopsAtWaypointMin(stops, seg.toId);
    const transitMin = Math.max(0, seg.timeMin - stopMin);
    const transitT = t + transitMin;
    breakpoints.push({ t: transitT, depth: seg.toDepthM });
    t = transitT;
    if (stopMin > 0) {
      t += stopMin;
      breakpoints.push({ t, depth: seg.toDepthM });
    }
  }
  const totalT = t;
  if (totalT <= 0) return { samples: [], violations: [] };

  /** Linear-interp depth at any time within the breakpoints. */
  const depthAt = (queryT: number): number => {
    if (queryT <= breakpoints[0]!.t) return breakpoints[0]!.depth;
    for (let i = 1; i < breakpoints.length; i++) {
      const a = breakpoints[i - 1]!;
      const b = breakpoints[i]!;
      if (queryT <= b.t) {
        const span = b.t - a.t;
        if (span <= 0) return b.depth;
        const ratio = (queryT - a.t) / span;
        return a.depth + (b.depth - a.depth) * ratio;
      }
    }
    return breakpoints[breakpoints.length - 1]!.depth;
  };

  // Step the simulation. Use the depth at the START of each step as the
  // constant-depth approximation for that step (good enough at 0.1 min).
  let loadings = initialTissueLoadings();
  const samples: CeilingSample[] = [];
  const violations: CeilingViolationRange[] = [];
  let activeViolation: CeilingViolationRange | null = null;
  const stepCount = Math.max(1, Math.ceil(totalT / CEILING_SAMPLE_DT_MIN));
  for (let i = 0; i <= stepCount; i++) {
    const sampleT = Math.min(totalT, i * CEILING_SAMPLE_DT_MIN);
    const depth = depthAt(sampleT);
    const ceil = ceilingDepthM(loadings);
    const violation = depth < ceil - 1e-6;
    samples.push({ tMin: sampleT, depthM: depth, ceilingM: ceil, violation });
    if (violation) {
      const breach = ceil - depth;
      if (activeViolation == null) {
        activeViolation = { startMin: sampleT, endMin: sampleT, maxBreachM: breach };
      } else {
        activeViolation.endMin = sampleT;
        if (breach > activeViolation.maxBreachM) activeViolation.maxBreachM = breach;
      }
    } else if (activeViolation != null) {
      violations.push(activeViolation);
      activeViolation = null;
    }
    if (i < stepCount) loadings = stepTissueLoadings(loadings, depth, fo2, CEILING_SAMPLE_DT_MIN);
  }
  if (activeViolation != null) violations.push(activeViolation);

  return { samples, violations };
}
