/**
 * Helpers for fetching satellite imagery from Esri's public World Imagery
 * service and stitching tiles into a single composite that can be embedded
 * in a Site as a calibrated Illustration. Esri's tile service serves CORS
 * and works without an API key for low-volume use.
 *
 * Attribution required: "Source: Esri, Maxar, Earthstar Geographics, and
 * the GIS User Community". The composite caption carries this string.
 */

const TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const TILE_SIZE = 256;

export const SATELLITE_ATTRIBUTION =
  'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 19;
export const MAX_TILE_GRID = 6;

/** Web-Mercator conversion: lon → fractional tile X at zoom z. */
export function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * Math.pow(2, z);
}

/** Web-Mercator conversion: lat → fractional tile Y at zoom z. */
export function latToTileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    (1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
    2 *
    Math.pow(2, z)
  );
}

/** Inverse: fractional tile X at zoom z → longitude. */
export function tileXToLon(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

/** Inverse: fractional tile Y at zoom z → latitude. */
export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Metres per pixel at a given latitude and zoom level. */
export function metersPerPixel(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (156543.03392 * Math.cos(latRad)) / Math.pow(2, z);
}

export interface ParsedLocation {
  lat: number;
  lon: number;
  zoom?: number;
}

/**
 * Best-effort parser for common Google Maps URL formats. Recognises:
 *  - https://www.google.com/maps/@LAT,LON,ZOOMz
 *  - https://maps.google.com/?q=LAT,LON
 *  - https://www.google.com/maps/place/.../@LAT,LON,ZOOMz/...
 * Returns null when the URL doesn't carry coordinates.
 */
export function parseGoogleMapsUrl(input: string): ParsedLocation | null {
  const text = input.trim();
  if (!text) return null;
  // The "@LAT,LON,ZOOMz" pattern (the most common form).
  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/i);
  if (at) {
    return {
      lat: Number(at[1]),
      lon: Number(at[2]),
      zoom: at[3] ? Math.round(Number(at[3])) : undefined,
    };
  }
  // The "?q=LAT,LON" form.
  const q = text.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (q) return { lat: Number(q[1]), lon: Number(q[2]) };
  return null;
}

/** Bare "lat, lon" or "lat lon" string; pasted from a coordinate field. */
export function parseLatLonString(input: string): ParsedLocation | null {
  const m = input
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (lat < -85 || lat > 85 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/** Fetch one tile as an HTMLImageElement; resolves once the image is loaded. */
function loadTileImage(z: number, x: number, y: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load tile ${z}/${x}/${y}`));
    img.src = TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  });
}

export interface SatelliteComposite {
  /** PNG data URL of the stitched composite. */
  dataUrl: string;
  /** Width / height in pixels. */
  pxWidth: number;
  pxHeight: number;
  /** Real-world dimensions in metres at the centre latitude. */
  worldWidthM: number;
  worldHeightM: number;
  /** Centre latitude/longitude (echo back for caller). */
  centerLat: number;
  centerLon: number;
  /** Zoom level used for the fetch. */
  zoom: number;
  /** Metres per pixel at the centre latitude. */
  metersPerPixel: number;
}

export interface FetchOptions {
  centerLat: number;
  centerLon: number;
  zoom: number;
  /** Number of tiles in each direction; the composite is `gridSize × gridSize` tiles. */
  gridSize: number;
  /** Optional progress callback ({loaded, total}). */
  onProgress?: (loaded: number, total: number) => void;
  /** AbortSignal so the dialog can cancel a long fetch. */
  signal?: AbortSignal;
}

/**
 * Fetch a `gridSize × gridSize` square of Esri World Imagery tiles centred
 * on `centerLat/centerLon` at zoom level `zoom`, then stitch them onto a
 * single canvas. Returns a PNG data URL plus metadata for placement.
 */
export async function fetchSatelliteComposite(
  opts: FetchOptions,
): Promise<SatelliteComposite> {
  const { centerLat, centerLon, zoom, onProgress, signal } = opts;
  const gridSize = Math.max(1, Math.min(MAX_TILE_GRID, Math.round(opts.gridSize)));

  const fx = lonToTileX(centerLon, zoom);
  const fy = latToTileY(centerLat, zoom);

  // Top-left tile coords so the centre falls in the middle of the grid.
  const tileX0 = Math.floor(fx - gridSize / 2);
  const tileY0 = Math.floor(fy - gridSize / 2);

  // Sub-pixel offset of the centre within the composite.
  const centerOffsetPx = {
    x: (fx - tileX0) * TILE_SIZE,
    y: (fy - tileY0) * TILE_SIZE,
  };
  void centerOffsetPx; // currently unused; here in case we crop later.

  const total = gridSize * gridSize;
  let loaded = 0;
  const tasks: Array<Promise<{ x: number; y: number; img: HTMLImageElement }>> = [];
  for (let dy = 0; dy < gridSize; dy++) {
    for (let dx = 0; dx < gridSize; dx++) {
      const tx = tileX0 + dx;
      const ty = tileY0 + dy;
      tasks.push(
        loadTileImage(zoom, tx, ty).then((img) => {
          loaded++;
          onProgress?.(loaded, total);
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          return { x: dx, y: dy, img };
        }),
      );
    }
  }

  const tiles = await Promise.all(tasks);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const pxWidth = gridSize * TILE_SIZE;
  const pxHeight = gridSize * TILE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = pxWidth;
  canvas.height = pxHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a 2D canvas context');
  for (const t of tiles) {
    ctx.drawImage(t.img, t.x * TILE_SIZE, t.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  const mPerPx = metersPerPixel(centerLat, zoom);
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.85),
    pxWidth,
    pxHeight,
    worldWidthM: pxWidth * mPerPx,
    worldHeightM: pxHeight * mPerPx,
    centerLat,
    centerLon,
    zoom,
    metersPerPixel: mPerPx,
  };
}
