import { useSiteStore, waypointSelectionId } from '../../state/useSiteStore';
import {
  type DivePlanSummary,
  waypointDepth,
  waypointPosition,
} from '../../domain/divePlan';
import { distance, vectorToBearing } from '../../domain/geometry';
import type {
  Route,
  RouteObjective,
  Stop,
  StopKind,
  Waypoint,
} from '../../domain/types';

interface ItineraryProps {
  route: Route;
  summary: DivePlanSummary;
  onArmAddWaypoint: () => void;
}

const OBJECTIVE_OPTIONS: { value: RouteObjective; label: string }[] = [
  { value: 'tour', label: 'Tour' },
  { value: 'training', label: 'Training' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'fun', label: 'Fun' },
  { value: 'survey', label: 'Survey' },
  { value: 'photo', label: 'Photo' },
  { value: 'other', label: 'Other' },
];

const STOP_KIND_LABELS: Record<StopKind, string> = {
  safety_stop: 'Safety stop',
  exercise: 'Exercise',
  gas_check: 'Gas check',
  observation: 'Observation',
  rest: 'Rest',
  other: 'Other',
};

const ROW_ACTIONS_CLASS = 'flex shrink-0 items-center gap-1';

/**
 * Combined dive-order list of waypoints and the stops attached to them.
 * Each entry is a single line. The user adds waypoints first; once the
 * route is laid out, they insert stops above or below any row.
 */
export default function Itinerary({ route, summary, onArmAddWaypoint }: ItineraryProps) {
  const site = useSiteStore((s) => s.site);
  const pois = site.layers.poi.pois;
  const stops = route.stops ?? [];

  const renameRoute = useSiteStore((s) => s.renameRoute);
  const setRouteColor = useSiteStore((s) => s.setRouteColor);
  const setRouteObjective = useSiteStore((s) => s.setRouteObjective);
  const setRouteVisible = useSiteStore((s) => s.setRouteVisible);
  const removeWaypoint = useSiteStore((s) => s.removeWaypoint);
  const updateWaypoint = useSiteStore((s) => s.updateWaypoint);
  const reorderWaypoints = useSiteStore((s) => s.reorderWaypoints);
  const addStop = useSiteStore((s) => s.addStop);
  const removeStop = useSiteStore((s) => s.removeStop);
  const updateStop = useSiteStore((s) => s.updateStop);
  const reorderStops = useSiteStore((s) => s.reorderStops);
  const setSelection = useSiteStore((s) => s.setSelection);
  const selection = useSiteStore((s) => s.editor.selection);

  // Build the flat dive-order list once: [WP1, stops at WP1..., WP2, stops at WP2..., ...].
  const items: Array<
    | { kind: 'waypoint'; waypoint: Waypoint; index: number }
    | { kind: 'stop'; stop: Stop; waypointIndex: number; positionInGroup: number }
  > = [];
  route.waypoints.forEach((wp, wpIdx) => {
    items.push({ kind: 'waypoint', waypoint: wp, index: wpIdx });
    const stopsHere = stops.filter((s) => s.waypointId === wp.id);
    stopsHere.forEach((st, i) => {
      items.push({ kind: 'stop', stop: st, waypointIndex: wpIdx, positionInGroup: i });
    });
  });

  /** Move a waypoint up/down (swap with adjacent waypoint, stops travel with it). */
  const swapWaypoints = (idxA: number, idxB: number) => {
    if (idxA < 0 || idxB < 0) return;
    if (idxA >= route.waypoints.length || idxB >= route.waypoints.length) return;
    const ids = route.waypoints.map((w) => w.id);
    [ids[idxA], ids[idxB]] = [ids[idxB]!, ids[idxA]!];
    reorderWaypoints(route.id, ids);
  };

  /** Move a stop within its own waypoint group. */
  const moveStopWithinGroup = (waypointId: string, fromPos: number, toPos: number) => {
    const groupIds = stops.filter((s) => s.waypointId === waypointId).map((s) => s.id);
    if (toPos < 0 || toPos >= groupIds.length) return;
    [groupIds[fromPos], groupIds[toPos]] = [groupIds[toPos]!, groupIds[fromPos]!];
    // Re-build a full ordering: keep stops outside this group in their existing
    // order, then weave the rebuilt group in place of the old one.
    const allIds: string[] = [];
    const used = new Set<string>();
    let groupInjected = false;
    for (const s of stops) {
      if (s.waypointId === waypointId) {
        if (!groupInjected) {
          for (const gid of groupIds) {
            allIds.push(gid);
            used.add(gid);
          }
          groupInjected = true;
        }
      } else if (!used.has(s.id)) {
        allIds.push(s.id);
        used.add(s.id);
      }
    }
    reorderStops(route.id, allIds);
  };

  /** Insert a new stop relative to a row. */
  const insertStop = (
    targetWaypointId: string,
    placement: 'before' | 'after',
    /** When the target is itself a stop, place the new stop relative to it. */
    relativeToStopId?: string,
  ) => {
    // The new stop is attached to the same waypoint as the target row.
    const newStop = {
      waypointId: targetWaypointId,
      kind: 'safety_stop' as StopKind,
      durationMin: 3,
    };
    const newId = addStop(route.id, newStop);
    if (!newId) return;
    if (relativeToStopId) {
      // Reorder so the new stop sits adjacent to the reference stop.
      const groupIds = stops
        .filter((s) => s.waypointId === targetWaypointId)
        .map((s) => s.id);
      groupIds.push(newId);
      const fromPos = groupIds.indexOf(newId);
      const refPos = groupIds.indexOf(relativeToStopId);
      if (fromPos < 0 || refPos < 0) return;
      groupIds.splice(fromPos, 1);
      const insertPos = placement === 'before' ? refPos : refPos + 1;
      groupIds.splice(insertPos, 0, newId);
      // Compose full stop order across all waypoints.
      const allIds: string[] = [];
      const used = new Set<string>();
      let injected = false;
      for (const s of stops.concat([{ ...newStop, id: newId } as Stop])) {
        if (s.waypointId === targetWaypointId) {
          if (!injected) {
            for (const gid of groupIds) {
              allIds.push(gid);
              used.add(gid);
            }
            injected = true;
          }
        } else if (!used.has(s.id)) {
          allIds.push(s.id);
          used.add(s.id);
        }
      }
      reorderStops(route.id, allIds);
    } else if (placement === 'before') {
      // New stop should be at the top of the group: it's currently last;
      // move it to position 0 within the group.
      const groupIds = stops
        .filter((s) => s.waypointId === targetWaypointId)
        .map((s) => s.id);
      groupIds.unshift(newId); // reflect what addStop did, then move to front
      // groupIds is now [newId, ...existing]. We want [newId] already first.
      const allIds: string[] = [];
      const used = new Set<string>();
      let injected = false;
      for (const s of stops.concat([{ ...newStop, id: newId } as Stop])) {
        if (s.waypointId === targetWaypointId) {
          if (!injected) {
            for (const gid of groupIds) {
              allIds.push(gid);
              used.add(gid);
            }
            injected = true;
          }
        } else if (!used.has(s.id)) {
          allIds.push(s.id);
          used.add(s.id);
        }
      }
      reorderStops(route.id, allIds);
    }
    // For placement === 'after' with no relative stop, the default append from
    // addStop already places it at the end of the group — no reorder needed.
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <header className="flex flex-col gap-2 border-b border-water-200 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={route.name}
            onChange={(e) => renameRoute(route.id, e.target.value)}
            className="min-w-0 flex-1 rounded border border-water-200 px-2 py-1 text-sm font-semibold text-water-900 focus:border-water-400 focus:outline-none"
            aria-label="Route name"
          />
          <input
            type="color"
            value={route.color}
            onChange={(e) => setRouteColor(route.id, e.target.value)}
            className="h-7 w-9 cursor-pointer rounded border border-water-200"
            aria-label="Route colour"
            title="Route colour"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-water-700">
            Objective
            <select
              value={route.objective ?? 'tour'}
              onChange={(e) => setRouteObjective(route.id, e.target.value as RouteObjective)}
              className="rounded border border-water-200 px-2 py-1 text-xs text-water-900"
            >
              {OBJECTIVE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-water-700">
            <input
              type="checkbox"
              checked={route.visible}
              onChange={(e) => setRouteVisible(route.id, e.target.checked)}
              className="accent-water-600"
            />
            Visible
          </label>
          <button
            type="button"
            onClick={onArmAddWaypoint}
            className="ml-auto rounded bg-water-700 px-2 py-1 text-xs font-semibold text-white hover:bg-water-800"
            title="Click on the canvas to append a waypoint to the end of the route"
          >
            + Add waypoint
          </button>
        </div>
        <div className="text-[11px] text-water-600">
          {route.waypoints.length} waypoint{route.waypoints.length === 1 ? '' : 's'} ·{' '}
          {stops.length} stop{stops.length === 1 ? '' : 's'} ·{' '}
          {summary.totalTimeMin.toFixed(0)} min
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-4 text-xs text-water-600">
            <p className="mb-2">
              <span className="font-semibold">1.</span> Click <span className="font-semibold">+ Add waypoint</span>, then tap the canvas to drop waypoints in dive order.
            </p>
            <p>
              <span className="font-semibold">2.</span> Once the route is laid out, hover any row and use the <span className="font-semibold">+</span> buttons to insert stops above or below it.
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-water-100">
            {items.map((item) => {
              if (item.kind === 'waypoint') {
                const wp = item.waypoint;
                const idx = item.index;
                const isSelected = selection.some(
                  (s) => s.kind === 'waypoint' && s.id === waypointSelectionId(route.id, wp.id),
                );
                return (
                  <WaypointLine
                    key={`wp-${wp.id}`}
                    route={route}
                    wp={wp}
                    idx={idx}
                    pois={pois}
                    isSelected={isSelected}
                    bearingFromPrevDeg={
                      idx > 0
                        ? bearingBetween(route.waypoints[idx - 1]!, wp, pois)
                        : undefined
                    }
                    distanceFromPrevM={
                      idx > 0
                        ? distanceBetween(
                            route.waypoints[idx - 1]!,
                            wp,
                            pois,
                            site.meta.scaleMetersPerUnit ?? 1,
                          )
                        : undefined
                    }
                    onSelect={() =>
                      setSelection({ kind: 'waypoint', id: waypointSelectionId(route.id, wp.id) })
                    }
                    onUpdate={(patch) => updateWaypoint(route.id, wp.id, patch)}
                    onRemove={() => {
                      if (window.confirm(`Remove waypoint ${idx + 1}?`)) removeWaypoint(route.id, wp.id);
                    }}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < route.waypoints.length - 1}
                    onMoveUp={() => swapWaypoints(idx, idx - 1)}
                    onMoveDown={() => swapWaypoints(idx, idx + 1)}
                    onInsertStopAfter={() => {
                      // "Add stop here" attaches a new stop to this waypoint
                      // as the first stop in the group, so it sits visually
                      // right beneath the waypoint row.
                      insertStop(wp.id, 'before');
                    }}
                  />
                );
              }
              const st = item.stop;
              const wp = route.waypoints[item.waypointIndex]!;
              const stopsInGroup = stops.filter((s) => s.waypointId === wp.id);
              const isFirstInGroup = item.positionInGroup === 0;
              const isLastInGroup = item.positionInGroup === stopsInGroup.length - 1;
              return (
                <StopLine
                  key={`stop-${st.id}`}
                  stop={st}
                  parentWaypointIdx={item.waypointIndex}
                  onUpdate={(patch) => updateStop(route.id, st.id, patch)}
                  onRemove={() => {
                    if (window.confirm(`Remove this ${STOP_KIND_LABELS[st.kind].toLowerCase()}?`)) {
                      removeStop(route.id, st.id);
                    }
                  }}
                  canMoveUp={!isFirstInGroup}
                  canMoveDown={!isLastInGroup}
                  onMoveUp={() => moveStopWithinGroup(wp.id, item.positionInGroup, item.positionInGroup - 1)}
                  onMoveDown={() => moveStopWithinGroup(wp.id, item.positionInGroup, item.positionInGroup + 1)}
                  onInsertBelow={() => insertStop(wp.id, 'after', st.id)}
                />
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

interface WaypointLineProps {
  route: Route;
  wp: Waypoint;
  idx: number;
  pois: ReturnType<typeof useSiteStore.getState>['site']['layers']['poi']['pois'];
  isSelected: boolean;
  /** Compass bearing from the previous waypoint to this one (undefined for idx 0). */
  bearingFromPrevDeg?: number;
  /** Distance in metres from the previous waypoint (undefined for idx 0). */
  distanceFromPrevM?: number;
  onSelect: () => void;
  onUpdate: (patch: Partial<Waypoint>) => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertStopAfter: () => void;
}

function WaypointLine({
  route,
  wp,
  idx,
  pois,
  isSelected,
  bearingFromPrevDeg,
  distanceFromPrevM,
  onSelect,
  onUpdate,
  onRemove,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onInsertStopAfter,
}: WaypointLineProps) {
  const resolvedDepth = waypointDepth(wp, pois);
  const poiName = wp.kind === 'poi' ? pois.find((p) => p.id === wp.poiRefId)?.name : null;

  return (
    <li
      className={`group flex items-center gap-2 px-3 py-1.5 text-xs ${
        isSelected ? 'bg-water-100' : 'hover:bg-water-50'
      }`}
      onClick={onSelect}
    >
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ backgroundColor: route.color }}
      >
        {idx + 1}
      </span>
      {wp.kind === 'poi' ? (
        <span className="min-w-0 flex-1 truncate text-water-900">
          {poiName ?? <span className="text-red-600">missing POI</span>}
        </span>
      ) : (
        <input
          type="text"
          value={wp.name ?? ''}
          placeholder={`Waypoint ${idx + 1}`}
          onChange={(e) => onUpdate({ name: e.target.value } as Partial<Waypoint>)}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-water-200 focus:border-water-400 focus:outline-none focus:bg-white"
        />
      )}
      {/* Bearing and distance from the previous waypoint, in light grey
          and right-aligned. Squeezes into whatever space is left after the
          name (no fixed width) and shrinks-out gracefully on narrow rows. */}
      {(bearingFromPrevDeg != null || distanceFromPrevM != null) && (
        <span
          className="shrink-0 text-right text-[10px] tabular-nums text-water-400"
          title="From previous waypoint: bearing · distance"
        >
          {bearingFromPrevDeg != null && (
            <span>{Math.round(bearingFromPrevDeg)}°</span>
          )}
          {bearingFromPrevDeg != null && distanceFromPrevM != null && ' · '}
          {distanceFromPrevM != null && (
            <span>{formatShortDistance(distanceFromPrevM)}</span>
          )}
        </span>
      )}
      <DepthInput wp={wp} fallback={resolvedDepth} onChange={onUpdate} />
      {/* Spacer keeps the duration column aligned with stop rows. */}
      <span className={DURATION_COL_CLASS} aria-hidden />
      <RowActions
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onInsertBelow={onInsertStopAfter}
        onRemove={onRemove}
        kind="waypoint"
      />
    </li>
  );
}

interface StopLineProps {
  stop: Stop;
  parentWaypointIdx: number;
  onUpdate: (patch: Partial<Stop>) => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertBelow: () => void;
}

function StopLine({
  stop,
  parentWaypointIdx,
  onUpdate,
  onRemove,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onInsertBelow,
}: StopLineProps) {
  return (
    <li className="group flex items-center gap-2 bg-water-50/40 px-3 py-1 pl-8 text-[11px] hover:bg-water-50">
      <span className="text-water-400" title={`Stop attached to waypoint ${parentWaypointIdx + 1}`}>
        ↳
      </span>
      <select
        value={stop.kind}
        onChange={(e) => onUpdate({ kind: e.target.value as StopKind })}
        className="rounded border border-water-200 bg-white px-1 py-0.5 text-[11px]"
        aria-label="Stop kind"
        onClick={(e) => e.stopPropagation()}
      >
        {(Object.keys(STOP_KIND_LABELS) as StopKind[]).map((k) => (
          <option key={k} value={k}>
            {STOP_KIND_LABELS[k]}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={stop.name ?? ''}
        placeholder={STOP_KIND_LABELS[stop.kind]}
        onChange={(e) => onUpdate({ name: e.target.value })}
        onClick={(e) => e.stopPropagation()}
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-water-200 focus:border-water-400 focus:bg-white focus:outline-none"
      />
      {/* Spacer keeps the depth column aligned with waypoint rows. */}
      <span className={DEPTH_COL_CLASS} aria-hidden />
      <span className={DURATION_COL_CLASS}>
        <input
          type="number"
          min={0}
          step={0.5}
          value={stop.durationMin}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v) || v < 0) return;
            onUpdate({ durationMin: v });
          }}
          onClick={(e) => e.stopPropagation()}
          className={VALUE_INPUT_CLASS}
          aria-label="Stop duration in minutes"
        />
        <span className={DURATION_UNIT_CLASS}>min</span>
      </span>
      <RowActions
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onInsertBelow={onInsertBelow}
        onRemove={onRemove}
        kind="stop"
      />
    </li>
  );
}

interface RowActionsProps {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertBelow: () => void;
  onRemove: () => void;
  kind: 'waypoint' | 'stop';
}

function RowActions({
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onInsertBelow,
  onRemove,
  kind,
}: RowActionsProps) {
  // Stops always sit at or below the waypoint they refer to (a stop "before"
  // the first waypoint makes no sense — the dive hasn't started). So the
  // only insertion direction we expose is "below".
  const insertLabel =
    kind === 'waypoint' ? 'Add stop here' : 'Insert stop below this one';
  return (
    <span className={ROW_ACTIONS_CLASS} onClick={(e) => e.stopPropagation()}>
      <IconButton onClick={onMoveUp} disabled={!canMoveUp} title="Move up" label="Move up">
        <ArrowUpIcon />
      </IconButton>
      <IconButton onClick={onMoveDown} disabled={!canMoveDown} title="Move down" label="Move down">
        <ArrowDownIcon />
      </IconButton>
      <IconButton onClick={onInsertBelow} title={insertLabel} label={insertLabel}>
        <InsertBelowIcon />
      </IconButton>
      <IconButton onClick={onRemove} title="Remove" label="Remove" danger>
        <RemoveIcon />
      </IconButton>
    </span>
  );
}

function IconButton({
  onClick,
  disabled,
  title,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const palette = danger
    ? 'border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 active:bg-red-100'
    : 'border-water-200 text-water-700 hover:bg-water-100 hover:border-water-400 active:bg-water-200';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className={`flex h-6 w-6 items-center justify-center rounded border bg-white ${palette} disabled:cursor-not-allowed disabled:border-water-100 disabled:bg-water-50 disabled:text-water-300`}
    >
      {children}
    </button>
  );
}

function IconShell({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <IconShell>
      <path d="M 8 13 V 3" />
      <path d="M 4 7 L 8 3 L 12 7" />
    </IconShell>
  );
}

function ArrowDownIcon() {
  return (
    <IconShell>
      <path d="M 8 3 V 13" />
      <path d="M 4 9 L 8 13 L 12 9" />
    </IconShell>
  );
}

function InsertBelowIcon() {
  return (
    <IconShell>
      <path d="M 2 5 H 14" />
      <path d="M 8 8 V 14" />
      <path d="M 5 11 L 8 14 L 11 11" />
    </IconShell>
  );
}

function RemoveIcon() {
  return (
    <IconShell>
      <path d="M 4 4 L 12 12" />
      <path d="M 12 4 L 4 12" />
    </IconShell>
  );
}

/**
 * Two distinct column widths so depths align with depths (across waypoint
 * rows) and durations align with durations (across stop rows) — without the
 * two columns sharing the same horizontal slot.
 */
const DEPTH_COL_CLASS =
  'flex w-16 shrink-0 items-center justify-end gap-1 text-[11px] text-water-700';
const DURATION_COL_CLASS =
  'flex w-24 shrink-0 items-center justify-end gap-1 text-[11px] text-water-700';
const VALUE_INPUT_CLASS =
  'w-12 rounded border border-water-200 bg-white px-1 py-0.5 text-right';
const DEPTH_UNIT_CLASS = 'inline-block w-2 text-left';
const DURATION_UNIT_CLASS = 'inline-block w-8 text-left';

function DepthInput({
  wp,
  fallback,
  onChange,
}: {
  wp: Waypoint;
  fallback: number | undefined;
  onChange: (patch: Partial<Waypoint>) => void;
}) {
  const value =
    wp.kind === 'poi'
      ? wp.depthOverrideM ?? fallback ?? ''
      : wp.depthM ?? '';
  return (
    <span className={DEPTH_COL_CLASS}>
      <input
        type="number"
        step={0.5}
        value={value}
        placeholder={fallback != null ? `${fallback}` : '—'}
        onChange={(e) => {
          const raw = e.target.value;
          const v = raw === '' ? undefined : Number(raw);
          if (raw !== '' && !Number.isFinite(v)) return;
          if (wp.kind === 'poi') {
            onChange({ depthOverrideM: v } as Partial<Waypoint>);
          } else {
            onChange({ depthM: v } as Partial<Waypoint>);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={VALUE_INPUT_CLASS}
        aria-label="Depth (metres)"
      />
      <span className={DEPTH_UNIT_CLASS}>m</span>
    </span>
  );
}

/**
 * Compass bearing from waypoint `a` to waypoint `b` in degrees, or
 * undefined when either side can't be resolved to a position.
 */
function bearingBetween(
  a: Waypoint,
  b: Waypoint,
  pois: ReturnType<typeof useSiteStore.getState>['site']['layers']['poi']['pois'],
): number | undefined {
  const aPos = waypointPosition(a, pois);
  const bPos = waypointPosition(b, pois);
  if (!aPos || !bPos) return undefined;
  if (aPos.x === bPos.x && aPos.y === bPos.y) return undefined;
  return vectorToBearing({ x: bPos.x - aPos.x, y: bPos.y - aPos.y });
}

function distanceBetween(
  a: Waypoint,
  b: Waypoint,
  pois: ReturnType<typeof useSiteStore.getState>['site']['layers']['poi']['pois'],
  scaleMetersPerUnit: number,
): number | undefined {
  const aPos = waypointPosition(a, pois);
  const bPos = waypointPosition(b, pois);
  if (!aPos || !bPos) return undefined;
  return distance(aPos, bPos) * scaleMetersPerUnit;
}

/** Compact distance: rounds aggressively under 100 m, uses km for >= 1 km. */
function formatShortDistance(m: number): string {
  if (m >= 1000) return `${Math.round(m / 100) / 10}km`;
  if (m >= 100) return `${Math.round(m)}m`;
  return `${Math.round(m * 10) / 10}m`;
}
