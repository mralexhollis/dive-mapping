import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import LayersPanel from '../components/Editor/LayersPanel';
import Toolbar from '../components/Editor/Toolbar';
import Inspector from '../components/Editor/Inspector';
import MapCanvas from '../components/Map/MapCanvas';
import { useKeyboard } from '../hooks/useKeyboard';
import { useSiteStore } from '../state/useSiteStore';
import {
  exportPngDownload,
  exportSiteAsJsonDownload,
  exportSvgDownload,
  loadSite,
} from '../state/persistence';

export default function EditorPage() {
  useKeyboard();
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

  // Sync URL siteId → store. If the URL points at a site we don't have in
  // memory, try to load from localStorage; otherwise bounce home.
  useEffect(() => {
    if (!siteId) return;
    if (site.id === siteId) return;
    const loaded = loadSite(siteId);
    if (loaded) replaceSite(loaded);
    else navigate('/', { replace: true });
  }, [siteId, site.id, replaceSite, navigate]);

  const findSvg = () => document.querySelector('svg[data-map-canvas]') as SVGSVGElement | null;
  const mutate = useSiteStore((s) => s.mutateSite);
  const gridMeters = site.meta.gridSpacingMeters ?? 20;
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
      <header className="flex items-center justify-between border-b border-water-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm text-water-700 hover:text-water-900">
            ← Sites
          </Link>
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
            className="rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-water-900 hover:border-water-200 focus:border-water-400 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1 text-xs text-water-700">
            Grid =
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
          </label>
          <label className="flex items-center gap-1 text-xs text-water-700">
            Screen N =
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
              title="Bearing that screen-up represents. 0 = north up."
            />
            °
          </label>
          <span className="mx-2 h-4 w-px bg-water-200" />
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="rounded px-2 py-1 text-water-700 hover:bg-water-100 disabled:text-water-300"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="rounded px-2 py-1 text-water-700 hover:bg-water-100 disabled:text-water-300"
          >
            Redo
          </button>
          <span className="mx-2 h-4 w-px bg-water-200" />
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
          <label className="flex items-center gap-1 text-xs text-water-700">
            <input
              type="checkbox"
              checked={showPrintArea}
              onChange={togglePrintArea}
              className="accent-water-600"
            />
            Print area
          </label>
          <span className="mx-2 h-4 w-px bg-water-200" />
          <button
            type="button"
            onClick={() => exportSiteAsJsonDownload(site)}
            className="rounded border border-water-200 px-2 py-1 text-water-900 hover:bg-water-100"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => {
              const svg = findSvg();
              if (svg) exportSvgDownload(svg, site.meta.name);
            }}
            className="rounded border border-water-200 px-2 py-1 text-water-900 hover:bg-water-100"
          >
            Export SVG
          </button>
          <button
            type="button"
            onClick={() => {
              const svg = findSvg();
              if (svg) exportPngDownload(svg, site.meta.name);
            }}
            className="rounded border border-water-200 px-2 py-1 text-water-900 hover:bg-water-100"
          >
            Export PNG
          </button>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <Toolbar />
        <main className="relative flex-1">
          <MapCanvas />
        </main>
        <div className="flex w-72 flex-col border-l border-water-200 bg-white">
          <div className="flex-1 min-h-0 overflow-hidden">
            <Inspector />
          </div>
          <div className="border-t border-water-200">
            <LayersPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
