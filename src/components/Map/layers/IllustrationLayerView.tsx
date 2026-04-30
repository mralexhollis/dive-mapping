import { useRef } from 'react';
import { useSiteStore } from '../../../state/useSiteStore';
import type { Illustration, PrimitiveShape } from '../../../domain/types';
import { vectorToBearing } from '../../../domain/geometry';
import { clientToWorld } from '../../../utils/coords';

/** Which Site layer the view should render and mutate. Both layers share the
 * Illustration shape; the `source` prop selects between them. */
export type IllustrationSource = 'illustrations' | 'references';

export interface IllustrationLayerViewProps {
  source?: IllustrationSource;
}

export function IllustrationLayerView({ source = 'illustrations' }: IllustrationLayerViewProps = {}) {
  const layer = useSiteStore((s) => s.site.layers[source]);
  const selection = useSiteStore((s) => s.editor.selection);
  const setSelection = useSiteStore((s) => s.setSelection);
  const readOnly = useSiteStore((s) => s.editor.readOnly);

  return (
    <g data-layer={source}>
      {layer.items.map((it) => {
        const isSelected = selection.some((s) => s.kind === 'illustration' && s.id === it.id);
        const cx = it.x + it.width / 2;
        const cy = it.y + it.height / 2;
        const rotate = it.rotationDeg ? `rotate(${it.rotationDeg} ${cx} ${cy})` : '';
        const onPointerDown = (ev: React.PointerEvent<SVGElement>) => {
          if (ev.button !== 0) return;
          ev.stopPropagation();
          setSelection({ kind: 'illustration', id: it.id });
        };
        const showHandles = isSelected && !layer.locked && !readOnly;
        const showRotationHandle = showHandles && it.primitive !== 'circle';
        return (
          <g
            key={it.id}
            opacity={it.opacity ?? 1}
            transform={rotate}
            data-illustration={it.id}
          >
            <g onPointerDown={onPointerDown} style={{ cursor: 'pointer' }}>
              {it.kind === 'primitive' && it.primitive ? (
                <PrimitiveShapeRender it={it} primitive={it.primitive} />
              ) : it.src ? (
                <image href={it.src} x={it.x} y={it.y} width={it.width} height={it.height} />
              ) : null}
            </g>
            {isSelected && (
              <rect
                x={it.x - 0.5}
                y={it.y - 0.5}
                width={it.width + 1}
                height={it.height + 1}
                fill="none"
                stroke="#d97706"
                strokeWidth={0.7}
                strokeDasharray="2 1"
                pointerEvents="none"
              />
            )}
            {showHandles && (
              <>
                <MoveHandle source={source} id={it.id} cx={cx} cy={cy} x={it.x} y={it.y} />
                <ResizeHandle source={source} id={it.id} corner="tl" x={it.x} y={it.y} />
                <ResizeHandle source={source} id={it.id} corner="tr" x={it.x + it.width} y={it.y} />
                <ResizeHandle source={source} id={it.id} corner="bl" x={it.x} y={it.y + it.height} />
                <ResizeHandle source={source} id={it.id} corner="br" x={it.x + it.width} y={it.y + it.height} />
              </>
            )}
            {showRotationHandle && (
              <RotationHandle source={source} id={it.id} cx={cx} cy={cy} top={it.y - 5} />
            )}
          </g>
        );
      })}
    </g>
  );
}

function MoveHandle({
  source,
  id,
  cx,
  cy,
  x,
  y,
}: {
  source: IllustrationSource;
  id: string;
  cx: number;
  cy: number;
  x: number;
  y: number;
}) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const dragRef = useRef<{
    active: boolean;
    startWorld: { x: number; y: number };
    startX: number;
    startY: number;
  }>({ active: false, startWorld: { x: 0, y: 0 }, startX: 0, startY: 0 });

  const onPointerDown = (ev: React.PointerEvent<SVGGElement>) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const viewport = useSiteStore.getState().editor.viewport;
    const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
    dragRef.current = { active: true, startWorld: world, startX: x, startY: y };
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
    mutate((d) => {
      const it = d.layers[source].items.find((i) => i.id === id);
      if (it) {
        it.x = dragRef.current.startX + dx;
        it.y = dragRef.current.startY + dy;
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
      transform={`translate(${cx} ${cy})`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: 'move' }}
      data-sublayer="move-handle"
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

function RotationHandle({
  source,
  id,
  cx,
  cy,
  top,
}: {
  source: IllustrationSource;
  id: string;
  cx: number;
  cy: number;
  top: number;
}) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const dragRef = useRef({ active: false });

  const onPointerDown = (ev: React.PointerEvent<SVGCircleElement>) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    dragRef.current = { active: true };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: React.PointerEvent<SVGCircleElement>) => {
    if (!dragRef.current.active) return;
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const viewport = useSiteStore.getState().editor.viewport;
    const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
    // Bearing from centre to cursor — matches our compass convention
    // (0° = up, increases clockwise).
    const angle = vectorToBearing({ x: world.x - cx, y: world.y - cy });
    mutate((d) => {
      const it = d.layers[source].items.find((i) => i.id === id);
      if (it) it.rotationDeg = Math.round(angle);
    });
  };
  const onPointerUp = (ev: React.PointerEvent<SVGCircleElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  return (
    <g data-sublayer="rotation-handle" pointerEvents="auto">
      <line x1={cx} y1={cy} x2={cx} y2={top} stroke="#d97706" strokeWidth={0.4} pointerEvents="none" />
      <circle
        cx={cx}
        cy={top}
        r={1.5}
        fill="#fbbf24"
        stroke="#d97706"
        strokeWidth={0.5}
        style={{ cursor: 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </g>
  );
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';

function rotateAround(p: { x: number; y: number }, angleDeg: number) {
  const θ = (angleDeg * Math.PI) / 180;
  const c = Math.cos(θ);
  const s = Math.sin(θ);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

function ResizeHandle({ source, id, corner, x, y }: { source: IllustrationSource; id: string; corner: Corner; x: number; y: number }) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const dragRef = useRef<{
    active: boolean;
    startRot: number;
    /** World-space position of the opposite corner; stays pinned during the drag. */
    oppositeWorld: { x: number; y: number };
  }>({ active: false, startRot: 0, oppositeWorld: { x: 0, y: 0 } });

  const onPointerDown = (ev: React.PointerEvent<SVGCircleElement>) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    const it = useSiteStore.getState().site.layers[source].items.find((i) => i.id === id);
    if (!it) return;
    const startRot = it.rotationDeg ?? 0;
    const halfW = it.width / 2;
    const halfH = it.height / 2;
    // Opposite corner relative to bbox centre (in unrotated local coords).
    const localOpposite =
      corner === 'tl'
        ? { x: halfW, y: halfH }
        : corner === 'tr'
        ? { x: -halfW, y: halfH }
        : corner === 'bl'
        ? { x: halfW, y: -halfH }
        : { x: -halfW, y: -halfH };
    const startCenter = { x: it.x + halfW, y: it.y + halfH };
    const rotated = rotateAround(localOpposite, startRot);
    const oppositeWorld = {
      x: startCenter.x + rotated.x,
      y: startCenter.y + rotated.y,
    };
    dragRef.current = { active: true, startRot, oppositeWorld };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev: React.PointerEvent<SVGCircleElement>) => {
    if (!dragRef.current.active) return;
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const viewport = useSiteStore.getState().editor.viewport;
    const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
    const { startRot, oppositeWorld } = dragRef.current;
    // The new bbox is centred on the midpoint between the cursor and the
    // pinned opposite corner. In the bbox' local (unrotated) frame, the two
    // diagonal corners sit at ±(w/2, h/2) — so we recover w and h by
    // rotating the cursor offset back into local space.
    const mid = {
      x: (world.x + oppositeWorld.x) / 2,
      y: (world.y + oppositeWorld.y) / 2,
    };
    const cRel = { x: world.x - mid.x, y: world.y - mid.y };
    const localC = rotateAround(cRel, -startRot);
    const minSide = 1;
    const w = Math.max(minSide, 2 * Math.abs(localC.x));
    const h = Math.max(minSide, 2 * Math.abs(localC.y));
    const newX = mid.x - w / 2;
    const newY = mid.y - h / 2;
    mutate((d) => {
      const it = d.layers[source].items.find((i) => i.id === id);
      if (!it) return;
      it.x = newX;
      it.y = newY;
      it.width = w;
      it.height = h;
    });
  };

  const onPointerUp = (ev: React.PointerEvent<SVGCircleElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  const cursor =
    corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize';

  return (
    <circle
      cx={x}
      cy={y}
      r={1.6}
      className="fill-white stroke-amber-700"
      strokeWidth={0.6}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-sublayer="resize-handle"
      data-corner={corner}
    />
  );
}

function PrimitiveShapeRender({ it, primitive }: { it: Illustration; primitive: PrimitiveShape }) {
  const fill = it.fill ?? '#cbd5e1';
  const stroke = it.stroke ?? '#475569';
  switch (primitive) {
    case 'square':
      return (
        <rect
          x={it.x}
          y={it.y}
          width={it.width}
          height={it.height}
          fill={fill}
          stroke={stroke}
          strokeWidth={0.6}
        />
      );
    case 'circle': {
      const cx = it.x + it.width / 2;
      const cy = it.y + it.height / 2;
      return (
        <ellipse
          cx={cx}
          cy={cy}
          rx={it.width / 2}
          ry={it.height / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={0.6}
        />
      );
    }
    case 'triangle': {
      const points = [
        [it.x + it.width / 2, it.y],
        [it.x + it.width, it.y + it.height],
        [it.x, it.y + it.height],
      ]
        .map((p) => p.join(','))
        .join(' ');
      return <polygon points={points} fill={fill} stroke={stroke} strokeWidth={0.6} />;
    }
    case 'boat': {
      const pts = [
        [it.x + it.width / 2, it.y],
        [it.x + it.width, it.y + it.height * 0.35],
        [it.x + it.width, it.y + it.height],
        [it.x, it.y + it.height],
        [it.x, it.y + it.height * 0.35],
      ]
        .map((p) => p.join(','))
        .join(' ');
      return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={0.6} />;
    }
    default:
      return null;
  }
}
