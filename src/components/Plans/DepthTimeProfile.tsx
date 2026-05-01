import { useEffect, useMemo, useRef, useState } from 'react';
import type { Route } from '../../domain/types';
import {
  type CeilingSample,
  type DivePlanSummary,
  MAX_DESCENT_RATE_M_PER_MIN,
  stopsAtWaypointMin,
} from '../../domain/divePlan';

interface DepthTimeProfileProps {
  route: Route;
  summary: DivePlanSummary;
  /** Override the auto-measured width. Use sparingly — the chart fills its parent by default. */
  width?: number;
  /** Override the auto-derived height. Defaults to a clamped 2:1 aspect ratio of the measured width. */
  height?: number;
}

const PADDING = { top: 18, right: 60, bottom: 32, left: 48 };
const FALLBACK_WIDTH = 480;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 320;
/** Target chart aspect ratio (width / height) before clamping by MIN/MAX_HEIGHT. */
const ASPECT_RATIO = 2;

export default function DepthTimeProfile({
  route,
  summary,
  width: widthOverride,
  height: heightOverride,
}: DepthTimeProfileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Track the container's measured pixel width so the chart fills available
  // space. ResizeObserver fires synchronously on layout changes — re-renders
  // are cheap because the chart math is all derived from the current width.
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  useEffect(() => {
    if (widthOverride != null) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === 'number' && w > 0) setMeasuredWidth(w);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [widthOverride]);

  const width = widthOverride ?? measuredWidth ?? FALLBACK_WIDTH;
  const height =
    heightOverride ??
    Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(width / ASPECT_RATIO)));

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
  const ooaY = barScale(0);

  // Find the time at which cumulative air crosses turn pressure, for the
  // vertical "Turn" marker. Linear-interpolate between bar samples.
  const turnT = findTurnTime(data.barPoints, summary.turnPressureBar);

  // Bühlmann ZHL-16C deco ceiling, sampled along the planned depth profile
  // by `divePlanSummary`. Split into runs where the ceiling is below the
  // surface so we only draw the shaded "no-go" band when a real obligation
  // exists. Violations (depth shallower than the ceiling) come back as
  // separate runs so we can overlay them on the depth line.
  const ceilingRuns = useMemo(() => groupCeilingRuns(summary.ceilingSamples), [summary.ceilingSamples]);
  const violationRuns = useMemo(() => groupViolationRuns(summary.ceilingSamples), [summary.ceilingSamples]);

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
    <div ref={containerRef} className="w-full">
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

      {/* Reserve + turn pressure dashed lines, plus a solid out-of-air floor
          at 0 bar. The OOA line is always drawn — it sits at or near the
          bottom edge of the bar axis and only really stands out when the
          plan dips into negative remaining (i.e. the air line crosses it). */}
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
      <line
        x1={PADDING.left}
        x2={width - PADDING.right}
        y1={ooaY}
        y2={ooaY}
        stroke="#991b1b"
        strokeWidth={1.2}
      />
      <text x={width - PADDING.right - 4} y={ooaY - 2} fontSize={9} fill="#991b1b" fontWeight={600} textAnchor="end">
        out of air
      </text>

      {/* Deco ceiling overlay — a smooth line that "comes in from the top"
          as tissue loadings rise during the dive, and recedes back to the
          surface as the diver off-gases at shallower depths. Only drawn
          for runs where the ceiling is below the surface; the band between
          the surface (top) and the ceiling is shaded translucent red as
          the no-go zone. */}
      {ceilingRuns.map((run, runIdx) => {
        if (run.length < 2) return null;
        const fillD =
          `M ${xScale(run[0]!.tMin)} ${depthScale(0)}` +
          run.map((p) => ` L ${xScale(p.tMin)} ${depthScale(p.ceilingM)}`).join('') +
          ` L ${xScale(run[run.length - 1]!.tMin)} ${depthScale(0)} Z`;
        const lineD =
          `M ${xScale(run[0]!.tMin)} ${depthScale(run[0]!.ceilingM)}` +
          run.slice(1).map((p) => ` L ${xScale(p.tMin)} ${depthScale(p.ceilingM)}`).join('');
        return (
          <g key={`ceil-${runIdx}`} pointerEvents="none">
            <path d={fillD} fill="rgba(220, 38, 38, 0.14)" />
            <path d={lineD} fill="none" stroke="#dc2626" strokeWidth={1.2} strokeDasharray="4 3" />
            {runIdx === 0 && (
              <text
                x={xScale(run[0]!.tMin) + 4}
                y={depthScale(run[0]!.ceilingM) + 11}
                fontSize={9}
                fill="#dc2626"
                fontWeight={600}
              >
                Deco ceiling
              </text>
            )}
          </g>
        );
      })}

      {/* Depth fill + line */}
      <path d={depthFill} fill={`${route.color}26`} />
      <path d={depthPath} fill="none" stroke={route.color} strokeWidth={1.6} />

      {/* Ceiling violations: any sub-range where the planned depth rose
          above the deco ceiling. Overlays a thick red segment on the
          offending part of the depth line so it stands out from the
          (otherwise quiet) ceiling band. */}
      {violationRuns.map((run, i) => {
        if (run.length < 2) return null;
        const d =
          `M ${xScale(run[0]!.tMin)} ${depthScale(run[0]!.depthM)}` +
          run.slice(1).map((p) => ` L ${xScale(p.tMin)} ${depthScale(p.depthM)}`).join('');
        return (
          <path
            key={`viol-${i}`}
            d={d}
            fill="none"
            stroke="#dc2626"
            strokeWidth={3}
            pointerEvents="none"
          />
        );
      })}

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
        <g transform="translate(85 0)">
          <line x1={0} x2={10} y1={0} y2={0} stroke="#991b1b" strokeWidth={1.2} />
          <text x={14} y={2} fill="#0f172a">out of air</text>
        </g>
        <g transform="translate(140 0)">
          <line x1={0} x2={10} y1={0} y2={0} stroke="#dc2626" strokeWidth={1.2} strokeDasharray="4 3" />
          <text x={14} y={2} fill="#0f172a">deco ceiling</text>
        </g>
        <g transform="translate(220 0)">
          <line x1={0} x2={10} y1={0} y2={0} stroke="#d97706" strokeWidth={2} strokeDasharray="3 2" />
          <text x={14} y={2} fill="#0f172a">rapid descent (&gt;{MAX_DESCENT_RATE_M_PER_MIN})</text>
        </g>
      </g>
      </svg>
    </div>
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
 * Group consecutive samples whose ceiling sits below the surface (> 0 m)
 * into runs. Lets the renderer skip the long stretches at the start of
 * a dive where the ceiling is irrelevantly stuck at 0.
 */
function groupCeilingRuns(samples: CeilingSample[]): CeilingSample[][] {
  const runs: CeilingSample[][] = [];
  let current: CeilingSample[] | null = null;
  for (const s of samples) {
    if (s.ceilingM > 0) {
      if (current == null) current = [s];
      else current.push(s);
    } else if (current != null) {
      runs.push(current);
      current = null;
    }
  }
  if (current != null) runs.push(current);
  return runs;
}

/**
 * Group consecutive in-violation samples into runs, padded by one
 * non-violating sample on each end so the overlay path connects cleanly to
 * the surrounding depth line instead of starting/ending mid-air.
 */
function groupViolationRuns(samples: CeilingSample[]): CeilingSample[][] {
  const runs: CeilingSample[][] = [];
  let current: CeilingSample[] | null = null;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    if (s.violation) {
      if (current == null) {
        current = [];
        const prev = samples[i - 1];
        if (prev) current.push(prev);
      }
      current.push(s);
    } else if (current != null) {
      current.push(s);
      runs.push(current);
      current = null;
    }
  }
  if (current != null) runs.push(current);
  return runs;
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
