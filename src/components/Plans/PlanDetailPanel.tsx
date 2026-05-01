import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSiteStore } from '../../state/useSiteStore';
import type { DivePlanSummary } from '../../domain/divePlan';
import type { GasPlan, Route } from '../../domain/types';
import DepthTimeProfile from './DepthTimeProfile';
import {
  loadDiverProfiles,
  type DiverProfile,
} from '../../utils/diverProfiles';

interface PlanDetailPanelProps {
  route: Route;
  summary: DivePlanSummary;
}

/**
 * Right-column analytics for the route editor: feasibility check, summary,
 * profile chart, warnings, and notes. The combined waypoint+stop itinerary
 * lives in the left column ({@link Itinerary}).
 */
export default function PlanDetailPanel({ route, summary }: PlanDetailPanelProps) {
  const setRouteNotes = useSiteStore((s) => s.setRouteNotes);
  const updateRouteGas = useSiteStore((s) => s.updateRouteGas);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex flex-col gap-4 p-4">
        <FeasibilitySection route={route} summary={summary} updateGas={updateRouteGas} />

        <Section title="Summary">
          <SummaryGrid route={route} summary={summary} />
        </Section>

        <Section title="Profile">
          <DepthTimeProfile route={route} summary={summary} />
        </Section>

        {summary.warnings.length > 0 && (
          <Section title="Warnings">
            <ul className="space-y-1">
              {summary.warnings.map((w, i) => (
                <li
                  key={i}
                  className={`rounded border px-2 py-1 text-xs ${warningClass(w.kind)}`}
                >
                  {w.message}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Notes">
          <textarea
            value={route.notes ?? ''}
            onChange={(e) => setRouteNotes(route.id, e.target.value)}
            placeholder="Briefing notes, hazards, things to point out…"
            className="w-full min-h-[80px] rounded border border-water-200 p-2 text-sm text-water-900"
          />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-water-600">
        {title}
      </div>
      {children}
    </section>
  );
}

interface FeasibilitySectionProps {
  route: Route;
  summary: DivePlanSummary;
  updateGas: (id: string, patch: Partial<Route['gas']>) => void;
}

/**
 * Compact feasibility check — uses the route's reference gas profile to flag
 * whether the route fits within standard reserves. Not a personal dive plan;
 * the viewer-side panel lets each diver evaluate against their own gear.
 *
 * The reference profile itself is read-only here — the user picks from saved
 * diver profiles (managed on /profiles) so the lifecycle of those profiles
 * lives in one place.
 */
function FeasibilitySection({ route, summary, updateGas }: FeasibilitySectionProps) {
  // Diver profiles are stored in the same localStorage list the viewer uses,
  // so picking one here loads the same gas values the diver would dive with.
  const [profiles, setProfiles] = useState<DiverProfile[]>(() => loadDiverProfiles());

  // Refresh on focus (in case the user added or edited a profile on the
  // /profiles page between visits). Cheap — just re-reads localStorage.
  useEffect(() => {
    const onFocus = () => setProfiles(loadDiverProfiles());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Identify which profile (if any) the route's current gas matches exactly,
  // so the dropdown shows the right selection.
  const matchingProfileId = profiles.find((p) => gasesMatch(p.gas, route.gas))?.id ?? '';

  const onPickProfile = (profileId: string) => {
    const p = profiles.find((x) => x.id === profileId);
    if (!p) return;
    updateGas(route.id, { ...p.gas });
  };

  const ok = summary.remainingBar >= route.gas.reserveBarPressure;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-water-600">
          Feasibility
        </div>
        <Link
          to="/profiles"
          className="text-xs font-semibold text-water-600 hover:text-water-900"
          title="Manage diver profiles"
        >
          Manage profiles →
        </Link>
      </div>
      <div
        className={`rounded border px-3 py-2 text-xs ${
          ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
        }`}
      >
        {ok ? '✓ ' : '✗ '}
        Achievable on the reference profile (SAC {route.gas.sacLPerMin} L/min, {route.gas.cylinderL} L
        @ {route.gas.startBarPressure} bar)
        {' — '}
        {summary.remainingBar.toFixed(0)} bar remaining vs {route.gas.reserveBarPressure} bar reserve.
        <div className="mt-0.5 text-[11px] opacity-80">
          {mixLabel(route.gas.fo2)} · MOD {Number.isFinite(summary.modM) ? `${summary.modM.toFixed(1)} m` : '—'}
          {' · '}
          The diver can plug in their own gas plan from the viewer.
        </div>
      </div>
      <label className="mt-2 flex min-w-0 items-center gap-1 text-[11px] text-water-700">
        <span className="shrink-0">Diver profile</span>
        <select
          value={matchingProfileId}
          onChange={(e) => onPickProfile(e.target.value)}
          className="min-w-0 flex-1 rounded border border-water-200 px-2 py-1 text-xs text-water-900"
          title="Pick a saved diver profile to load its gas values into this route's reference profile"
        >
          <option value="" disabled>
            {matchingProfileId ? '' : 'Custom (no match)'}
          </option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function SummaryGrid({
  route,
  summary,
}: {
  route: Route;
  summary: DivePlanSummary;
}) {
  const turnLabel =
    summary.turnAtSegmentIdx != null
      ? `after WP ${summary.turnAtSegmentIdx + 1} → ${summary.turnAtSegmentIdx + 2}`
      : 'not reached';
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Stat label="Total distance" value={`${Math.round(summary.totalDistanceM)} m`} />
      <Stat label="Total time" value={`${summary.totalTimeMin.toFixed(1)} min`} />
      <Stat label="Total air" value={`${summary.totalAirBar.toFixed(1)} bar`} />
      <Stat
        label="Remaining"
        value={`${summary.remainingBar.toFixed(0)} bar`}
        warn={summary.remainingBar < route.gas.reserveBarPressure}
      />
      <Stat label="Turn pressure" value={`${Math.round(summary.turnPressureBar)} bar`} />
      <Stat label="Turn point" value={turnLabel} />
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={`rounded border px-3 py-2 ${
        warn ? 'border-red-300 bg-red-50' : 'border-water-200 bg-white'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-water-600">{label}</div>
      <div className={`text-sm font-semibold ${warn ? 'text-red-700' : 'text-water-900'}`}>{value}</div>
    </div>
  );
}

/**
 * Two gas plans match if every numeric field is within a small epsilon and
 * the rule policy is identical. Used so the profile dropdown can highlight
 * which named profile the route's current values came from.
 */
function gasesMatch(a: GasPlan, b: GasPlan): boolean {
  const eps = 0.001;
  const close = (x: number, y: number) => Math.abs(x - y) < eps;
  return (
    close(a.sacLPerMin, b.sacLPerMin) &&
    close(a.cylinderL, b.cylinderL) &&
    close(a.startBarPressure, b.startBarPressure) &&
    close(a.reserveBarPressure, b.reserveBarPressure) &&
    close(a.transitSpeedMPerMin, b.transitSpeedMPerMin) &&
    a.rulePolicy === b.rulePolicy
  );
}

function warningClass(kind: string): string {
  switch (kind) {
    case 'ceiling-violation':
    case 'rapid-ascent':
    case 'reserve':
    case 'mod-exceeded':
      return 'border-red-300 bg-red-50 text-red-700';
    case 'rapid-descent':
      return 'border-amber-300 bg-amber-50 text-amber-800';
    default:
      return 'border-water-200 bg-water-50 text-water-700';
  }
}

/** "Air" for 21 % O₂; "EAN32" / "EAN36" / etc. otherwise. */
function mixLabel(fo2: number | undefined): string {
  const percent = Math.round((fo2 ?? 0.21) * 100);
  return percent === 21 ? 'Air' : `EAN${percent}`;
}
