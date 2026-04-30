export type UUID = string;

export interface Point {
  x: number;
  y: number;
}

export interface LayerMeta {
  visible: boolean;
  locked: boolean;
  opacity: number;
}

// --- Layer 1: water body ----------------------------------------------------

export type WaterBodyType =
  | 'lake'
  | 'beach'
  | 'open_water'
  | 'quarry'
  | 'river'
  | 'pool'
  | 'other';

export type WaterBodyShape = 'shoreline' | 'lake' | 'cave';

export interface ShorelinePath {
  id: UUID;
  /** What kind of feature this path describes. Defaults to 'shoreline'. */
  shape?: WaterBodyShape;
  points: Point[];
  closed: boolean;
  label?: string;
}

export interface WaterBodyLayer extends LayerMeta {
  type: WaterBodyType;
  shoreline: ShorelinePath[];
  fillColor?: string;
}

// --- Layer 2: depth ---------------------------------------------------------

export interface DepthSounding {
  id: UUID;
  x: number;
  y: number;
  depth: number;
  source?: 'survey' | 'estimated';
}

export interface ContourLine {
  id: UUID;
  depth: number;
  /** Optional override for the on-canvas label. Defaults to "{depth}m". */
  label?: string;
  /** When true, no label is drawn on the canvas for this contour. */
  labelHidden?: boolean;
  /** Where the label sits along the line, 0 = start, 1 = end. Defaults to 0.5. */
  labelOffset?: number;
  /** How many times the label repeats along the line (1..5). Defaults to 1. */
  labelRepeat?: number;
  points: Point[];
  closed?: boolean;
  origin: 'manual' | 'derived';
}

export interface DepthGrid {
  originX: number;
  originY: number;
  spacing: number;
}

export type DepthLabelKind = 'contour' | 'reference';

export interface DepthLabel {
  id: UUID;
  x: number;
  y: number;
  /** Depth value to display (typically the depth of the band the label sits in). */
  depth: number;
  /** Optional rotation of the label, in degrees. */
  rotationDeg?: number;
  /** Marks labels auto-placed by the contour generator so they can be regenerated. */
  origin?: 'manual' | 'derived';
  /**
   * Visual category. 'contour' labels sit on/near a contour line and pick up
   * the contour blue; 'reference' labels are independent depth annotations.
   * If absent, falls back to: `origin === 'derived' → 'contour'`.
   */
  kind?: DepthLabelKind;
  /** Font size in world units. Defaults to {@link DEFAULT_DEPTH_LABEL_FONT_SIZE}. */
  fontSize?: number;
}

/** Default depth-label font size in world units (matches the long-standing
 * renderer default of 4). */
export const DEFAULT_DEPTH_LABEL_FONT_SIZE = 4;
export const DEPTH_LABEL_MIN_FONT_SIZE = 1.5;
export const DEPTH_LABEL_MAX_FONT_SIZE = 12;

export interface DepthLayer extends LayerMeta {
  grid?: DepthGrid;
  /** @deprecated Soundings now live on `MeasurementsLayer`. Kept for legacy import. */
  soundings?: DepthSounding[];
  contours: ContourLine[];
  labels?: DepthLabel[];
  /** @deprecated Default depth now lives on `MeasurementsLayer`. Kept for legacy import. */
  defaultDepth?: number;
}

/** Depth-survey point measurements ("soundings"), separated from the Depth layer. */
export interface MeasurementsLayer extends LayerMeta {
  soundings: DepthSounding[];
  /** Default depth used when a new measurement or depth label is dropped. */
  defaultDepth?: number;
  /** When true, dropped measurements snap to the centre of the containing grid square. */
  snapToGridCenter?: boolean;
}

// --- Layer 3: POIs & bearings ----------------------------------------------

export type POIType =
  | 'wreck'
  | 'vehicle'
  | 'natural'
  | 'structure'
  | 'anchor'
  | 'mooring'
  | 'entry_exit'
  | 'landmark'
  | 'other';

export type POILabelPosition = 'right' | 'left' | 'above' | 'below' | 'hidden';

export interface POI {
  id: UUID;
  /**
   * User-visible label drawn inside the marker. Typically a sequence number
   * (1, 2, 3…) but can also be a letter or short string ("A", "B", "X1") so
   * the user can hand-author legend ordering. Unique per site.
   */
  number?: number | string;
  name: string;
  type: POIType;
  depth?: number;
  notes?: string;
  gps?: { lat: number; lon: number };
  position?: Point;
  /** Where to draw the label relative to the marker. Defaults to 'right'. */
  labelPosition?: POILabelPosition;
}

export interface Bearing {
  id: UUID;
  fromId: UUID;
  toId: UUID;
  bearingDeg: number;
  reverseBearingDeg?: number;
  distanceM?: number;
  label?: string;
  style?: 'solid' | 'dashed';
  /** Label text size in world units. Defaults to 3. */
  labelFontSize?: number;
}

export interface POILayer extends LayerMeta {
  pois: POI[];
  bearings: Bearing[];
}

// --- Layer 4: sub-POIs ------------------------------------------------------

export type SubPOICategory =
  | 'fish'
  | 'coral'
  | 'hazard_high'
  | 'hazard_standard'
  | 'hazard_awareness'
  | 'access'
  | 'photo_spot'
  | 'note'
  | 'other';

export interface SubPOI {
  id: UUID;
  parentId: UUID;
  name: string;
  category: SubPOICategory;
  offset: Point;
  bearingFromParentDeg?: number;
  distanceFromParentM?: number;
  depth?: number;
  notes?: string;
  icon?: string;
  /** Where to draw the label relative to the marker. Defaults to 'right'. */
  labelPosition?: POILabelPosition;
}

export interface SubPOILayer extends LayerMeta {
  items: SubPOI[];
}

// --- Layer 5: illustrations -------------------------------------------------

export type IllustrationMime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/svg+xml'
  | 'image/webp';

export type PrimitiveShape = 'boat' | 'square' | 'circle' | 'triangle';

export interface Illustration {
  id: UUID;
  /** 'image' = rasterised import; 'primitive' = generated SVG primitive. */
  kind?: 'image' | 'primitive';
  /** Source data URL — required when kind='image'. */
  src?: string;
  mimeType?: IllustrationMime;
  /** Generated primitive — required when kind='primitive'. */
  primitive?: PrimitiveShape;
  /** Optional fill / stroke for primitives. */
  fill?: string;
  stroke?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg?: number;
  placement: 'under' | 'over';
  opacity?: number;
  caption?: string;
}

export type IllustrationLineStyle = 'solid' | 'dashed';
export type IllustrationLineLabelPosition = 'above' | 'below' | 'on' | 'hidden';

/** Min / max stroke width for illustration lines, in world units. */
export const ILLUSTRATION_LINE_MIN_WIDTH = 0.3;
export const ILLUSTRATION_LINE_MAX_WIDTH = 4.8;

/**
 * Polyline-style illustration: paths, roads, chains, lines. Renders as a
 * naturally-curving stroke through its points, with optional text drawn
 * along the path. Always open (never a closed loop).
 */
export interface IllustrationLine {
  id: UUID;
  points: Point[];
  /**
   * Stroke width in world units. Range
   * `[ILLUSTRATION_LINE_MIN_WIDTH, ILLUSTRATION_LINE_MAX_WIDTH]`.
   * Legacy data may carry the strings 'narrow' (0.5) or 'wide' (1.6) —
   * those are migrated to numeric values on parse.
   */
  width: number;
  /** Optional text drawn along the line. */
  label?: string;
  /** Where the label sits relative to the line. Defaults to 'above'. */
  labelPosition?: IllustrationLineLabelPosition;
  /** Stroke colour, default `#374151`. */
  color?: string;
  /** Stroke style — solid or dashed (good for chains / fences). */
  style?: IllustrationLineStyle;
}

export interface IllustrationLayer extends LayerMeta {
  items: Illustration[];
  /** Polyline-style decorations: paths, roads, chains. Optional for legacy compat. */
  lines?: IllustrationLine[];
}

/**
 * Reference imagery (satellite tiles, screenshots from other mapping
 * products, hand-drawn sketches the user wants as a backdrop). Same data
 * shape as illustrations, but kept on a separate layer so the user can
 * lock/hide guidance imagery independently of map decorations.
 */
export interface ReferenceLayer extends LayerMeta {
  items: Illustration[];
}

// --- Layer 6: personal notes -----------------------------------------------

export type NoteAttachKind = 'poi' | 'subpoi' | 'contour';

export type NoteConnectorStyle = 'line' | 'arrow' | 'dot';

export interface NoteConnector {
  /** World position the connector points TO. Independent of the note's own position. */
  target: Point;
  style: NoteConnectorStyle;
}

export interface Note {
  id: UUID;
  attachTo?: { kind: NoteAttachKind; id: UUID };
  position?: Point;
  text: string;
  /** Background colour. Use 'transparent' to suppress the box; default `#fef3c7`. */
  color?: string;
  /** 0..1 opacity for the background fill. Defaults to 1. */
  bgOpacity?: number;
  /** Text colour. Defaults to `#7c2d12` (amber-900). */
  textColor?: string;
  /** Optional connector with a draggable target. */
  connector?: NoteConnector;
  createdAt: string;
}

export interface NotesLayer extends LayerMeta {
  notes: Note[];
}

// --- Routes & dive plans ----------------------------------------------------

export type WaypointKind = 'poi' | 'free';

interface WaypointBase {
  id: UUID;
  /**
   * @deprecated Bottom time used to live on waypoints; now lives on `Stop`
   * entries attached to the route. Retained on the type for backwards
   * compatibility — ignored by dive math.
   */
  bottomTimeMin?: number;
  /** Optional per-waypoint note (e.g. "look for the wreck's bow"). */
  notes?: string;
}

export interface PoiRefWaypoint extends WaypointBase {
  kind: 'poi';
  poiRefId: UUID;
  /** Optional override; otherwise uses the referenced POI.depth. */
  depthOverrideM?: number;
}

export interface FreeWaypoint extends WaypointBase {
  kind: 'free';
  x: number;
  y: number;
  depthM?: number;
  name?: string;
}

export type Waypoint = PoiRefWaypoint | FreeWaypoint;

/**
 * The shape used to add a new waypoint. We can't use `Omit<Waypoint, 'id'>`
 * directly because `Omit` over a union doesn't preserve the discriminating
 * fields — distributing manually keeps `kind` + `poiRefId`/`x`/`y` typed.
 */
export type WaypointInput = Omit<PoiRefWaypoint, 'id'> | Omit<FreeWaypoint, 'id'>;

export type GasRulePolicy = 'thirds' | 'half' | 'all-usable';

/** Fraction of oxygen in air. Used as the default for new gas plans. */
export const FO2_AIR = 0.21;
/** Maximum partial pressure of O2 used to compute MOD for working dives. */
export const PPO2_MAX_WORKING = 1.4;
/**
 * Sensible bounds for the FO2 input. Below 21 %% you're into hypoxic mixes
 * (technical / trimix territory) and above 40 %% you're into oxygen-rich
 * Nitrox that needs O2-clean equipment. The app supports basic Nitrox only,
 * so we clamp to the recreational range.
 */
export const FO2_MIN = 0.21;
export const FO2_MAX = 0.40;

export interface GasPlan {
  /** Surface air consumption in litres / minute. */
  sacLPerMin: number;
  /** Cylinder volume in litres. */
  cylinderL: number;
  /** Starting cylinder pressure in bar. */
  startBarPressure: number;
  /** Reserve / minimum pressure in bar. */
  reserveBarPressure: number;
  rulePolicy: GasRulePolicy;
  /** Lateral transit speed in metres / minute. */
  transitSpeedMPerMin: number;
  /**
   * Fraction of oxygen in the breathing gas (0.21 = air, 0.32 = EAN32, etc.).
   * Drives MOD calculations and equivalent-air-depth NDL lookups for basic
   * enriched-air dives. Defaults to {@link FO2_AIR} on new profiles.
   */
  fo2: number;
}

/** What this route is for. Drives suggestions in the editor and shown to viewers. */
export type RouteObjective =
  | 'tour'
  | 'training'
  | 'recovery'
  | 'fun'
  | 'survey'
  | 'photo'
  | 'other';

/** A duration-bearing event attached to a waypoint along the route. */
export type StopKind =
  | 'safety_stop'
  | 'exercise'
  | 'gas_check'
  | 'observation'
  | 'rest'
  | 'other';

export interface Stop {
  id: UUID;
  /** The waypoint this stop happens at. */
  waypointId: UUID;
  kind: StopKind;
  /** Display name (e.g. "Mask removal drill", "Wreck bow tour"). */
  name?: string;
  /** Duration in minutes spent on this stop. */
  durationMin: number;
  notes?: string;
}

export interface Route {
  id: UUID;
  name: string;
  /** What this route is for. Defaults to 'tour' on creation. */
  objective: RouteObjective;
  /** Hex colour for the polyline; default `#dc2626`. */
  color: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  /** Ordered points the diver swims through; this is the path. */
  waypoints: Waypoint[];
  /** Stops/exercises with durations attached to specific waypoints. */
  stops: Stop[];
  /**
   * Reference gas profile used for feasibility checks in the editor. The
   * viewer-side "Plan this dive" panel can override these values per-diver
   * without modifying the route.
   */
  gas: GasPlan;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Site -------------------------------------------------------------------

export interface SiteMeta {
  name: string;
  subtitle?: string;
  edition?: string;
  northBearingDeg: number;
  /** Metres per world-coord unit (typically 1). */
  scaleMetersPerUnit: number;
  /** Distance in metres represented by one grid square. Defaults to 3. */
  gridSpacingMeters?: number;
  /** Whether to show the legend overlay on the canvas (and in exports). */
  showLegend?: boolean;
  /** Master toggle: when false, no routes render on canvas/print/export. Treated as true if absent. */
  routesVisible?: boolean;
  /** Print/export region in world coords. If absent, no clipping is applied. */
  printArea?: { x: number; y: number; width: number; height: number };
  createdAt: string;
  updatedAt: string;
}

export type LayerKey =
  | 'references'
  | 'waterBody'
  | 'depth'
  | 'measurements'
  | 'poi'
  | 'subPoi'
  | 'illustrations'
  | 'notes';

export interface SiteLayers {
  references: ReferenceLayer;
  waterBody: WaterBodyLayer;
  depth: DepthLayer;
  measurements: MeasurementsLayer;
  poi: POILayer;
  subPoi: SubPOILayer;
  illustrations: IllustrationLayer;
  notes: NotesLayer;
}

export interface Site {
  id: UUID;
  schemaVersion: 1;
  meta: SiteMeta;
  layers: SiteLayers;
  /** Bottom-to-top render order. */
  layerOrder: LayerKey[];
  /** Planned dive routes through the site. */
  routes: Route[];
}

export const DEFAULT_LAYER_ORDER: LayerKey[] = [
  // Reference imagery sits at the bottom of the stack so map data draws on top.
  'references',
  'waterBody',
  'measurements',
  'depth',
  'illustrations',
  // Sub-POIs render BEFORE POIs so the parent POI marker always paints on top
  // of its sub-annotations — keeps the primary marker readable even when
  // sub-POIs cluster around it.
  'subPoi',
  'poi',
  'notes',
];

const defaultLayerMeta = (): LayerMeta => ({ visible: true, locked: false, opacity: 1 });

export function emptySite(name = 'Untitled site'): Site {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    meta: {
      name,
      northBearingDeg: 0,
      scaleMetersPerUnit: 1,
      gridSpacingMeters: 3,
      createdAt: now,
      updatedAt: now,
    },
    layers: {
      references: { ...defaultLayerMeta(), items: [] },
      waterBody: { ...defaultLayerMeta(), type: 'open_water', shoreline: [] },
      depth: { ...defaultLayerMeta(), contours: [], labels: [] },
      measurements: { ...defaultLayerMeta(), soundings: [] },
      poi: { ...defaultLayerMeta(), pois: [], bearings: [] },
      subPoi: { ...defaultLayerMeta(), items: [] },
      illustrations: { ...defaultLayerMeta(), items: [], lines: [] },
      notes: { ...defaultLayerMeta(), notes: [] },
    },
    layerOrder: [...DEFAULT_LAYER_ORDER],
    routes: [],
  };
}
