import { useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import MapCanvas from '../components/Map/MapCanvas';
import Inspector from '../components/Editor/Inspector';
import LayersPanel from '../components/Editor/LayersPanel';
import { useSiteStore } from '../state/useSiteStore';
import { loadSite } from '../state/persistence';
import { fitViewportToWorldRect, resolveDefaultPrintArea } from '../utils/fitViewport';

export default function ViewerPage() {
  const navigate = useNavigate();
  const { siteId } = useParams<{ siteId: string }>();
  const site = useSiteStore((s) => s.site);
  const replaceSite = useSiteStore((s) => s.replaceSite);
  const setReadOnly = useSiteStore((s) => s.setReadOnly);
  const setViewport = useSiteStore((s) => s.setViewport);
  const canvasSize = useSiteStore((s) => s.editor.canvasSize);
  const fittedRef = useRef<string | null>(null);

  useEffect(() => {
    setReadOnly(true);
    return () => setReadOnly(false);
  }, [setReadOnly]);

  // Fit the canvas to the print area once per loaded site, as soon as both
  // the site and the canvas size are known.
  useEffect(() => {
    if (!site || canvasSize.width === 0 || canvasSize.height === 0) return;
    if (fittedRef.current === site.id) return;
    const area = resolveDefaultPrintArea(site);
    if (!area) return;
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

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-water-200 bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <Link to="/" className="text-sm text-water-700 hover:text-water-900">
            ←
          </Link>
          <h1 className="text-sm font-semibold text-water-900">{site.meta.name}</h1>
          <span className="rounded bg-water-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-water-700">
            view only
          </span>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <main className="relative flex-1">
          <MapCanvas interactive={false} />
        </main>
        <div className="hidden w-72 flex-col border-l border-water-200 bg-white md:flex">
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
