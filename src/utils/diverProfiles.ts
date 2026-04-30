/**
 * Local-storage management for diver gas profiles. The viewer's "Plan this
 * dive" panel reads from these profiles instead of a single anonymous gas
 * plan, so a user can keep multiple presets (e.g. "AL80 / single tank",
 * "Twin 12L tech") and switch between them in one click.
 */

import { defaultGasPlan } from '../domain/divePlan';
import { FO2_AIR, type GasPlan } from '../domain/types';

export interface DiverProfile {
  id: string;
  name: string;
  gas: GasPlan;
}

const PROFILES_KEY = 'dive-mapping:diver-profiles';
const ACTIVE_KEY = 'dive-mapping:diver-profile-active';
/** Legacy single-profile store used before this module existed. */
const LEGACY_GAS_KEY = 'dive-mapping:viewer-gas';

function isValidGas(g: unknown): g is GasPlan {
  if (!g || typeof g !== 'object') return false;
  const o = g as Record<string, unknown>;
  // fo2 is optional here — older profiles predate the Nitrox feature and get
  // air (0.21) backfilled in `withFo2`. Anything else missing means the blob
  // is too broken to use.
  return (
    typeof o.sacLPerMin === 'number' &&
    typeof o.cylinderL === 'number' &&
    typeof o.startBarPressure === 'number' &&
    typeof o.reserveBarPressure === 'number' &&
    typeof o.transitSpeedMPerMin === 'number' &&
    typeof o.rulePolicy === 'string'
  );
}

function isValidProfile(p: unknown): p is DiverProfile {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    isValidGas((o as { gas: unknown }).gas)
  );
}

/** Ensure a parsed gas object carries an `fo2` value — defaults to air. */
function withFo2(g: GasPlan): GasPlan {
  return typeof g.fo2 === 'number' ? g : { ...g, fo2: FO2_AIR };
}

/** Read the saved profiles, migrating from the legacy single-profile store
 *  on first run. Always returns at least one profile so the picker has
 *  something to show. */
export function loadDiverProfiles(): DiverProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(isValidProfile);
        if (valid.length > 0) {
          // Backfill fo2 on profiles saved before the Nitrox feature shipped.
          return valid.map((p) => ({ ...p, gas: withFo2(p.gas) }));
        }
      }
    }
  } catch {
    // localStorage unavailable or JSON corrupt — fall through to seeding.
  }

  // Legacy: a single anonymous gas plan. Migrate it as "Default".
  try {
    const legacy = localStorage.getItem(LEGACY_GAS_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed && typeof parsed === 'object') {
        const gas: GasPlan = { ...defaultGasPlan(), ...parsed };
        const profile: DiverProfile = {
          id: cryptoRandomId(),
          name: 'Default',
          gas,
        };
        saveDiverProfiles([profile]);
        // Don't drop the legacy entry — it's harmless and keeps backward
        // compatibility if the user rolls back.
        return [profile];
      }
    }
  } catch {
    // ignore — fall through to seed
  }

  const seed: DiverProfile = {
    id: cryptoRandomId(),
    name: 'Default',
    gas: defaultGasPlan(),
  };
  saveDiverProfiles([seed]);
  return [seed];
}

export function saveDiverProfiles(profiles: DiverProfile[]): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // ignore
  }
}

export function loadActiveProfileId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveProfileId(id: string | null): void {
  try {
    if (id == null) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // ignore
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Cheap fallback — only reached in environments without WebCrypto.
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
