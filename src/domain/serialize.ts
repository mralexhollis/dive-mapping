import { z } from 'zod';
import type { Site } from './types';

const point = z.object({ x: z.number(), y: z.number() }).passthrough();

const layerMeta = z.object({
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: z.number().min(0).max(1),
});

const shorelinePath = z
  .object({
    id: z.string(),
    shape: z.enum(['shoreline', 'lake', 'cave']).optional(),
    points: z.array(point),
    closed: z.boolean(),
    label: z.string().optional(),
  })
  .passthrough();

const waterBodyLayer = layerMeta
  .extend({
    type: z.enum(['lake', 'beach', 'open_water', 'quarry', 'river', 'pool', 'other']),
    shoreline: z.array(shorelinePath),
    fillColor: z.string().optional(),
  })
  .passthrough();

const depthSounding = z
  .object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    depth: z.number(),
    source: z.enum(['survey', 'estimated']).optional(),
  })
  .passthrough();

const contourLine = z
  .object({
    id: z.string(),
    depth: z.number(),
    label: z.string().optional(),
    labelHidden: z.boolean().optional(),
    points: z.array(point),
    closed: z.boolean().optional(),
    origin: z.enum(['manual', 'derived']),
  })
  .passthrough();

const depthLabel = z
  .object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    depth: z.number(),
    rotationDeg: z.number().optional(),
    origin: z.enum(['manual', 'derived']).optional(),
    kind: z.enum(['contour', 'reference']).optional(),
  })
  .passthrough();

const depthLayer = layerMeta
  .extend({
    grid: z
      .object({
        originX: z.number(),
        originY: z.number(),
        spacing: z.number().positive(),
      })
      .optional(),
    /** Legacy: soundings used to live here. Migration moves them to measurements. */
    soundings: z.array(depthSounding).optional(),
    contours: z.array(contourLine),
    labels: z.array(depthLabel).optional(),
    defaultDepth: z.number().optional(),
  })
  .passthrough();

const measurementsLayer = layerMeta
  .extend({
    soundings: z.array(depthSounding),
    defaultDepth: z.number().optional(),
    snapToGridCenter: z.boolean().optional(),
  })
  .passthrough();

const poi = z
  .object({
    id: z.string(),
    number: z.number().optional(),
    name: z.string(),
    type: z.enum(['wreck', 'vehicle', 'natural', 'structure', 'anchor', 'mooring', 'landmark', 'other']),
    depth: z.number().optional(),
    notes: z.string().optional(),
    gps: z.object({ lat: z.number(), lon: z.number() }).optional(),
    position: point.optional(),
    labelPosition: z.enum(['right', 'left', 'above', 'below', 'hidden']).optional(),
  })
  .passthrough();

const bearing = z
  .object({
    id: z.string(),
    fromId: z.string(),
    toId: z.string(),
    bearingDeg: z.number(),
    reverseBearingDeg: z.number().optional(),
    distanceM: z.number().optional(),
    label: z.string().optional(),
    style: z.enum(['solid', 'dashed']).optional(),
  })
  .passthrough();

const poiLayer = layerMeta
  .extend({
    pois: z.array(poi),
    bearings: z.array(bearing),
  })
  .passthrough();

const subPoi = z
  .object({
    id: z.string(),
    parentId: z.string(),
    name: z.string(),
    category: z.enum([
      'fish',
      'coral',
      'hazard_high',
      'hazard_standard',
      'hazard_awareness',
      'access',
      'photo_spot',
      'note',
      'other',
      // Legacy values; migrated at parse time.
      'hazard',
      'entry',
      'exit',
      'penetration',
    ]),
    offset: point,
    bearingFromParentDeg: z.number().optional(),
    distanceFromParentM: z.number().optional(),
    depth: z.number().optional(),
    notes: z.string().optional(),
    icon: z.string().optional(),
    labelPosition: z.enum(['right', 'left', 'above', 'below', 'hidden']).optional(),
  })
  .passthrough();

const subPoiLayer = layerMeta.extend({ items: z.array(subPoi) }).passthrough();

const illustration = z
  .object({
    id: z.string(),
    kind: z.enum(['image', 'primitive']).optional(),
    src: z.string().optional(),
    mimeType: z
      .enum(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
      .optional(),
    primitive: z.enum(['boat', 'square', 'circle', 'triangle']).optional(),
    fill: z.string().optional(),
    stroke: z.string().optional(),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    rotationDeg: z.number().optional(),
    placement: z.enum(['under', 'over']),
    opacity: z.number().min(0).max(1).optional(),
    caption: z.string().optional(),
  })
  .passthrough();

const illustrationLayer = layerMeta.extend({ items: z.array(illustration) }).passthrough();

const note = z
  .object({
    id: z.string(),
    attachTo: z
      .object({ kind: z.enum(['poi', 'subpoi', 'contour']), id: z.string() })
      .optional(),
    position: point.optional(),
    text: z.string(),
    color: z.string().optional(),
    createdAt: z.string(),
  })
  .passthrough();

const notesLayer = layerMeta.extend({ notes: z.array(note) }).passthrough();

const siteMeta = z
  .object({
    name: z.string(),
    subtitle: z.string().optional(),
    edition: z.string().optional(),
    northBearingDeg: z.number(),
    scaleMetersPerUnit: z.number().positive(),
    gridSpacingMeters: z.number().positive().optional(),
    showLegend: z.boolean().optional(),
    printArea: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

const layerKey = z.enum(['waterBody', 'depth', 'measurements', 'poi', 'subPoi', 'illustrations', 'notes']);

export const siteSchema = z
  .object({
    id: z.string(),
    schemaVersion: z.literal(1),
    meta: siteMeta,
    layers: z
      .object({
        waterBody: waterBodyLayer,
        depth: depthLayer,
        // Optional in zod for legacy import; the migration step ensures it
        // is always present on the parsed Site value.
        measurements: measurementsLayer.optional(),
        poi: poiLayer,
        subPoi: subPoiLayer,
        illustrations: illustrationLayer,
        notes: notesLayer,
      })
      .passthrough(),
    layerOrder: z.array(layerKey),
  })
  .passthrough();

export type ParsedSite = z.infer<typeof siteSchema>;

/** Serialise a site to a pretty-printed JSON string. */
export function siteToJson(site: Site): string {
  return JSON.stringify(site, null, 2);
}

/**
 * Parse and validate a JSON site document. Throws on malformed input.
 * Unknown fields are preserved (for forward compatibility).
 */
export function siteFromJson(json: string): Site {
  const parsed = JSON.parse(json);
  const v = siteSchema.parse(parsed);
  return migrateAfterParse(v) as Site;
}

/**
 * Bring legacy site documents up to the current shape. Currently:
 * - Ensure the `measurements` layer exists.
 * - Move legacy `depth.soundings` into `measurements.soundings`.
 * - Make sure `layerOrder` references the measurements layer.
 */
function migrateAfterParse(s: ParsedSite): ParsedSite {
  const layers = s.layers as ParsedSite['layers'] & Record<string, unknown>;
  const depth = layers.depth as { soundings?: unknown[] } & Record<string, unknown>;
  if (!('measurements' in layers) || layers.measurements == null) {
    layers.measurements = {
      visible: true,
      locked: false,
      opacity: 1,
      soundings: [],
    };
  }
  const measurements = layers.measurements as {
    soundings: unknown[];
    defaultDepth?: number;
  };
  const legacy = Array.isArray(depth.soundings) ? depth.soundings : [];
  if (legacy.length > 0) {
    measurements.soundings = [...measurements.soundings, ...legacy];
    depth.soundings = [];
  }
  // Default depth used to live on the depth layer; move it to measurements.
  if (typeof depth.defaultDepth === 'number' && measurements.defaultDepth == null) {
    measurements.defaultDepth = depth.defaultDepth;
    delete depth.defaultDepth;
  }
  if (!s.layerOrder.includes('measurements')) {
    // Insert directly after waterBody so soundings render between the water
    // body fill and the depth contours.
    const i = s.layerOrder.indexOf('waterBody');
    if (i >= 0) {
      s.layerOrder = [
        ...s.layerOrder.slice(0, i + 1),
        'measurements',
        ...s.layerOrder.slice(i + 1),
      ];
    } else {
      s.layerOrder = [...s.layerOrder, 'measurements'];
    }
  }
  // Sub-POI category cleanup: collapse legacy values.
  const subItems = (s.layers as ParsedSite['layers']).subPoi.items as Array<{ category: string }>;
  for (const it of subItems) {
    if (it.category === 'hazard') it.category = 'hazard_standard';
    else if (it.category === 'entry' || it.category === 'exit' || it.category === 'penetration') {
      it.category = 'access';
    }
  }
  return s;
}

/** Quietly try to parse — returns null on any failure. */
export function trySiteFromJson(json: string): Site | null {
  try {
    return siteFromJson(json);
  } catch {
    return null;
  }
}
