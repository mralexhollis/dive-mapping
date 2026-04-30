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
    labelOffset: z.number().min(0).max(1).optional(),
    labelRepeat: z.number().int().min(1).max(5).optional(),
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
    fontSize: z.number().positive().optional(),
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
    // Accepts a numeric sequence number ("1", "2") or a hand-typed label
    // ("A", "B", "X1"). Stored as-is so the legend honours the user's choice.
    number: z.union([z.number(), z.string()]).optional(),
    name: z.string(),
    type: z.enum([
      'wreck',
      'vehicle',
      'natural',
      'structure',
      'anchor',
      'mooring',
      'entry_exit',
      'landmark',
      'other',
    ]),
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
    labelFontSize: z.number().positive().optional(),
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

const illustrationLine = z
  .object({
    id: z.string(),
    points: z.array(point),
    // Accepts a numeric width (current shape) or the legacy 'narrow' / 'wide'
    // strings. Legacy values are normalised to numbers in migrateAfterParse.
    width: z.union([z.number().positive(), z.enum(['narrow', 'wide'])]),
    label: z.string().optional(),
    labelPosition: z.enum(['above', 'below', 'on', 'hidden']).optional(),
    color: z.string().optional(),
    style: z.enum(['solid', 'dashed']).optional(),
  })
  .passthrough();

const illustrationLayer = layerMeta
  .extend({
    items: z.array(illustration),
    lines: z.array(illustrationLine).optional(),
  })
  .passthrough();

const referenceLayer = layerMeta.extend({ items: z.array(illustration) }).passthrough();

const note = z
  .object({
    id: z.string(),
    attachTo: z
      .object({ kind: z.enum(['poi', 'subpoi', 'contour']), id: z.string() })
      .optional(),
    position: point.optional(),
    text: z.string(),
    color: z.string().optional(),
    bgOpacity: z.number().min(0).max(1).optional(),
    textColor: z.string().optional(),
    connector: z
      .object({
        target: point,
        style: z.enum(['line', 'arrow', 'dot']),
      })
      .optional(),
    createdAt: z.string(),
  })
  .passthrough();

const notesLayer = layerMeta.extend({ notes: z.array(note) }).passthrough();

const gasPlan = z
  .object({
    sacLPerMin: z.number().positive(),
    cylinderL: z.number().positive(),
    startBarPressure: z.number().positive(),
    reserveBarPressure: z.number().nonnegative(),
    rulePolicy: z.enum(['thirds', 'half', 'all-usable']),
    transitSpeedMPerMin: z.number().positive(),
    /**
     * Fraction of oxygen in the breathing gas. Optional in the schema so
     * legacy documents without an O₂ value still parse — the migration
     * fills in `FO2_AIR` (0.21) post-parse.
     */
    fo2: z.number().min(0).max(1).optional(),
  })
  .passthrough();

const waypointBase = {
  id: z.string(),
  bottomTimeMin: z.number().nonnegative().optional(),
  notes: z.string().optional(),
};

const poiRefWaypoint = z
  .object({
    ...waypointBase,
    kind: z.literal('poi'),
    poiRefId: z.string(),
    depthOverrideM: z.number().optional(),
  })
  .passthrough();

const freeWaypoint = z
  .object({
    ...waypointBase,
    kind: z.literal('free'),
    x: z.number(),
    y: z.number(),
    depthM: z.number().optional(),
    name: z.string().optional(),
  })
  .passthrough();

const waypoint = z.discriminatedUnion('kind', [poiRefWaypoint, freeWaypoint]);

const stop = z
  .object({
    id: z.string(),
    waypointId: z.string(),
    kind: z.enum(['safety_stop', 'exercise', 'gas_check', 'observation', 'rest', 'other']),
    name: z.string().optional(),
    durationMin: z.number().nonnegative(),
    notes: z.string().optional(),
  })
  .passthrough();

const route = z
  .object({
    id: z.string(),
    name: z.string(),
    objective: z.enum(['tour', 'training', 'recovery', 'fun', 'survey', 'photo', 'other']).optional(),
    color: z.string(),
    visible: z.boolean(),
    locked: z.boolean(),
    opacity: z.number().min(0).max(1),
    waypoints: z.array(waypoint),
    stops: z.array(stop).optional(),
    gas: gasPlan,
    notes: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

const siteMeta = z
  .object({
    name: z.string(),
    subtitle: z.string().optional(),
    edition: z.string().optional(),
    northBearingDeg: z.number(),
    scaleMetersPerUnit: z.number().positive(),
    gridSpacingMeters: z.number().positive().optional(),
    showLegend: z.boolean().optional(),
    routesVisible: z.boolean().optional(),
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

const layerKey = z.enum([
  'references',
  'waterBody',
  'depth',
  'measurements',
  'poi',
  'subPoi',
  'illustrations',
  'notes',
]);

export const siteSchema = z
  .object({
    id: z.string(),
    schemaVersion: z.literal(1),
    meta: siteMeta,
    layers: z
      .object({
        // Optional in zod for legacy import; the migration ensures it's
        // always present on the parsed Site value.
        references: referenceLayer.optional(),
        waterBody: waterBodyLayer,
        depth: depthLayer,
        measurements: measurementsLayer.optional(),
        poi: poiLayer,
        subPoi: subPoiLayer,
        illustrations: illustrationLayer,
        notes: notesLayer,
      })
      .passthrough(),
    layerOrder: z.array(layerKey),
    routes: z.array(route).optional(),
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
  // Ensure the illustrations layer carries a `lines` array; legacy sites
  // didn't have it, but the rest of the app expects an iterable.
  const ill = (s.layers as ParsedSite['layers']).illustrations as Record<string, unknown>;
  if (!Array.isArray(ill.lines)) ill.lines = [];
  // Migrate legacy IllustrationLine.width strings ('narrow' / 'wide') to the
  // numeric values the renderer now expects.
  for (const ln of ill.lines as Array<{ width: unknown }>) {
    if (ln.width === 'narrow') ln.width = 0.5;
    else if (ln.width === 'wide') ln.width = 1.6;
  }
  // Ensure the references layer (satellite/guidance imagery, separate from
  // illustrations so it can be locked/hidden independently) exists.
  if (!('references' in layers) || layers.references == null) {
    layers.references = {
      visible: true,
      locked: false,
      opacity: 1,
      items: [],
    };
  }
  if (!s.layerOrder.includes('references')) {
    // References sit at the bottom of the stack so map data draws on top.
    s.layerOrder = ['references', ...s.layerOrder];
  }
  // Enforce subPoi-before-poi: POIs are the primary annotation and must
  // always paint on top of sub-POIs. If a legacy site has them swapped,
  // pull subPoi to the slot directly before poi.
  const poiIdx = s.layerOrder.indexOf('poi');
  const subPoiIdx = s.layerOrder.indexOf('subPoi');
  if (poiIdx >= 0 && subPoiIdx >= 0 && subPoiIdx > poiIdx) {
    const without = s.layerOrder.filter((k) => k !== 'subPoi');
    const insertAt = without.indexOf('poi');
    s.layerOrder = [
      ...without.slice(0, insertAt),
      'subPoi',
      ...without.slice(insertAt),
    ];
  }
  // Routes are an additive feature: ensure the array exists on legacy sites.
  if ((s as { routes?: unknown }).routes == null) {
    (s as { routes: unknown[] }).routes = [];
  }
  // Each route gets a default objective and an empty stops list if not present.
  // Any legacy waypoint.bottomTimeMin is migrated into a 'rest' stop attached
  // to that waypoint so the duration isn't lost.
  for (const r of (s as { routes: Array<Record<string, unknown>> }).routes) {
    if (typeof r.objective !== 'string') r.objective = 'tour';
    if (!Array.isArray(r.stops)) r.stops = [];
    // Older sites stored gas without an O₂ fraction — default missing values
    // to air so existing routes keep their original NDL/MOD behaviour.
    const gas = r.gas as Record<string, unknown> | undefined;
    if (gas != null && typeof gas.fo2 !== 'number') gas.fo2 = 0.21;
    const existingStops = r.stops as Array<{ waypointId: string }>;
    const wps = r.waypoints as Array<{ id: string; bottomTimeMin?: number }>;
    for (const wp of wps ?? []) {
      const bt = wp.bottomTimeMin;
      if (typeof bt === 'number' && bt > 0) {
        const alreadyMigrated = existingStops.some(
          (st) => st.waypointId === wp.id,
        );
        if (!alreadyMigrated) {
          existingStops.push({
            id: crypto.randomUUID(),
            waypointId: wp.id,
            kind: 'rest',
            durationMin: bt,
          } as never);
        }
        delete wp.bottomTimeMin;
      }
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
