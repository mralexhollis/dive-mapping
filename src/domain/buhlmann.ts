/**
 * Bühlmann ZHL-16C tissue loading + deco ceiling.
 *
 * Used to compute the depth ceiling that arises during a dive: as nitrogen
 * loads into the diver's tissues, certain compartments may exceed the
 * ambient pressure they can tolerate at the surface, producing a depth
 * shallower than which the diver cannot ascend without risking DCI.
 *
 * Implementation notes:
 * - Nitrogen only. Helium is ignored (rec air + Nitrox); FN2 = 1 − FO2.
 * - Constant-depth Haldane integration over short timesteps. Accurate
 *   enough for visualisation; sidesteps the full Schreiner equation.
 * - Initial tissue state: long surface interval breathing air → all
 *   compartments saturated at sea-level alveolar N2.
 * - GF 100/100 (raw M-values, no conservatism). Aggressive but matches
 *   what the model literally says — divers wanting a buffer should add
 *   their own margin on top of what this reports.
 */

const N2_HALF_TIMES_MIN = [
  4.0, 8.0, 12.5, 18.5, 27.0, 38.3, 54.3, 77.0,
  109.0, 146.0, 187.0, 239.0, 305.0, 390.0, 498.0, 635.0,
] as const;

const N2_A = [
  1.2599, 1.0, 0.8618, 0.7562, 0.6667, 0.5933, 0.5282, 0.4701,
  0.4187, 0.3798, 0.3497, 0.3223, 0.2971, 0.2737, 0.2523, 0.2327,
] as const;

const N2_B = [
  0.505, 0.6514, 0.7222, 0.7825, 0.8126, 0.8434, 0.8693, 0.891,
  0.9092, 0.9222, 0.9319, 0.9403, 0.9477, 0.9544, 0.9602, 0.9653,
] as const;

export const COMPARTMENTS = N2_HALF_TIMES_MIN.length;

/** Alveolar water-vapor partial pressure (bar) — subtracted from ambient. */
const WATER_VAPOR_BAR = 0.0627;

/** Saltwater-style: 1 bar at surface + 1 bar per 10 m. */
function ambientPressureBar(depthM: number): number {
  return 1 + Math.max(0, depthM) / 10;
}

function ambientPressureToDepthM(pAmbBar: number): number {
  return Math.max(0, (pAmbBar - 1) * 10);
}

/** Inspired N2 partial pressure at depth, accounting for alveolar water vapor. */
function inspiredN2Bar(depthM: number, fo2: number): number {
  const fn2 = Math.max(0, 1 - fo2);
  const pAmb = ambientPressureBar(depthM);
  return Math.max(0, (pAmb - WATER_VAPOR_BAR) * fn2);
}

/**
 * Initial tissue loadings — assumes a long surface interval breathing air,
 * so each compartment sits at the alveolar N2 partial pressure at sea level.
 */
export function initialTissueLoadings(): number[] {
  const surface = inspiredN2Bar(0, 0.21);
  return new Array(COMPARTMENTS).fill(surface);
}

/**
 * One Haldane integration step at constant depth + gas mix for `dtMin`
 * minutes. Returns a fresh array of tissue loadings (caller's array is not
 * mutated).
 */
export function stepTissueLoadings(
  loadings: number[],
  depthM: number,
  fo2: number,
  dtMin: number,
): number[] {
  const pIns = inspiredN2Bar(depthM, fo2);
  const next = new Array<number>(COMPARTMENTS);
  for (let i = 0; i < COMPARTMENTS; i++) {
    const k = Math.LN2 / N2_HALF_TIMES_MIN[i]!;
    const pPrev = loadings[i]!;
    next[i] = pIns + (pPrev - pIns) * Math.exp(-k * dtMin);
  }
  return next;
}

/**
 * Deco ceiling depth (m) for the given tissue loadings, using raw ZHL-16C
 * M-values (GF 100/100). The ceiling is the deepest of the 16 compartment
 * ceilings — the most-saturated compartment dictates.
 *
 * For each compartment the minimum ambient pressure tolerated is
 *   P_amb_min = (P_t − a) × b
 * (Bühlmann's original formulation). The ceiling depth is the max of the
 * per-compartment values, clamped at 0 m.
 */
export function ceilingDepthM(loadings: number[]): number {
  let maxAmb = 0;
  for (let i = 0; i < COMPARTMENTS; i++) {
    const pAmbMin = (loadings[i]! - N2_A[i]!) * N2_B[i]!;
    if (pAmbMin > maxAmb) maxAmb = pAmbMin;
  }
  return ambientPressureToDepthM(maxAmb);
}
