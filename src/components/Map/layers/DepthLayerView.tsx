import { useRef } from 'react';
import { useSiteStore } from '../../../state/useSiteStore';
import type { ContourLine, Point } from '../../../domain/types';
import { centroid, pointAlongPolyline } from '../../../domain/geometry';
import { clientToWorld } from '../../../utils/coords';

export function DepthLayerView() {
  const layer = useSiteStore((s) => s.site.layers.depth);
  const selection = useSiteStore((s) => s.editor.selection);
  const tool = useSiteStore((s) => s.editor.tool);
  const readOnly = useSiteStore((s) => s.editor.readOnly);
  const pendingPolyline = useSiteStore((s) => s.editor.pendingPolyline);
  const setSelection = useSiteStore((s) => s.setSelection);
  const northDeg = useSiteStore((s) => s.site.meta.northBearingDeg) ?? 0;

  return (
    <g data-layer="depth">
      <g data-sublayer="contours">
        {layer.contours.map((c) => {
          if (c.points.length === 0) return null;
          const d = `M ${c.points.map((p) => `${p.x} ${p.y}`).join(' L ')}${c.closed ? ' Z' : ''}`;
          const isSelected = selection.some((s) => s.kind === 'contour' && s.id === c.id);
          return (
            <g key={c.id} data-contour={c.id}>
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={3}
                onPointerDown={(ev) => {
                  if (ev.button !== 0) return;
                  ev.stopPropagation();
                  setSelection({ kind: 'contour', id: c.id });
                }}
                style={{ cursor: 'pointer' }}
              />
              <path
                d={d}
                fill="none"
                strokeWidth={isSelected ? 1 : 0.6}
                className={
                  isSelected
                    ? 'stroke-amber-600'
                    : c.origin === 'derived'
                    ? 'stroke-water-500/70'
                    : 'stroke-water-700/80'
                }
                strokeDasharray={c.origin === 'derived' ? '1.5 1' : undefined}
                pointerEvents="none"
              />
              {!c.labelHidden && c.points.length > 0 && (() => {
                const text = c.label ?? `${c.depth}m`;
                const offset = c.labelOffset ?? 0.5;
                const repeat = Math.max(1, Math.min(5, c.labelRepeat ?? 1));
                const positions: number[] = [];
                for (let k = 0; k < repeat; k++) {
                  positions.push((offset + k / repeat) % 1);
                }
                return positions.map((t, i) => {
                  const p = pointAlongPolyline(c.points, !!c.closed, t);
                  return (
                    <text
                      key={i}
                      x={p.x}
                      y={p.y}
                      fontSize={3}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className={
                        isSelected
                          ? 'fill-amber-900 font-semibold'
                          : c.origin === 'derived'
                          ? 'fill-water-700 font-semibold'
                          : 'fill-water-900 font-semibold'
                      }
                      fontFamily="ui-sans-serif, system-ui"
                      stroke="white"
                      strokeWidth={0.4}
                      paintOrder="stroke"
                      pointerEvents="none"
                    >
                      {text}
                    </text>
                  );
                });
              })()}
              {isSelected && !layer.locked && !readOnly && (
                <ContourEditHandles contour={c} tool={tool} />
              )}
            </g>
          );
        })}
      </g>
      <g data-sublayer="depth-labels">
        {(layer.labels ?? []).map((lbl) => {
          const isSelected = selection.some((s) => s.kind === 'depthLabel' && s.id === lbl.id);
          // Default for back-compat: derived labels = contour, manual = reference.
          const labelKind = lbl.kind ?? (lbl.origin === 'derived' ? 'contour' : 'reference');
          return (
            <DepthLabelMarker
              key={lbl.id}
              id={lbl.id}
              x={lbl.x}
              y={lbl.y}
              depth={lbl.depth}
              labelKind={labelKind}
              selected={isSelected}
              draggable={tool === 'select' && !layer.locked && !readOnly}
              northDeg={northDeg}
            />
          );
        })}
      </g>
      {pendingPolyline && pendingPolyline.layer === 'depth' && pendingPolyline.points.length > 0 && (
        <g data-sublayer="pending-contour" pointerEvents="none">
          <polyline
            points={pendingPolyline.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            className="stroke-amber-600"
            strokeWidth={0.7}
            strokeDasharray="2 1"
          />
          {pendingPolyline.points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={0.7} className="fill-amber-600" />
          ))}
        </g>
      )}
    </g>
  );
}

function DepthLabelMarker({
  id,
  x,
  y,
  depth,
  labelKind,
  selected,
  draggable,
  northDeg,
}: {
  id: string;
  x: number;
  y: number;
  depth: number;
  labelKind: 'contour' | 'reference';
  selected: boolean;
  draggable: boolean;
  northDeg: number;
}) {
  const setSelection = useSiteStore((s) => s.setSelection);
  const mutate = useSiteStore((s) => s.mutateSite);
  const dragRef = useRef({ active: false });

  const onPointerDown = (ev: React.PointerEvent<SVGGElement>) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    setSelection({ kind: 'depthLabel', id });
    if (!draggable) return;
    dragRef.current = { active: true };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: React.PointerEvent<SVGGElement>) => {
    if (!dragRef.current.active) return;
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const viewport = useSiteStore.getState().editor.viewport;
    const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
    mutate((d) => {
      const l = d.layers.depth.labels?.find((l) => l.id === id);
      if (l) {
        l.x = world.x;
        l.y = world.y;
      }
    });
  };
  const onPointerUp = (ev: React.PointerEvent<SVGGElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  return (
    <g
      transform={`rotate(${northDeg} ${x} ${y})`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: draggable ? 'move' : 'pointer' }}
      data-depth-label={id}
    >
      <text
        x={x}
        y={y}
        fontSize={4}
        textAnchor="middle"
        className={
          selected
            ? 'fill-amber-700 font-semibold'
            : labelKind === 'contour'
            ? 'fill-water-700 font-semibold'
            : 'fill-water-900 font-semibold'
        }
        fontFamily="ui-sans-serif, system-ui"
        stroke="white"
        strokeWidth={0.4}
        paintOrder="stroke"
      >
        {depth}m
      </text>
    </g>
  );
}

function ContourEditHandles({ contour, tool }: { contour: ContourLine; tool: string }) {
  const c = centroid(contour.points);
  return (
    <g data-sublayer="contour-handles">
      {contour.points.map((p, i) => (
        <ContourVertex key={i} contourId={contour.id} idx={i} point={p} tool={tool} />
      ))}
      <ContourMoveHandle contourId={contour.id} centroid={c} />
    </g>
  );
}

function ContourVertex({
  contourId,
  idx,
  point,
  tool,
}: {
  contourId: string;
  idx: number;
  point: Point;
  tool: string;
}) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const dragRef = useRef({ active: false });

  const onPointerDown = (ev: React.PointerEvent<SVGCircleElement>) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    if (tool === 'remove-point') {
      mutate((d) => {
        const c = d.layers.depth.contours.find((c) => c.id === contourId);
        if (c && c.points.length > 2) c.points.splice(idx, 1);
      });
      return;
    }
    dragRef.current = { active: true };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: React.PointerEvent<SVGCircleElement>) => {
    if (!dragRef.current.active) return;
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const viewport = useSiteStore.getState().editor.viewport;
    const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
    mutate((d) => {
      const c = d.layers.depth.contours.find((c) => c.id === contourId);
      if (c) c.points[idx] = world;
    });
  };
  const onPointerUp = (ev: React.PointerEvent<SVGCircleElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };
  const isRemove = tool === 'remove-point';
  return (
    <circle
      cx={point.x}
      cy={point.y}
      r={1.2}
      className={isRemove ? 'fill-red-500 stroke-red-700' : 'fill-amber-400 stroke-amber-700'}
      strokeWidth={0.4}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: isRemove ? 'crosshair' : 'move' }}
    />
  );
}

function ContourMoveHandle({ contourId, centroid: c }: { contourId: string; centroid: Point }) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const dragRef = useRef<{
    active: boolean;
    startWorld: Point;
    startPoints: Point[];
  }>({ active: false, startWorld: { x: 0, y: 0 }, startPoints: [] });

  const onPointerDown = (ev: React.PointerEvent<SVGGElement>) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const viewport = useSiteStore.getState().editor.viewport;
    const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
    const cl = useSiteStore.getState().site.layers.depth.contours.find((c) => c.id === contourId);
    if (!cl) return;
    dragRef.current = {
      active: true,
      startWorld: world,
      startPoints: cl.points.map((p) => ({ ...p })),
    };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: React.PointerEvent<SVGGElement>) => {
    if (!dragRef.current.active) return;
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const viewport = useSiteStore.getState().editor.viewport;
    const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
    const dx = world.x - dragRef.current.startWorld.x;
    const dy = world.y - dragRef.current.startWorld.y;
    const start = dragRef.current.startPoints;
    mutate((d) => {
      const cl = d.layers.depth.contours.find((c) => c.id === contourId);
      if (cl) cl.points = start.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    });
  };
  const onPointerUp = (ev: React.PointerEvent<SVGGElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };
  return (
    <g
      transform={`translate(${c.x} ${c.y})`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: 'move' }}
    >
      <circle r={2.6} className="fill-amber-500 stroke-amber-700" strokeWidth={0.5} />
      <path
        d="M -1.5 0 L 1.5 0 M 0 -1.5 L 0 1.5 M -1.5 -1.5 L 1.5 1.5 M -1.5 1.5 L 1.5 -1.5"
        className="stroke-white"
        strokeWidth={0.5}
        strokeLinecap="round"
        pointerEvents="none"
      />
    </g>
  );
}
