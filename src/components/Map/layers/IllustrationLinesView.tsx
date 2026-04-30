import { useRef } from 'react';
import { useSiteStore } from '../../../state/useSiteStore';
import { smoothPath } from '../../../utils/smoothing';
import { nearestSegment } from '../../../domain/geometry';
import { clientToWorld } from '../../../utils/coords';
import type { IllustrationLine, Point, UUID } from '../../../domain/types';
import { ILLUSTRATION_LINE_MIN_WIDTH, ILLUSTRATION_LINE_MAX_WIDTH } from '../../../domain/types';

/**
 * Renders all polyline illustrations (paths, roads, chains). Behaves like
 * the contour/shoreline layers — naturally curves through the points,
 * supports per-vertex drag handles when selected, and draws optional text
 * along the path.
 */
export function IllustrationLinesView() {
  const lines = useSiteStore((s) => s.site.layers.illustrations.lines ?? []);
  const layerLocked = useSiteStore((s) => s.site.layers.illustrations.locked);
  const selection = useSiteStore((s) => s.editor.selection);
  const setSelection = useSiteStore((s) => s.setSelection);
  const mutate = useSiteStore((s) => s.mutateSite);
  const tool = useSiteStore((s) => s.editor.tool);
  const readOnly = useSiteStore((s) => s.editor.readOnly);
  const northDeg = useSiteStore((s) => s.site.meta.northBearingDeg) ?? 0;

  const onPathPointerDown = (ev: React.PointerEvent<SVGElement>, lineId: UUID) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    // Ctrl/Cmd-click inserts a vertex at the closest point on the line.
    if ((ev.ctrlKey || ev.metaKey) && !layerLocked && !readOnly) {
      const svg = ev.currentTarget.ownerSVGElement;
      if (!svg) return;
      const viewport = useSiteStore.getState().editor.viewport;
      const world = clientToWorld(ev.clientX, ev.clientY, svg, viewport);
      const target = lines.find((l) => l.id === lineId);
      if (!target) return;
      const ns = nearestSegment(target.points, false, world);
      if (!ns) return;
      mutate((d) => {
        const ln = d.layers.illustrations.lines?.find((l) => l.id === lineId);
        if (ln) ln.points.splice(ns.insertIdx, 0, ns.point);
      });
      setSelection({ kind: 'illustrationLine', id: lineId });
      return;
    }
    setSelection({ kind: 'illustrationLine', id: lineId });
  };

  return (
    <g data-sublayer="illustration-lines">
      {lines.map((ln) => {
        const isSelected = selection.some(
          (s) => s.kind === 'illustrationLine' && s.id === ln.id,
        );
        return (
          <IllustrationLineRender
            key={ln.id}
            line={ln}
            selected={isSelected}
            northDeg={northDeg}
            onPathPointerDown={(ev) => onPathPointerDown(ev, ln.id)}
          />
        );
      })}
      {/* Handles drawn after every line's hit-stroke so they always win
          clicks against later-rendered lines in the same layer. */}
      {!layerLocked &&
        !readOnly &&
        tool === 'select' &&
        lines
          .filter((ln) => selection.some((s) => s.kind === 'illustrationLine' && s.id === ln.id))
          .map((ln) => <IllustrationLineHandles key={ln.id} line={ln} />)}
    </g>
  );
}

function IllustrationLineHandles({ line }: { line: IllustrationLine }) {
  const tool = useSiteStore((s) => s.editor.tool);
  return (
    <g data-sublayer="illustration-line-handles">
      {line.points.map((p, idx) => (
        <VertexHandle
          key={idx}
          lineId={line.id}
          index={idx}
          point={p}
          tool={tool}
        />
      ))}
    </g>
  );
}

function clampWidth(w: number): number {
  if (!Number.isFinite(w)) return 0.5;
  return Math.max(ILLUSTRATION_LINE_MIN_WIDTH, Math.min(ILLUSTRATION_LINE_MAX_WIDTH, w));
}

function strokeForLine(line: IllustrationLine): {
  color: string;
  dashArray?: string;
  width: number;
} {
  return {
    color: line.color ?? '#374151',
    dashArray: line.style === 'dashed' ? '2 1.5' : undefined,
    width: clampWidth(line.width),
  };
}

/**
 * Decide whether the textPath should run against a reversed copy of the
 * geometry, so the text isn't upside-down. We rotate the start→end vector
 * by `-northDeg` to get screen coords, then check if it points more
 * leftward than rightward.
 */
function labelNeedsReversal(points: Point[], northDeg: number): boolean {
  if (points.length < 2) return false;
  const start = points[0]!;
  const end = points[points.length - 1]!;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return false;
  const θ = (-northDeg * Math.PI) / 180;
  const screenDx = dx * Math.cos(θ) - dy * Math.sin(θ);
  return screenDx < 0;
}

interface RenderProps {
  line: IllustrationLine;
  selected: boolean;
  northDeg: number;
  onPathPointerDown: (ev: React.PointerEvent<SVGElement>) => void;
}

function IllustrationLineRender({ line, selected, northDeg, onPathPointerDown }: RenderProps) {
  const stroke = strokeForLine(line);
  const d = smoothPath(line.points, false);
  if (line.points.length === 0) return null;
  const pathId = `illustration-line-${line.id}`;
  // Generate a reversed-direction reference path for the textPath when the
  // forward path runs right-to-left on screen (otherwise the label reads
  // upside-down).
  const flipLabel = labelNeedsReversal(line.points, northDeg);
  const labelPathId = flipLabel ? `illustration-line-label-${line.id}` : pathId;
  const labelPathD = flipLabel ? smoothPath([...line.points].reverse(), false) : d;
  // Fixed world-space font size — the label readability shouldn't change as
  // the user widens or narrows the stroke. Matches the size used by depth
  // labels and bearings for visual consistency.
  const labelFontSize = 3;
  const labelPosition = line.labelPosition ?? 'above';
  const showLabel = labelPosition !== 'hidden' && !!line.label;
  const labelGap = 0.6; // small clear-of-stroke padding in world units
  let labelDy = 0;
  let labelBaseline: 'auto' | 'middle' | 'hanging' = 'auto';
  if (labelPosition === 'above') {
    labelDy = -stroke.width * 0.6 - labelGap;
    labelBaseline = 'auto';
  } else if (labelPosition === 'below') {
    labelDy = stroke.width * 0.6 + labelGap;
    labelBaseline = 'hanging';
  } else if (labelPosition === 'on') {
    labelDy = 0;
    labelBaseline = 'middle';
  }

  return (
    <g data-illustration-line={line.id}>
      <defs>
        {/* Visible path geometry — also the textPath reference when the
            label doesn't need to be flipped. */}
        <path id={pathId} d={d} fill="none" stroke="none" />
        {flipLabel && <path id={labelPathId} d={labelPathD} fill="none" stroke="none" />}
      </defs>
      {/* Wide invisible hit-stroke for easy selection. */}
      <path
        d={d}
        stroke="transparent"
        strokeWidth={Math.max(stroke.width * 3, 2.5)}
        fill="none"
        onPointerDown={onPathPointerDown}
        style={{ cursor: 'pointer' }}
      />
      <path
        d={d}
        fill="none"
        stroke={selected ? '#d97706' : stroke.color}
        strokeWidth={selected ? stroke.width * 1.4 : stroke.width}
        strokeDasharray={stroke.dashArray}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
      {showLabel && (
        <text
          fontSize={labelFontSize}
          fontFamily="ui-sans-serif, system-ui"
          fill={selected ? '#7c2d12' : stroke.color}
          dominantBaseline={labelBaseline}
          // For 'on' mode, paint a thin white outline so the text stays
          // legible against the stroke. Other modes don't need the halo.
          paintOrder={labelPosition === 'on' ? 'stroke' : undefined}
          stroke={labelPosition === 'on' ? 'white' : undefined}
          strokeWidth={labelPosition === 'on' ? 0.6 : undefined}
          pointerEvents="none"
          dy={labelDy}
        >
          <textPath href={`#${labelPathId}`} startOffset="50%" textAnchor="middle">
            {line.label}
          </textPath>
        </text>
      )}
    </g>
  );
}

function VertexHandle({
  lineId,
  index,
  point,
  tool,
}: {
  lineId: UUID;
  index: number;
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
        const ln = d.layers.illustrations.lines?.find((l) => l.id === lineId);
        if (!ln || ln.points.length <= 2) return;
        ln.points.splice(index, 1);
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
      const ln = d.layers.illustrations.lines?.find((l) => l.id === lineId);
      if (!ln) return;
      ln.points[index] = { x: world.x, y: world.y };
    });
  };
  const onPointerUp = (ev: React.PointerEvent<SVGCircleElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  return (
    <circle
      cx={point.x}
      cy={point.y}
      r={1.6}
      fill="#fbbf24"
      stroke="#d97706"
      strokeWidth={0.4}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: tool === 'remove-point' ? 'not-allowed' : 'move' }}
    />
  );
}
