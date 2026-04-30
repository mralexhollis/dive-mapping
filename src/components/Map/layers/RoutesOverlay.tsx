import { useRef } from 'react';
import { useSiteStore, waypointSelectionId, parseWaypointSelectionId } from '../../../state/useSiteStore';
import { waypointPosition } from '../../../domain/divePlan';
import { clientToWorld } from '../../../utils/coords';
import type { POI, Point, Route, UUID, Waypoint } from '../../../domain/types';

export interface RoutesOverlayProps {
  /** Allow drag/click interactions. False in the read-only viewer. */
  interactive: boolean;
  /**
   * When set, render only this single route (used in the route-editor mode
   * so the user isn't distracted by other routes' polylines).
   */
  restrictToRouteId?: UUID | null;
}

/**
 * Renders visible routes on top of the per-layer rendering. Routes are
 * not part of `SiteLayers` — they're an annotation overlay (like the print
 * area or compass) and intentionally don't appear in the LayersPanel.
 */
export function RoutesOverlay({ interactive, restrictToRouteId }: RoutesOverlayProps) {
  const routes = useSiteStore((s) => s.site.routes);
  const pois = useSiteStore((s) => s.site.layers.poi.pois);
  const routesVisible = useSiteStore((s) => s.site.meta.routesVisible);
  const editingRouteId = useSiteStore((s) => s.editor.editingRouteId);
  const selection = useSiteStore((s) => s.editor.selection);
  const scale = useSiteStore((s) => s.editor.viewport.scale);

  if (routesVisible === false) return null;
  if (routes.length === 0) return null;

  return (
    <g data-sublayer="routes" pointerEvents={interactive ? undefined : 'none'}>
      {routes.map((route) => {
        if (!route.visible) return null;
        if (restrictToRouteId && route.id !== restrictToRouteId) return null;
        return (
          <RouteView
            key={route.id}
            route={route}
            pois={pois}
            isEditing={editingRouteId === route.id}
            interactive={interactive}
            selection={selection}
            scale={scale}
          />
        );
      })}
    </g>
  );
}

interface RouteViewProps {
  route: Route;
  pois: POI[];
  isEditing: boolean;
  interactive: boolean;
  selection: ReadonlyArray<{ kind: string; id: string }>;
  scale: number;
}

function RouteView({ route, pois, isEditing, interactive, selection, scale }: RouteViewProps) {
  const setSelection = useSiteStore((s) => s.setSelection);
  const resolved = route.waypoints.map((wp) => ({ wp, pos: waypointPosition(wp, pois) }));
  const points = resolved.filter((r): r is { wp: Waypoint; pos: Point } => r.pos != null);
  if (points.length === 0) return null;

  const stroke = route.color;
  const strokeWidth = (isEditing ? 1.8 : 1.2) / scale;
  const opacity = route.opacity;
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.pos.x} ${p.pos.y}`)
    .join(' ');

  return (
    <g opacity={opacity} data-route={route.id}>
      {/* Wide invisible stroke for easier hit-testing on the polyline. */}
      {interactive && (
        <path
          d={pathD}
          stroke="transparent"
          strokeWidth={6 / scale}
          fill="none"
          onPointerDown={(ev) => {
            if (ev.button !== 0) return;
            ev.stopPropagation();
            // Selecting the polyline picks the first waypoint as a stand-in
            // (so the Plans drawer knows which route to focus). The dedicated
            // editing flow lives in the Plans page; on-canvas, only waypoint
            // selection is meaningful.
            const first = points[0]!;
            setSelection({ kind: 'waypoint', id: waypointSelectionId(route.id, first.wp.id) });
          }}
          style={{ cursor: 'pointer' }}
        />
      )}
      <path
        d={pathD}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        pointerEvents="none"
      />
      <SegmentArrows points={points} stroke={stroke} scale={scale} />
      {points.map((p, idx) => {
        const isSelected = selection.some(
          (s) => s.kind === 'waypoint' && s.id === waypointSelectionId(route.id, p.wp.id),
        );
        return (
          <WaypointMarker
            key={p.wp.id}
            routeId={route.id}
            wp={p.wp}
            pos={p.pos}
            sequence={idx + 1}
            color={stroke}
            selected={isSelected}
            isEditing={isEditing}
            interactive={interactive}
            scale={scale}
          />
        );
      })}
    </g>
  );
}

function SegmentArrows({
  points,
  stroke,
  scale,
}: {
  points: Array<{ wp: Waypoint; pos: Point }>;
  stroke: string;
  scale: number;
}) {
  // Arrow size in world units. By using a world-constant base (so it grows
  // with the zoom) and a minimum-screen-size clamp (so it stays visible when
  // zoomed out), arrows never shrink when the user zooms in and never become
  // microdots when zoomed out.
  const ARROW_WORLD = 1.5;
  const ARROW_MIN_SCREEN_PX = 4;
  const arrowSize = Math.max(ARROW_WORLD, ARROW_MIN_SCREEN_PX / Math.max(scale, 1e-6));
  return (
    <g pointerEvents="none">
      {points.slice(0, -1).map((p, i) => {
        const next = points[i + 1]!;
        const dx = next.pos.x - p.pos.x;
        const dy = next.pos.y - p.pos.y;
        const len = Math.hypot(dx, dy);
        if (len < arrowSize * 2) return null;
        const mx = (p.pos.x + next.pos.x) / 2;
        const my = (p.pos.y + next.pos.y) / 2;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <polygon
            key={i}
            points={`0,${-arrowSize} ${arrowSize * 1.6},0 0,${arrowSize}`}
            fill={stroke}
            transform={`translate(${mx} ${my}) rotate(${angle})`}
          />
        );
      })}
    </g>
  );
}

interface WaypointMarkerProps {
  routeId: UUID;
  wp: Waypoint;
  pos: Point;
  sequence: number;
  color: string;
  selected: boolean;
  isEditing: boolean;
  interactive: boolean;
  scale: number;
}

function WaypointMarker({
  routeId,
  wp,
  pos,
  sequence,
  color,
  selected,
  isEditing,
  interactive,
  scale,
}: WaypointMarkerProps) {
  const setSelection = useSiteStore((s) => s.setSelection);
  const moveFreeWaypoint = useSiteStore((s) => s.moveFreeWaypoint);
  const dragRef = useRef({ active: false });
  const draggable = interactive && isEditing && wp.kind === 'free';

  const onPointerDown = (ev: React.PointerEvent<SVGGElement>) => {
    if (!interactive) return;
    if (ev.button !== 0) return;
    ev.stopPropagation();
    setSelection({ kind: 'waypoint', id: waypointSelectionId(routeId, wp.id) });
    if (!draggable) return;
    dragRef.current.active = true;
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev: React.PointerEvent<SVGGElement>) => {
    if (!dragRef.current.active) return;
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const viewport = useSiteStore.getState().editor.viewport;
    const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
    moveFreeWaypoint(routeId, wp.id, world.x, world.y);
  };

  const onPointerUp = (ev: React.PointerEvent<SVGGElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    (ev.currentTarget as Element).releasePointerCapture(ev.pointerId);
  };

  const innerR = wp.kind === 'free' ? 2.4 : 1.8;
  const ringR = wp.kind === 'poi' ? 5.2 : selected ? 3.8 : 3.0;

  return (
    <g
      transform={`translate(${pos.x} ${pos.y})`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={
        interactive
          ? { cursor: draggable ? 'move' : 'pointer' }
          : undefined
      }
      data-waypoint={wp.id}
    >
      {/* POI-ref waypoints render an outer ring around the underlying POI marker. */}
      {wp.kind === 'poi' && (
        <circle
          r={ringR}
          fill="none"
          stroke={color}
          strokeWidth={selected ? 1.0 / scale : 0.7 / scale}
          strokeDasharray={selected ? undefined : `${1.5 / scale} ${1.0 / scale}`}
        />
      )}
      {wp.kind === 'free' && (
        <circle
          r={innerR}
          fill={color}
          stroke="white"
          strokeWidth={selected ? 0.9 / scale : 0.6 / scale}
        />
      )}
      <text
        x={(wp.kind === 'poi' ? ringR : innerR) + 1.2}
        y={0}
        fontSize={3.4}
        textAnchor="start"
        dominantBaseline="central"
        fill={color}
        fontFamily="ui-sans-serif, system-ui"
        fontWeight={700}
        pointerEvents="none"
        paintOrder="stroke"
        stroke="white"
        strokeWidth={0.6}
      >
        {sequence}
      </text>
    </g>
  );
}

export function consumeWaypointSelection(
  selectionId: string,
): { routeId: UUID; waypointId: UUID } | null {
  return parseWaypointSelectionId(selectionId);
}
