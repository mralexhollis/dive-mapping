import { create } from 'zustand';
import { produce } from 'immer';
import type {
  GasPlan,
  LayerKey,
  Route,
  RouteObjective,
  Site,
  Stop,
  UUID,
  Waypoint,
  WaypointInput,
} from '../domain/types';
import { emptySite } from '../domain/types';
import { defaultGasPlan } from '../domain/divePlan';

export type SelectionKind =
  | 'poi'
  | 'bearing'
  | 'sounding'
  | 'contour'
  | 'depthLabel'
  | 'subpoi'
  | 'illustration'
  | 'illustrationLine'
  | 'note'
  | 'shoreline'
  | 'waypoint';

/** Encode a waypoint selection's compound id as `${routeId}:${waypointId}`. */
export function waypointSelectionId(routeId: UUID, waypointId: UUID): string {
  return `${routeId}:${waypointId}`;
}

export function parseWaypointSelectionId(
  id: string,
): { routeId: UUID; waypointId: UUID } | null {
  const idx = id.indexOf(':');
  if (idx <= 0) return null;
  return {
    routeId: id.slice(0, idx),
    waypointId: id.slice(idx + 1),
  };
}

export interface Selection {
  kind: SelectionKind;
  id: string;
}

const sameSelection = (a: Selection, b: Selection) => a.kind === b.kind && a.id === b.id;

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface EditorState {
  activeLayer: LayerKey;
  /** Active tool. The set of valid tools depends on the active layer. */
  tool: string;
  /** Multi-selection. Single-click on an item replaces; marquee adds many. */
  selection: Selection[];
  viewport: Viewport;
  /** Width / height of the rendered canvas, set by the MapCanvas. */
  canvasSize: { width: number; height: number };
  /** First-click POI id while the "Add bearing" two-step is in progress. */
  pendingBearingFromId: string | null;
  /** First-click parent POI id while the "Add sub-POI" two-step is in progress. */
  pendingSubPoiParentId: string | null;
  /** Active in-progress polyline being drawn (e.g. shoreline, contour). */
  pendingPolyline:
    | {
        layer: LayerKey;
        points: { x: number; y: number }[];
        /** Optional water-body shape kind for this drawing session. */
        shape?: 'shoreline' | 'lake' | 'cave';
      }
    | null;
  /** Transient: show the print/export bounding box on the canvas. */
  showPrintArea: boolean;
  /** When true, layer views and the Inspector render in display-only mode. */
  readOnly: boolean;
  /** Hide the left tools panel — useful on narrow viewports. */
  toolbarCollapsed: boolean;
  /** Hide the right Inspector + Layers column — useful on narrow viewports. */
  sidebarCollapsed: boolean;
  /** Active route while in route-edit mode (driven by the Plans page or the canvas tools). */
  editingRouteId: UUID | null;
}

const HISTORY_LIMIT = 100;

interface State {
  site: Site;
  editor: EditorState;
  past: Site[];
  future: Site[];
}

interface Actions {
  /** Mutate the site through an immer recipe. Pushes the prior state onto undo. */
  mutateSite(recipe: (draft: Site) => void): void;
  /** Replace the entire site (e.g. on import). Resets history. */
  replaceSite(next: Site): void;
  undo(): void;
  redo(): void;

  setActiveLayer(key: LayerKey): void;
  setTool(tool: string): void;
  /** Pick a layer and a tool together (lets the all-tools palette do this in one step). */
  setLayerAndTool(key: LayerKey, tool: string): void;
  setSelection(sel: Selection[] | Selection | null): void;
  addSelection(sel: Selection): void;
  clearSelection(): void;
  setViewport(updater: (v: Viewport) => Viewport): void;
  setCanvasSize(size: { width: number; height: number }): void;
  setPendingBearingFrom(id: string | null): void;
  setPendingSubPoiParent(id: string | null): void;
  setPendingPolyline(p: EditorState['pendingPolyline']): void;
  setShowPrintArea(v: boolean): void;
  setReadOnly(v: boolean): void;
  setToolbarCollapsed(v: boolean): void;
  setSidebarCollapsed(v: boolean): void;

  setLayerVisible(key: LayerKey, visible: boolean): void;
  setLayerLocked(key: LayerKey, locked: boolean): void;
  setLayerOpacity(key: LayerKey, opacity: number): void;
  reorderLayers(order: LayerKey[]): void;

  setEditingRoute(id: UUID | null): void;

  addRoute(name?: string): UUID;
  removeRoute(id: UUID): void;
  duplicateRoute(id: UUID): UUID | null;
  renameRoute(id: UUID, name: string): void;
  setRouteVisible(id: UUID, visible: boolean): void;
  setRouteLocked(id: UUID, locked: boolean): void;
  setRouteOpacity(id: UUID, opacity: number): void;
  setRouteColor(id: UUID, color: string): void;
  setRouteNotes(id: UUID, notes: string): void;
  reorderRoutes(ids: UUID[]): void;
  updateRouteGas(id: UUID, patch: Partial<GasPlan>): void;
  setRouteObjective(id: UUID, objective: RouteObjective): void;
  setRoutesVisible(visible: boolean): void;

  addStop(routeId: UUID, stop: Omit<Stop, 'id'>): UUID | null;
  removeStop(routeId: UUID, stopId: UUID): void;
  updateStop(routeId: UUID, stopId: UUID, patch: Partial<Stop>): void;
  reorderStops(routeId: UUID, ids: UUID[]): void;

  appendWaypoint(routeId: UUID, wp: WaypointInput): UUID | null;
  removeWaypoint(routeId: UUID, wpId: UUID): void;
  moveFreeWaypoint(routeId: UUID, wpId: UUID, x: number, y: number): void;
  updateWaypoint(routeId: UUID, wpId: UUID, patch: Partial<Waypoint>): void;
  reorderWaypoints(routeId: UUID, ids: UUID[]): void;
}

const initialEditor: EditorState = {
  activeLayer: 'poi',
  tool: 'select',
  selection: [],
  viewport: { x: 0, y: 0, scale: 1 },
  canvasSize: { width: 0, height: 0 },
  pendingBearingFromId: null,
  pendingSubPoiParentId: null,
  pendingPolyline: null,
  showPrintArea: false,
  readOnly: false,
  toolbarCollapsed: false,
  sidebarCollapsed: false,
  editingRouteId: null,
};

function pushPast(past: Site[], snapshot: Site): Site[] {
  const next = [...past, snapshot];
  if (next.length > HISTORY_LIMIT) next.shift();
  return next;
}

function touch(site: Site): void {
  site.meta.updatedAt = new Date().toISOString();
}

export const useSiteStore = create<State & Actions>((set, get) => ({
  site: emptySite('Untitled site'),
  editor: initialEditor,
  past: [],
  future: [],

  mutateSite: (recipe) => {
    const { site, past } = get();
    const next = produce(site, (draft) => {
      recipe(draft);
      touch(draft);
    });
    if (next === site) return;
    set({ site: next, past: pushPast(past, site), future: [] });
  },

  replaceSite: (next) =>
    set({ site: next, past: [], future: [], editor: { ...get().editor, selection: [] } }),

  undo: () => {
    const { past, site, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    set({
      site: prev,
      past: past.slice(0, -1),
      future: [...future, site],
    });
  },

  redo: () => {
    const { past, site, future } = get();
    if (future.length === 0) return;
    const next = future[future.length - 1]!;
    set({
      site: next,
      past: pushPast(past, site),
      future: future.slice(0, -1),
    });
  },

  setActiveLayer: (key) => set({
    editor: {
      ...get().editor,
      activeLayer: key,
      pendingBearingFromId: null,
      pendingSubPoiParentId: null,
      pendingPolyline: null,
    },
  }),
  setTool: (tool) => set({
    editor: {
      ...get().editor,
      tool,
      pendingBearingFromId: null,
      pendingSubPoiParentId: null,
      pendingPolyline: null,
    },
  }),
  setLayerAndTool: (key, tool) => set({
    editor: {
      ...get().editor,
      activeLayer: key,
      tool,
      pendingBearingFromId: null,
      pendingSubPoiParentId: null,
      pendingPolyline: null,
    },
  }),
  setSelection: (sel) => {
    const next: Selection[] = sel == null ? [] : Array.isArray(sel) ? sel : [sel];
    set({ editor: { ...get().editor, selection: next } });
  },
  addSelection: (s) => {
    const cur = get().editor.selection;
    if (cur.some((x) => sameSelection(x, s))) return;
    set({ editor: { ...get().editor, selection: [...cur, s] } });
  },
  clearSelection: () => set({ editor: { ...get().editor, selection: [] } }),
  setViewport: (updater) => set({ editor: { ...get().editor, viewport: updater(get().editor.viewport) } }),
  setCanvasSize: (canvasSize) => set({ editor: { ...get().editor, canvasSize } }),
  setPendingBearingFrom: (id) => set({ editor: { ...get().editor, pendingBearingFromId: id } }),
  setPendingSubPoiParent: (id) => set({ editor: { ...get().editor, pendingSubPoiParentId: id } }),
  setPendingPolyline: (pendingPolyline) => set({ editor: { ...get().editor, pendingPolyline } }),
  setShowPrintArea: (v) => set({ editor: { ...get().editor, showPrintArea: v } }),
  setReadOnly: (v) => set({ editor: { ...get().editor, readOnly: v } }),
  setToolbarCollapsed: (v) => set({ editor: { ...get().editor, toolbarCollapsed: v } }),
  setSidebarCollapsed: (v) => set({ editor: { ...get().editor, sidebarCollapsed: v } }),

  setLayerVisible: (key, visible) =>
    get().mutateSite((draft) => {
      draft.layers[key].visible = visible;
    }),
  setLayerLocked: (key, locked) =>
    get().mutateSite((draft) => {
      draft.layers[key].locked = locked;
    }),
  setLayerOpacity: (key, opacity) =>
    get().mutateSite((draft) => {
      draft.layers[key].opacity = opacity;
    }),
  reorderLayers: (order) =>
    get().mutateSite((draft) => {
      draft.layerOrder = order;
    }),

  setEditingRoute: (id) => set({ editor: { ...get().editor, editingRouteId: id } }),

  addRoute: (name) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    get().mutateSite((draft) => {
      draft.routes.push({
        id,
        name: name ?? `Route ${draft.routes.length + 1}`,
        objective: 'tour',
        color: pickRouteColor(draft.routes.length),
        visible: true,
        locked: false,
        opacity: 1,
        waypoints: [],
        stops: [],
        gas: defaultGasPlan(),
        createdAt: now,
        updatedAt: now,
      });
    });
    return id;
  },
  removeRoute: (id) =>
    get().mutateSite((draft) => {
      draft.routes = draft.routes.filter((r) => r.id !== id);
    }),
  duplicateRoute: (id) => {
    const src = get().site.routes.find((r) => r.id === id);
    if (!src) return null;
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    get().mutateSite((draft) => {
      // Build a waypoint id remap so cloned stops still attach to the right
      // (cloned) waypoint and not the original's.
      const wpIdMap = new Map<string, string>();
      const waypoints = src.waypoints.map((wp) => {
        const newWpId = crypto.randomUUID();
        wpIdMap.set(wp.id, newWpId);
        return { ...wp, id: newWpId };
      });
      const stops = (src.stops ?? []).map((st) => ({
        ...st,
        id: crypto.randomUUID(),
        waypointId: wpIdMap.get(st.waypointId) ?? st.waypointId,
      }));
      draft.routes.push({
        ...src,
        id: newId,
        name: `${src.name} copy`,
        waypoints,
        stops,
        createdAt: now,
        updatedAt: now,
      });
    });
    return newId;
  },
  renameRoute: (id, name) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === id);
      if (r) {
        r.name = name;
        r.updatedAt = new Date().toISOString();
      }
    }),
  setRouteVisible: (id, visible) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === id);
      if (r) r.visible = visible;
    }),
  setRouteLocked: (id, locked) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === id);
      if (r) r.locked = locked;
    }),
  setRouteOpacity: (id, opacity) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === id);
      if (r) r.opacity = opacity;
    }),
  setRouteColor: (id, color) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === id);
      if (r) r.color = color;
    }),
  setRouteNotes: (id, notes) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === id);
      if (r) r.notes = notes;
    }),
  reorderRoutes: (ids) =>
    get().mutateSite((draft) => {
      const map = new Map(draft.routes.map((r) => [r.id, r]));
      const next: Route[] = [];
      for (const rid of ids) {
        const r = map.get(rid);
        if (r) {
          next.push(r);
          map.delete(rid);
        }
      }
      // Append any routes that weren't in the supplied order so they aren't lost.
      for (const r of map.values()) next.push(r);
      draft.routes = next;
    }),
  updateRouteGas: (id, patch) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === id);
      if (r) Object.assign(r.gas, patch);
    }),
  setRouteObjective: (id, objective) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === id);
      if (r) {
        r.objective = objective;
        r.updatedAt = new Date().toISOString();
      }
    }),
  setRoutesVisible: (visible) =>
    get().mutateSite((draft) => {
      draft.meta.routesVisible = visible;
    }),

  addStop: (routeId, stop) => {
    const newId = crypto.randomUUID();
    let inserted = false;
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === routeId);
      if (!r) return;
      r.stops.push({ ...stop, id: newId });
      r.updatedAt = new Date().toISOString();
      inserted = true;
    });
    return inserted ? newId : null;
  },
  removeStop: (routeId, stopId) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === routeId);
      if (!r) return;
      r.stops = r.stops.filter((s) => s.id !== stopId);
      r.updatedAt = new Date().toISOString();
    }),
  updateStop: (routeId, stopId, patch) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === routeId);
      if (!r) return;
      const st = r.stops.find((s) => s.id === stopId);
      if (!st) return;
      Object.assign(st, patch);
      r.updatedAt = new Date().toISOString();
    }),
  reorderStops: (routeId, ids) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === routeId);
      if (!r) return;
      const map = new Map(r.stops.map((s) => [s.id, s]));
      const next: Stop[] = [];
      for (const sid of ids) {
        const s = map.get(sid);
        if (s) {
          next.push(s);
          map.delete(sid);
        }
      }
      for (const s of map.values()) next.push(s);
      r.stops = next;
      r.updatedAt = new Date().toISOString();
    }),

  appendWaypoint: (routeId, wp) => {
    const newId = crypto.randomUUID();
    let inserted = false;
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === routeId);
      if (!r) return;
      r.waypoints.push({ ...wp, id: newId } as Waypoint);
      r.updatedAt = new Date().toISOString();
      inserted = true;
    });
    return inserted ? newId : null;
  },
  removeWaypoint: (routeId, wpId) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === routeId);
      if (!r) return;
      r.waypoints = r.waypoints.filter((w) => w.id !== wpId);
      // Drop any stops attached to the removed waypoint so we don't leave
      // orphaned durations behind.
      r.stops = r.stops.filter((s) => s.waypointId !== wpId);
      r.updatedAt = new Date().toISOString();
    }),
  moveFreeWaypoint: (routeId, wpId, x, y) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === routeId);
      if (!r) return;
      const wp = r.waypoints.find((w) => w.id === wpId);
      if (wp && wp.kind === 'free') {
        wp.x = x;
        wp.y = y;
        r.updatedAt = new Date().toISOString();
      }
    }),
  updateWaypoint: (routeId, wpId, patch) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === routeId);
      if (!r) return;
      const wp = r.waypoints.find((w) => w.id === wpId);
      if (!wp) return;
      // Only assign keys that exist on the current waypoint shape — guards
      // against accidentally cross-pollinating poi/free-only fields.
      Object.assign(wp, patch);
      r.updatedAt = new Date().toISOString();
    }),
  reorderWaypoints: (routeId, ids) =>
    get().mutateSite((draft) => {
      const r = draft.routes.find((rt) => rt.id === routeId);
      if (!r) return;
      const map = new Map(r.waypoints.map((w) => [w.id, w]));
      const next: Waypoint[] = [];
      for (const wid of ids) {
        const w = map.get(wid);
        if (w) {
          next.push(w);
          map.delete(wid);
        }
      }
      for (const w of map.values()) next.push(w);
      r.waypoints = next;
      r.updatedAt = new Date().toISOString();
    }),
}));

const ROUTE_COLOR_PALETTE = [
  '#dc2626', // red-600
  '#2563eb', // blue-600
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#7c3aed', // violet-600
  '#0891b2', // cyan-600
  '#db2777', // pink-600
];

function pickRouteColor(idx: number): string {
  return ROUTE_COLOR_PALETTE[idx % ROUTE_COLOR_PALETTE.length]!;
}
