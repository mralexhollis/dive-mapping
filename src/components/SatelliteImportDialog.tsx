import { useEffect, useRef, useState } from 'react';
import {
  fetchSatelliteComposite,
  MAX_ZOOM,
  MAX_TILE_GRID,
  MIN_ZOOM,
  parseGoogleMapsUrl,
  parseLatLonString,
  type SatelliteComposite,
} from '../utils/satelliteTiles';

interface SatelliteImportDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (composite: SatelliteComposite) => void;
}

const DEFAULT_ZOOM = 19;
const DEFAULT_GRID = 3;

/**
 * Modal that drives the "Start from satellite image" flow. The user supplies
 * a location (lat/lon, a pasted Google Maps URL, or a "lat, lon" string),
 * picks a zoom and grid size, previews the composite, and confirms — at
 * which point the parent creates a new site with the imagery placed as a
 * calibrated illustration.
 */
export default function SatelliteImportDialog({
  open,
  onCancel,
  onConfirm,
}: SatelliteImportDialogProps) {
  const [urlInput, setUrlInput] = useState('');
  const [lat, setLat] = useState<string>('');
  const [lon, setLon] = useState<string>('');
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [gridSize, setGridSize] = useState(DEFAULT_GRID);
  const [composite, setComposite] = useState<SatelliteComposite | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset the dialog state every time it reopens, so a previous run's
  // composite doesn't show on a fresh launch.
  useEffect(() => {
    if (!open) {
      setComposite(null);
      setError(null);
      setLoading(false);
      setProgress(null);
      abortRef.current?.abort();
    }
  }, [open]);

  if (!open) return null;

  const tryParse = () => {
    const fromUrl = parseGoogleMapsUrl(urlInput);
    const fromLatLon = parseLatLonString(urlInput);
    const parsed = fromUrl ?? fromLatLon;
    if (!parsed) {
      setError(
        'Could not read a location from that string. Paste a Google Maps URL (the part with @lat,lon,zoomz) or just "lat, lon".',
      );
      return;
    }
    setError(null);
    setLat(String(parsed.lat));
    setLon(String(parsed.lon));
    if (parsed.zoom != null) setZoom(clampZoom(parsed.zoom));
  };

  const fetchPreview = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setComposite(null);
    setLoading(true);
    setProgress({ loaded: 0, total: gridSize * gridSize });
    try {
      const latNum = Number(lat);
      const lonNum = Number(lon);
      if (!isFinite(latNum) || !isFinite(lonNum)) {
        throw new Error('Enter a valid latitude and longitude.');
      }
      if (latNum < -85 || latNum > 85) {
        throw new Error('Latitude must be between -85 and 85.');
      }
      const c = await fetchSatelliteComposite({
        centerLat: latNum,
        centerLon: lonNum,
        zoom,
        gridSize,
        signal: ctrl.signal,
        onProgress: (loaded, total) => setProgress({ loaded, total }),
      });
      if (!ctrl.signal.aborted) setComposite(c);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(
        e instanceof Error
          ? e.message
          : 'Failed to fetch satellite imagery. Check your connection and try again.',
      );
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };

  const canFetch = lat !== '' && lon !== '' && !loading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Start from satellite image"
    >
      <div className="flex w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-water-200 px-4 py-3">
          <h2 className="text-base font-semibold text-water-900">Start from satellite image</h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-water-700 hover:bg-water-100"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <p className="text-xs text-water-700">
            Paste a Google Maps URL or coordinates of your dive site, pick a zoom level, and we'll fetch a satellite image you can use as a to-scale reference.
          </p>

          <label className="flex flex-col gap-1 text-xs text-water-700">
            Google Maps URL or "lat, lon"
            <span className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.google.com/maps/@36.5298,-6.2932,18z"
                className="min-w-0 flex-1 rounded border border-water-200 px-2 py-1 text-sm text-water-900"
              />
              <button
                type="button"
                onClick={tryParse}
                disabled={!urlInput.trim()}
                className="rounded border border-water-300 bg-white px-3 py-1 text-xs font-medium text-water-900 hover:bg-water-100 disabled:cursor-not-allowed disabled:text-water-400"
              >
                Parse
              </button>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-water-700">
              Latitude
              <input
                type="number"
                step="0.000001"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="rounded border border-water-200 px-2 py-1 text-sm text-water-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-water-700">
              Longitude
              <input
                type="number"
                step="0.000001"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                className="rounded border border-water-200 px-2 py-1 text-sm text-water-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-water-700">
              Zoom ({zoom})
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={1}
                value={zoom}
                onChange={(e) => setZoom(clampZoom(Number(e.target.value)))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-water-700">
              Grid ({gridSize}×{gridSize} tiles)
              <input
                type="range"
                min={1}
                max={MAX_TILE_GRID}
                step={1}
                value={gridSize}
                onChange={(e) => setGridSize(Math.max(1, Math.min(MAX_TILE_GRID, Number(e.target.value))))}
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchPreview}
              disabled={!canFetch}
              className="rounded bg-water-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-water-800 disabled:cursor-not-allowed disabled:bg-water-300"
            >
              {loading ? 'Fetching…' : composite ? 'Refresh preview' : 'Preview'}
            </button>
            {loading && progress && (
              <span className="text-xs text-water-600">
                Loaded {progress.loaded}/{progress.total} tiles…
              </span>
            )}
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {composite && (
            <div className="flex flex-col gap-2">
              <div className="overflow-hidden rounded border border-water-200">
                <img
                  src={composite.dataUrl}
                  alt="Satellite preview"
                  className="block max-h-72 w-full object-contain"
                />
              </div>
              <div className="text-[11px] text-water-600">
                ~{Math.round(composite.worldWidthM)} m × {Math.round(composite.worldHeightM)} m
                {' · '}
                {composite.metersPerPixel.toFixed(2)} m/pixel
                {' · '}
                Imagery © Esri, Maxar, Earthstar Geographics, GIS User Community
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-water-200 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-water-300 px-3 py-1.5 text-sm text-water-900 hover:bg-water-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => composite && onConfirm(composite)}
            disabled={!composite}
            className="rounded bg-water-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-water-800 disabled:cursor-not-allowed disabled:bg-water-300"
          >
            Create site
          </button>
        </footer>
      </div>
    </div>
  );
}

function clampZoom(z: number): number {
  if (!isFinite(z)) return DEFAULT_ZOOM;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z)));
}
