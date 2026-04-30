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

/**
 * No-decompression limits in minutes, by depth in metres. Values approximate the
 * PADI Recreational Dive Planner air table for first dives. Depths shallower
 * than the smallest entry are treated as effectively unlimited.
 */
export const NDL_TABLE_M: ReadonlyArray<{ depthM: number; ndlMin: number }> = [
  { depthM: 12, ndlMin: 147 },
  { depthM: 15, ndlMin: 72 },
  { depthM: 18, ndlMin: 56 },
  { depthM: 21, ndlMin: 41 },
  { depthM: 24, ndlMin: 28 },
  { depthM: 27, ndlMin: 24 },
  { depthM: 30, ndlMin: 18 },
  { depthM: 33, ndlMin: 14 },
  { depthM: 36, ndlMin: 12 },
  { depthM: 39, ndlMin: 10 },
  { depthM: 42, ndlMin: 8 },
];

export const MAX_ASCENT_RATE_M_PER_MIN = 9;
export const MAX_DESCENT_RATE_M_PER_MIN = 18;

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

/**
 * Inverse of {@link ndlForDepth}: the depth ceiling at a given elapsed
 * bottom-time. Returns the depth at-or-below which staying any longer would
 * exceed NDL — divers must be SHALLOWER than this value. For times shorter
 * than the deepest tabled NDL (8 min at 42 m), there is no constraint within
 * the table and `Infinity` is returned. For times beyond the longest tabled
 * NDL (147 min at 12 m), the ceiling clamps at the shallowest tabled depth.
 *
 * The result is a staircase that drops monotonically as time accumulates,
 * making it easy to overlay on the depth profile as a visible "no-go" line.
 */
export function ndlCeilingDepthM(elapsedMin: number): number {
  if (elapsedMin <= 0) return Infinity;
  // Walk shallowest → deepest. The first entry whose NDL is at-or-below the
  // elapsed time marks the ceiling: the diver must stay shallower than this
  // depth. Equality counts (NDL of 8 min at 42 m means at exactly 8 min you
  // can no longer be at 42 m).
  for (let i = 0; i < NDL_TABLE_M.length; i++) {
    if (NDL_TABLE_M[i]!.ndlMin <= elapsedMin) return NDL_TABLE_M[i]!.depthM;
  }
  // Elapsed time is shorter than every tabled NDL — no ceiling within the table.
  return Infinity;
}

/**
 * Floor-look-up of NDL minutes for a given depth. Depths shallower than the
 * smallest tabled value return Infinity (no NDL pressure). Depths between
 * entries take the next-deeper entry's value (more conservative).
 */
export function ndlForDepth(depthM: number): number {
  if (depthM < NDL_TABLE_M[0]!.depthM) return Infinity;
  for (let i = NDL_TABLE_M.length - 1; i >= 0; i--) {
    const entry = NDL_TABLE_M[i]!;
    if (depthM >= entry.depthM) return entry.ndlMin;
  }
  return NDL_TABLE_M[NDL_TABLE_M.length - 1]!.ndlMin;
}

export type DivePlanWarningKind =
  | 'ndl'
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
  /**
   * NDL minutes for this segment — looked up against the segment's
   * equivalent air depth so Nitrox mixes earn longer bottom times.
   */
  ndlMin: number;
  ndlExceeded: boolean;
  rapidAscent: boolean;
  rapidDescent: boolean;
  /** True when the segment's max depth exceeds the gas mix's MOD. */
  modExceeded: boolean;
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
    // Look up NDL against the segment's equivalent air depth so a Nitrox
    // mix earns the longer bottom time the table promises.
    const eadM = equivalentAirDepthM(avgDepthM, fo2);
    const ndlMin = ndlForDepth(eadM);
    // Use stops-at-dest as the "bottom time" charged against NDL for this segment.
    const ndlExceeded = stopsAtDest > ndlMin;
    const rapidAscent = -verticalRateMPerMin > MAX_ASCENT_RATE_M_PER_MIN;
    const rapidDescent = verticalRateMPerMin > MAX_DESCENT_RATE_M_PER_MIN;
    const modExceeded = Number.isFinite(modM) && maxDepthM > modM;

    if (ndlExceeded) {
      warnings.push({
        kind: 'ndl',
        segmentIdx: i,
        message: `Segment ${i + 1}: stops total ${stopsAtDest} min at ${avgDepthM.toFixed(1)} m exceed NDL ${ndlMin} min.`,
      });
    }
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
      ndlMin,
      ndlExceeded,
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
  };
}
