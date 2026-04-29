import { useRef } from 'react';
import { useSiteStore } from '../../../state/useSiteStore';
import type { POILabelPosition, Point, UUID } from '../../../domain/types';
import { distance, vectorToBearing } from '../../../domain/geometry';
import { clientToWorld } from '../../../utils/coords';

export interface POILayerViewProps {
  positions: Map<UUID, Point>;
}

export function POILayerView({ positions }: POILayerViewProps) {
  const layer = useSiteStore((s) => s.site.layers.poi);
  const selection = useSiteStore((s) => s.editor.selection);
  const activeLayer = useSiteStore((s) => s.editor.activeLayer);
  const tool = useSiteStore((s) => s.editor.tool);
  const pendingBearingFrom = useSiteStore((s) => s.editor.pendingBearingFromId);
  const pendingSubPoiParent = useSiteStore((s) => s.editor.pendingSubPoiParentId);
  const readOnly = useSiteStore((s) => s.editor.readOnly);
  const northDeg = useSiteStore((s) => s.site.meta.northBearingDeg) ?? 0;
  const isLayerActive = activeLayer === 'poi';
  const isSubPoiActive = activeLayer === 'subPoi';

  return (
    <g data-layer="poi">
      <g data-sublayer="bearings">
        {layer.bearings.map((b) => {
          const a = positions.get(b.fromId);
          const c = positions.get(b.toId);
          if (!a || !c) return null;
          const isSelected = selection.some((s) => s.kind === 'bearing' && s.id === b.id);
          return (
            <BearingEdge
              key={b.id}
              id={b.id}
              from={a}
              to={c}
              bearingDeg={b.bearingDeg}
              reverseDeg={b.reverseBearingDeg}
              dashed={b.style === 'dashed'}
              label={b.label}
              selected={isSelected}
            />
          );
        })}
      </g>
      <g data-sublayer="pois">
        {layer.pois.map((p) => {
          const pos = positions.get(p.id);
          if (!pos) return null;
          const isSelected = selection.some((s) => s.kind === 'poi' && s.id === p.id);
          const isPending =
            pendingBearingFrom === p.id || pendingSubPoiParent === p.id;
          // POIs participate in: their own tools (when POI layer is active),
          // sub-POI parent picking (when Sub-POI's add-subpoi is active), and
          // the universal Select tool regardless of which layer is "active".
          const effectiveTool =
            tool === 'select'
              ? 'select'
              : isLayerActive
              ? tool
              : isSubPoiActive && tool.startsWith('add-subpoi')
              ? 'pick-subpoi-parent'
              : null;
          return (
            <PoiNode
              key={p.id}
              id={p.id}
              pos={pos}
              name={p.name}
              depth={p.depth}
              number={p.number}
              labelPosition={p.labelPosition}
              selected={isSelected}
              pending={isPending}
              draggable={tool === 'select' && !layer.locked && !readOnly}
              tool={effectiveTool}
              northDeg={northDeg}
            />
          );
        })}
      </g>
    </g>
  );
}

interface PoiNodeProps {
  id: UUID;
  pos: Point;
  name: string;
  depth?: number;
  selected: boolean;
  pending: boolean;
  draggable: boolean;
  tool: string | null;
  number?: number;
  labelPosition?: POILabelPosition;
  northDeg: number;
}

function PoiNode({
  id,
  pos,
  name,
  depth,
  selected,
  pending,
  draggable,
  tool,
  number,
  labelPosition,
  northDeg,
}: PoiNodeProps) {
  const setSelection = useSiteStore((s) => s.setSelection);
  const setPendingFrom = useSiteStore((s) => s.setPendingBearingFrom);
  const setTool = useSiteStore((s) => s.setTool);
  const mutate = useSiteStore((s) => s.mutateSite);
  const dragRef = useRef({ active: false, moved: false });

  const onPointerDown = (ev: React.PointerEvent<SVGGElement>) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();

    if (tool === 'add-bearing') {
      const store = useSiteStore.getState();
      const fromId = store.editor.pendingBearingFromId;
      if (!fromId) {
        setPendingFrom(id);
      } else if (fromId === id) {
        setPendingFrom(null);
      } else {
        completeAddBearing(fromId, id);
        setPendingFrom(null);
        setTool('select');
      }
      return;
    }

    if (tool === 'pick-subpoi-parent') {
      // While the Add sub-POI tool is active, clicks on POIs are absorbed —
      // sub-POIs are only created on empty-canvas clicks (parent auto-picked
      // as the nearest POI by handleBackgroundClick).
      return;
    }

    setSelection({ kind: 'poi', id });
    if (!draggable) return;
    dragRef.current = { active: true, moved: false };
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev: React.PointerEvent<SVGGElement>) => {
    if (!dragRef.current.active) return;
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const viewport = useSiteStore.getState().editor.viewport;
    const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
    dragRef.current.moved = true;
    mutate((d) => {
      const p = d.layers.poi.pois.find((p) => p.id === id);
      if (!p) return;
      p.position = world;
      // Recompute every bearing that touches this POI in real time.
      for (const b of d.layers.poi.bearings) {
        if (b.fromId !== id && b.toId !== id) continue;
        const fromPos = d.layers.poi.pois.find((p) => p.id === b.fromId)?.position;
        const toPos = d.layers.poi.pois.find((p) => p.id === b.toId)?.position;
        if (!fromPos || !toPos) continue;
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) continue;
        const fwd = Math.round(vectorToBearing({ x: dx, y: dy }));
        b.bearingDeg = fwd;
        b.reverseBearingDeg = (fwd + 180) % 360;
        b.distanceM = Math.round(len * 10) / 10;
      }
    });
  };

  const onPointerUp = (ev: React.PointerEvent<SVGGElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    (ev.currentTarget as Element).releasePointerCapture(ev.pointerId);
  };

  const fillClass = pending
    ? 'fill-amber-300 stroke-amber-700'
    : selected
    ? 'fill-amber-400 stroke-amber-700'
    : 'fill-water-700 stroke-white';

  return (
    <g
      transform={`translate(${pos.x} ${pos.y})`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: tool === 'add-bearing' ? 'crosshair' : draggable ? 'move' : 'pointer' }}
      data-poi={id}
    >
      <circle
        r={3.6}
        className={fillClass}
        strokeWidth={selected || pending ? 0.7 : 0.5}
      />
      {/* Counter-rotate everything else by +northDeg so the number + label
          read horizontally regardless of the screen-bearing rotation. */}
      <g transform={`rotate(${northDeg})`}>
        {number != null && (
          <text
            x={0}
            y={0}
            fontSize={3.6}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-white"
            fontFamily="ui-sans-serif, system-ui"
            fontWeight={600}
            pointerEvents="none"
          >
            {number}
          </text>
        )}
        {labelPosition !== 'hidden' && (
          <PoiLabel
            name={name}
            depth={depth}
            position={labelPosition ?? 'right'}
            selected={selected}
          />
        )}
      </g>
    </g>
  );
}

function PoiLabel({
  name,
  depth,
  position,
  selected,
}: {
  name: string;
  depth?: number;
  position: POILabelPosition;
  selected: boolean;
}) {
  const text = `${name}${depth != null ? ` (${depth}m)` : ''}`;
  // Marker has radius 3.6; pad so the label clears the marker edge.
  const pad = 4.5;
  let x = 0;
  let y = 0;
  let textAnchor: 'start' | 'middle' | 'end' = 'start';
  let dominantBaseline: 'auto' | 'central' | 'hanging' | 'text-after-edge' = 'central';
  switch (position) {
    case 'right':
      x = pad;
      textAnchor = 'start';
      dominantBaseline = 'central';
      break;
    case 'left':
      x = -pad;
      textAnchor = 'end';
      dominantBaseline = 'central';
      break;
    case 'above':
      y = -pad;
      textAnchor = 'middle';
      dominantBaseline = 'text-after-edge';
      break;
    case 'below':
      y = pad;
      textAnchor = 'middle';
      dominantBaseline = 'hanging';
      break;
    case 'hidden':
      return null;
  }
  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline={dominantBaseline}
      className={selected ? 'fill-amber-900' : 'fill-water-900'}
      fontSize={4}
      fontFamily="ui-sans-serif, system-ui"
      pointerEvents="none"
    >
      {text}
    </text>
  );
}

function completeAddBearing(fromId: UUID, toId: UUID) {
  const store = useSiteStore.getState();
  const fromPos = store.site.layers.poi.pois.find((p) => p.id === fromId)?.position;
  const toPos = store.site.layers.poi.pois.find((p) => p.id === toId)?.position;
  let bearingDeg = 0;
  let distanceM: number | undefined = undefined;
  if (fromPos && toPos) {
    bearingDeg = Math.round(vectorToBearing({ x: toPos.x - fromPos.x, y: toPos.y - fromPos.y }));
    distanceM = Math.round(distance(fromPos, toPos) * 10) / 10;
  }
  const id = crypto.randomUUID();
  store.mutateSite((d) => {
    d.layers.poi.bearings.push({ id, fromId, toId, bearingDeg, distanceM });
  });
  store.setSelection({ kind: 'bearing', id });
}

interface BearingEdgeProps {
  id: UUID;
  from: Point;
  to: Point;
  bearingDeg: number;
  reverseDeg?: number;
  dashed?: boolean;
  label?: string;
  selected: boolean;
}

function useDistanceForBearing(id: UUID): number | undefined {
  return useSiteStore((s) => s.site.layers.poi.bearings.find((b) => b.id === id)?.distanceM);
}

function formatMetersShort(m: number): string {
  if (m >= 1000) return `${Math.round(m / 100) / 10}km`;
  if (m >= 100) return `${Math.round(m)}m`;
  return `${Math.round(m * 10) / 10}m`;
}

function BearingEdge({ id, from, to, bearingDeg, reverseDeg, dashed, label, selected }: BearingEdgeProps) {
  const setSelection = useSiteStore((s) => s.setSelection);
  const northDeg = useSiteStore((s) => s.site.meta.northBearingDeg) ?? 0;
  const reverse = reverseDeg ?? (bearingDeg + 180) % 360;
  const onPointerDown = (ev: React.PointerEvent<SVGElement>) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    setSelection({ kind: 'bearing', id });
  };

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  // The "above the line" perpendicular in screen coords (y-down) is (dy, -dx) / len.
  let nx = dy / len;
  let ny = -dx / len;
  // Flip the label when the *screen* angle of the line points leftward, so
  // the text isn't upside-down. The world rotates by -northDeg before reaching
  // the screen, so subtract that to get the screen angle.
  const screenAngle = angle - northDeg;
  const normSA = ((screenAngle + 180) % 360 + 360) % 360 - 180; // (-180, 180]
  if (normSA > 90 || normSA < -90) {
    angle += 180;
    nx = -nx;
    ny = -ny;
  }
  const offset = 1.6;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const labelX = midX + nx * offset;
  const labelY = midY + ny * offset;
  const distanceM = useDistanceForBearing(id);
  const labelParts: string[] = [];
  if (label) labelParts.push(label);
  labelParts.push(`${Math.round(bearingDeg)}° / ${Math.round(reverse)}°`);
  if (distanceM != null) labelParts.push(`~${formatMetersShort(distanceM)}`);
  const labelText = labelParts.join(' · ');

  return (
    <g onPointerDown={onPointerDown} style={{ cursor: 'pointer' }}>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="transparent"
        strokeWidth={3}
      />
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        className={selected ? 'stroke-amber-600' : 'stroke-water-900'}
        strokeWidth={selected ? 0.8 : 0.5}
        strokeDasharray={dashed ? '2 2' : undefined}
      />
      <text
        x={labelX}
        y={labelY}
        fontSize={3}
        textAnchor="middle"
        transform={`rotate(${angle} ${labelX} ${labelY})`}
        className={selected ? 'fill-amber-900' : 'fill-water-900'}
        fontFamily="ui-sans-serif, system-ui"
      >
        {labelText}
      </text>
    </g>
  );
}
