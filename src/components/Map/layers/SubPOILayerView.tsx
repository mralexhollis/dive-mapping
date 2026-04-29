import { useRef } from 'react';
import { useSiteStore } from '../../../state/useSiteStore';
import type { POILabelPosition, Point, SubPOICategory, UUID } from '../../../domain/types';
import { clientToWorld } from '../../../utils/coords';

export interface SubPOILayerViewProps {
  positions: Map<UUID, Point>;
}

export interface SubPoiCategoryStyle {
  fill: string;
  stroke: string;
  iconColor: string;
}

export const SUBPOI_STYLES: Record<SubPOICategory, SubPoiCategoryStyle> = {
  fish: { fill: '#ffffff', stroke: '#1f2937', iconColor: '#1f2937' },
  coral: { fill: '#ffffff', stroke: '#1f2937', iconColor: '#1f2937' },
  hazard_high: { fill: '#7f1d1d', stroke: '#450a0a', iconColor: '#ffffff' }, // dark red
  hazard_standard: { fill: '#fca5a5', stroke: '#7f1d1d', iconColor: '#7f1d1d' }, // light red
  hazard_awareness: { fill: '#fbbf24', stroke: '#78350f', iconColor: '#78350f' }, // amber
  access: { fill: '#ffffff', stroke: '#1f2937', iconColor: '#1f2937' },
  photo_spot: { fill: '#ffffff', stroke: '#1f2937', iconColor: '#1f2937' },
  note: { fill: '#ffffff', stroke: '#1f2937', iconColor: '#1f2937' },
  other: { fill: '#ffffff', stroke: '#1f2937', iconColor: '#1f2937' },
};

export const SUBPOI_LABELS: Record<SubPOICategory, string> = {
  fish: 'Fish / wildlife',
  coral: 'Coral / flora',
  hazard_high: 'Hazard — high risk',
  hazard_standard: 'Hazard — standard',
  hazard_awareness: 'Hazard — awareness',
  access: 'Access (entry / exit / swim-through)',
  photo_spot: 'Photo spot',
  note: 'Note',
  other: 'Other',
};

export function SubPOILayerView({ positions }: SubPOILayerViewProps) {
  const layer = useSiteStore((s) => s.site.layers.subPoi);
  const selection = useSiteStore((s) => s.editor.selection);
  const tool = useSiteStore((s) => s.editor.tool);
  const readOnly = useSiteStore((s) => s.editor.readOnly);
  const northDeg = useSiteStore((s) => s.site.meta.northBearingDeg) ?? 0;
  return (
    <g data-layer="subPoi">
      {layer.items.map((s) => {
        const pos = positions.get(s.id);
        if (!pos) return null;
        const isSelected = selection.some((sel) => sel.kind === 'subpoi' && sel.id === s.id);
        const draggable = tool === 'select' && !layer.locked && !readOnly;
        return (
          <SubPoiNode
            key={s.id}
            id={s.id}
            parentId={s.parentId}
            pos={pos}
            name={s.name}
            category={s.category}
            labelPosition={s.labelPosition}
            selected={isSelected}
            draggable={draggable}
            northDeg={northDeg}
          />
        );
      })}
    </g>
  );
}

function SubPoiNode({
  id,
  parentId,
  pos,
  name,
  category,
  labelPosition,
  selected,
  draggable,
  northDeg,
}: {
  id: UUID;
  parentId: UUID;
  pos: Point;
  name: string;
  category: SubPOICategory;
  labelPosition?: POILabelPosition;
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
    setSelection({ kind: 'subpoi', id });
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
    const parentPos = useSiteStore
      .getState()
      .site.layers.poi.pois.find((p) => p.id === parentId)?.position;
    const baseX = parentPos?.x ?? 0;
    const baseY = parentPos?.y ?? 0;
    mutate((d) => {
      const sp = d.layers.subPoi.items.find((s) => s.id === id);
      if (sp) sp.offset = { x: world.x - baseX, y: world.y - baseY };
    });
  };
  const onPointerUp = (ev: React.PointerEvent<SVGGElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  const style = SUBPOI_STYLES[category] ?? SUBPOI_STYLES.other;
  return (
    <g
      transform={`translate(${pos.x} ${pos.y})`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: draggable ? 'move' : 'pointer' }}
      data-subpoi={id}
    >
      <g transform={`rotate(${northDeg})`}>
        <circle
          r={2.4}
          fill={selected ? '#fcd34d' : style.fill}
          stroke={selected ? '#92400e' : style.stroke}
          strokeWidth={0.5}
        />
        <CategoryIcon
          category={category}
          color={selected ? '#92400e' : style.iconColor}
        />
        <SubPoiLabel
          name={name}
          position={labelPosition ?? 'right'}
          selected={selected}
        />
      </g>
    </g>
  );
}

function SubPoiLabel({
  name,
  position,
  selected,
}: {
  name: string;
  position: POILabelPosition;
  selected: boolean;
}) {
  if (position === 'hidden') return null;
  // Marker has radius ~2.4; pad clears the edge.
  const pad = 3.2;
  let x = 0;
  let y = 0;
  let textAnchor: 'start' | 'middle' | 'end' = 'start';
  let dominantBaseline: 'central' | 'hanging' | 'text-after-edge' = 'central';
  switch (position) {
    case 'right':
      x = pad;
      textAnchor = 'start';
      break;
    case 'left':
      x = -pad;
      textAnchor = 'end';
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
  }
  return (
    <text
      x={x}
      y={y}
      fontSize={2.8}
      textAnchor={textAnchor}
      dominantBaseline={dominantBaseline}
      className={selected ? 'fill-amber-900 font-semibold' : 'fill-amber-900'}
      fontFamily="ui-sans-serif, system-ui"
      pointerEvents="none"
    >
      {name}
    </text>
  );
}

/**
 * Renders just the inner glyph of a sub-POI category icon, sized for the
 * canvas marker (paths are drawn within roughly ±2 units around 0,0).
 * Exported so the Toolbar can reuse the same shapes inside its category buttons.
 */
export function CategoryIcon({ category, color }: { category: SubPOICategory; color: string }) {
  switch (category) {
    case 'fish':
      // Stylised fish: pointed-left body + tail.
      return (
        <g pointerEvents="none">
          <path
            d="M -0.7 0 Q -0.4 -0.7 0.5 -0.6 Q 1.2 -0.4 1.2 0 Q 1.2 0.4 0.5 0.6 Q -0.4 0.7 -0.7 0 Z"
            fill={color}
          />
          <path d="M -0.7 0 L -1.4 -0.55 L -1.4 0.55 Z" fill={color} />
          <circle cx={0.7} cy={-0.15} r={0.13} fill={color === '#ffffff' ? '#1f2937' : '#ffffff'} />
        </g>
      );
    case 'coral':
      // Branching coral fan.
      return (
        <g
          pointerEvents="none"
          fill="none"
          stroke={color}
          strokeWidth={0.3}
          strokeLinecap="round"
        >
          <path d="M 0 1.1 L 0 -0.2" />
          <path d="M 0 -0.2 L -0.85 -1.05" />
          <path d="M 0 -0.2 L 0.85 -1.05" />
          <path d="M 0 -0.2 L 0 -1.15" />
          <path d="M -0.45 -0.65 L -0.45 -1.05" />
          <path d="M 0.45 -0.65 L 0.45 -1.05" />
        </g>
      );
    case 'hazard_high':
    case 'hazard_standard':
    case 'hazard_awareness':
      return (
        <g pointerEvents="none">
          <path d="M 0 -1.3 L 1.4 1 L -1.4 1 Z" fill={color} />
          <rect x={-0.13} y={-0.6} width={0.26} height={0.9} fill={inverseOf(color)} />
          <circle cx={0} cy={0.65} r={0.18} fill={inverseOf(color)} />
        </g>
      );
    case 'access':
      // Two opposing arrows (entry/exit/swim-through).
      return (
        <g
          pointerEvents="none"
          fill="none"
          stroke={color}
          strokeWidth={0.28}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M -1.2 -0.45 L 1.2 -0.45" />
          <path d="M 0.7 -0.85 L 1.2 -0.45 L 0.7 -0.05" />
          <path d="M 1.2 0.45 L -1.2 0.45" />
          <path d="M -0.7 0.05 L -1.2 0.45 L -0.7 0.85" />
        </g>
      );
    case 'photo_spot':
      return (
        <g pointerEvents="none">
          <rect x={-1.3} y={-0.55} width={2.6} height={1.7} rx={0.18} fill={color} />
          <rect x={-0.45} y={-0.92} width={0.9} height={0.4} fill={color} />
          <circle cx={0} cy={0.3} r={0.55} fill={inverseOf(color)} />
          <circle cx={0} cy={0.3} r={0.32} fill={color} />
          <circle cx={0.85} cy={-0.18} r={0.13} fill={inverseOf(color)} />
        </g>
      );
    case 'note':
      return (
        <g
          pointerEvents="none"
          fill="none"
          stroke={color}
          strokeWidth={0.22}
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path d="M -1 -1.1 L 0.6 -1.1 L 1.1 -0.6 L 1.1 1.1 L -1 1.1 Z" />
          <path d="M 0.6 -1.1 L 0.6 -0.6 L 1.1 -0.6" />
          <path d="M -0.55 -0.2 L 0.7 -0.2" />
          <path d="M -0.55 0.3 L 0.7 0.3" />
          <path d="M -0.55 0.8 L 0.3 0.8" />
        </g>
      );
    case 'other':
      return <circle r={0.6} fill={color} pointerEvents="none" />;
  }
}

export function inverseOf(color: string): string {
  // Dark-on-coloured icon → light infill; light-on-dark icon → dark infill.
  if (color === '#ffffff') return '#7f1d1d';
  return '#ffffff';
}
