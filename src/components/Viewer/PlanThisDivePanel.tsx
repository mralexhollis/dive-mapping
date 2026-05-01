import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSiteStore } from '../../state/useSiteStore';
import {
  defaultGasPlan,
  divePlanSummary,
  maxOperatingDepthM,
  type DivePlanSummary,
} from '../../domain/divePlan';
import type { GasPlan, Route, RouteObjective } from '../../domain/types';
import DepthTimeProfile from '../Plans/DepthTimeProfile';
import {
  loadActiveProfileId,
  loadDiverProfiles,
  saveActiveProfileId,
  type DiverProfile,
} from '../../utils/diverProfiles';

const OBJECTIVE_LABELS: Record<RouteObjective, string> = {
  tour: 'Tour',
  training: 'Training',
  recovery: 'Recovery',
  fun: 'Fun',
  survey: 'Survey',
  photo: 'Photo',
  other: 'Other',
};

const RULE_LABELS: Record<GasPlan['rulePolicy'], string> = {
  thirds: 'Thirds',
  half: 'Half',
  'all-usable': 'All usable',
};

/**
 * Read-only "Plan this dive" panel for the viewer. The diver picks a route
 * and a saved profile; gas values come from the profile and can only be
 * edited from the dedicated /profiles screen.
 */
export default function PlanThisDivePanel() {
  const site = useSiteStore((s) => s.site);
  const routes = site.routes;
  // Open with no route selected — the diver opts in by picking one.
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<DiverProfile[]>(() => loadDiverProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    const stored = loadActiveProfileId();
    const initialProfiles = loadDiverProfiles();
    if (stored && initialProfiles.some((p) => p.id === stored)) return stored;
    return initialProfiles[0]?.id ?? null;
  });

  // Re-read profiles when the window regains focus, so changes made in the
  // /profiles screen (or another tab) flow through without a hard refresh.
  useEffect(() => {
    const refresh = () => setProfiles(loadDiverProfiles());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  useEffect(() => {
    saveActiveProfileId(activeProfileId);
  }, [activeProfileId]);

  // If the active profile disappears (e.g. deleted in /profiles), fall back
  // to whatever profile is left.
  useEffect(() => {
    if (activeProfileId != null && !profiles.some((p) => p.id === activeProfileId)) {
      setActiveProfileId(profiles[0]?.id ?? null);
    }
  }, [profiles, activeProfileId]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null,
    [profiles, activeProfileId],
  );
  const gas: GasPlan = activeProfile?.gas ?? defaultGasPlan();

  useEffect(() => {
    if (selectedRouteId != null && !routes.some((r) => r.id === selectedRouteId)) {
      setSelectedRouteId(null);
    }
  }, [routes, selectedRouteId]);

  const route = useMemo(
    () => (selectedRouteId ? routes.find((r) => r.id === selectedRouteId) ?? null : null),
    [routes, selectedRouteId],
  );

  const summary: DivePlanSummary | null = useMemo(
    () => (route ? divePlanSummary(route, site, gas) : null),
    [route, site, gas],
  );

  if (routes.length === 0) {
    return (
      <div className="border-b border-water-200 p-3 text-xs text-water-600">
        No routes yet for this site. Use <span className="font-semibold">Add/Edit Plans</span> from the home page to create one.
      </div>
    );
  }

  return (
    <div className="flex max-h-full flex-col overflow-y-auto border-b border-water-200">
      <div className="bg-white p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-water-600">
          Plan this dive
        </div>
        <label className="flex flex-col gap-1 text-xs text-water-700">
          Route
          <select
            value={selectedRouteId ?? ''}
            onChange={(e) =>
              setSelectedRouteId(e.target.value === '' ? null : e.target.value)
            }
            className="rounded border border-water-200 px-2 py-1 text-sm text-water-900"
          >
            <option value="">— Pick a route to plan —</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({OBJECTIVE_LABELS[(r.objective ?? 'tour') as RouteObjective]})
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 flex flex-col gap-1 text-xs text-water-700">
          <span className="flex items-center justify-between">
            Diver profile
            <Link
              to="/profiles"
              className="text-[11px] font-semibold text-water-600 hover:text-water-900"
              title="Manage diver profiles"
            >
              Manage profiles →
            </Link>
          </span>
          <select
            value={activeProfileId ?? ''}
            onChange={(e) => setActiveProfileId(e.target.value || null)}
            className="rounded border border-water-200 px-2 py-1 text-sm text-water-900"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {activeProfile && (
          <div className="mt-2 rounded border border-water-200 bg-water-50 p-2 text-[11px] text-water-700">
            <GasReadout gas={activeProfile.gas} />
          </div>
        )}
      </div>

      {route && summary && (
        <div className="space-y-3 bg-water-50 p-3">
          <FeasibilityBadge route={route} summary={summary} gas={gas} />
          <SummaryGrid summary={summary} reserveBar={gas.reserveBarPressure} />
          <DepthTimeProfileForViewer route={route} summary={summary} gas={gas} />
          {summary.warnings.length > 0 && (
            <ul className="space-y-1">
              {summary.warnings.map((w, i) => (
                <li
                  key={i}
                  className={`rounded border px-2 py-1 text-[11px] ${warningClass(w.kind)}`}
                >
                  {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function GasReadout({ gas }: { gas: GasPlan }) {
  const percent = Math.round((gas.fo2 ?? 0.21) * 100);
  const mixName = percent === 21 ? 'Air' : `EAN${percent}`;
  const mod = maxOperatingDepthM(gas.fo2 ?? 0.21);
  return (
    <div className="space-y-0.5">
      <div>
        SAC {gas.sacLPerMin} L/min · {gas.cylinderL} L @ {gas.startBarPressure} bar ·
        reserve {gas.reserveBarPressure} bar · {gas.transitSpeedMPerMin} m/min ·{' '}
        {RULE_LABELS[gas.rulePolicy]}
      </div>
      <div>
        <span className="font-semibold">{mixName}</span>
        {' · '}MOD {Number.isFinite(mod) ? `${mod.toFixed(1)} m` : '—'}
      </div>
    </div>
  );
}

function FeasibilityBadge({
  route,
  summary,
  gas,
}: {
  route: Route;
  summary: DivePlanSummary;
  gas: GasPlan;
}) {
  const ok = summary.remainingBar >= gas.reserveBarPressure;
  return (
    <div
      className={`rounded border px-3 py-2 text-xs ${
        ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
      }`}
    >
      {ok ? '✓' : '✗'} <span className="font-semibold">{route.name}</span> with your gas:
      {' '}
      {summary.remainingBar.toFixed(0)} bar remaining vs {gas.reserveBarPressure} bar reserve.
    </div>
  );
}

function SummaryGrid({
  summary,
  reserveBar,
}: {
  summary: DivePlanSummary;
  reserveBar: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Stat label="Distance" value={`${Math.round(summary.totalDistanceM)} m`} />
      <Stat label="Time" value={`${summary.totalTimeMin.toFixed(1)} min`} />
      <Stat label="Air used" value={`${summary.totalAirBar.toFixed(0)} bar`} />
      <Stat
        label="Remaining"
        value={`${summary.remainingBar.toFixed(0)} bar`}
        warn={summary.remainingBar < reserveBar}
      />
      <Stat label="Turn pressure" value={`${Math.round(summary.turnPressureBar)} bar`} />
      <Stat
        label="Turn point"
        value={
          summary.turnAtSegmentIdx != null
            ? `WP ${summary.turnAtSegmentIdx + 1} → ${summary.turnAtSegmentIdx + 2}`
            : '—'
        }
      />
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={`rounded border px-2 py-1.5 ${
        warn ? 'border-red-300 bg-red-50' : 'border-water-200 bg-white'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-water-600">{label}</div>
      <div className={`text-xs font-semibold ${warn ? 'text-red-700' : 'text-water-900'}`}>{value}</div>
    </div>
  );
}

/**
 * The depth-time profile rendered with the viewer's overridden gas. The
 * underlying chart reads `route.gas` for axis labels (start pressure, reserve,
 * etc.), so we pass a synthetic Route object whose gas reflects the viewer's
 * inputs without mutating the persisted route.
 */
function DepthTimeProfileForViewer({
  route,
  summary,
  gas,
}: {
  route: Route;
  summary: DivePlanSummary;
  gas: GasPlan;
}) {
  const overridden: Route = useMemo(() => ({ ...route, gas }), [route, gas]);
  return <DepthTimeProfile route={overridden} summary={summary} />;
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
