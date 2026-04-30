import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSiteStore } from '../state/useSiteStore';
import { emptySite } from '../domain/types';
import {
  deleteSite,
  importSiteFromFile,
  loadIndex,
  loadSite,
  saveSite,
  type SiteIndexEntry,
} from '../state/persistence';
import { siteFromJson } from '../domain/serialize';
import SatelliteImportDialog from '../components/SatelliteImportDialog';
import { SATELLITE_ATTRIBUTION, type SatelliteComposite } from '../utils/satelliteTiles';
// Vite's `?raw` import returns the file as a string, which `siteFromJson`
// expects. Bundling it lets the home page seed a known-good test site
// without a network round trip or a file picker.
import stoneyJson from '../data/stoney-cove-draft.json?raw';

export default function HomePage() {
  const navigate = useNavigate();
  const replaceSite = useSiteStore((s) => s.replaceSite);
  const [entries, setEntries] = useState<SiteIndexEntry[]>([]);
  const importRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEntries(loadIndex());
  }, []);

  const newSite = () => {
    const s = emptySite('New dive site');
    saveSite(s);
    replaceSite(s);
    navigate(`/edit/${s.id}`);
  };

  const [satelliteOpen, setSatelliteOpen] = useState(false);

  const newSiteFromSatellite = (c: SatelliteComposite) => {
    const s = emptySite(`Dive site near ${c.centerLat.toFixed(4)}, ${c.centerLon.toFixed(4)}`);
    // The illustration is placed centred on the world origin so its real-world
    // extent in metres maps 1:1 to world coordinates (scaleMetersPerUnit = 1).
    s.layers.references.items.push({
      id: crypto.randomUUID(),
      kind: 'image',
      src: c.dataUrl,
      mimeType: 'image/jpeg',
      x: -c.worldWidthM / 2,
      y: -c.worldHeightM / 2,
      width: c.worldWidthM,
      height: c.worldHeightM,
      placement: 'under',
      opacity: 1,
      caption: SATELLITE_ATTRIBUTION,
    });
    // Stash the location on the site name as a default; the user can rename.
    s.meta.subtitle = `${c.centerLat.toFixed(5)}, ${c.centerLon.toFixed(5)} · zoom ${c.zoom}`;
    saveSite(s);
    replaceSite(s);
    setSatelliteOpen(false);
    navigate(`/edit/${s.id}`);
  };

  const open = (id: string) => {
    const site = loadSite(id);
    if (!site) {
      setError('Could not load that site.');
      return;
    }
    replaceSite(site);
    navigate(`/edit/${id}`);
  };

  const remove = (id: string) => {
    deleteSite(id);
    setEntries(loadIndex());
  };

  const onImport = async (file: File) => {
    try {
      const site = await importSiteFromFile(file);
      saveSite(site);
      replaceSite(site);
      navigate(`/edit/${site.id}`);
    } catch (e) {
      setError(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const loadStoneyTestMap = () => {
    try {
      // Reload from the bundled JSON every time so the test map is always in
      // a known state — any in-place edits the user made get overwritten.
      const site = siteFromJson(stoneyJson);
      saveSite(site);
      replaceSite(site);
      setEntries(loadIndex());
      navigate(`/edit/${site.id}`);
    } catch (e) {
      setError(`Couldn't load test map: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-start gap-6 overflow-y-auto bg-water-50 p-8 text-water-900">
      <div
        role="alert"
        className="w-full max-w-2xl rounded-lg border-2 border-red-400 bg-red-50 p-4 text-red-900 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 text-2xl leading-none">⚠</span>
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-wide">
              In development — do not use for real dive planning
            </p>
            <p className="text-sm">
              This application is a work in progress and must not be relied
              upon for planning real dives. The maps, bearings, distances and
              gas calculations may be incomplete, inaccurate, or change
              without notice.
            </p>
            <p className="text-sm">
              <strong>Diving is an inherently dangerous activity.</strong> You
              must hold the appropriate certification, dive within your
              training and experience, and follow the procedures taught by
              your instructor. This tool is not a substitute for proper
              training, current certifications, or in-person briefings.
            </p>
          </div>
        </div>
      </div>
      <div className="w-full max-w-2xl rounded-lg border border-water-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Dive Mapping</h1>
        <p className="mt-1 text-sm text-water-700">
          Build bearing-graph maps of your favourite dive sites.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={newSite}
            className="rounded bg-water-600 px-4 py-2 text-white hover:bg-water-700"
          >
            New site
          </button>
          <button
            type="button"
            onClick={() => setSatelliteOpen(true)}
            className="rounded border border-water-300 px-4 py-2 text-water-900 hover:bg-water-100"
            title="Start with a satellite image as a to-scale reference"
          >
            From satellite image…
          </button>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="rounded border border-water-300 px-4 py-2 text-water-900 hover:bg-water-100"
          >
            Import JSON…
          </button>
          <button
            type="button"
            onClick={loadStoneyTestMap}
            className="rounded border border-water-300 px-4 py-2 text-water-900 hover:bg-water-100"
            title="Load the bundled Stoney Cove draft as a sample site"
          >
            Load test map — Stoney
          </button>
          <button
            type="button"
            onClick={() => navigate('/profiles')}
            className="rounded border border-water-300 px-4 py-2 text-water-900 hover:bg-water-100"
            title="Manage your diver gas profiles"
          >
            Diver profiles
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      <div className="w-full max-w-2xl rounded-lg border border-water-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Saved sites</h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-water-700">No sites yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-water-100">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium text-water-900">{e.name}</div>
                  <div className="text-xs text-water-700">
                    Updated {new Date(e.updatedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/view/${e.id}`)}
                    className="rounded bg-water-600 px-3 py-1 text-sm text-white hover:bg-water-700"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/plan/${e.id}`)}
                    className="rounded border border-water-300 px-3 py-1 text-sm text-water-900 hover:bg-water-100"
                  >
                    Add/Edit Plans
                  </button>
                  <button
                    type="button"
                    onClick={() => open(e.id)}
                    className="rounded border border-water-300 px-3 py-1 text-sm text-water-900 hover:bg-water-100"
                  >
                    Edit Map
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(e.id)}
                    className="rounded border border-red-200 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SatelliteImportDialog
        open={satelliteOpen}
        onCancel={() => setSatelliteOpen(false)}
        onConfirm={newSiteFromSatellite}
      />
    </div>
  );
}
