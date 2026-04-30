import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSiteStore } from '../state/useSiteStore';
import { loadSite } from '../state/persistence';
import { divePlanSummary } from '../domain/divePlan';
import type { Route, RouteObjective } from '../domain/types';

const OBJECTIVE_LABELS: Record<RouteObjective, string> = {
  tour: 'Tour',
  training: 'Training',
  recovery: 'Recovery',
  fun: 'Fun',
  survey: 'Survey',
  photo: 'Photo',
  other: 'Other',
};

const OBJECTIVE_BADGE_CLASS: Record<RouteObjective, string> = {
  tour: 'bg-sky-100 text-sky-800',
  training: 'bg-emerald-100 text-emerald-800',
  recovery: 'bg-rose-100 text-rose-800',
  fun: 'bg-amber-100 text-amber-800',
  survey: 'bg-indigo-100 text-indigo-800',
  photo: 'bg-violet-100 text-violet-800',
  other: 'bg-water-100 text-water-700',
};

export default function PlanListPage() {
  const navigate = useNavigate();
  const { siteId } = useParams<{ siteId: string }>();
  const site = useSiteStore((s) => s.site);
  const replaceSite = useSiteStore((s) => s.replaceSite);
  const setReadOnly = useSiteStore((s) => s.setReadOnly);
  const setEditingRoute = useSiteStore((s) => s.setEditingRoute);
  const setTool = useSiteStore((s) => s.setTool);
  const addRoute = useSiteStore((s) => s.addRoute);
  const removeRoute = useSiteStore((s) => s.removeRoute);
  const duplicateRoute = useSiteStore((s) => s.duplicateRoute);

  useEffect(() => {
    setReadOnly(true);
    setEditingRoute(null);
    setTool('select');
  }, [setReadOnly, setEditingRoute, setTool]);

  useEffect(() => {
    if (!siteId) return;
    if (site.id === siteId) return;
    const loaded = loadSite(siteId);
    if (loaded) replaceSite(loaded);
    else navigate('/', { replace: true });
  }, [siteId, site.id, replaceSite, navigate]);

  const onCreate = () => {
    const id = addRoute();
    if (siteId) navigate(`/plan/${siteId}/${id}`);
  };

  return (
    <div className="flex h-full flex-col bg-water-50">
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
          <span className="truncate text-sm font-semibold text-water-900">
            {site.meta.name} · Routes
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/view/${siteId ?? ''}`}
            className="rounded border border-water-200 px-2 py-1 text-xs text-water-700 hover:bg-water-100"
          >
            View site
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-water-900">Routes for this site</h2>
            <button
              type="button"
              onClick={onCreate}
              className="rounded bg-water-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-water-700"
            >
              + New route
            </button>
          </div>

          {site.routes.length === 0 ? (
            <div className="rounded border border-dashed border-water-300 bg-white p-10 text-center text-sm text-water-700">
              No routes yet. Click <span className="font-semibold">+ New route</span> to plan one.
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {site.routes.map((r) => (
                <RouteCard
                  key={r.id}
                  route={r}
                  site={site}
                  onOpen={() => navigate(`/plan/${siteId}/${r.id}`)}
                  onDuplicate={() => {
                    const id = duplicateRoute(r.id);
                    if (id && siteId) navigate(`/plan/${siteId}/${id}`);
                  }}
                  onDelete={() => {
                    if (window.confirm(`Delete route "${r.name}"?`)) removeRoute(r.id);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

interface RouteCardProps {
  route: Route;
  site: ReturnType<typeof useSiteStore.getState>['site'];
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function RouteCard({ route, site, onOpen, onDuplicate, onDelete }: RouteCardProps) {
  const summary = divePlanSummary(route, site);
  const objective: RouteObjective = route.objective ?? 'tour';
  const stops = route.stops ?? [];
  return (
    <li className="flex flex-col rounded border border-water-200 bg-white p-3 shadow-sm hover:border-water-400">
      <button type="button" onClick={onOpen} className="flex flex-col gap-2 text-left">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-3 w-3 shrink-0 rounded-sm"
            style={{ backgroundColor: route.color }}
          />
          <span className="truncate text-sm font-semibold text-water-900">{route.name}</span>
          <span
            className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${OBJECTIVE_BADGE_CLASS[objective]}`}
          >
            {OBJECTIVE_LABELS[objective]}
          </span>
        </div>
        <div className="text-xs text-water-700">
          {route.waypoints.length} waypoint{route.waypoints.length === 1 ? '' : 's'}
          {' · '}
          {stops.length} stop{stops.length === 1 ? '' : 's'}
          {summary.totalDistanceM > 0 && (
            <>
              {' · '}
              {Math.round(summary.totalDistanceM)} m
            </>
          )}
          {summary.totalTimeMin > 0 && (
            <>
              {' · '}
              {summary.totalTimeMin.toFixed(0)} min
            </>
          )}
        </div>
        {summary.warnings.length > 0 && (
          <div className="text-[11px] text-amber-700">
            ⚠ {summary.warnings.length} feasibility warning{summary.warnings.length === 1 ? '' : 's'}
          </div>
        )}
      </button>
      <div className="mt-2 flex items-center justify-end gap-1 border-t border-water-100 pt-2">
        <button
          type="button"
          onClick={onOpen}
          className="rounded bg-water-600 px-2 py-1 text-xs font-medium text-white hover:bg-water-700"
        >
          Open
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="rounded border border-water-300 px-2 py-1 text-xs text-water-900 hover:bg-water-100"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </li>
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
