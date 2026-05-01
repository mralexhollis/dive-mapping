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
    <div className="flex h-full flex-col items-center justify-start gap-6 overflow-y-auto bg-water-50 p-4 text-water-900 sm:p-8">
      <div
        role="alert"
        className="w-full max-w-3xl shrink-0 rounded-lg border-2 border-red-400 bg-red-50 p-4 text-red-900 shadow-sm"
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

      {/* Hero / intro */}
      <section className="w-full max-w-3xl shrink-0 rounded-lg border border-water-200 bg-gradient-to-br from-water-700 via-water-600 to-water-500 p-6 text-white shadow-sm sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Dive Mapping</h1>
        <p className="mt-2 max-w-2xl text-sm text-water-100 sm:text-base">
          A lightweight planner for mapping dive sites and walking through
          dive routes — bearings, depths, gas, and a Bühlmann deco read-out
          all in one place.
        </p>
        <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
          <FeatureBullet>
            Designed to make mapping dive sites more accessible.
          </FeatureBullet>
          <FeatureBullet>
            Combines bearing-graph maps with richer visuals — satellite
            reference imagery, depth contours, scale.
          </FeatureBullet>
          <FeatureBullet>
            Detailed site drawing with illustrations, POIs and sub-POIs.
          </FeatureBullet>
          <FeatureBullet>
            Build routes from existing POIs or free waypoints, with safety
            stops and dive-order ordering.
          </FeatureBullet>
          <FeatureBullet>
            Simple gas-consumption and ZHL-16C decompression estimates per
            diver profile.
          </FeatureBullet>
        </ul>
        <div className="mt-5 rounded border border-white/20 bg-white/10 p-3 text-xs text-water-100 sm:text-sm">
          <p>
            <strong className="font-semibold text-white">Local-only for now.</strong>{' '}
            Your maps and routes live in this browser's local storage —
            nothing is uploaded. Try{' '}
            <button
              type="button"
              onClick={loadStoneyTestMap}
              className="underline underline-offset-2 hover:text-white"
            >
              Load test map — Stoney
            </button>{' '}
            below to see what a finished site looks like.
          </p>
          <p className="mt-1.5 text-water-200">
            Future updates will add cloud saving and sharing of maps and
            routes.
          </p>
        </div>
      </section>

      {/* Sites + add actions */}
      <section className="w-full max-w-3xl shrink-0 rounded-lg border border-water-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Your sites</h2>
          <span className="text-xs text-water-600">
            {entries.length === 0
              ? 'No sites yet — start by adding one below.'
              : `${entries.length} saved`}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={newSite}
            className="rounded bg-water-600 px-4 py-2 text-sm text-white hover:bg-water-700"
          >
            + New site
          </button>
          <button
            type="button"
            onClick={() => setSatelliteOpen(true)}
            className="rounded border border-water-300 px-4 py-2 text-sm text-water-900 hover:bg-water-100"
            title="Start with a satellite image as a to-scale reference"
          >
            From satellite image…
          </button>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="rounded border border-water-300 px-4 py-2 text-sm text-water-900 hover:bg-water-100"
          >
            Import JSON…
          </button>
          <button
            type="button"
            onClick={loadStoneyTestMap}
            className="rounded border border-water-300 px-4 py-2 text-sm text-water-900 hover:bg-water-100"
            title="Load the bundled Stoney Cove draft as a sample site"
          >
            Load test map — Stoney
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

        {entries.length > 0 && (
          <ul className="mt-5 divide-y divide-water-100 border-t border-water-100">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-water-900">{e.name}</div>
                  <div className="text-xs text-water-700">
                    Updated {new Date(e.updatedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
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
                    Plans
                  </button>
                  <button
                    type="button"
                    onClick={() => open(e.id)}
                    className="rounded border border-water-300 px-3 py-1 text-sm text-water-900 hover:bg-water-100"
                  >
                    Edit map
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
      </section>

      {/* Diver profiles — visually distinct (subtle, secondary). */}
      <section className="w-full max-w-3xl shrink-0 rounded-lg border border-water-200 bg-water-100/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-water-600 text-white"
            >
              <DiverIcon />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Diver profiles</h2>
              <p className="text-xs text-water-700">
                Cylinder, gas mix, SAC and reserve presets. Used by the
                viewer's "Plan this dive" panel and the route feasibility
                check — set up once, switch in one click.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/profiles')}
            className="shrink-0 rounded border border-water-300 bg-white px-4 py-2 text-sm text-water-900 hover:bg-water-50"
          >
            Manage profiles →
          </button>
        </div>
      </section>

      <SatelliteImportDialog
        open={satelliteOpen}
        onCancel={() => setSatelliteOpen(false)}
        onConfirm={newSiteFromSatellite}
      />
    </div>
  );
}

function FeatureBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold leading-none text-white"
      >
        ✓
      </span>
      <span className="leading-snug">{children}</span>
    </li>
  );
}

function DiverIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Diver mask + fins silhouette: simple circular face + tail. */}
      <circle cx={9} cy={9} r={3} />
      <path d="M 12 11 C 16 11 18 13 19 16" />
      <path d="M 19 16 L 22 14" />
      <path d="M 19 16 L 21 19" />
      <path d="M 6 13 C 5 16 5 19 7 21" />
    </svg>
  );
}
