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
}

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
  | 'landmark'
  | 'other';

export type POILabelPosition = 'right' | 'left' | 'above' | 'below' | 'hidden';

export interface POI {
  id: UUID;
  /** User-visible number drawn inside the marker. Unique per site. */
  number?: number;
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

export interface IllustrationLayer extends LayerMeta {
  items: Illustration[];
}

// --- Layer 6: personal notes -----------------------------------------------

export type NoteAttachKind = 'poi' | 'subpoi' | 'contour';

export interface Note {
  id: UUID;
  attachTo?: { kind: NoteAttachKind; id: UUID };
  position?: Point;
  text: string;
  color?: string;
  createdAt: string;
}

export interface NotesLayer extends LayerMeta {
  notes: Note[];
}

// --- Site -------------------------------------------------------------------

export interface SiteMeta {
  name: string;
  subtitle?: string;
  edition?: string;
  northBearingDeg: number;
  /** Metres per world-coord unit (typically 1). */
  scaleMetersPerUnit: number;
  /** Distance in metres represented by one grid square. Defaults to 20. */
  gridSpacingMeters?: number;
  /** Whether to show the legend overlay on the canvas (and in exports). */
  showLegend?: boolean;
  /** Print/export region in world coords. If absent, no clipping is applied. */
  printArea?: { x: number; y: number; width: number; height: number };
  createdAt: string;
  updatedAt: string;
}

export type LayerKey =
  | 'waterBody'
  | 'depth'
  | 'measurements'
  | 'poi'
  | 'subPoi'
  | 'illustrations'
  | 'notes';

export interface SiteLayers {
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
}

export const DEFAULT_LAYER_ORDER: LayerKey[] = [
  'waterBody',
  'measurements',
  'depth',
  'illustrations',
  'poi',
  'subPoi',
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
      gridSpacingMeters: 5,
      createdAt: now,
      updatedAt: now,
    },
    layers: {
      waterBody: { ...defaultLayerMeta(), type: 'open_water', shoreline: [] },
      depth: { ...defaultLayerMeta(), contours: [], labels: [] },
      measurements: { ...defaultLayerMeta(), soundings: [] },
      poi: { ...defaultLayerMeta(), pois: [], bearings: [] },
      subPoi: { ...defaultLayerMeta(), items: [] },
      illustrations: { ...defaultLayerMeta(), items: [] },
      notes: { ...defaultLayerMeta(), notes: [] },
    },
    layerOrder: [...DEFAULT_LAYER_ORDER],
  };
}
