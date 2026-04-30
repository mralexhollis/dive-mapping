import { useMemo, useState } from 'react';
import { useSiteStore } from '../../state/useSiteStore';
import { solveBearingGraph, type SolverResult } from '../../domain/bearingSolver';
import { distance } from '../../domain/geometry';
import type { Bearing, POI, UUID } from '../../domain/types';

interface BearingSolverDialogProps {
  onClose: () => void;
}

interface DraftBearing {
  id: UUID;
  fromId: UUID;
  toId: UUID;
  bearingDeg: number;
  reverseBearingDeg?: number;
  /** Optional distance hint (used as fallback when triangulation isn't possible). */
  distanceM?: number;
}

const norm360 = (d: number) => ((d % 360) + 360) % 360;

/**
 * Modal that lets the user enter/edit POI bearings, then triangulate
 * positions and apply them to the map. The dialog works on a local draft
 * of the bearings; nothing touches the site until "Place / adjust" runs.
 */
export default function BearingSolverDialog({ onClose }: BearingSolverDialogProps) {
  const site = useSiteStore((s) => s.site);
  const mutate = useSiteStore((s) => s.mutateSite);
  const pois = site.layers.poi.pois;

  // Local working copy so the user can edit without committing to the site.
  const [drafts, setDrafts] = useState<DraftBearing[]>(() =>
    site.layers.poi.bearings.map((b) => ({
      id: b.id,
      fromId: b.fromId,
      toId: b.toId,
      bearingDeg: b.bearingDeg,
      reverseBearingDeg: b.reverseBearingDeg,
      distanceM: b.distanceM,
    })),
  );
  const [anchorId, setAnchorId] = useState<UUID | null>(
    pois.find((p) => p.position)?.id ?? pois[0]?.id ?? null,
  );
  const [result, setResult] = useState<SolverResult | null>(null);

  // Bearings that are valid (have both endpoints) for solver use.
  const validBearings = useMemo<Bearing[]>(
    () =>
      drafts
        .filter((d) =>
          d.fromId &&
          d.toId &&
          d.fromId !== d.toId &&
          pois.some((p) => p.id === d.fromId) &&
          pois.some((p) => p.id === d.toId),
        )
        .map((d) => ({
          id: d.id,
          fromId: d.fromId,
          toId: d.toId,
          bearingDeg: norm360(d.bearingDeg),
          reverseBearingDeg:
            d.reverseBearingDeg != null ? norm360(d.reverseBearingDeg) : undefined,
          distanceM: d.distanceM,
        })),
    [drafts, pois],
  );

  const onCalculate = () => {
    if (!anchorId) return;
    setResult(solveBearingGraph(pois, validBearings, { anchorId, fallbackDistanceM: 30 }));
  };

  const onApply = () => {
    if (!result) return;
    mutate((d) => {
      // Overwrite the bearing list with the draft so user edits persist.
      d.layers.poi.bearings = validBearings.map((vb) => ({
        ...vb,
        // Round computed distance for storage cleanliness; keep manual hints as-is.
        distanceM:
          result.distances.get(vb.id) != null
            ? Math.round(result.distances.get(vb.id)! * 10) / 10
            : vb.distanceM,
      }));
      // Move POIs to their solved positions.
      for (const p of d.layers.poi.pois) {
        const pos = result.positions.get(p.id);
        if (pos) p.position = { x: pos.x, y: pos.y };
      }
    });
    onClose();
  };

  const updateDraft = (id: UUID, patch: Partial<DraftBearing>) =>
    setDrafts((arr) => arr.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const removeDraft = (id: UUID) =>
    setDrafts((arr) => arr.filter((d) => d.id !== id));

  const swapDirection = (id: UUID) => {
    setDrafts((arr) =>
      arr.map((d) => {
        if (d.id !== id) return d;
        const oldRev = d.reverseBearingDeg ?? norm360(d.bearingDeg + 180);
        const newRev = d.bearingDeg;
        return {
          ...d,
          fromId: d.toId,
          toId: d.fromId,
          bearingDeg: norm360(oldRev),
          reverseBearingDeg: norm360(newRev),
        };
      }),
    );
  };

  const addBearing = () => {
    if (pois.length < 2) return;
    setDrafts((arr) => [
      ...arr,
      {
        id: crypto.randomUUID(),
        fromId: pois[0]!.id,
        toId: pois[1]!.id,
        bearingDeg: 0,
      },
    ]);
  };

  const poisById = useMemo(() => new Map(pois.map((p) => [p.id, p])), [pois]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Bearing solver"
    >
      <div className="flex w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-water-200 px-4 py-3">
          <h2 className="text-base font-semibold text-water-900">Bearing solver</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-water-700 hover:bg-water-100"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          <p className="text-xs text-water-700">
            Enter bearings between POIs. Use the swap button (⇄) if a bearing was
            recorded in the opposite direction. Calculate distances triangulates
            POIs from two known bearings to the same target; Place / adjust then
            moves the POIs to the solved positions.
          </p>

          <label className="flex items-center gap-2 text-xs text-water-700">
            Anchor POI
            <select
              value={anchorId ?? ''}
              onChange={(e) => setAnchorId(e.target.value || null)}
              className="rounded border border-water-200 px-2 py-1 text-sm text-water-900"
            >
              {pois.length === 0 && <option value="">(no POIs yet)</option>}
              {pois.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-water-500">
              The anchor stays put; everything else moves relative to it.
            </span>
          </label>

          <div className="rounded border border-water-200">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-water-50">
                <tr className="text-left text-[11px] uppercase tracking-wide text-water-600">
                  <th className="px-2 py-1.5">From</th>
                  <th className="px-2 py-1.5">To</th>
                  <th className="px-2 py-1.5">Bearing (°)</th>
                  <th className="px-2 py-1.5">Reverse (°)</th>
                  <th className="px-2 py-1.5">Hint dist. (m)</th>
                  <th className="px-2 py-1.5">Solved (m)</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => {
                  const reverseDisplay =
                    d.reverseBearingDeg != null
                      ? d.reverseBearingDeg
                      : norm360(d.bearingDeg + 180);
                  const solved = result?.distances.get(d.id);
                  const approximated = result?.approximated.includes(d.id);
                  return (
                    <tr key={d.id} className="border-t border-water-100">
                      <td className="px-2 py-1">
                        <PoiSelect
                          value={d.fromId}
                          pois={pois}
                          onChange={(id) => updateDraft(d.id, { fromId: id })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <PoiSelect
                          value={d.toId}
                          pois={pois}
                          onChange={(id) => updateDraft(d.id, { toId: id })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step={1}
                          value={Math.round(d.bearingDeg)}
                          onChange={(e) =>
                            updateDraft(d.id, {
                              bearingDeg: norm360(Number(e.target.value)),
                            })
                          }
                          className="w-16 rounded border border-water-200 px-1 py-0.5 text-right"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step={1}
                          value={Math.round(reverseDisplay)}
                          placeholder={`${Math.round(norm360(d.bearingDeg + 180))}`}
                          onChange={(e) =>
                            updateDraft(d.id, {
                              reverseBearingDeg:
                                e.target.value === ''
                                  ? undefined
                                  : norm360(Number(e.target.value)),
                            })
                          }
                          className="w-16 rounded border border-water-200 px-1 py-0.5 text-right"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          value={d.distanceM ?? ''}
                          placeholder="auto"
                          onChange={(e) =>
                            updateDraft(d.id, {
                              distanceM:
                                e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-16 rounded border border-water-200 px-1 py-0.5 text-right"
                        />
                      </td>
                      <td className="px-2 py-1 text-right text-water-700">
                        {solved == null ? (
                          '—'
                        ) : (
                          <span
                            className={
                              approximated ? 'text-amber-700' : 'text-emerald-700'
                            }
                            title={
                              approximated
                                ? 'Approximated — used the hint distance (or 30 m default)'
                                : 'Triangulated from two bearings'
                            }
                          >
                            {solved.toFixed(1)}
                            {approximated ? ' ⚠' : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => swapDirection(d.id)}
                            className="rounded border border-water-200 px-1.5 py-0.5 text-[11px] text-water-700 hover:bg-water-100"
                            title="Swap from / to and reverse the bearing accordingly"
                            aria-label="Swap direction"
                          >
                            ⇄
                          </button>
                          <button
                            type="button"
                            onClick={() => removeDraft(d.id)}
                            className="rounded p-1 text-red-600 hover:bg-red-50"
                            aria-label="Remove bearing"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {drafts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-water-600">
                      No bearings yet. Add one to start.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="border-t border-water-100 p-2">
              <button
                type="button"
                onClick={addBearing}
                disabled={pois.length < 2}
                className="rounded border border-water-300 bg-white px-2 py-1 text-xs font-medium text-water-900 hover:bg-water-100 disabled:cursor-not-allowed disabled:text-water-400"
                title={pois.length < 2 ? 'Need at least two POIs first' : 'Add a new bearing'}
              >
                + Add bearing
              </button>
            </div>
          </div>

          {result && (
            <div className="space-y-1 text-xs">
              {result.unsolved.length > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
                  ⚠ {result.unsolved.length} POI{result.unsolved.length === 1 ? '' : 's'}{' '}
                  disconnected from the anchor: {' '}
                  {result.unsolved
                    .map((id) => poisById.get(id)?.name ?? id)
                    .join(', ')}
                </div>
              )}
              {result.approximated.length > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
                  ⚠ {result.approximated.length} bearing{result.approximated.length === 1 ? '' : 's'} couldn't be triangulated and used the hint distance (or 30 m default).
                </div>
              )}
              <div className="text-water-600">
                Anchor stays at{' '}
                {(() => {
                  const a = anchorId ? poisById.get(anchorId) : null;
                  if (!a) return '(none)';
                  const p = a.position;
                  return p ? `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})` : 'origin';
                })()}
                {(() => {
                  if (!anchorId) return null;
                  const moved = pois.filter((p) => {
                    if (p.id === anchorId) return false;
                    const np = result.positions.get(p.id);
                    if (!np || !p.position) return !!np;
                    return distance(p.position, np) > 0.01;
                  });
                  return (
                    <>
                      {' · '}
                      {moved.length} POI{moved.length === 1 ? '' : 's'} will move
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-water-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-water-300 px-3 py-1.5 text-sm text-water-900 hover:bg-water-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCalculate}
            disabled={validBearings.length === 0 || !anchorId}
            className="rounded bg-water-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-water-800 disabled:cursor-not-allowed disabled:bg-water-300"
          >
            Calculate distances
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!result}
            className="rounded bg-water-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-water-800 disabled:cursor-not-allowed disabled:bg-water-300"
          >
            Place / adjust
          </button>
        </footer>
      </div>
    </div>
  );
}

function PoiSelect({
  value,
  pois,
  onChange,
}: {
  value: UUID;
  pois: POI[];
  onChange: (id: UUID) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-32 rounded border border-water-200 px-1 py-0.5 text-xs"
    >
      {pois.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
