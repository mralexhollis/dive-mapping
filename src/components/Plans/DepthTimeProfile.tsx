import { useMemo } from 'react';
import type { Route } from '../../domain/types';
import {
  type DivePlanSummary,
  MAX_DESCENT_RATE_M_PER_MIN,
  NDL_TABLE_M,
  stopsAtWaypointMin,
} from '../../domain/divePlan';

interface DepthTimeProfileProps {
  route: Route;
  summary: DivePlanSummary;
  width?: number;
  height?: number;
}

const PADDING = { top: 18, right: 60, bottom: 32, left: 48 };

export default function DepthTimeProfile({
  route,
  summary,
  width = 640,
  height = 280,
}: DepthTimeProfileProps) {
  const data = useMemo(() => buildSeries(route, summary), [route, summary]);

  if (data.depthPoints.length < 2) {
    return (
      <div className="rounded border border-water-200 bg-water-50 p-4 text-xs text-water-600">
        Add at least two waypoints to see the dive profile.
      </div>
    );
  }

  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;
  const xScale = (t: number) => PADDING.left + (t / data.maxTime) * innerW;
  const depthScale = (d: number) => PADDING.top + (d / data.maxDepth) * innerH;
  const barScale = (b: number) => PADDING.top + (1 - (b - data.minBar) / (data.maxBar - data.minBar)) * innerH;

  const depthPath = data.depthPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.t)} ${depthScale(p.depth)}`)
    .join(' ');
  const depthFill =
    `M ${xScale(0)} ${depthScale(0)} ` +
    data.depthPoints.map((p) => `L ${xScale(p.t)} ${depthScale(p.depth)}`).join(' ') +
    ` L ${xScale(data.maxTime)} ${depthScale(0)} Z`;
  const barPath = data.barPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.t)} ${barScale(p.bar)}`)
    .join(' ');

  const reserveY = barScale(route.gas.reserveBarPressure);
  const turnY = barScale(summary.turnPressureBar);

  // Find the time at which cumulative air crosses turn pressure, for the
  // vertical "Turn" marker. Linear-interpolate between bar samples.
  const turnT = findTurnTime(data.barPoints, summary.turnPressureBar);

  // NDL ceiling staircase across the dive's time range. Each step drops to
  // the next-shallower bracket as elapsed time crosses an NDL boundary.
  const ndlStair = buildNdlCeilingStair(data.maxTime);

  // X-axis ticks every 5 minutes (or finer when total < 10 min).
  const xTickStep = data.maxTime <= 10 ? 1 : data.maxTime <= 30 ? 5 : 10;
  const xTicks: number[] = [];
  for (let t = 0; t <= data.maxTime + 1e-6; t += xTickStep) xTicks.push(Math.round(t * 10) / 10);

  // Depth ticks: 0, half, max.
  const depthTicks = [0, data.maxDepth / 2, data.maxDepth];
  const barTicks = [data.minBar, route.gas.reserveBarPressure, summary.turnPressureBar, route.gas.startBarPressure].filter(
    (b) => b >= data.minBar - 1 && b <= data.maxBar + 1,
  );

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Depth-time profile for ${route.name}`}
      style={{ display: 'block' }}
    >
      <rect width={width} height={height} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={0.5} rx={4} />

      {/* X grid + ticks */}
      {xTicks.map((t) => (
        <g key={`x-${t}`} pointerEvents="none">
          <line
            x1={xScale(t)}
            x2={xScale(t)}
            y1={PADDING.top}
            y2={height - PADDING.bottom}
            stroke="#e2e8f0"
            strokeWidth={0.5}
          />
          <text
            x={xScale(t)}
            y={height - PADDING.bottom + 12}
            fontSize={10}
            fill="#64748b"
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui"
          >
            {t}
          </text>
        </g>
      ))}
      <text
        x={width / 2}
        y={height - 4}
        fontSize={10}
        fill="#475569"
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui"
      >
        Time (min)
      </text>

      {/* Depth ticks (left axis) */}
      {depthTicks.map((d) => (
        <g key={`d-${d}`} pointerEvents="none">
          <line
            x1={PADDING.left - 4}
            x2={PADDING.left}
            y1={depthScale(d)}
            y2={depthScale(d)}
            stroke="#94a3b8"
          />
          <text
            x={PADDING.left - 6}
            y={depthScale(d) + 3}
            fontSize={10}
            fill="#475569"
            textAnchor="end"
            fontFamily="ui-sans-serif, system-ui"
          >
            {Math.round(d)}m
          </text>
        </g>
      ))}
      <text
        x={12}
        y={PADDING.top + innerH / 2}
        fontSize={10}
        fill="#0f172a"
        textAnchor="middle"
        transform={`rotate(-90 12 ${PADDING.top + innerH / 2})`}
        fontFamily="ui-sans-serif, system-ui"
      >
        Depth (m)
      </text>

      {/* Bar ticks (right axis) */}
      {barTicks.map((b, i) => (
        <g key={`b-${i}`} pointerEvents="none">
          <line
            x1={width - PADDING.right}
            x2={width - PADDING.right + 4}
            y1={barScale(b)}
            y2={barScale(b)}
            stroke="#b45309"
          />
          <text
            x={width - PADDING.right + 6}
            y={barScale(b) + 3}
            fontSize={10}
            fill="#92400e"
            fontFamily="ui-sans-serif, system-ui"
          >
            {Math.round(b)} bar
          </text>
        </g>
      ))}
      <text
        x={width - 8}
        y={PADDING.top + innerH / 2}
        fontSize={10}
        fill="#92400e"
        textAnchor="middle"
        transform={`rotate(-90 ${width - 8} ${PADDING.top + innerH / 2})`}
        fontFamily="ui-sans-serif, system-ui"
      >
        Pressure (bar)
      </text>

      {/* Reserve + turn pressure dashed lines */}
      <line
        x1={PADDING.left}
        x2={width - PADDING.right}
        y1={reserveY}
        y2={reserveY}
        stroke="#dc2626"
        strokeDasharray="4 3"
        strokeWidth={0.8}
      />
      <text x={width - PADDING.right - 4} y={reserveY - 2} fontSize={9} fill="#dc2626" textAnchor="end">
        reserve {route.gas.reserveBarPressure} bar
      </text>
      <line
        x1={PADDING.left}
        x2={width - PADDING.right}
        y1={turnY}
        y2={turnY}
        stroke="#7c2d12"
        strokeDasharray="2 3"
        strokeWidth={0.8}
      />
      <text x={width - PADDING.right - 4} y={turnY - 2} fontSize={9} fill="#7c2d12" textAnchor="end">
        turn {Math.round(summary.turnPressureBar)} bar
      </text>

      {/* NDL / deco ceiling overlay — a staircase line that drops in from the
          TOP of the chart as elapsed time accumulates. The region between
          the chart top (the surface) and the ceiling is shaded translucent
          red: the diver cannot ascend through that band without entering
          deco territory at this point in the dive. */}
      {ndlStair.length >= 2 && (
        <g pointerEvents="none">
          <path
            d={
              `M ${xScale(ndlStair[0]!.t)} ${depthScale(0)}` +
              ` L ${xScale(ndlStair[0]!.t)} ${depthScale(ndlStair[0]!.ceiling)}` +
              ndlStair
                .slice(1)
                .map((p) => ` L ${xScale(p.t)} ${depthScale(p.ceiling)}`)
                .join('') +
              ` L ${xScale(ndlStair[ndlStair.length - 1]!.t)} ${depthScale(0)} Z`
            }
            fill="rgba(220, 38, 38, 0.14)"
          />
          <path
            d={
              `M ${xScale(ndlStair[0]!.t)} ${depthScale(ndlStair[0]!.ceiling)}` +
              ndlStair
                .slice(1)
                .map((p) => ` L ${xScale(p.t)} ${depthScale(p.ceiling)}`)
                .join('')
            }
            fill="none"
            stroke="#dc2626"
            strokeWidth={1.2}
            strokeDasharray="4 3"
          />
          <text
            x={xScale(ndlStair[0]!.t) + 4}
            y={depthScale(ndlStair[0]!.ceiling) + 11}
            fontSize={9}
            fill="#dc2626"
            fontWeight={600}
          >
            NDL ceiling
          </text>
        </g>
      )}

      {/* Depth fill + line */}
      <path d={depthFill} fill={`${route.color}26`} />
      <path d={depthPath} fill="none" stroke={route.color} strokeWidth={1.6} />

      {/* Rapid-descent stripes overlaid on offending segments. Rapid ascent
          isn't drawn — the planning model can't produce a faster ascent than
          the configured limit, so it would only ever be noise. */}
      {summary.segments.map((seg, i) => {
        if (!seg.rapidDescent) return null;
        const t0 = data.cumulativeTimes[i]!;
        const t1 = data.cumulativeTimes[i + 1]!;
        const x0 = xScale(t0);
        const x1 = xScale(t1);
        const y0 = depthScale(seg.fromDepthM);
        const y1 = depthScale(seg.toDepthM);
        return (
          <g key={`rate-${i}`} pointerEvents="none">
            <line
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke="#d97706"
              strokeWidth={3}
              strokeDasharray="3 2"
            />
            <text
              x={(x0 + x1) / 2}
              y={(y0 + y1) / 2 - 6}
              fontSize={9}
              fill="#d97706"
              textAnchor="middle"
              fontWeight={600}
            >
              ↓ rapid ({Math.abs(seg.verticalRateMPerMin).toFixed(1)} m/min)
            </text>
          </g>
        );
      })}

      {/* Air-pressure overlay */}
      <path d={barPath} fill="none" stroke="#b45309" strokeWidth={1.4} strokeDasharray="0" />
      <circle cx={xScale(0)} cy={barScale(route.gas.startBarPressure)} r={2} fill="#b45309" />
      <circle
        cx={xScale(data.maxTime)}
        cy={barScale(summary.remainingBar)}
        r={2}
        fill={summary.remainingBar < route.gas.reserveBarPressure ? '#dc2626' : '#b45309'}
      />

      {/* Vertical "Turn" marker where remaining air crosses turn pressure. */}
      {turnT != null && (
        <g pointerEvents="none">
          <line
            x1={xScale(turnT)}
            x2={xScale(turnT)}
            y1={PADDING.top}
            y2={height - PADDING.bottom}
            stroke="#7c2d12"
            strokeDasharray="3 2"
            strokeWidth={0.8}
          />
          <text x={xScale(turnT) + 3} y={PADDING.top + 10} fontSize={9} fill="#7c2d12" fontWeight={600}>
            Turn
          </text>
        </g>
      )}

      {/* Waypoint markers along the depth line */}
      {data.depthPoints.map((p, i) => (
        <g key={`wp-${i}`} pointerEvents="none">
          <circle cx={xScale(p.t)} cy={depthScale(p.depth)} r={2.5} fill={route.color} stroke="white" strokeWidth={0.8} />
        </g>
      ))}

      {/* Legend */}
      <g transform={`translate(${PADDING.left} ${height - 14})`} fontSize={9} fontFamily="ui-sans-serif, system-ui">
        <g>
          <rect width={10} height={3} y={-2} fill={route.color} />
          <text x={14} y={2} fill="#0f172a">depth</text>
        </g>
        <g transform="translate(60 0)">
          <line x1={0} x2={10} y1={0} y2={0} stroke="#b45309" strokeWidth={1.4} />
          <text x={14} y={2} fill="#0f172a">air</text>
        </g>
        <g transform="translate(100 0)">
          <line x1={0} x2={10} y1={0} y2={0} stroke="#dc2626" strokeWidth={1.2} strokeDasharray="4 3" />
          <text x={14} y={2} fill="#0f172a">NDL ceiling</text>
        </g>
        <g transform="translate(200 0)">
          <line x1={0} x2={10} y1={0} y2={0} stroke="#d97706" strokeWidth={2} strokeDasharray="3 2" />
          <text x={14} y={2} fill="#0f172a">rapid descent (&gt;{MAX_DESCENT_RATE_M_PER_MIN})</text>
        </g>
      </g>
    </svg>
  );
}

interface ProfileSeries {
  depthPoints: Array<{ t: number; depth: number }>;
  barPoints: Array<{ t: number; bar: number }>;
  cumulativeTimes: number[];
  maxTime: number;
  maxDepth: number;
  minBar: number;
  maxBar: number;
}

function buildSeries(route: Route, summary: DivePlanSummary): ProfileSeries {
  const depthPoints: Array<{ t: number; depth: number }> = [];
  const barPoints: Array<{ t: number; bar: number }> = [];
  const cumulativeTimes: number[] = [0];
  let t = 0;
  let bar = route.gas.startBarPressure;
  if (summary.segments.length === 0) {
    return {
      depthPoints,
      barPoints,
      cumulativeTimes,
      maxTime: 1,
      maxDepth: 1,
      minBar: 0,
      maxBar: route.gas.startBarPressure,
    };
  }
  const stops = route.stops ?? [];
  // Seed with the first waypoint depth.
  depthPoints.push({ t: 0, depth: summary.segments[0]!.fromDepthM });
  barPoints.push({ t: 0, bar });
  for (const seg of summary.segments) {
    const stopMin = stopsAtWaypointMin(stops, seg.toId);
    const transitMin = Math.max(0, seg.timeMin - stopMin);
    // Transit segment: slope from fromDepth to toDepth over transit time.
    const transitT = t + transitMin;
    depthPoints.push({ t: transitT, depth: seg.toDepthM });
    // Bar at end of transit, linearly interpolating cumulative consumption
    // by time-share. Approximate but visually correct: stops at constant
    // depth consume proportionally less than ascent/descent transits.
    const segShareTransit = seg.timeMin > 0 ? transitMin / seg.timeMin : 0;
    const transitBar =
      route.gas.startBarPressure -
      (seg.cumulativeAirBar - seg.airBar) -
      seg.airBar * segShareTransit;
    barPoints.push({ t: transitT, bar: transitBar });

    t = transitT;

    if (stopMin > 0) {
      // Hold segment: depth stays constant at toDepthM for stopMin minutes.
      t += stopMin;
      bar = route.gas.startBarPressure - seg.cumulativeAirBar;
      depthPoints.push({ t, depth: seg.toDepthM });
      barPoints.push({ t, bar });
    } else {
      bar = route.gas.startBarPressure - seg.cumulativeAirBar;
    }
    cumulativeTimes.push(t);
  }
  const maxDepth = Math.max(1, ...depthPoints.map((p) => p.depth));
  const maxTime = Math.max(1, t);
  const minBar = Math.min(0, ...barPoints.map((p) => p.bar));
  const maxBar = Math.max(route.gas.startBarPressure, ...barPoints.map((p) => p.bar));
  return {
    depthPoints,
    barPoints,
    cumulativeTimes,
    maxTime,
    maxDepth,
    minBar,
    maxBar,
  };
}

/**
 * Build a staircase of NDL ceiling points from t=0 up to {@link maxTime}.
 * Each table entry triggers a vertical drop in the ceiling line at the
 * elapsed time it takes to reach that depth's NDL — the result is a
 * polyline that monotonically deepens-then-shallows over time, suitable for
 * direct overlay on the depth-versus-time chart.
 */
function buildNdlCeilingStair(maxTime: number): Array<{ t: number; ceiling: number }> {
  if (maxTime <= 0) return [];
  // Ascending order of NDL minutes — i.e. shortest NDL first (deepest depth).
  const transitions = [...NDL_TABLE_M].sort((a, b) => a.ndlMin - b.ndlMin);
  const points: Array<{ t: number; ceiling: number }> = [];
  let lastCeiling: number | null = null;
  for (const entry of transitions) {
    if (entry.ndlMin > maxTime) break;
    const newCeiling = entry.depthM;
    if (lastCeiling == null) {
      // First step: the ceiling appears at this transition time.
      points.push({ t: entry.ndlMin, ceiling: newCeiling });
    } else {
      // Hold the previous ceiling until this transition, then drop to the
      // shallower ceiling — two points to draw a vertical step.
      points.push({ t: entry.ndlMin, ceiling: lastCeiling });
      points.push({ t: entry.ndlMin, ceiling: newCeiling });
    }
    lastCeiling = newCeiling;
  }
  // Extend the last ceiling out to the end of the chart.
  if (lastCeiling != null) {
    const lastT = points[points.length - 1]!.t;
    if (lastT < maxTime) points.push({ t: maxTime, ceiling: lastCeiling });
  }
  return points;
}

function findTurnTime(barPoints: Array<{ t: number; bar: number }>, turnBar: number): number | null {
  for (let i = 1; i < barPoints.length; i++) {
    const a = barPoints[i - 1]!;
    const b = barPoints[i]!;
    if ((a.bar >= turnBar && b.bar <= turnBar) || (a.bar <= turnBar && b.bar >= turnBar)) {
      const span = a.bar - b.bar;
      if (span === 0) return a.t;
      const ratio = (a.bar - turnBar) / span;
      return a.t + (b.t - a.t) * ratio;
    }
  }
  return null;
}
