import { useRef } from 'react';
import { useSiteStore } from '../../../state/useSiteStore';
import type { Point, ShorelinePath, WaterBodyShape } from '../../../domain/types';
import { smoothPath } from '../../../utils/smoothing';
import { centroid, nearestSegment } from '../../../domain/geometry';
import { clientToWorld } from '../../../utils/coords';

const SHAPE_STYLES: Record<
  WaterBodyShape,
  { fill: string; strokeClass: string; strokeWidth: number; dash?: string }
> = {
  shoreline: {
    fill: 'none',
    strokeClass: 'stroke-water-700',
    strokeWidth: 1.4,
    dash: '5 3',
  },
  lake: {
    fill: 'rgba(125, 193, 220, 0.45)',
    strokeClass: 'stroke-water-700',
    strokeWidth: 1.4,
    dash: '5 3',
  },
  cave: {
    fill: 'rgba(20, 60, 80, 0.55)',
    strokeClass: 'stroke-water-900',
    strokeWidth: 2,
    dash: '2 2',
  },
};

export function WaterBodyLayerView() {
  const layer = useSiteStore((s) => s.site.layers.waterBody);
  const selection = useSiteStore((s) => s.editor.selection);
  const setSelection = useSiteStore((s) => s.setSelection);
  const mutate = useSiteStore((s) => s.mutateSite);
  const tool = useSiteStore((s) => s.editor.tool);
  const readOnly = useSiteStore((s) => s.editor.readOnly);
  const pendingPolyline = useSiteStore((s) => s.editor.pendingPolyline);

  return (
    <g data-layer="waterBody">
      {layer.shoreline.map((path) => {
        if (path.points.length === 0) return null;
        const shape: WaterBodyShape = path.shape ?? 'shoreline';
        const style = SHAPE_STYLES[shape];
        const d = smoothPath(path.points, path.closed);
        const isSelected = selection.some((s) => s.kind === 'shoreline' && s.id === path.id);
        return (
          <g key={path.id} data-shoreline={path.id} data-shape={shape}>
            {/* Wide invisible stroke for easier hit-testing */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={6}
              onPointerDown={(ev) => {
                if (ev.button !== 0) return;
                ev.stopPropagation();
                // Ctrl/Cmd-click on the path inserts a new vertex at the
                // closest point on the path. Skip if the layer is locked.
                if ((ev.ctrlKey || ev.metaKey) && !layer.locked && !readOnly) {
                  const svg = ev.currentTarget.ownerSVGElement;
                  if (!svg) return;
                  const viewport = useSiteStore.getState().editor.viewport;
                  const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
                  const ns = nearestSegment(path.points, path.closed, world);
                  if (!ns) return;
                  mutate((d) => {
                    const sh = d.layers.waterBody.shoreline.find((s) => s.id === path.id);
                    if (sh) sh.points.splice(ns.insertIdx, 0, ns.point);
                  });
                  setSelection({ kind: 'shoreline', id: path.id });
                  return;
                }
                setSelection({ kind: 'shoreline', id: path.id });
              }}
              style={{ cursor: 'pointer' }}
            />
            <path
              d={d}
              fill={path.closed ? style.fill : 'none'}
              className={isSelected ? 'stroke-amber-600' : style.strokeClass}
              strokeWidth={isSelected ? style.strokeWidth + 0.6 : style.strokeWidth}
              strokeDasharray={style.dash}
              pointerEvents="none"
            />
          </g>
        );
      })}
      {/* Selection handles render in a separate pass AFTER every item's
          hit-stroke, so they always win the click priority — otherwise a
          later-rendered shoreline's transparent hit-stroke can swallow the
          click intended for the handle of an earlier-selected shoreline. */}
      {!layer.locked &&
        !readOnly &&
        layer.shoreline
          .filter((p) => selection.some((s) => s.kind === 'shoreline' && s.id === p.id))
          .map((p) => <EditHandles key={p.id} path={p} tool={tool} />)}
      {pendingPolyline?.layer === 'waterBody' && pendingPolyline.points.length > 0 && (
        <PendingPreview points={pendingPolyline.points} shape={pendingPolyline.shape ?? 'shoreline'} />
      )}
    </g>
  );
}

function EditHandles({ path, tool }: { path: ShorelinePath; tool: string }) {
  const c = centroid(path.points);
  return (
    <g data-sublayer="waterbody-handles">
      {path.points.map((p, i) => (
        <VertexHandle key={i} pathId={path.id} idx={i} point={p} tool={tool} />
      ))}
      <BodyMoveHandle pathId={path.id} centroid={c} />
    </g>
  );
}

function VertexHandle({
  pathId,
  idx,
  point,
  tool,
}: {
  pathId: string;
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
        const sh = d.layers.waterBody.shoreline.find((s) => s.id === pathId);
        if (sh && sh.points.length > 2) sh.points.splice(idx, 1);
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
      const sh = d.layers.waterBody.shoreline.find((s) => s.id === pathId);
      if (sh) sh.points[idx] = world;
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
      r={1.6}
      className={isRemove ? 'fill-red-500 stroke-red-700' : 'fill-amber-400 stroke-amber-700'}
      strokeWidth={0.5}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: isRemove ? 'crosshair' : 'move' }}
    />
  );
}

function BodyMoveHandle({ pathId, centroid: c }: { pathId: string; centroid: Point }) {
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
    const sh = useSiteStore.getState().site.layers.waterBody.shoreline.find((s) => s.id === pathId);
    if (!sh) return;
    dragRef.current = {
      active: true,
      startWorld: world,
      startPoints: sh.points.map((p) => ({ ...p })),
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
      const sh = d.layers.waterBody.shoreline.find((s) => s.id === pathId);
      if (sh) sh.points = start.map((p) => ({ x: p.x + dx, y: p.y + dy }));
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
      <circle r={3.5} className="fill-amber-500 stroke-amber-700" strokeWidth={0.6} />
      <path
        d="M -2 0 L 2 0 M 0 -2 L 0 2 M -2 -2 L 2 2 M -2 2 L 2 -2"
        className="stroke-white"
        strokeWidth={0.6}
        strokeLinecap="round"
        pointerEvents="none"
      />
    </g>
  );
}

function PendingPreview({ points, shape }: { points: Point[]; shape: WaterBodyShape }) {
  const closedPreview = shape === 'lake' || shape === 'cave';
  const d =
    points.length > 1
      ? smoothPath(points, false) +
        (closedPreview && points.length > 2 ? ` L ${points[0]!.x} ${points[0]!.y}` : '')
      : '';
  return (
    <g data-sublayer="pending-shoreline" pointerEvents="none">
      {d && (
        <path
          d={d}
          fill="none"
          className="stroke-amber-600"
          strokeWidth={1.4}
          strokeDasharray="3 2"
        />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.2} className="fill-amber-600" />
      ))}
    </g>
  );
}
