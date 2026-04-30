import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { defaultGasPlan, maxOperatingDepthM } from '../domain/divePlan';
import {
  FO2_MAX,
  FO2_MIN,
  type GasPlan,
  type GasRulePolicy,
} from '../domain/types';
import {
  loadActiveProfileId,
  loadDiverProfiles,
  saveActiveProfileId,
  saveDiverProfiles,
  type DiverProfile,
} from '../utils/diverProfiles';

/**
 * Dedicated page for managing diver gas profiles. The viewer's "Plan this
 * dive" panel and the route editor's reference-profile picker only let users
 * pick from this list — adding / editing / deleting profiles all happens
 * here so the lifecycle is in one place.
 */
export default function DiverProfilesPage() {
  const [profiles, setProfiles] = useState<DiverProfile[]>(() => loadDiverProfiles());
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveProfileId());

  useEffect(() => {
    saveDiverProfiles(profiles);
  }, [profiles]);

  useEffect(() => {
    saveActiveProfileId(activeId);
  }, [activeId]);

  const updateProfile = (id: string, fn: (p: DiverProfile) => DiverProfile) =>
    setProfiles((arr) => arr.map((p) => (p.id === id ? fn(p) : p)));

  const updateGas = (id: string, patch: Partial<GasPlan>) =>
    updateProfile(id, (p) => ({ ...p, gas: { ...p.gas, ...patch } }));

  const newProfile = () => {
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `profile-${Date.now()}`;
    const profile: DiverProfile = {
      id,
      name: `Profile ${profiles.length + 1}`,
      gas: defaultGasPlan(),
    };
    setProfiles((arr) => [...arr, profile]);
    setActiveId(id);
  };

  const removeProfile = (id: string) => {
    if (profiles.length <= 1) {
      window.alert("Can't delete the last profile.");
      return;
    }
    const target = profiles.find((p) => p.id === id);
    if (!target) return;
    if (!window.confirm(`Delete profile "${target.name}"?`)) return;
    const remaining = profiles.filter((p) => p.id !== id);
    setProfiles(remaining);
    if (activeId === id) setActiveId(remaining[0]?.id ?? null);
  };

  const resetProfileGas = (id: string) =>
    updateProfile(id, (p) => ({ ...p, gas: defaultGasPlan() }));

  return (
    <div className="flex h-full flex-col bg-water-50 text-water-900">
      <header className="flex items-center justify-between gap-2 border-b border-water-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="flex items-center justify-center rounded border border-water-200 px-2 py-1 text-water-700 hover:bg-water-100 hover:text-water-900"
            title="Back to sites"
            aria-label="Back to sites"
          >
            <HomeIcon />
          </Link>
          <span className="text-xs text-water-400">/</span>
          <span className="truncate text-sm font-semibold text-water-900">Diver profiles</span>
        </div>
        <button
          type="button"
          onClick={newProfile}
          className="rounded bg-water-600 px-3 py-1.5 text-sm text-white hover:bg-water-700"
        >
          + New profile
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-6">
          <p className="mb-4 text-xs text-water-700">
            Profiles are stored locally on this device. The viewer's "Plan this
            dive" panel and the route editor's feasibility check both read
            from this list — pick a profile in those screens to apply its
            values.
          </p>
          {profiles.length === 0 ? (
            <div className="rounded border border-dashed border-water-300 bg-white p-10 text-center text-sm text-water-700">
              No profiles yet. Click <span className="font-semibold">+ New profile</span> to add one.
            </div>
          ) : (
            <ul className="space-y-3">
              {profiles.map((p) => (
                <ProfileCard
                  key={p.id}
                  profile={p}
                  isActive={p.id === activeId}
                  canDelete={profiles.length > 1}
                  onSetActive={() => setActiveId(p.id)}
                  onRename={(name) => updateProfile(p.id, (x) => ({ ...x, name }))}
                  onUpdateGas={(patch) => updateGas(p.id, patch)}
                  onResetGas={() => resetProfileGas(p.id)}
                  onDelete={() => removeProfile(p.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

interface ProfileCardProps {
  profile: DiverProfile;
  isActive: boolean;
  canDelete: boolean;
  onSetActive: () => void;
  onRename: (name: string) => void;
  onUpdateGas: (patch: Partial<GasPlan>) => void;
  onResetGas: () => void;
  onDelete: () => void;
}

function ProfileCard({
  profile,
  isActive,
  canDelete,
  onSetActive,
  onRename,
  onUpdateGas,
  onResetGas,
  onDelete,
}: ProfileCardProps) {
  return (
    <li
      className={`rounded border bg-white p-4 shadow-sm ${
        isActive ? 'border-water-500 ring-1 ring-water-200' : 'border-water-200'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={profile.name}
          onChange={(e) => onRename(e.target.value)}
          className="min-w-0 flex-1 rounded border border-water-200 px-2 py-1 text-sm font-semibold text-water-900 focus:border-water-400 focus:outline-none"
          aria-label="Profile name"
        />
        {isActive ? (
          <span
            className="rounded bg-water-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-water-700"
            title="Currently active in the viewer"
          >
            Active
          </span>
        ) : (
          <button
            type="button"
            onClick={onSetActive}
            className="rounded border border-water-300 px-2 py-1 text-xs text-water-900 hover:bg-water-100"
            title="Make this the default in the viewer"
          >
            Set active
          </button>
        )}
        <button
          type="button"
          onClick={onResetGas}
          className="rounded border border-water-200 px-2 py-1 text-xs text-water-700 hover:bg-water-100"
          title="Reset the gas values to the application defaults"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-water-200 disabled:text-water-300"
          title={canDelete ? 'Delete this profile' : "Can't delete the last profile"}
        >
          Delete
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumberField
          label="SAC (L/min)"
          value={profile.gas.sacLPerMin}
          step={0.5}
          min={0.1}
          onChange={(v) => onUpdateGas({ sacLPerMin: v })}
        />
        <NumberField
          label="Cylinder (L)"
          value={profile.gas.cylinderL}
          step={0.1}
          min={0.1}
          onChange={(v) => onUpdateGas({ cylinderL: v })}
        />
        <NumberField
          label="Start (bar)"
          value={profile.gas.startBarPressure}
          step={1}
          min={1}
          onChange={(v) => onUpdateGas({ startBarPressure: v })}
        />
        <NumberField
          label="Reserve (bar)"
          value={profile.gas.reserveBarPressure}
          step={1}
          min={0}
          onChange={(v) => onUpdateGas({ reserveBarPressure: v })}
        />
        <NumberField
          label="Speed (m/min)"
          value={profile.gas.transitSpeedMPerMin}
          step={0.5}
          min={0.1}
          onChange={(v) => onUpdateGas({ transitSpeedMPerMin: v })}
        />
        <label className="flex flex-col text-xs text-water-700">
          <span className="mb-1">Rule</span>
          <select
            value={profile.gas.rulePolicy}
            onChange={(e) => onUpdateGas({ rulePolicy: e.target.value as GasRulePolicy })}
            className="rounded border border-water-200 px-2 py-1 text-sm text-water-900"
          >
            <option value="thirds">Thirds</option>
            <option value="half">Half</option>
            <option value="all-usable">All usable</option>
          </select>
        </label>
        <NumberField
          label="O₂ (%)"
          value={Math.round(profile.gas.fo2 * 100)}
          step={1}
          min={Math.round(FO2_MIN * 100)}
          max={Math.round(FO2_MAX * 100)}
          onChange={(percent) => onUpdateGas({ fo2: percent / 100 })}
        />
      </div>
      <NitroxReadout fo2={profile.gas.fo2} />
    </li>
  );
}

/**
 * One-line summary of the breathing-gas mix: the named mix (Air, EAN32…) and
 * its MOD at PPO2 1.4. Helps the user sanity-check the O₂ percentage they
 * just typed without leaving the profiles screen.
 */
function NitroxReadout({ fo2 }: { fo2: number }) {
  const percent = Math.round(fo2 * 100);
  const mod = maxOperatingDepthM(fo2);
  const mixName = percent === 21 ? 'Air' : `EAN${percent}`;
  return (
    <div className="mt-2 text-[11px] text-water-600">
      <span className="font-semibold text-water-700">{mixName}</span>
      {' · '}
      MOD {Number.isFinite(mod) ? `${mod.toFixed(1)} m` : '—'}
      <span className="ml-1 text-water-400">(PPO₂ 1.4)</span>
    </div>
  );
}

function NumberField({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col text-xs text-water-700">
      <span className="mb-1">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isFinite(v)) return;
          if (min != null && v < min) return;
          if (max != null && v > max) return;
          onChange(v);
        }}
        className="rounded border border-water-200 px-2 py-1 text-sm text-water-900"
      />
    </label>
  );
}

function HomeIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M 3 11 L 12 3 L 21 11" />
      <path d="M 5 10 V 21 H 19 V 10" />
      <path d="M 10 21 V 14 H 14 V 21" />
    </svg>
  );
}
