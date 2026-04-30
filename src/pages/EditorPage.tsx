import { useEffect, useRef, type SVGProps } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import LayersPanel from '../components/Editor/LayersPanel';
import Toolbar from '../components/Editor/Toolbar';
import Inspector from '../components/Editor/Inspector';
import MapCanvas from '../components/Map/MapCanvas';
import { useKeyboard } from '../hooks/useKeyboard';
import { useResponsivePanels } from '../hooks/useResponsivePanels';
import { useSiteStore } from '../state/useSiteStore';
import {
  exportPngDownload,
  exportSiteAsJsonDownload,
  exportSvgDownload,
  loadSite,
} from '../state/persistence';
import {
  defaultEmptyArea,
  fitViewportToWorldRect,
  resolveDefaultPrintArea,
} from '../utils/fitViewport';

export default function EditorPage() {
  useKeyboard();
  useResponsivePanels();
  const navigate = useNavigate();
  const { siteId } = useParams<{ siteId: string }>();
  const site = useSiteStore((s) => s.site);
  const replaceSite = useSiteStore((s) => s.replaceSite);
  const setReadOnly = useSiteStore((s) => s.setReadOnly);
  useEffect(() => {
    setReadOnly(false);
  }, [setReadOnly]);
  const undo = useSiteStore((s) => s.undo);
  const redo = useSiteStore((s) => s.redo);
  const canUndo = useSiteStore((s) => s.past.length > 0);
  const canRedo = useSiteStore((s) => s.future.length > 0);

  const toolbarCollapsed = useSiteStore((s) => s.editor.toolbarCollapsed);
  const sidebarCollapsed = useSiteStore((s) => s.editor.sidebarCollapsed);
  const setToolbarCollapsed = useSiteStore((s) => s.setToolbarCollapsed);
  const setSidebarCollapsed = useSiteStore((s) => s.setSidebarCollapsed);

  const setViewport = useSiteStore((s) => s.setViewport);
  const canvasSize = useSiteStore((s) => s.editor.canvasSize);
  const fittedRef = useRef<string | null>(null);

  // Sync URL siteId → store. If the URL points at a site we don't have in
  // memory, try to load from localStorage; otherwise bounce home.
  useEffect(() => {
    if (!siteId) return;
    if (site.id === siteId) return;
    const loaded = loadSite(siteId);
    if (loaded) replaceSite(loaded);
    else navigate('/', { replace: true });
  }, [siteId, site.id, replaceSite, navigate]);

  // First-load fit: zoom to existing content, or to a sensible default
  // dive-site-sized area for a brand-new empty site. Without this the editor
  // opens at scale=1, which on a typical 800-px canvas shows ~800 m of empty
  // space — far larger than a real dive covers.
  useEffect(() => {
    if (!site || canvasSize.width === 0 || canvasSize.height === 0) return;
    if (fittedRef.current === site.id) return;
    const area = resolveDefaultPrintArea(site) ?? defaultEmptyArea(site);
    const v = fitViewportToWorldRect(area, canvasSize, site.meta.northBearingDeg ?? 0);
    setViewport(() => v);
    fittedRef.current = site.id;
  }, [site, canvasSize, setViewport]);

  const findSvg = () => document.querySelector('svg[data-map-canvas]') as SVGSVGElement | null;
  const mutate = useSiteStore((s) => s.mutateSite);
  const gridMeters = site.meta.gridSpacingMeters ?? 3;
  const showLegend = !!site.meta.showLegend;
  const showPrintArea = useSiteStore((s) => s.editor.showPrintArea);
  const setShowPrintArea = useSiteStore((s) => s.setShowPrintArea);

  const togglePrintArea = () => {
    // The print area auto-fits to all entities by default; the user can
    // override later by setting `meta.printArea` explicitly.
    setShowPrintArea(!showPrintArea);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-water-200 bg-white px-2 py-2 sm:px-4">
        {/* Left: Tools toggle + back link */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setToolbarCollapsed(!toolbarCollapsed)}
            title={toolbarCollapsed ? 'Show tools' : 'Hide tools'}
            aria-label={toolbarCollapsed ? 'Show tools' : 'Hide tools'}
            aria-pressed={!toolbarCollapsed}
            className="rounded border border-water-200 px-2 py-1 text-xs text-water-700 hover:bg-water-100"
          >
            {toolbarCollapsed ? '▸' : '◂'} Tools
          </button>
          <Link
            to="/"
            className="flex items-center justify-center rounded border border-water-200 px-2 py-1 text-water-700 hover:bg-water-100 hover:text-water-900"
            title="Back to sites"
            aria-label="Back to sites"
          >
            <HomeIcon />
          </Link>
        </div>
        {/* Centre: site name */}
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <input
            type="text"
            value={site.meta.name}
            onChange={(e) => {
              const v = e.target.value;
              mutate((d) => {
                d.meta.name = v;
              });
            }}
            title="Click to rename this site"
            className="min-w-0 max-w-full truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-sm font-semibold text-water-900 hover:border-water-200 focus:border-water-400 focus:outline-none"
          />
        </div>
        {/* Right: undo/redo (always), more-settings popover, export, sidebar toggle */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="rounded p-1 text-water-700 hover:bg-water-100 disabled:cursor-not-allowed disabled:text-water-300"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            className="rounded p-1 text-water-700 hover:bg-water-100 disabled:cursor-not-allowed disabled:text-water-300"
          >
            <RedoIcon />
          </button>
          <details className="relative">
            <summary
              className="flex cursor-pointer list-none items-center gap-0.5 rounded border border-water-200 px-2 py-1 text-xs text-water-700 hover:bg-water-100"
              aria-label="Map settings"
              title="Map settings"
            >
              <SettingsIcon /> ▾
            </summary>
            <div className="absolute right-0 z-20 mt-1 flex w-56 flex-col gap-2 rounded border border-water-200 bg-white p-3 text-sm shadow">
              <label className="flex items-center justify-between gap-2 text-xs text-water-700">
                <span>Grid spacing</span>
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0.1}
                    step={0.5}
                    value={gridMeters}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v) || v <= 0) return;
                      mutate((d) => {
                        d.meta.gridSpacingMeters = v;
                      });
                    }}
                    className="w-14 rounded border border-water-200 px-1 py-0.5 text-right"
                    aria-label="metres per grid square"
                  />
                  m
                </span>
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-water-700">
                <span>Screen-up bearing</span>
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    step={1}
                    value={Math.round(site.meta.northBearingDeg ?? 0)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      mutate((d) => {
                        d.meta.northBearingDeg = ((v % 360) + 360) % 360;
                      });
                    }}
                    className="w-14 rounded border border-water-200 px-1 py-0.5 text-right"
                    aria-label="bearing of screen-up (degrees)"
                  />
                  °
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs text-water-900">
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
                Show legend
              </label>
              <label className="flex items-center gap-2 text-xs text-water-900">
                <input
                  type="checkbox"
                  checked={showPrintArea}
                  onChange={togglePrintArea}
                  className="accent-water-600"
                />
                Show print area
              </label>
            </div>
          </details>
          <details className="relative">
            <summary
              className="cursor-pointer list-none rounded border border-water-200 px-2 py-1 text-xs text-water-900 hover:bg-water-100"
              title="Export"
            >
              Export ▾
            </summary>
            <div className="absolute right-0 z-20 mt-1 flex w-40 flex-col rounded border border-water-200 bg-white shadow">
              <button
                type="button"
                onClick={() => exportSiteAsJsonDownload(site)}
                className="px-3 py-1.5 text-left text-sm text-water-900 hover:bg-water-100"
              >
                JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  const svg = findSvg();
                  if (svg) exportSvgDownload(svg, site.meta.name);
                }}
                className="px-3 py-1.5 text-left text-sm text-water-900 hover:bg-water-100"
              >
                SVG
              </button>
              <button
                type="button"
                onClick={() => {
                  const svg = findSvg();
                  if (svg) exportPngDownload(svg, site.meta.name);
                }}
                className="px-3 py-1.5 text-left text-sm text-water-900 hover:bg-water-100"
              >
                PNG
              </button>
            </div>
          </details>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Show inspector & layers' : 'Hide inspector & layers'}
            aria-label={sidebarCollapsed ? 'Show inspector & layers' : 'Hide inspector & layers'}
            aria-pressed={!sidebarCollapsed}
            className="rounded border border-water-200 px-2 py-1 text-xs text-water-700 hover:bg-water-100"
          >
            Details {sidebarCollapsed ? '◂' : '▸'}
          </button>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        {!toolbarCollapsed && <Toolbar />}
        <main className="relative flex-1 min-w-0">
          <MapCanvas mode="edit" />
        </main>
        {!sidebarCollapsed && (
          <div className="flex w-72 flex-col border-l border-water-200 bg-white">
            <div className="flex-1 min-h-0 overflow-hidden">
              <Inspector />
            </div>
            <div className="border-t border-water-200">
              <LayersPanel />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IconShell({
  size = 16,
  children,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

function HomeIcon() {
  return (
    <IconShell size={22}>
      <path d="M 3 11 L 12 3 L 21 11" />
      <path d="M 5 10 V 21 H 19 V 10" />
      <path d="M 10 21 V 14 H 14 V 21" />
    </IconShell>
  );
}

function UndoIcon() {
  return (
    <IconShell>
      <polyline points="9,5 4,10 9,15" />
      <path d="M 4 10 H 14 a 6 6 0 0 1 0 12 H 8" />
    </IconShell>
  );
}

function RedoIcon() {
  return (
    <IconShell>
      <polyline points="15,5 20,10 15,15" />
      <path d="M 20 10 H 10 a 6 6 0 0 0 0 12 H 16" />
    </IconShell>
  );
}

function SettingsIcon() {
  return (
    <IconShell>
      <circle cx={12} cy={12} r={3} />
      <path d="M 19.4 15 a 1.65 1.65 0 0 0 0.33 1.82 l 0.06 0.06 a 2 2 0 1 1 -2.83 2.83 l -0.06 -0.06 a 1.65 1.65 0 0 0 -1.82 -0.33 a 1.65 1.65 0 0 0 -1 1.51 V 21 a 2 2 0 0 1 -4 0 v -0.09 a 1.65 1.65 0 0 0 -1 -1.51 a 1.65 1.65 0 0 0 -1.82 0.33 l -0.06 0.06 a 2 2 0 1 1 -2.83 -2.83 l 0.06 -0.06 a 1.65 1.65 0 0 0 0.33 -1.82 a 1.65 1.65 0 0 0 -1.51 -1 H 3 a 2 2 0 0 1 0 -4 h 0.09 a 1.65 1.65 0 0 0 1.51 -1 a 1.65 1.65 0 0 0 -0.33 -1.82 l -0.06 -0.06 a 2 2 0 1 1 2.83 -2.83 l 0.06 0.06 a 1.65 1.65 0 0 0 1.82 0.33 H 9 a 1.65 1.65 0 0 0 1 -1.51 V 3 a 2 2 0 0 1 4 0 v 0.09 a 1.65 1.65 0 0 0 1 1.51 a 1.65 1.65 0 0 0 1.82 -0.33 l 0.06 -0.06 a 2 2 0 1 1 2.83 2.83 l -0.06 0.06 a 1.65 1.65 0 0 0 -0.33 1.82 V 9 a 1.65 1.65 0 0 0 1.51 1 H 21 a 2 2 0 0 1 0 4 h -0.09 a 1.65 1.65 0 0 0 -1.51 1 z" />
    </IconShell>
  );
}
