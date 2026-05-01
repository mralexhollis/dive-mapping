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
import Inspector from '../Editor/Inspector';
import LayersPanel from '../Editor/LayersPanel';
import CollapsibleSection from '../CollapsibleSection';
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

interface ViewerSidebarProps {
  /** ID of the route the diver is planning, or null if none picked yet. */
  selectedRouteId: string | null;
  setSelectedRouteId: (id: string | null) => void;
}

/**
 * Right-hand sidebar for the viewer. Mirrors the editor's collapsible
 * section layout: Plan (always shown), Profile, Graph, Inspector, Layers.
 * Owns the diver-profile pick + the route pick so the rest of the viewer
 * can render against a single source of truth.
 */
export default function ViewerSidebar({
  selectedRouteId,
  setSelectedRouteId,
}: ViewerSidebarProps) {
  const site = useSiteStore((s) => s.site);
  const routes = site.routes;

  const [profiles, setProfiles] = useState<DiverProfile[]>(() => loadDiverProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    const stored = loadActiveProfileId();
    const initial = loadDiverProfiles();
    if (stored && initial.some((p) => p.id === stored)) return stored;
    return initial[0]?.id ?? null;
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

  // If the picked route disappears (e.g. deleted on a different tab), drop
  // the selection so we don't render against a stale id.
  useEffect(() => {
    if (selectedRouteId != null && !routes.some((r) => r.id === selectedRouteId)) {
      setSelectedRouteId(null);
    }
  }, [routes, selectedRouteId, setSelectedRouteId]);

  const route = useMemo(
    () => (selectedRouteId ? routes.find((r) => r.id === selectedRouteId) ?? null : null),
    [routes, selectedRouteId],
  );

  const summary: DivePlanSummary | null = useMemo(
    () => (route ? divePlanSummary(route, site, gas) : null),
    [route, site, gas],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-white">
      <PlanSection
        routes={routes}
        selectedRouteId={selectedRouteId}
        setSelectedRouteId={setSelectedRouteId}
        route={route}
        summary={summary}
        gas={gas}
      />
      <CollapsibleSection
        title="Profile"
        storageKey="dive-mapping:viewer-section-profile"
        rightAdornment={activeProfile ? activeProfile.name : 'No profile'}
      >
        <ProfileBody
          profiles={profiles}
          activeProfileId={activeProfileId}
          setActiveProfileId={setActiveProfileId}
          activeProfile={activeProfile}
        />
      </CollapsibleSection>
      <CollapsibleSection
        title="Graph"
        storageKey="dive-mapping:viewer-section-graph"
        defaultOpen={false}
      >
        <GraphBody route={route} summary={summary} gas={gas} />
      </CollapsibleSection>
      <CollapsibleSection
        title="Inspector"
        storageKey="dive-mapping:viewer-section-inspector"
        defaultOpen={false}
      >
        <Inspector />
      </CollapsibleSection>
      <CollapsibleSection
        title="Layers"
        storageKey="dive-mapping:viewer-section-layers"
        defaultOpen={false}
      >
        <LayersPanel />
      </CollapsibleSection>
    </div>
  );
}

/* ---------------------------------------------------------------- Plan -- */

interface PlanSectionProps {
  routes: Route[];
  selectedRouteId: string | null;
  setSelectedRouteId: (id: string | null) => void;
  route: Route | null;
  summary: DivePlanSummary | null;
  gas: GasPlan;
}

function PlanSection({
  routes,
  selectedRouteId,
  setSelectedRouteId,
  route,
  summary,
  gas,
}: PlanSectionProps) {
  // Mirrors CollapsibleSection's chrome but is fixed-open per the design —
  // the diver always needs the route picker visible.
  return (
    <section className="border-b border-water-200">
      <div className="flex items-center justify-between gap-2 bg-water-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-water-700">
        <span className="flex min-w-0 items-center gap-2">
          <span className="inline-block w-3 text-water-500" aria-hidden>
            ▾
          </span>
          <span className="truncate">Plan</span>
        </span>
        {route && (
          <span className="shrink-0 text-[11px] font-normal normal-case text-water-600">
            {route.name}
          </span>
        )}
      </div>
      <div className="bg-white p-3">
        {routes.length === 0 ? (
          <div className="text-xs text-water-600">
            No routes yet for this site. Use{' '}
            <span className="font-semibold">Add/Edit Plans</span> from the home page to
            create one.
          </div>
        ) : (
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
        )}
      </div>
      {route && summary && (
        <div className="space-y-3 bg-water-50 p-3">
          <FeasibilityBadge route={route} summary={summary} gas={gas} />
          <SummaryGrid summary={summary} reserveBar={gas.reserveBarPressure} />
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
    </section>
  );
}

/* ------------------------------------------------------------- Profile -- */

interface ProfileBodyProps {
  profiles: DiverProfile[];
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
  activeProfile: DiverProfile | null;
}

function ProfileBody({
  profiles,
  activeProfileId,
  setActiveProfileId,
  activeProfile,
}: ProfileBodyProps) {
  return (
    <div className="bg-white p-3">
      <label className="flex flex-col gap-1 text-xs text-water-700">
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

/* --------------------------------------------------------------- Graph -- */

interface GraphBodyProps {
  route: Route | null;
  summary: DivePlanSummary | null;
  gas: GasPlan;
}

function GraphBody({ route, summary, gas }: GraphBodyProps) {
  if (!route || !summary) {
    return (
      <div className="bg-white px-3 py-4 text-xs text-water-600">
        Pick a route in the Plan section above to see its depth-time profile.
      </div>
    );
  }
  // The chart reads `route.gas` for axis labels (start pressure, reserve…).
  // Pass a synthetic Route whose gas reflects the diver's profile without
  // mutating the persisted route.
  const overridden: Route = { ...route, gas };
  return (
    <div className="bg-white p-3">
      <DepthTimeProfile route={overridden} summary={summary} />
    </div>
  );
}

/* ------------------------------------------------------------ helpers -- */

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
        ok
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-red-200 bg-red-50 text-red-800'
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

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded border px-2 py-1.5 ${
        warn ? 'border-red-300 bg-red-50' : 'border-water-200 bg-white'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-water-600">{label}</div>
      <div className={`text-xs font-semibold ${warn ? 'text-red-700' : 'text-water-900'}`}>
        {value}
      </div>
    </div>
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
