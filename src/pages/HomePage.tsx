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

  return (
    <div className="flex h-full flex-col items-center justify-start gap-6 overflow-y-auto bg-water-50 p-8 text-water-900">
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
            onClick={() => importRef.current?.click()}
            className="rounded border border-water-300 px-4 py-2 text-water-900 hover:bg-water-100"
          >
            Import JSON…
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
                    onClick={() => open(e.id)}
                    className="rounded bg-water-600 px-3 py-1 text-sm text-white hover:bg-water-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/view/${e.id}`)}
                    className="rounded border border-water-300 px-3 py-1 text-sm text-water-900 hover:bg-water-100"
                  >
                    View
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
    </div>
  );
}
