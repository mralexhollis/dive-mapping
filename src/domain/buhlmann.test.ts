import { describe, expect, it } from 'vitest';
import {
  ceilingDepthM,
  COMPARTMENTS,
  initialTissueLoadings,
  stepTissueLoadings,
} from './buhlmann';

const FO2_AIR = 0.21;

/**
 * Step the tissues for `totalMin` minutes at constant `depthM` on the
 * given mix, returning the final loadings. Convenience helper for tests
 * that want to skip past the Haldane integration to the resulting state.
 */
function settleAt(depthM: number, fo2: number, totalMin: number, dtMin = 0.1): number[] {
  let l = initialTissueLoadings();
  const steps = Math.round(totalMin / dtMin);
  for (let i = 0; i < steps; i++) l = stepTissueLoadings(l, depthM, fo2, dtMin);
  return l;
}

describe('initialTissueLoadings', () => {
  it('seeds 16 compartments at sea-level alveolar N2 partial pressure', () => {
    const l = initialTissueLoadings();
    expect(l.length).toBe(COMPARTMENTS);
    // (1 − 0.0627) × 0.79 ≈ 0.7404 bar — the standard surface value.
    expect(l.every((p) => Math.abs(p - 0.7404) < 1e-3)).toBe(true);
  });
});

describe('ceilingDepthM', () => {
  it('is 0 at the initial surface state', () => {
    expect(ceilingDepthM(initialTissueLoadings())).toBe(0);
  });

  it('stays at 0 after a brief shallow dive', () => {
    // 5 minutes at 10 m on air — well within any rec table NDL.
    const l = settleAt(10, FO2_AIR, 5);
    expect(ceilingDepthM(l)).toBe(0);
  });

  it('rises above the surface after a long deep exposure', () => {
    // 40 min at 40 m on air saturates the fast compartments past their
    // surface M-values — there should be a real obligation.
    const l = settleAt(40, FO2_AIR, 40);
    expect(ceilingDepthM(l)).toBeGreaterThan(0);
  });

  it('recedes back toward the surface as the diver off-gases at shallow depth', () => {
    let l = settleAt(40, FO2_AIR, 40);
    const ceilingDeep = ceilingDepthM(l);
    expect(ceilingDeep).toBeGreaterThan(0);
    // Spend 30 min at 5 m breathing air — the fast compartments should
    // shed enough nitrogen for the ceiling to drop by a meaningful amount.
    const steps = Math.round(30 / 0.1);
    for (let i = 0; i < steps; i++) l = stepTissueLoadings(l, 5, FO2_AIR, 0.1);
    const ceilingShallow = ceilingDepthM(l);
    expect(ceilingShallow).toBeLessThan(ceilingDeep);
  });
});

describe('stepTissueLoadings', () => {
  it('approaches the inspired N2 partial pressure asymptotically', () => {
    // After many half-times at constant depth every compartment should sit
    // at the inspired N2 partial pressure for that depth and mix. The slowest
    // ZHL-16C compartment is 635 min, so 10 000 min is ~16 half-times — well
    // past the noise floor for a 1e-3 bar tolerance.
    const fo2 = FO2_AIR;
    const depthM = 30;
    const expectedInspired = (1 + 30 / 10 - 0.0627) * (1 - fo2); // ≈ 3.1105
    let l = initialTissueLoadings();
    const dtMin = 1; // coarser step is fine — analytical Haldane is exact at any dt
    const steps = Math.round(10000 / dtMin);
    for (let i = 0; i < steps; i++) l = stepTissueLoadings(l, depthM, fo2, dtMin);
    expect(l.every((p) => Math.abs(p - expectedInspired) < 1e-3)).toBe(true);
  });

  it('does not mutate the input loadings array', () => {
    const before = initialTissueLoadings();
    const snapshot = [...before];
    stepTissueLoadings(before, 30, FO2_AIR, 1.0);
    expect(before).toEqual(snapshot);
  });
});
