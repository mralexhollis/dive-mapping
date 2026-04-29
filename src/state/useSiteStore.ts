import { create } from 'zustand';
import { produce } from 'immer';
import type { LayerKey, Site } from '../domain/types';
import { emptySite } from '../domain/types';

export type SelectionKind =
  | 'poi'
  | 'bearing'
  | 'sounding'
  | 'contour'
  | 'depthLabel'
  | 'subpoi'
  | 'illustration'
  | 'note'
  | 'shoreline';

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
}));
