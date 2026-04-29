import { useRef } from 'react';
import { useSiteStore } from '../../../state/useSiteStore';
import type { Point, UUID } from '../../../domain/types';
import { clientToWorld } from '../../../utils/coords';

export interface NotesLayerViewProps {
  positions: Map<UUID, Point>;
  subPoiPositions: Map<UUID, Point>;
}

export function NotesLayerView({ positions, subPoiPositions }: NotesLayerViewProps) {
  const layer = useSiteStore((s) => s.site.layers.notes);
  const selection = useSiteStore((s) => s.editor.selection);
  const tool = useSiteStore((s) => s.editor.tool);
  const readOnly = useSiteStore((s) => s.editor.readOnly);
  const northDeg = useSiteStore((s) => s.site.meta.northBearingDeg) ?? 0;
  const draggable = tool === 'select' && !layer.locked && !readOnly;
  return (
    <g data-layer="notes">
      {layer.notes.map((n) => {
        const anchor =
          n.attachTo?.kind === 'poi'
            ? positions.get(n.attachTo.id)
            : n.attachTo?.kind === 'subpoi'
            ? subPoiPositions.get(n.attachTo.id)
            : null;
        const pos = n.position ?? anchor;
        if (!pos) return null;
        const isSelected = selection.some((s) => s.kind === 'note' && s.id === n.id);
        return (
          <NoteCallout
            key={n.id}
            id={n.id}
            pos={pos}
            text={n.text}
            color={n.color}
            selected={isSelected}
            draggable={draggable && !n.attachTo}
            northDeg={northDeg}
          />
        );
      })}
    </g>
  );
}

function NoteCallout({
  id,
  pos,
  text,
  color,
  selected,
  draggable,
  northDeg,
}: {
  id: UUID;
  pos: Point;
  text: string;
  color?: string;
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
    setSelection({ kind: 'note', id });
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
      const n = d.layers.notes.notes.find((n) => n.id === id);
      if (n) n.position = world;
    });
  };
  const onPointerUp = (ev: React.PointerEvent<SVGGElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  const truncated = text.slice(0, 30);
  const w = Math.min(60, Math.max(8, truncated.length * 1.4 + 4));
  return (
    <g
      transform={`translate(${pos.x} ${pos.y}) rotate(${northDeg})`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: draggable ? 'move' : 'pointer' }}
      data-note={id}
    >
      <rect
        x={1}
        y={-5}
        rx={1}
        ry={1}
        width={w}
        height={6.5}
        fill={color ?? '#fef3c7'}
        stroke={selected ? '#d97706' : '#fbbf24'}
        strokeWidth={selected ? 0.6 : 0.3}
      />
      <text x={2.5} y={-0.7} fontSize={3} className="fill-amber-900" fontFamily="ui-sans-serif, system-ui">
        {truncated}
      </text>
    </g>
  );
}
