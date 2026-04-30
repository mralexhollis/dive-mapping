import { useRef } from 'react';
import { useSiteStore } from '../../../state/useSiteStore';
import { clientToWorld } from '../../../utils/coords';

export function MeasurementsLayerView() {
  const layer = useSiteStore((s) => s.site.layers.measurements);
  const selection = useSiteStore((s) => s.editor.selection);
  const tool = useSiteStore((s) => s.editor.tool);
  const readOnly = useSiteStore((s) => s.editor.readOnly);
  const northDeg = useSiteStore((s) => s.site.meta.northBearingDeg) ?? 0;
  return (
    <g data-layer="measurements">
      {layer.soundings.map((s) => {
        const isSelected = selection.some((sel) => sel.kind === 'sounding' && sel.id === s.id);
        return (
          <SoundingMarker
            key={s.id}
            id={s.id}
            x={s.x}
            y={s.y}
            depth={s.depth}
            selected={isSelected}
            draggable={tool === 'select' && !layer.locked && !readOnly}
            northDeg={northDeg}
          />
        );
      })}
    </g>
  );
}

function SoundingMarker({
  id,
  x,
  y,
  depth,
  selected,
  draggable,
  northDeg,
}: {
  id: string;
  x: number;
  y: number;
  depth: number;
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
    setSelection({ kind: 'sounding', id });
    if (!draggable) return;
    dragRef.current = { active: true };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: React.PointerEvent<SVGGElement>) => {
    if (!dragRef.current.active) return;
    const svg = ev.currentTarget.ownerSVGElement;
    if (!svg) return;
    const state = useSiteStore.getState();
    const viewport = state.editor.viewport;
    const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
    let target = world;
    if (state.site.layers.measurements.snapToGridCenter) {
      const g = state.site.meta.gridSpacingMeters ?? 3;
      target = {
        x: Math.floor(world.x / g) * g + g / 2,
        y: Math.floor(world.y / g) * g + g / 2,
      };
      // Don't allow the drag to land on a grid cell already occupied by
      // another measurement. We just freeze at the previous position until
      // the cursor moves to an empty cell.
      const collision = state.site.layers.measurements.soundings.some(
        (s) =>
          s.id !== id &&
          Math.abs(s.x - target.x) < 1e-6 &&
          Math.abs(s.y - target.y) < 1e-6,
      );
      if (collision) return;
    }
    mutate((d) => {
      const s = d.layers.measurements.soundings.find((s) => s.id === id);
      if (s) {
        s.x = target.x;
        s.y = target.y;
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
      transform={`translate(${x} ${y})`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: draggable ? 'move' : 'pointer' }}
      data-sounding={id}
    >
      <path
        d="M 0 -0.65 L 0.65 0 L 0 0.65 L -0.65 0 Z"
        className={
          selected
            ? 'fill-amber-400 stroke-amber-700'
            : 'fill-water-700 stroke-water-900'
        }
        strokeWidth={selected ? 0.12 : 0.08}
      />
      <g transform={`rotate(${northDeg})`}>
        <text
          x={0}
          y={0}
          fontSize={0.5}
          textAnchor="middle"
          dominantBaseline="central"
          className={selected ? 'fill-amber-900 font-semibold' : 'fill-white font-semibold'}
          fontFamily="ui-sans-serif, system-ui"
          pointerEvents="none"
        >
          {depth}
        </text>
      </g>
    </g>
  );
}
