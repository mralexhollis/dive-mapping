import { useRef } from 'react';
import { useSiteStore } from '../../../state/useSiteStore';
import type { NoteConnector, Point, UUID } from '../../../domain/types';
import { clientToWorld } from '../../../utils/coords';

export interface NotesLayerViewProps {
  positions: Map<UUID, Point>;
  subPoiPositions: Map<UUID, Point>;
}

const DEFAULT_BG = '#fef3c7';
const DEFAULT_TEXT = '#7c2d12';

export function NotesLayerView({ positions, subPoiPositions }: NotesLayerViewProps) {
  const layer = useSiteStore((s) => s.site.layers.notes);
  const selection = useSiteStore((s) => s.editor.selection);
  const tool = useSiteStore((s) => s.editor.tool);
  const readOnly = !!useSiteStore((s) => s.editor.readOnly);
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
            color={n.color ?? DEFAULT_BG}
            bgOpacity={n.bgOpacity ?? 1}
            textColor={n.textColor ?? DEFAULT_TEXT}
            connector={n.connector}
            selected={isSelected}
            draggable={draggable && !n.attachTo}
            readOnly={readOnly}
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
  bgOpacity,
  textColor,
  connector,
  selected,
  draggable,
  readOnly,
  northDeg,
}: {
  id: UUID;
  pos: Point;
  text: string;
  color: string;
  bgOpacity: number;
  textColor: string;
  connector?: NoteConnector;
  selected: boolean;
  draggable: boolean;
  readOnly: boolean;
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

  // Multi-line: split on newlines, size the box to the longest line + line count.
  const rawLines = text.split('\n');
  const lines = rawLines.length === 0 ? [''] : rawLines;
  const longestLineChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const fontSize = 3;
  const lineHeight = fontSize * 1.2;
  const padX = 1.5;
  const padY = 1.2;
  const w = Math.max(8, longestLineChars * 1.4 + padX * 2);
  const h = lines.length * lineHeight + padY * 2;
  const transparent = color === 'transparent' || bgOpacity <= 0;
  return (
    <g data-note={id}>
      {connector && <ConnectorLine notePos={pos} connector={connector} />}
      <g
        transform={`translate(${pos.x} ${pos.y}) rotate(${northDeg})`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: draggable ? 'move' : 'pointer' }}
      >
        {!transparent && (
          <rect
            x={-w / 2}
            y={-h / 2}
            rx={1}
            ry={1}
            width={w}
            height={h}
            fill={color}
            fillOpacity={bgOpacity}
            stroke={selected ? '#d97706' : 'none'}
            strokeWidth={selected ? 0.6 : 0}
          />
        )}
        {transparent && selected && (
          <rect
            x={-w / 2}
            y={-h / 2}
            rx={1}
            ry={1}
            width={w}
            height={h}
            fill="none"
            stroke="#d97706"
            strokeDasharray="1 0.6"
            strokeWidth={0.4}
          />
        )}
        <text
          x={0}
          fontSize={fontSize}
          textAnchor="middle"
          fill={textColor}
          fontFamily="ui-sans-serif, system-ui"
        >
          {lines.map((line, i) => (
            <tspan
              key={i}
              x={0}
              y={(i - (lines.length - 1) / 2) * lineHeight}
              dominantBaseline="central"
            >
              {line || ' '}
            </tspan>
          ))}
        </text>
      </g>
      {connector && !readOnly && selected && (
        <ConnectorTargetHandle id={id} target={connector.target} />
      )}
    </g>
  );
}

function ConnectorLine({
  notePos,
  connector,
}: {
  notePos: Point;
  connector: NoteConnector;
}) {
  const dx = connector.target.x - notePos.x;
  const dy = connector.target.y - notePos.y;
  const len = Math.hypot(dx, dy);
  // Marker geometry pre-computed in world coords.
  const arrowSize = 1.6;
  const ux = len === 0 ? 0 : dx / len;
  const uy = len === 0 ? 0 : dy / len;
  // Stop the line a touch shy of the target so the marker can finish the path.
  const tailEnd = {
    x: connector.target.x - ux * arrowSize * 0.35,
    y: connector.target.y - uy * arrowSize * 0.35,
  };
  return (
    <g data-sublayer="note-connector" pointerEvents="none">
      <line
        x1={notePos.x}
        y1={notePos.y}
        x2={tailEnd.x}
        y2={tailEnd.y}
        stroke="#92400e"
        strokeWidth={0.4}
        strokeLinecap="round"
      />
      {connector.style === 'arrow' && (
        <ArrowHead target={connector.target} ux={ux} uy={uy} size={arrowSize} />
      )}
      {connector.style === 'dot' && (
        <circle
          cx={connector.target.x}
          cy={connector.target.y}
          r={0.9}
          fill="#92400e"
        />
      )}
    </g>
  );
}

function ArrowHead({
  target,
  ux,
  uy,
  size,
}: {
  target: Point;
  ux: number;
  uy: number;
  size: number;
}) {
  // Rotate the unit vector by ±150° to get the back-flap directions.
  const rot = (angleDeg: number, x: number, y: number) => {
    const θ = (angleDeg * Math.PI) / 180;
    const c = Math.cos(θ);
    const s = Math.sin(θ);
    return { x: x * c - y * s, y: x * s + y * c };
  };
  const left = rot(150, ux, uy);
  const right = rot(-150, ux, uy);
  const points = [
    `${target.x},${target.y}`,
    `${target.x + left.x * size},${target.y + left.y * size}`,
    `${target.x + right.x * size},${target.y + right.y * size}`,
  ].join(' ');
  return <polygon points={points} fill="#92400e" />;
}

function ConnectorTargetHandle({ id, target }: { id: UUID; target: Point }) {
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
    mutate((d) => {
      const n = d.layers.notes.notes.find((n) => n.id === id);
      if (n?.connector) n.connector.target = world;
    });
  };
  const onPointerUp = (ev: React.PointerEvent<SVGCircleElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };
  return (
    <circle
      cx={target.x}
      cy={target.y}
      r={1.4}
      fill="#fbbf24"
      stroke="#92400e"
      strokeWidth={0.4}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: 'move' }}
      data-sublayer="note-connector-handle"
    />
  );
}
