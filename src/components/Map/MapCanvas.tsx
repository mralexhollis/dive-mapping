import { useEffect, useMemo, useRef, useState } from 'react';
import { useSiteStore, waypointSelectionId } from '../../state/useSiteStore';
import { usePanZoom } from '../../hooks/usePanZoom';
import { layoutSite } from '../../domain/layout';
import { distance, nearestSegment } from '../../domain/geometry';
import { clientToWorld } from '../../utils/coords';
import type { LayerKey, Point, WaypointInput } from '../../domain/types';
import { WaterBodyLayerView } from './layers/WaterBodyLayerView';
import { DepthLayerView } from './layers/DepthLayerView';
import { MeasurementsLayerView } from './layers/MeasurementsLayerView';
import { POILayerView } from './layers/POILayerView';
import { SubPOILayerView } from './layers/SubPOILayerView';
import { IllustrationLayerView } from './layers/IllustrationLayerView';
import { IllustrationLinesView } from './layers/IllustrationLinesView';
import { NotesLayerView } from './layers/NotesLayerView';
import { RoutesOverlay } from './layers/RoutesOverlay';
import { hitsInRect, rectFromPoints, selectableLayers } from './marquee-hits';

export type MapCanvasMode = 'edit' | 'plan' | 'view';

export interface MapCanvasProps {
  /**
   * Which mode the canvas is rendering in. The three modes are kept distinct:
   *  - 'edit': layer tools fire; routes do NOT render at all.
   *  - 'plan': routes render and respond to route tools; map layers are visible
   *    for spatial context but cannot be edited.
   *  - 'view': routes + layers render read-only; nothing handles clicks.
   *
   * Defaults to 'edit' so the existing editor caller doesn't need to be touched.
   */
  mode?: MapCanvasMode;
}

const MARQUEE_THRESHOLD_PX = 4;

export default function MapCanvas({ mode = 'edit' }: MapCanvasProps) {
  const interactive = mode !== 'view';
  const showRoutes = mode !== 'edit';
  const routesInteractive = mode === 'plan';
  const editingRouteId = useSiteStore((s) => s.editor.editingRouteId);
  // In plan mode the editor focuses on a single route; hide all others on the
  // canvas so the user isn't distracted. In view mode, show every route.
  const restrictRoutesTo = mode === 'plan' ? editingRouteId : null;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const site = useSiteStore((s) => s.site);
  const viewport = useSiteStore((s) => s.editor.viewport);
  const setCanvasSize = useSiteStore((s) => s.setCanvasSize);
  usePanZoom(svgRef);

  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null);
  const marqueeStartedAtRef = useRef<{ clientX: number; clientY: number } | null>(null);
  // Pan-tool drag: tracks the last cursor position so move events translate
  // the viewport by the delta. Stored in a ref so the move handler always
  // sees the latest position without re-rendering between frames.
  const panDragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });
  const setViewport = useSiteStore((s) => s.setViewport);

  // Resize observer keeps the store informed of the canvas' pixel size, so
  // tools can convert client → world coords without measuring on every event.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const r = e.contentRect;
        setCanvasSize({ width: r.width, height: r.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setCanvasSize]);

  const layout = useMemo(() => layoutSite(site), [site]);
  const northDeg = site.meta.northBearingDeg ?? 0;
  // World-rotate by -northBearingDeg so the bearing-N direction in world coords
  // ends up pointing screen-up after the user requests it.
  const transform = `translate(${viewport.x} ${viewport.y}) scale(${viewport.scale}) rotate(${-northDeg})`;
  const gridSize = site.meta.gridSpacingMeters ?? 3;
  const tool = useSiteStore((s) => s.editor.tool);
  const panTool = tool === 'pan';

  const onBackgroundPointerDown = (ev: React.PointerEvent<SVGRectElement>) => {
    if (ev.button !== 0) return;
    if (mode === 'view') {
      // View mode is select-only — clicking empty canvas just clears the
      // current selection. No marquee, no tool dispatch.
      useSiteStore.getState().clearSelection();
      return;
    }
    if (!interactive) return;
    const svg = svgRef.current;
    if (!svg) return;

    const store = useSiteStore.getState();
    const tool = store.editor.tool;

    // Hand tool: left-drag pans the viewport without selecting or modifying
    // anything. Available in every mode where the canvas is interactive.
    if (tool === 'pan') {
      panDragRef.current = { active: true, lastX: ev.clientX, lastY: ev.clientY };
      (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
      return;
    }

    const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);

    // The universal Select tool starts a marquee no matter which layer is
    // "active" — selection sweeps every visible, unlocked layer. Marquee
    // selection only makes sense in edit mode.
    if (mode === 'edit' && tool === 'select') {
      marqueeStartedAtRef.current = { clientX: ev.clientX, clientY: ev.clientY };
      setMarquee({ start: world, end: world });
      (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
      return;
    }

    handleBackgroundClick(world, mode);
  };

  const onBackgroundPointerMove = (ev: React.PointerEvent<SVGRectElement>) => {
    if (panDragRef.current.active) {
      const dx = ev.clientX - panDragRef.current.lastX;
      const dy = ev.clientY - panDragRef.current.lastY;
      panDragRef.current.lastX = ev.clientX;
      panDragRef.current.lastY = ev.clientY;
      setViewport((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }
    if (!marquee) return;
    const svg = svgRef.current;
    if (!svg) return;
    const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
    setMarquee({ start: marquee.start, end: world });
  };

  const onBackgroundPointerUp = (ev: React.PointerEvent<SVGRectElement>) => {
    if (panDragRef.current.active) {
      panDragRef.current.active = false;
      (ev.currentTarget as Element).releasePointerCapture(ev.pointerId);
      return;
    }
    if (!marquee) return;
    (ev.currentTarget as Element).releasePointerCapture(ev.pointerId);
    const startedAt = marqueeStartedAtRef.current;
    marqueeStartedAtRef.current = null;
    const tinyDrag =
      !startedAt ||
      (Math.abs(ev.clientX - startedAt.clientX) < MARQUEE_THRESHOLD_PX &&
        Math.abs(ev.clientY - startedAt.clientY) < MARQUEE_THRESHOLD_PX);
    const finalMarquee = marquee;
    setMarquee(null);
    if (tinyDrag) {
      // Treat as a click on the background — clear selection.
      useSiteStore.getState().clearSelection();
      return;
    }
    const rect = rectFromPoints(finalMarquee.start, finalMarquee.end);
    const store = useSiteStore.getState();
    const hits = hitsInRect(
      store.site,
      selectableLayers(store.site),
      rect,
      layout.positions,
      layout.subPoiPositions,
    );
    store.setSelection(hits);
  };

  const onBackgroundDoubleClick = (ev: React.MouseEvent<SVGRectElement>) => {
    if (!interactive) return;
    const svg = svgRef.current;
    if (!svg) return;
    const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
    handleBackgroundDoubleClick(world);
  };

  return (
    <svg
      ref={svgRef}
      className="h-full w-full touch-none select-none bg-water-100"
      data-interactive={interactive}
      data-map-canvas
    >
      <defs>
        <pattern
          id="grid"
          width={gridSize}
          height={gridSize}
          patternUnits="userSpaceOnUse"
          patternTransform={transform}
        >
          <path
            d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
            className="fill-none stroke-water-200"
            strokeWidth={0.5}
          />
        </pattern>
      </defs>
      <rect
        className="h-full w-full"
        width="100%"
        height="100%"
        fill="url(#grid)"
        style={panTool ? { cursor: panDragRef.current.active ? 'grabbing' : 'grab' } : undefined}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onBackgroundPointerMove}
        onPointerUp={onBackgroundPointerUp}
        onPointerCancel={onBackgroundPointerUp}
        onDoubleClick={onBackgroundDoubleClick}
        data-canvas-bg
      />

      <g data-world="" transform={transform}>
        {site.layerOrder.map((key) => (
          // Layers are clickable for selection in 'edit' AND 'view' (drag /
          // edit handlers inside each layer view also gate on `readOnly` so
          // the viewer can't actually mutate anything). In 'plan' mode the
          // canvas routes clicks to route tools instead.
          <LayerSwitch
            key={key}
            layerKey={key}
            layout={layout}
            layersInteractive={mode !== 'plan'}
          />
        ))}
        {showRoutes && (
          <RoutesOverlay interactive={routesInteractive} restrictToRouteId={restrictRoutesTo} />
        )}
        <PrintAreaOverlay layout={layout} />
        {marquee && <MarqueeOverlay start={marquee.start} end={marquee.end} scale={viewport.scale} />}
      </g>
      <Compass />
      <ScaleReference />
      <Legend />
    </svg>
  );
}

function PrintAreaOverlay({ layout }: { layout: ReturnType<typeof layoutSite> }) {
  const show = useSiteStore((s) => s.editor.showPrintArea);
  const explicit = useSiteStore((s) => s.site.meta.printArea);
  const site = useSiteStore((s) => s.site);
  const scale = useSiteStore((s) => s.editor.viewport.scale);
  if (!show) return null;
  // Use the explicit print area if set; otherwise auto-fit a bbox around
  // all visible entities, plus a margin.
  const area = explicit ?? autoPrintArea(site, layout);
  if (!area) return null;
  return (
    <g pointerEvents="none" data-sublayer="print-area">
      <rect
        x={area.x}
        y={area.y}
        width={area.width}
        height={area.height}
        fill="rgba(250, 204, 21, 0.05)"
        stroke="#ca8a04"
        strokeWidth={1.4 / scale}
        strokeDasharray={`${6 / scale} ${4 / scale}`}
      />
      <text
        x={area.x + 2 / scale}
        y={area.y + 10 / scale}
        fontSize={9 / scale}
        fill="#92400e"
        fontFamily="ui-sans-serif, system-ui"
      >
        Print area · {Math.round(area.width)} × {Math.round(area.height)} m
        {!explicit ? ' (auto)' : ''}
      </text>
    </g>
  );
}

function autoPrintArea(
  site: ReturnType<typeof useSiteStore.getState>['site'],
  layout: ReturnType<typeof layoutSite>,
): { x: number; y: number; width: number; height: number } | null {
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
  for (const c of site.layers.depth.contours) {
    for (const p of c.points) include(p.x, p.y);
  }
  for (const l of site.layers.depth.labels ?? []) include(l.x, l.y);
  for (const sh of site.layers.waterBody.shoreline) {
    for (const p of sh.points) include(p.x, p.y);
  }
  for (const it of site.layers.illustrations.items) {
    include(it.x, it.y);
    include(it.x + it.width, it.y + it.height);
  }
  for (const it of site.layers.references.items) {
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

const LEGEND_COLLAPSED_LIMIT = 5;

function Legend() {
  const canvasSize = useSiteStore((s) => s.editor.canvasSize);
  const showLegend = useSiteStore((s) => s.site.meta.showLegend);
  const pois = useSiteStore((s) => s.site.layers.poi.pois);
  const [expanded, setExpanded] = useState(false);
  if (!showLegend || canvasSize.width <= 0) return null;
  const ordered = [...pois].filter((p) => p.number != null).sort(comparePoiNumbers);
  if (ordered.length === 0) return null;

  const collapsible = ordered.length > LEGEND_COLLAPSED_LIMIT;
  const visible =
    collapsible && !expanded ? ordered.slice(0, LEGEND_COLLAPSED_LIMIT) : ordered;
  const hiddenCount = ordered.length - visible.length;

  const lineH = 12;
  const padX = 8;
  const padY = 6;
  const headerH = 14;
  const width = 200;
  // SVG <text> doesn't auto-wrap. Word-wrap each label by an approximate
  // character budget (the font is fixed 10px sans-serif so this is a
  // close-enough heuristic) and lay each line out manually.
  const maxChars = 30;
  const wrapped = visible.map((p) => ({
    poi: p,
    lines: wrapLabel(
      `${p.number}. ${p.name}${p.depth != null ? ` (${p.depth} m)` : ''}`,
      maxChars,
    ),
  }));
  const totalLines = wrapped.reduce((acc, w) => acc + w.lines.length, 0);
  // Reserve one extra row for the expand/collapse toggle when applicable.
  const toggleRow = collapsible ? 1 : 0;
  const height = headerH + (totalLines + toggleRow) * lineH + padY;
  const x = canvasSize.width - width - 12;
  const y = 12;

  let lineIdx = 0;
  return (
    <g pointerEvents="none" data-sublayer="legend">
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="rgba(255,255,255,0.93)"
        stroke="#94a3b8"
        strokeWidth={0.8}
        rx={3}
      />
      <text
        x={x + padX}
        y={y + headerH}
        fontSize={10}
        fontWeight={700}
        fill="#0f172a"
        fontFamily="ui-sans-serif, system-ui"
      >
        Legend
      </text>
      {wrapped.map(({ poi, lines }) => {
        const start = lineIdx;
        lineIdx += lines.length;
        return (
          <text
            key={poi.id}
            x={x + padX}
            y={y + headerH + (start + 1) * lineH}
            fontSize={10}
            fill="#0f172a"
            fontFamily="ui-sans-serif, system-ui"
          >
            {lines.map((ln, i) => (
              <tspan
                key={i}
                x={x + padX + (i === 0 ? 0 : 10)}
                dy={i === 0 ? 0 : lineH}
              >
                {ln}
              </tspan>
            ))}
          </text>
        );
      })}
      {collapsible && (
        <g pointerEvents="auto" style={{ cursor: 'pointer' }} onClick={() => setExpanded((e) => !e)}>
          {/* Wider invisible hit-area covering the toggle row */}
          <rect
            x={x}
            y={y + headerH + totalLines * lineH + 1}
            width={width}
            height={lineH + padY}
            fill="transparent"
          />
          <text
            x={x + padX}
            y={y + headerH + (totalLines + 1) * lineH}
            fontSize={10}
            fontWeight={600}
            fill="#0369a1"
            fontFamily="ui-sans-serif, system-ui"
          >
            {expanded ? '▴ Show less' : `▾ Show ${hiddenCount} more`}
          </text>
        </g>
      )}
    </g>
  );
}

/**
 * Sort POIs by their legend label. Numeric labels come first in numeric
 * order, then string labels in case-insensitive alphabetic order.
 */
function comparePoiNumbers(
  a: { number?: number | string },
  b: { number?: number | string },
): number {
  const av = a.number;
  const bv = b.number;
  const aNum = typeof av === 'number';
  const bNum = typeof bv === 'number';
  if (aNum && bNum) return (av as number) - (bv as number);
  if (aNum) return -1;
  if (bNum) return 1;
  return String(av ?? '').localeCompare(String(bv ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Word-wrap `text` so that no line exceeds `maxChars` characters. Long words
 * that themselves exceed `maxChars` are hard-broken so a single huge token
 * can't blow out the legend's width.
 */
function wrapLabel(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = '';
  const flush = () => {
    if (line.length === 0) return;
    if (line.length <= maxChars) {
      out.push(line);
    } else {
      for (let i = 0; i < line.length; i += maxChars) {
        out.push(line.slice(i, i + maxChars));
      }
    }
    line = '';
  };
  for (const w of words) {
    if (!w) continue;
    if (line.length === 0) {
      line = w;
    } else if (line.length + 1 + w.length <= maxChars) {
      line += ' ' + w;
    } else {
      flush();
      line = w;
    }
  }
  flush();
  return out.length > 0 ? out : [''];
}

function Compass() {
  const canvasSize = useSiteStore((s) => s.editor.canvasSize);
  const northDeg = useSiteStore((s) => s.site.meta.northBearingDeg) ?? 0;
  if (canvasSize.width <= 0) return null;
  const r = 18;
  // Compass in the bottom-left corner; scale stays bottom-right.
  const cx = 28;
  const cy = canvasSize.height - 30;
  // Arrow points to world-north. World-north is at screen bearing -northDeg.
  return (
    <g pointerEvents="none" data-sublayer="compass">
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="rgba(255,255,255,0.9)"
        stroke="#94a3b8"
        strokeWidth={0.8}
      />
      <g transform={`rotate(${-northDeg} ${cx} ${cy})`}>
        <line
          x1={cx}
          y1={cy + r * 0.7}
          x2={cx}
          y2={cy - r * 0.85}
          stroke="#0f172a"
          strokeWidth={1}
        />
        <polygon
          points={`${cx},${cy - r * 0.95} ${cx - 4},${cy - r * 0.55} ${cx + 4},${cy - r * 0.55}`}
          fill="#dc2626"
          stroke="#7f1d1d"
          strokeWidth={0.5}
        />
        <text
          x={cx}
          y={cy - r * 1.15}
          fontSize={10}
          textAnchor="middle"
          fill="#0f172a"
          fontFamily="ui-sans-serif, system-ui"
          fontWeight={600}
        >
          N
        </text>
      </g>
    </g>
  );
}

function ScaleReference() {
  const canvasSize = useSiteStore((s) => s.editor.canvasSize);
  const scale = useSiteStore((s) => s.editor.viewport.scale);
  const metersPerUnit = useSiteStore((s) => s.site.meta.scaleMetersPerUnit) ?? 1;
  if (canvasSize.width <= 0) return null;
  // One-fifth of the visible canvas width, in metres.
  const visibleWidthMeters = (canvasSize.width / scale) * metersPerUnit;
  const target = visibleWidthMeters / 5;
  const niceMeters = niceRound(target);
  const barPx = (niceMeters / metersPerUnit) * scale;
  if (!Number.isFinite(barPx) || barPx < 5) return null;
  const right = canvasSize.width - 12;
  const left = right - barPx;
  const y = canvasSize.height - 18;
  return (
    <g pointerEvents="none" data-sublayer="scale">
      <rect
        x={left - 6}
        y={y - 12}
        width={barPx + 12}
        height={20}
        fill="rgba(255,255,255,0.85)"
        stroke="#94a3b8"
        strokeWidth={0.5}
        rx={2}
      />
      <line x1={left} y1={y} x2={right} y2={y} stroke="#0f172a" strokeWidth={1.5} />
      <line x1={left} y1={y - 4} x2={left} y2={y + 4} stroke="#0f172a" strokeWidth={1.5} />
      <line x1={right} y1={y - 4} x2={right} y2={y + 4} stroke="#0f172a" strokeWidth={1.5} />
      <text
        x={(left + right) / 2}
        y={y - 4}
        fontSize={10}
        textAnchor="middle"
        fill="#0f172a"
        fontFamily="ui-sans-serif, system-ui"
      >
        {formatMeters(niceMeters)}
      </text>
    </g>
  );
}

function niceRound(value: number): number {
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

function MarqueeOverlay({ start, end, scale }: { start: Point; end: Point; scale: number }) {
  const r = rectFromPoints(start, end);
  return (
    <rect
      x={r.minX}
      y={r.minY}
      width={r.maxX - r.minX}
      height={r.maxY - r.minY}
      fill="rgba(245, 158, 11, 0.12)"
      stroke="#d97706"
      strokeWidth={1 / scale}
      strokeDasharray={`${4 / scale} ${2 / scale}`}
      pointerEvents="none"
    />
  );
}

function handleBackgroundClick(world: Point, mode: MapCanvasMode) {
  const store = useSiteStore.getState();
  const { activeLayer, tool, pendingPolyline, editingRouteId } = store.editor;

  if (mode === 'plan') {
    // Plans mode: only the route-add-waypoint tool fires. Layer-editing tools
    // are inert here, and the route is built by appending — reordering and
    // inserting stops happens in the itinerary, not on the canvas.
    if (editingRouteId && tool === 'route-add-waypoint') {
      handleRouteToolClick(world, editingRouteId);
    } else {
      store.clearSelection();
    }
    return;
  }

  // From here on we're in 'edit' mode (route tools never run in 'edit').
  const layer = store.site.layers[activeLayer];
  // If the active layer is hidden or locked, ignore tool actions on the canvas.
  if (!layer.visible || layer.locked) {
    store.clearSelection();
    return;
  }

  if (activeLayer === 'poi') {
    if (tool === 'add-poi') {
      const id = crypto.randomUUID();
      const existing = store.site.layers.poi.pois;
      // Auto-number considers only numeric labels — letter labels ("A", "B")
      // are user-set and don't bump the counter.
      const maxN = existing.reduce(
        (m, p) => (typeof p.number === 'number' && p.number > m ? p.number : m),
        0,
      );
      const next = maxN + 1;
      store.mutateSite((d) => {
        d.layers.poi.pois.push({
          id,
          number: next,
          name: `POI ${next}`,
          type: 'wreck',
          position: world,
        });
      });
      store.setSelection({ kind: 'poi', id });
      return;
    }
    if (tool === 'add-bearing') {
      store.setPendingBearingFrom(null);
      return;
    }
    store.clearSelection();
    return;
  }

  if (activeLayer === 'measurements') {
    if (tool === 'add-sounding') {
      const defaultDepth = store.site.layers.measurements.defaultDepth ?? 0;
      let target = world;
      const snapping = !!store.site.layers.measurements.snapToGridCenter;
      if (snapping) {
        const g = store.site.meta.gridSpacingMeters ?? 3;
        target = {
          x: Math.floor(world.x / g) * g + g / 2,
          y: Math.floor(world.y / g) * g + g / 2,
        };
        // Snap mode: don't create a second measurement at the same grid square.
        const existing = store.site.layers.measurements.soundings.find(
          (s) => Math.abs(s.x - target.x) < 1e-6 && Math.abs(s.y - target.y) < 1e-6,
        );
        if (existing) {
          store.setSelection({ kind: 'sounding', id: existing.id });
          return;
        }
      }
      const id = crypto.randomUUID();
      store.mutateSite((d) => {
        d.layers.measurements.soundings.push({ id, x: target.x, y: target.y, depth: defaultDepth });
      });
      store.setSelection({ kind: 'sounding', id });
      return;
    }
    store.clearSelection();
    return;
  }

  if (activeLayer === 'depth') {
    if (tool === 'add-depth-label') {
      const id = crypto.randomUUID();
      const defaultDepth = store.site.layers.measurements.defaultDepth ?? 0;
      store.mutateSite((d) => {
        if (!d.layers.depth.labels) d.layers.depth.labels = [];
        d.layers.depth.labels.push({
          id,
          x: world.x,
          y: world.y,
          depth: defaultDepth,
          origin: 'manual',
          kind: 'reference',
        });
      });
      store.setSelection({ kind: 'depthLabel', id });
      return;
    }
    if (tool === 'draw-contour') {
      const next =
        pendingPolyline?.layer === 'depth'
          ? { ...pendingPolyline, points: [...pendingPolyline.points, world] }
          : { layer: 'depth' as const, points: [world] };
      store.setPendingPolyline(next);
      return;
    }
    if (tool === 'add-point') {
      const sel = store.editor.selection.find((s) => s.kind === 'contour');
      if (!sel) return;
      const target = store.site.layers.depth.contours.find((c) => c.id === sel.id);
      if (!target) return;
      const ns = nearestSegment(target.points, !!target.closed, world);
      if (!ns) return;
      store.mutateSite((d) => {
        const c = d.layers.depth.contours.find((c) => c.id === sel.id);
        if (c) c.points.splice(ns.insertIdx, 0, ns.point);
      });
      return;
    }
    store.clearSelection();
    return;
  }

  if (activeLayer === 'waterBody') {
    const drawShape = toolToWaterBodyShape(tool);
    if (drawShape) {
      const next =
        pendingPolyline?.layer === 'waterBody' && pendingPolyline.shape === drawShape
          ? { ...pendingPolyline, points: [...pendingPolyline.points, world] }
          : { layer: 'waterBody' as const, shape: drawShape, points: [world] };
      store.setPendingPolyline(next);
      return;
    }
    if (tool === 'add-point') {
      // Insert a vertex into the currently-selected shoreline at the position
      // closest to the click on the existing path.
      const shorelineSel = store.editor.selection.find((s) => s.kind === 'shoreline');
      if (!shorelineSel) return;
      const target = store.site.layers.waterBody.shoreline.find((s) => s.id === shorelineSel.id);
      if (!target) return;
      const ns = nearestSegment(target.points, target.closed, world);
      if (!ns) return;
      store.mutateSite((d) => {
        const sh = d.layers.waterBody.shoreline.find((s) => s.id === shorelineSel.id);
        if (sh) sh.points.splice(ns.insertIdx, 0, ns.point);
      });
      return;
    }
    store.clearSelection();
    return;
  }

  if (activeLayer === 'subPoi') {
    const subCategory = toolToSubPoiCategory(tool);
    if (subCategory) {
      // Drop a sub-POI at the click location. Auto-parent to the nearest POI.
      const pois = store.site.layers.poi.pois;
      if (pois.length === 0) {
        // No POIs to attach to — silently bail. (UI tooltip explains.)
        return;
      }
      let nearest = pois[0]!;
      let nearestDist = Infinity;
      for (const p of pois) {
        const pos = p.position;
        if (!pos) continue;
        const d = Math.hypot(pos.x - world.x, pos.y - world.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = p;
        }
      }
      const parentPos = nearest.position;
      if (!parentPos) return;
      const offset = { x: world.x - parentPos.x, y: world.y - parentPos.y };
      const id = crypto.randomUUID();
      const n = store.site.layers.subPoi.items.length + 1;
      store.mutateSite((d) => {
        d.layers.subPoi.items.push({
          id,
          parentId: nearest.id,
          name: `Sub-POI ${n}`,
          category: subCategory,
          offset,
        });
      });
      store.setSelection({ kind: 'subpoi', id });
      return;
    }
    store.clearSelection();
    return;
  }

  if (activeLayer === 'illustrations') {
    const primitive = toolToPrimitive(tool);
    if (primitive) {
      const id = crypto.randomUUID();
      // Default sizes — boats are taller than they are wide; others are square.
      const width = primitive === 'boat' ? 12 : 14;
      const height = primitive === 'boat' ? 28 : 14;
      store.mutateSite((d) => {
        d.layers.illustrations.items.push({
          id,
          kind: 'primitive',
          primitive,
          x: world.x - width / 2,
          y: world.y - height / 2,
          width,
          height,
          placement: 'over',
          opacity: 1,
          caption: primitive,
        });
      });
      store.setSelection({ kind: 'illustration', id });
      return;
    }
    if (tool === 'draw-illustration-line') {
      const next =
        pendingPolyline?.layer === 'illustrations'
          ? { ...pendingPolyline, points: [...pendingPolyline.points, world] }
          : { layer: 'illustrations' as const, points: [world] };
      store.setPendingPolyline(next);
      return;
    }
    if (tool === 'add-point') {
      const sel = store.editor.selection.find((s) => s.kind === 'illustrationLine');
      if (!sel) return;
      const target = (store.site.layers.illustrations.lines ?? []).find(
        (l) => l.id === sel.id,
      );
      if (!target) return;
      const ns = nearestSegment(target.points, false, world);
      if (!ns) return;
      store.mutateSite((d) => {
        const ln = d.layers.illustrations.lines?.find((l) => l.id === sel.id);
        if (ln) ln.points.splice(ns.insertIdx, 0, ns.point);
      });
      return;
    }
    store.clearSelection();
    return;
  }

  if (activeLayer === 'notes') {
    if (tool === 'add-note') {
      const id = crypto.randomUUID();
      store.mutateSite((d) => {
        d.layers.notes.notes.push({
          id,
          position: world,
          text: 'New note',
          createdAt: new Date().toISOString(),
        });
      });
      store.setSelection({ kind: 'note', id });
      return;
    }
    store.clearSelection();
    return;
  }

  store.clearSelection();
}

const SUBPOI_CATEGORIES = new Set([
  'fish',
  'coral',
  'hazard_high',
  'hazard_standard',
  'hazard_awareness',
  'access',
  'photo_spot',
  'note',
  'other',
]);

function toolToSubPoiCategory(
  tool: string,
): import('../../domain/types').SubPOICategory | null {
  if (!tool.startsWith('add-subpoi')) return null;
  const rest = tool.replace(/^add-subpoi-?/, '');
  if (!rest) return 'note';
  if (!SUBPOI_CATEGORIES.has(rest)) return null;
  return rest as import('../../domain/types').SubPOICategory;
}

function toolToPrimitive(tool: string): 'boat' | 'square' | 'circle' | 'triangle' | null {
  if (tool === 'add-boat') return 'boat';
  if (tool === 'add-square') return 'square';
  if (tool === 'add-circle') return 'circle';
  if (tool === 'add-triangle') return 'triangle';
  return null;
}

/** Hit radius in world units for "click on a POI = POI-ref waypoint". */
const POI_PICK_RADIUS = 6;

function handleRouteToolClick(world: Point, routeId: string) {
  const store = useSiteStore.getState();
  const route = store.site.routes.find((r) => r.id === routeId);
  if (!route || route.locked) return;
  const pois = store.site.layers.poi.pois;

  // Decide whether the click landed on top of a POI; if so, prefer a poi-ref waypoint.
  let nearestPoi: { id: string; dist: number } | null = null;
  for (const p of pois) {
    if (!p.position) continue;
    const d = distance(p.position, world);
    if (d <= POI_PICK_RADIUS && (nearestPoi == null || d < nearestPoi.dist)) {
      nearestPoi = { id: p.id, dist: d };
    }
  }

  const baseWp: WaypointInput = nearestPoi
    ? { kind: 'poi', poiRefId: nearestPoi.id }
    : { kind: 'free', x: world.x, y: world.y };

  const newId = store.appendWaypoint(routeId, baseWp);
  if (newId) store.setSelection({ kind: 'waypoint', id: waypointSelectionId(routeId, newId) });
}

function toolToWaterBodyShape(tool: string): 'shoreline' | 'lake' | 'cave' | null {
  if (tool === 'draw-shoreline') return 'shoreline';
  if (tool === 'draw-lake') return 'lake';
  if (tool === 'draw-cave') return 'cave';
  return null;
}

function handleBackgroundDoubleClick(_world: Point) {
  const store = useSiteStore.getState();
  const { pendingPolyline, activeLayer } = store.editor;
  if (!pendingPolyline || pendingPolyline.layer !== activeLayer) return;
  if (pendingPolyline.points.length < 2) {
    store.setPendingPolyline(null);
    return;
  }
  const id = crypto.randomUUID();
  if (activeLayer === 'depth') {
    store.mutateSite((d) => {
      d.layers.depth.contours.push({
        id,
        depth: 0,
        points: pendingPolyline.points,
        origin: 'manual',
      });
    });
    store.setSelection({ kind: 'contour', id });
  } else if (activeLayer === 'waterBody') {
    const shape = pendingPolyline.shape ?? 'shoreline';
    const closed = shape !== 'shoreline'; // lakes and caves are closed
    store.mutateSite((d) => {
      d.layers.waterBody.shoreline.push({
        id,
        shape,
        points: pendingPolyline.points,
        closed,
      });
    });
    store.setSelection({ kind: 'shoreline', id });
  } else if (activeLayer === 'illustrations') {
    store.mutateSite((d) => {
      if (!d.layers.illustrations.lines) d.layers.illustrations.lines = [];
      d.layers.illustrations.lines.push({
        id,
        points: pendingPolyline.points,
        // Default stroke matches the old 'narrow' tier; user adjusts in the
        // Inspector via the slider.
        width: 0.5,
      });
    });
    store.setSelection({ kind: 'illustrationLine', id });
  }
  store.setPendingPolyline(null);
  store.setTool('select');
}

interface LayerSwitchProps {
  layerKey: LayerKey;
  layout: ReturnType<typeof layoutSite>;
  /** When false, the layer renders but ignores all pointer events. */
  layersInteractive: boolean;
}

/**
 * Per-tool: which layers the user is allowed to click on. Anything not listed
 * gets pointer-events: none, so clicks fall through to the background rect and
 * the tool's "background click" logic runs against the right layer.
 */
const SELECT_INTERACTIVE = new Set<LayerKey>([
  'references',
  'waterBody',
  'depth',
  'measurements',
  'poi',
  'subPoi',
  'illustrations',
  'notes',
]);
const SUBPOI_INTERACTIVE = new Set<LayerKey>(['poi', 'subPoi']);
const POI_ONLY = new Set<LayerKey>(['poi']);
const REMOVE_POINT_INTERACTIVE = new Set<LayerKey>(['waterBody', 'depth', 'illustrations']);

function interactiveLayersForTool(tool: string): ReadonlySet<LayerKey> {
  if (tool === 'select') return SELECT_INTERACTIVE;
  if (tool === 'add-bearing') return POI_ONLY;
  if (tool.startsWith('add-subpoi')) return SUBPOI_INTERACTIVE;
  if (tool === 'remove-point') return REMOVE_POINT_INTERACTIVE;
  return new Set();
}

function LayerSwitch({ layerKey, layout, layersInteractive }: LayerSwitchProps) {
  const layer = useSiteStore((s) => s.site.layers[layerKey]);
  const tool = useSiteStore((s) => s.editor.tool);
  if (!layer.visible) return null;
  const opacity = layer.opacity;
  const allowed = interactiveLayersForTool(tool);
  const interactive = layersInteractive && allowed.has(layerKey) && !layer.locked;
  const wrap = (children: React.ReactNode) => (
    <g
      opacity={opacity}
      style={interactive ? undefined : { pointerEvents: 'none' }}
    >
      {children}
    </g>
  );
  switch (layerKey) {
    case 'references':
      return wrap(<IllustrationLayerView source="references" />);
    case 'waterBody':
      return wrap(<WaterBodyLayerView />);
    case 'depth':
      return wrap(<DepthLayerView />);
    case 'measurements':
      return wrap(<MeasurementsLayerView />);
    case 'illustrations':
      return wrap(
        <>
          <IllustrationLayerView source="illustrations" />
          <IllustrationLinesView />
        </>,
      );
    case 'poi':
      return wrap(<POILayerView positions={layout.positions} />);
    case 'subPoi':
      return wrap(<SubPOILayerView positions={layout.subPoiPositions} />);
    case 'notes':
      return wrap(<NotesLayerView positions={layout.positions} subPoiPositions={layout.subPoiPositions} />);
    default:
      return null;
  }
}
