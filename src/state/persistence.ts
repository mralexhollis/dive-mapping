import { siteFromJson, siteToJson, trySiteFromJson } from '../domain/serialize';
import { layoutSite } from '../domain/layout';
import type { LayerKey, Site, UUID } from '../domain/types';
import { useSiteStore } from './useSiteStore';

const SITE_PREFIX = 'dive-mapping:sites:';
const INDEX_KEY = 'dive-mapping:index';

export interface SiteIndexEntry {
  id: UUID;
  name: string;
  updatedAt: string;
}

export function loadIndex(): SiteIndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveIndex(entries: SiteIndexEntry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

export function loadSite(id: UUID): Site | null {
  try {
    const raw = localStorage.getItem(SITE_PREFIX + id);
    return raw ? trySiteFromJson(raw) : null;
  } catch {
    return null;
  }
}

export function saveSite(site: Site): void {
  try {
    localStorage.setItem(SITE_PREFIX + site.id, siteToJson(site));
    const idx = loadIndex().filter((e) => e.id !== site.id);
    idx.unshift({ id: site.id, name: site.meta.name, updatedAt: site.meta.updatedAt });
    saveIndex(idx);
  } catch {
    // Quota exceeded or unavailable — silently swallow for MVP.
  }
}

export function deleteSite(id: UUID): void {
  localStorage.removeItem(SITE_PREFIX + id);
  saveIndex(loadIndex().filter((e) => e.id !== id));
}

/**
 * Subscribe the store to localStorage. Debounced so rapid edits coalesce into
 * a single write. Returns an unsubscribe function.
 */
export function attachAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSiteRef = useSiteStore.getState().site;
  const unsub = useSiteStore.subscribe((state) => {
    if (state.site === lastSiteRef) return;
    lastSiteRef = state.site;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => saveSite(state.site), 300);
  });
  return () => {
    unsub();
    if (timer) clearTimeout(timer);
  };
}

export function exportSiteAsJsonDownload(site: Site): void {
  const blob = new Blob([siteToJson(site)], { type: 'application/json' });
  triggerDownload(blob, `${slugify(site.meta.name)}.json`);
}

export async function importSiteFromFile(file: File): Promise<Site> {
  const text = await file.text();
  return siteFromJson(text);
}

export function exportSvgDownload(svg: SVGSVGElement, baseName: string): void {
  const clone = prepareSvgForExport(svg);
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: 'image/svg+xml' });
  triggerDownload(blob, `${slugify(baseName)}.svg`);
}

export async function exportPngDownload(
  svg: SVGSVGElement,
  baseName: string,
  pixelRatio = 2,
): Promise<void> {
  const rect = svg.getBoundingClientRect();
  const clone = prepareSvgForExport(svg);
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
    canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#d6ecf5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    await new Promise<void>((resolve) =>
      canvas.toBlob((png) => {
        if (png) triggerDownload(png, `${slugify(baseName)}.png`);
        resolve();
      }, 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * SVG presentation properties we copy from `getComputedStyle` onto each
 * element's attributes so the standalone SVG renders correctly without
 * the page's stylesheet.
 */
const SVG_STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'paint-order',
] as const;

/**
 * Clone the live SVG and inline every Tailwind / CSS-derived style onto each
 * element as direct SVG attributes, then size the root explicitly so external
 * renderers (canvas, image viewers) don't rely on page CSS or the rendered
 * bounding box.
 *
 * If the editor's print area is on, the export crops to the print area in
 * world coordinates and strips overlay UI (compass / scale / legend / handles
 * / pending previews / the print-area indicator itself).
 */
function prepareSvgForExport(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const store = useSiteStore.getState();
  const printArea = resolveExportPrintArea(store.site, store.editor.showPrintArea);

  if (printArea) {
    // World-coord crop. Drop the canvas's viewport translate/scale, keep
    // the screen-bearing rotation but pivot it on the print-area centre so
    // the export shows the print area in its on-screen orientation.
    const ppm = 4; // pixels per metre — yields ~A3-class image at typical sizes.
    const w = Math.max(1, Math.round(printArea.width * ppm));
    const h = Math.max(1, Math.round(printArea.height * ppm));
    clone.setAttribute(
      'viewBox',
      `${printArea.x} ${printArea.y} ${printArea.width} ${printArea.height}`,
    );
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));

    const worldG = clone.querySelector('[data-world]');
    if (worldG) {
      const northDeg = store.site.meta.northBearingDeg ?? 0;
      if (northDeg !== 0) {
        const cx = printArea.x + printArea.width / 2;
        const cy = printArea.y + printArea.height / 2;
        worldG.setAttribute('transform', `rotate(${-northDeg} ${cx} ${cy})`);
      } else {
        worldG.removeAttribute('transform');
      }
    }
    // Drop the patternTransform (which mirrored the live viewport transform)
    // so the grid lines align with the print-area's world coordinates.
    const grid = clone.querySelector('#grid');
    if (grid) grid.removeAttribute('patternTransform');

    // Strip every overlay that's positioned in canvas-pixel coords or only
    // makes sense in the editor.
    const strip = [
      'compass',
      'scale',
      'legend',
      'print-area',
      'rotation-handle',
      'move-handle',
      'resize-handle',
      'waterbody-handles',
      'contour-handles',
      'pending-shoreline',
      'pending-contour',
    ];
    for (const key of strip) {
      for (const el of Array.from(
        clone.querySelectorAll(`[data-sublayer="${key}"]`),
      )) {
        el.parentElement?.removeChild(el);
      }
    }

    // Re-add scale, compass, and (optionally) legend in WORLD coordinates so
    // they're correctly sized & positioned within the print area.
    appendPrintAreaOverlays(clone, store.site, printArea);
  } else {
    const rect = svg.getBoundingClientRect();
    clone.setAttribute('width', String(Math.round(rect.width)));
    clone.setAttribute('height', String(Math.round(rect.height)));
    if (!clone.hasAttribute('viewBox')) {
      clone.setAttribute(
        'viewBox',
        `0 0 ${Math.round(rect.width)} ${Math.round(rect.height)}`,
      );
    }
  }

  inlineComputedStyles(svg, clone);
  return clone;
}

function resolveExportPrintArea(
  site: Site,
  showPrintArea: boolean,
): { x: number; y: number; width: number; height: number } | null {
  if (!showPrintArea) return null;
  if (site.meta.printArea) return site.meta.printArea;
  // Auto-bbox: same logic as the on-canvas indicator.
  const layout = layoutSite(site);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const pos of layout.positions.values()) include(pos.x, pos.y);
  for (const pos of layout.subPoiPositions.values()) include(pos.x, pos.y);
  for (const s of site.layers.measurements.soundings) include(s.x, s.y);
  for (const c of site.layers.depth.contours) for (const p of c.points) include(p.x, p.y);
  for (const l of site.layers.depth.labels ?? []) include(l.x, l.y);
  for (const sh of site.layers.waterBody.shoreline) for (const p of sh.points) include(p.x, p.y);
  for (const it of site.layers.illustrations.items) {
    include(it.x, it.y);
    include(it.x + it.width, it.y + it.height);
  }
  for (const n of site.layers.notes.notes) {
    if (n.position) include(n.position.x, n.position.y);
  }
  if (!Number.isFinite(minX)) return null;
  const w = maxX - minX;
  const h = maxY - minY;
  const margin = Math.max(20, Math.max(w, h) * 0.1);
  return {
    x: minX - margin,
    y: minY - margin,
    width: w + margin * 2,
    height: h + margin * 2,
  };
}

// Re-export so the helper above can compile against the LayerKey union when
// future layers join.
export type { LayerKey };

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs: Record<string, string | number>, children?: (Node | string)[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (children) {
    for (const c of children) {
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
  }
  return el;
}

function niceRoundMeters(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const r = value / base;
  if (r < 1.5) return base;
  if (r < 3) return 2 * base;
  if (r < 7) return 5 * base;
  return 10 * base;
}

function formatMeters(m: number): string {
  if (m >= 1000) return `${m / 1000} km`;
  if (m >= 1) return `${m} m`;
  return `${Math.round(m * 100) / 100} m`;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function appendPrintAreaOverlays(svg: SVGSVGElement, site: Site, area: Rect): void {
  const overlay = svgEl('g', { 'data-export-overlay': '' });
  overlay.appendChild(buildExportScaleBar(area));
  overlay.appendChild(buildExportCompass(area, site.meta.northBearingDeg ?? 0));
  if (site.meta.showLegend) {
    const legend = buildExportLegend(area, site);
    if (legend) overlay.appendChild(legend);
  }
  svg.appendChild(overlay);
}

function buildExportScaleBar(area: Rect): SVGElement {
  const margin = Math.max(area.width, area.height) * 0.025;
  const target = area.width / 6;
  const niceM = niceRoundMeters(target);
  const fontSize = Math.max(area.width, area.height) * 0.022;
  const tickH = Math.max(0.4, niceM * 0.05);
  const right = area.x + area.width - margin;
  const left = right - niceM;
  const baseY = area.y + area.height - margin;
  const stroke = Math.max(0.3, niceM * 0.012);
  return svgEl(
    'g',
    { 'data-export-overlay': 'scale' },
    [
      svgEl('rect', {
        x: left - margin * 0.4,
        y: baseY - tickH - fontSize - margin * 0.4,
        width: niceM + margin * 0.8,
        height: tickH * 2 + fontSize + margin * 0.7,
        fill: 'rgba(255,255,255,0.85)',
        stroke: '#94a3b8',
        'stroke-width': stroke * 0.5,
        rx: margin * 0.2,
      }),
      svgEl('line', {
        x1: left,
        y1: baseY,
        x2: right,
        y2: baseY,
        stroke: '#0f172a',
        'stroke-width': stroke,
      }),
      svgEl('line', {
        x1: left,
        y1: baseY - tickH,
        x2: left,
        y2: baseY + tickH,
        stroke: '#0f172a',
        'stroke-width': stroke,
      }),
      svgEl('line', {
        x1: right,
        y1: baseY - tickH,
        x2: right,
        y2: baseY + tickH,
        stroke: '#0f172a',
        'stroke-width': stroke,
      }),
      svgEl(
        'text',
        {
          x: (left + right) / 2,
          y: baseY - tickH * 1.2,
          'font-size': fontSize,
          'text-anchor': 'middle',
          fill: '#0f172a',
          'font-family': 'ui-sans-serif, system-ui, sans-serif',
        },
        [formatMeters(niceM)],
      ),
    ],
  );
}

function buildExportCompass(area: Rect, northDeg: number): SVGElement {
  const margin = Math.max(area.width, area.height) * 0.025;
  const r = Math.min(area.width, area.height) * 0.04;
  const cx = area.x + margin + r;
  const cy = area.y + area.height - margin - r;
  const stroke = r * 0.05;
  const fontSize = r * 0.55;
  const arrowGroup = svgEl('g', { transform: `rotate(${-northDeg} ${cx} ${cy})` }, [
    svgEl('line', {
      x1: cx,
      y1: cy + r * 0.6,
      x2: cx,
      y2: cy - r * 0.85,
      stroke: '#0f172a',
      'stroke-width': stroke * 1.5,
    }),
    svgEl('polygon', {
      points: `${cx},${cy - r * 0.95} ${cx - r * 0.22},${cy - r * 0.5} ${cx + r * 0.22},${cy - r * 0.5}`,
      fill: '#dc2626',
      stroke: '#7f1d1d',
      'stroke-width': stroke,
    }),
    svgEl(
      'text',
      {
        x: cx,
        y: cy - r * 1.2,
        'font-size': fontSize,
        'text-anchor': 'middle',
        fill: '#0f172a',
        'font-weight': 700,
        'font-family': 'ui-sans-serif, system-ui, sans-serif',
      },
      ['N'],
    ),
  ]);
  return svgEl('g', { 'data-export-overlay': 'compass' }, [
    svgEl('circle', {
      cx,
      cy,
      r,
      fill: 'rgba(255,255,255,0.92)',
      stroke: '#94a3b8',
      'stroke-width': stroke,
    }),
    arrowGroup,
  ]);
}

function buildExportLegend(area: Rect, site: Site): SVGElement | null {
  const ordered = [...site.layers.poi.pois]
    .filter((p) => p.number != null)
    .sort((a, b) => a.number! - b.number!);
  if (ordered.length === 0) return null;
  const margin = Math.max(area.width, area.height) * 0.025;
  const lineH = Math.max(area.width, area.height) * 0.025;
  const padX = lineH * 0.6;
  const padY = lineH * 0.4;
  const headerSize = lineH * 0.85;
  const rowSize = lineH * 0.7;
  const boxW = Math.min(area.width * 0.32, lineH * 14);
  const boxH = padY * 2 + headerSize + ordered.length * lineH;
  const x = area.x + area.width - margin - boxW;
  const y = area.y + margin;
  const stroke = Math.max(0.3, lineH * 0.04);
  const children: Node[] = [
    svgEl('rect', {
      x,
      y,
      width: boxW,
      height: boxH,
      fill: 'rgba(255,255,255,0.93)',
      stroke: '#94a3b8',
      'stroke-width': stroke,
      rx: lineH * 0.2,
    }),
    svgEl(
      'text',
      {
        x: x + padX,
        y: y + padY + headerSize * 0.85,
        'font-size': headerSize,
        'font-weight': 700,
        fill: '#0f172a',
        'font-family': 'ui-sans-serif, system-ui, sans-serif',
      },
      ['Legend'],
    ),
  ];
  ordered.forEach((p, i) => {
    const text = `${p.number}. ${p.name}${p.depth != null ? ` (${p.depth} m)` : ''}`;
    children.push(
      svgEl(
        'text',
        {
          x: x + padX,
          y: y + padY + headerSize + (i + 1) * lineH,
          'font-size': rowSize,
          fill: '#0f172a',
          'font-family': 'ui-sans-serif, system-ui, sans-serif',
        },
        [text],
      ),
    );
  });
  return svgEl('g', { 'data-export-overlay': 'legend' }, children);
}

function inlineComputedStyles(original: SVGSVGElement, clone: SVGSVGElement): void {
  // Walk both trees in lockstep — cloneNode(true) preserves order so the
  // querySelectorAll('*') indices align.
  const originals = original.querySelectorAll<Element>('*');
  const clones = clone.querySelectorAll<Element>('*');
  const len = Math.min(originals.length, clones.length);
  for (let i = 0; i < len; i++) {
    const o = originals[i]!;
    const c = clones[i]!;
    const cs = window.getComputedStyle(o);
    for (const prop of SVG_STYLE_PROPS) {
      const v = cs.getPropertyValue(prop).trim();
      if (!v || v === 'normal') continue;
      // Don't smother an explicit fill/stroke="none" with the computed value.
      const existing = c.getAttribute(prop);
      if (existing && existing !== '') continue;
      c.setAttribute(prop, v);
    }
    // Tailwind classes on the clone are no longer needed and clutter the export.
    if (c.hasAttribute('class')) c.removeAttribute('class');
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
}
