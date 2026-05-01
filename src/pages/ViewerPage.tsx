import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import MapCanvas from '../components/Map/MapCanvas';
import ViewerSidebar from '../components/Viewer/ViewerSidebar';
import Itinerary from '../components/Plans/Itinerary';
import ResizableSplit from '../components/ResizableSplit';
import { useIsMobile, useResponsivePanels } from '../hooks/useResponsivePanels';
import { useSiteStore } from '../state/useSiteStore';
import { loadSite } from '../state/persistence';
import { divePlanSummary } from '../domain/divePlan';
import {
  defaultEmptyArea,
  fitViewportToWorldRect,
  resolveDefaultPrintArea,
} from '../utils/fitViewport';

const LS_LEFT_WIDTH = 'dive-mapping:viewer-left-width';
const LS_ITINERARY_HEIGHT = 'dive-mapping:viewer-itinerary-height';
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
 * Read-only site viewer with the same split-pane shape as the route editor:
 *
 *   ┌────────────────┬───────────────────┐
 *   │ Itinerary      │ Plan              │
 *   │ (top left)     │ Profile           │
 *   ├────────────────┤ Graph             │
 *   │ Map            │ Inspector         │
 *   │ (bottom left)  │ Layers            │
 *   └────────────────┴───────────────────┘
 *
 * The right column is a stack of collapsible sections; "Plan" is fixed open
 * (the route picker always needs to be visible) while the others persist
 * their open/closed state to localStorage so the diver can carry their
 * preferred shape between sessions.
 */
export default function ViewerPage() {
  useResponsivePanels();
  const navigate = useNavigate();
  const { siteId } = useParams<{ siteId: string }>();
  const site = useSiteStore((s) => s.site);
  const replaceSite = useSiteStore((s) => s.replaceSite);
  const setReadOnly = useSiteStore((s) => s.setReadOnly);
  const setViewport = useSiteStore((s) => s.setViewport);
  const canvasSize = useSiteStore((s) => s.editor.canvasSize);
  const sidebarCollapsed = useSiteStore((s) => s.editor.sidebarCollapsed);
  const setSidebarCollapsed = useSiteStore((s) => s.setSidebarCollapsed);
  const mutate = useSiteStore((s) => s.mutateSite);
  const isMobile = useIsMobile();
  const showLegend = !!site.meta.showLegend;
  const fittedRef = useRef<string | null>(null);

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
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

  useEffect(() => {
    setReadOnly(true);
    return () => setReadOnly(false);
  }, [setReadOnly]);

  // Fit the canvas to the print area once per loaded site, as soon as both
  // the site and the canvas size are known.
  useEffect(() => {
    if (!site || canvasSize.width === 0 || canvasSize.height === 0) return;
    if (fittedRef.current === site.id) return;
    const area = resolveDefaultPrintArea(site) ?? defaultEmptyArea(site);
    const v = fitViewportToWorldRect(
      area,
      canvasSize,
      site.meta.northBearingDeg ?? 0,
    );
    setViewport(() => v);
    fittedRef.current = site.id;
  }, [site, canvasSize, setViewport]);

  useEffect(() => {
    if (!siteId) return;
    if (site.id === siteId) return;
    const loaded = loadSite(siteId);
    if (loaded) replaceSite(loaded);
    else navigate('/', { replace: true });
  }, [siteId, site.id, replaceSite, navigate]);

  const route = useMemo(
    () =>
      selectedRouteId
        ? site.routes.find((r) => r.id === selectedRouteId) ?? null
        : null,
    [site.routes, selectedRouteId],
  );

  const summary = useMemo(
    () => (route ? divePlanSummary(route, site) : null),
    [route, site],
  );

  // The itinerary expects an `onArmAddWaypoint` callback. Viewer is read-only
  // so the call is a no-op — the itinerary is wrapped in a disabled fieldset
  // below, which inerts the buttons that would invoke it anyway.
  const noopArmAddWaypoint = () => {};

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-water-200 bg-white px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/"
            className="flex items-center justify-center rounded border border-water-200 px-2 py-1 text-water-700 hover:bg-water-100 hover:text-water-900"
            title="Back to sites"
            aria-label="Back to sites"
          >
            <ViewerHomeIcon />
          </Link>
          <h1 className="truncate text-sm font-semibold text-water-900">
            {site.meta.name}
          </h1>
          <span className="rounded bg-water-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-water-700">
            view only
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-water-700">
            <input
              type="checkbox"
              checked={showLegend}
              onChange={(e) =>
                mutate((d) => {
                  d.meta.showLegend = e.target.checked;
                })
              }
              className="accent-water-600"
            />
            Legend
          </label>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            aria-pressed={!sidebarCollapsed}
            className="shrink-0 rounded border border-water-200 px-2 py-1 text-xs text-water-700 hover:bg-water-100"
          >
            Details {sidebarCollapsed ? '◂' : '▸'}
          </button>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        {isMobile ? (
          // Mobile: stack itinerary, map, and sidebar at fixed viewport-height
          // fractions; each pane scrolls independently inside its own area.
          // The "Details ▸" toggle still hides the sidebar to give the map +
          // itinerary more room. `min-w-0` is critical — without it the column
          // refuses to shrink below the natural width of any intrinsically-
          // sized child (e.g. the depth/time chart's SVG), overflowing the
          // viewport.
          <div className="flex flex-1 min-w-0 min-h-0 flex-col">
            <div className="h-[35vh] min-h-0 shrink-0">
              <ItineraryPane
                route={route}
                summary={summary}
                onArmAddWaypoint={noopArmAddWaypoint}
              />
            </div>
            <div
              className={`relative min-h-0 shrink-0 bg-water-100 ${
                sidebarCollapsed ? 'flex-1' : 'h-[35vh]'
              }`}
            >
              <MapCanvas mode="view" />
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-h-0 border-t border-water-200 bg-white">
                <ViewerSidebar
                  selectedRouteId={selectedRouteId}
                  setSelectedRouteId={setSelectedRouteId}
                />
              </div>
            )}
          </div>
        ) : sidebarCollapsed ? (
          // No right column: itinerary + map fill the whole viewport.
          <ResizableSplit
            direction="column"
            firstSize={itineraryHeight}
            setFirstSize={setItineraryHeight}
            minFirst={120}
            minSecond={160}
            className="flex-1"
          >
            <ItineraryPane
              route={route}
              summary={summary}
              onArmAddWaypoint={noopArmAddWaypoint}
            />
            <MapPane />
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
              <ItineraryPane
                route={route}
                summary={summary}
                onArmAddWaypoint={noopArmAddWaypoint}
              />
              <MapPane />
            </ResizableSplit>
            <aside className="h-full bg-white">
              <ViewerSidebar
                selectedRouteId={selectedRouteId}
                setSelectedRouteId={setSelectedRouteId}
              />
            </aside>
          </ResizableSplit>
        )}
      </div>
    </div>
  );
}

interface ItineraryPaneProps {
  route: ReturnType<typeof useSiteStore.getState>['site']['routes'][number] | null;
  summary: ReturnType<typeof divePlanSummary> | null;
  onArmAddWaypoint: () => void;
}

/**
 * The itinerary list, made read-only by wrapping it in a disabled fieldset.
 * Browsers inert all the inputs/buttons inside, so the viewer can't reorder
 * waypoints, edit stops, or rename the route — but they can still scroll
 * through and click rows to select waypoints (selection happens via the
 * store from outside the disabled subtree).
 */
function ItineraryPane({ route, summary, onArmAddWaypoint }: ItineraryPaneProps) {
  if (!route || !summary) {
    return (
      <div className="flex h-full items-center justify-center bg-white px-4 text-center text-xs text-water-600">
        Pick a route from the Plan section to see its itinerary.
      </div>
    );
  }
  return (
    <fieldset disabled className="contents">
      <Itinerary route={route} summary={summary} onArmAddWaypoint={onArmAddWaypoint} />
    </fieldset>
  );
}

function MapPane() {
  return (
    <div className="relative flex-1 min-h-0 bg-water-100">
      <MapCanvas mode="view" />
    </div>
  );
}

function ViewerHomeIcon() {
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
