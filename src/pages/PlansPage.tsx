import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSiteStore } from '../state/useSiteStore';
import { loadSite } from '../state/persistence';
import { divePlanSummary } from '../domain/divePlan';
import PlanDetailPanel from '../components/Plans/PlanDetailPanel';
import AddWaypointToolbar from '../components/Plans/AddWaypointToolbar';
import Itinerary from '../components/Plans/Itinerary';
import MapCanvas from '../components/Map/MapCanvas';
import ResizableSplit from '../components/ResizableSplit';
import { useIsMobile } from '../hooks/useResponsivePanels';

const LS_LEFT_WIDTH = 'dive-mapping:plans-left-width';
const LS_ITINERARY_HEIGHT = 'dive-mapping:plans-itinerary-height';
const DEFAULT_LEFT_WIDTH = 460;
const DEFAULT_ITINERARY_HEIGHT = 320;

function loadPersistedSize(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function persistSize(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // localStorage unavailable; safe to ignore.
  }
}

/**
 * Single-route editor. Reachable as `/plan/:siteId/:planId` after the user
 * picks a specific route from the list page (`/plan/:siteId`). Layout:
 *
 *   ┌───────────────┬─────────────────┐
 *   │ Itinerary     │                 │
 *   ├───────────────┤ Feasibility,    │
 *   │ Map canvas    │ summary, profile │
 *   └───────────────┴─────────────────┘
 */
export default function PlansPage() {
  const navigate = useNavigate();
  const { siteId, planId } = useParams<{ siteId: string; planId: string }>();
  const site = useSiteStore((s) => s.site);
  const replaceSite = useSiteStore((s) => s.replaceSite);
  const setReadOnly = useSiteStore((s) => s.setReadOnly);
  const setEditingRoute = useSiteStore((s) => s.setEditingRoute);
  const setTool = useSiteStore((s) => s.setTool);

  useEffect(() => {
    setReadOnly(true);
    return () => {
      setEditingRoute(null);
      setTool('select');
    };
  }, [setReadOnly, setEditingRoute, setTool]);

  useEffect(() => {
    if (!siteId) return;
    if (site.id === siteId) return;
    const loaded = loadSite(siteId);
    if (loaded) replaceSite(loaded);
    else navigate('/', { replace: true });
  }, [siteId, site.id, replaceSite, navigate]);

  useEffect(() => {
    if (!planId) return;
    setEditingRoute(planId);
  }, [planId, setEditingRoute]);

  const route = planId ? site.routes.find((r) => r.id === planId) ?? null : null;

  useEffect(() => {
    if (!siteId || !planId) return;
    if (site.id === siteId && !site.routes.some((r) => r.id === planId)) {
      navigate(`/plan/${siteId}`, { replace: true });
    }
  }, [siteId, planId, site, navigate]);

  const summary = useMemo(
    () => (route ? divePlanSummary(route, site) : null),
    [route, site],
  );

  const armAddWaypoint = () => {
    if (!route) return;
    setEditingRoute(route.id);
    setTool('route-add-waypoint');
  };

  const isMobile = useIsMobile();
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(() =>
    loadPersistedSize(LS_LEFT_WIDTH, DEFAULT_LEFT_WIDTH),
  );
  const [itineraryHeight, setItineraryHeight] = useState(() =>
    loadPersistedSize(LS_ITINERARY_HEIGHT, DEFAULT_ITINERARY_HEIGHT),
  );

  useEffect(() => {
    persistSize(LS_LEFT_WIDTH, leftWidth);
  }, [leftWidth]);
  useEffect(() => {
    persistSize(LS_ITINERARY_HEIGHT, itineraryHeight);
  }, [itineraryHeight]);

  if (!route || !summary) {
    return (
      <div className="flex h-full items-center justify-center bg-water-50 text-sm text-water-700">
        Loading route…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-water-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to={`/plan/${siteId ?? ''}`}
            className="flex items-center justify-center rounded border border-water-200 px-2 py-1 text-xs text-water-700 hover:bg-water-100"
            title="Back to route list"
          >
            ← Routes
          </Link>
          <span className="text-xs text-water-400">/</span>
          <span className="truncate text-sm font-semibold text-water-900">
            {site.meta.name} · {route.name}
          </span>
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: route.color }}
          />
        </div>
        <button
          type="button"
          onClick={() => setDetailPanelCollapsed(!detailPanelCollapsed)}
          className="rounded border border-water-200 px-2 py-1 text-xs text-water-700 hover:bg-water-100"
          title={detailPanelCollapsed ? 'Show plan details' : 'Hide plan details'}
        >
          Details {detailPanelCollapsed ? '◂' : '▸'}
        </button>
      </header>
      <div className="flex flex-1 min-h-0">
        {isMobile ? (
          // Mobile: the row split can't fit (~780px needed) and dragging a
          // resizer with a finger is fiddly. Stack the three panes at fixed
          // viewport-height fractions; each pane scrolls inside its own area.
          // The "Details ▸" toggle still works to hide the bottom pane and
          // give the map + itinerary more room. `min-w-0` is critical — without
          // it the column refuses to shrink below the natural width of any
          // intrinsically-sized child (e.g. the depth/time chart's SVG),
          // overflowing the viewport.
          <div className="flex flex-1 min-w-0 min-h-0 flex-col">
            <div className="h-[35vh] min-h-0 shrink-0">
              <Itinerary
                route={route}
                summary={summary}
                onArmAddWaypoint={armAddWaypoint}
              />
            </div>
            <div
              className={`relative min-h-0 shrink-0 bg-water-100 ${
                detailPanelCollapsed ? 'flex-1' : 'h-[35vh]'
              }`}
            >
              <MapCanvas mode="plan" />
              <AddWaypointToolbar />
            </div>
            {!detailPanelCollapsed && (
              <div className="flex-1 min-h-0 border-t border-water-200 bg-white">
                <PlanDetailPanel route={route} summary={summary} />
              </div>
            )}
          </div>
        ) : detailPanelCollapsed ? (
          // No right column: the left panel takes the full viewport.
          <ResizableSplit
            direction="column"
            firstSize={itineraryHeight}
            setFirstSize={setItineraryHeight}
            minFirst={120}
            minSecond={160}
            className="flex-1"
          >
            <Itinerary
              route={route}
              summary={summary}
              onArmAddWaypoint={armAddWaypoint}
            />
            <div className="relative flex-1 min-h-0 bg-water-100">
              <MapCanvas mode="plan" />
              <AddWaypointToolbar />
            </div>
          </ResizableSplit>
        ) : (
          <ResizableSplit
            direction="row"
            firstSize={leftWidth}
            setFirstSize={setLeftWidth}
            minFirst={280}
            minSecond={320}
            className="flex-1"
          >
            <ResizableSplit
              direction="column"
              firstSize={itineraryHeight}
              setFirstSize={setItineraryHeight}
              minFirst={120}
              minSecond={160}
              className="h-full"
            >
              <Itinerary
                route={route}
                summary={summary}
                onArmAddWaypoint={armAddWaypoint}
              />
              <div className="relative flex-1 min-h-0 bg-water-100">
                <MapCanvas mode="plan" />
                <AddWaypointToolbar />
              </div>
            </ResizableSplit>
            <aside className="h-full bg-white">
              <PlanDetailPanel route={route} summary={summary} />
            </aside>
          </ResizableSplit>
        )}
      </div>
    </div>
  );
}
