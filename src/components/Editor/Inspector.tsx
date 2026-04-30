import { useEffect, useRef, useState } from 'react';
import { useSiteStore } from '../../state/useSiteStore';
import { DEFAULT_BEARING_FONT_SIZE } from '../Map/layers/POILayerView';
import type {
  Bearing,
  ContourLine,
  DepthLabel,
  DepthSounding,
  Illustration,
  IllustrationLine,
  IllustrationLineLabelPosition,
  IllustrationLineStyle,
  Note,
  POI,
  Point,
  ShorelinePath,
  SubPOI,
} from '../../domain/types';
import {
  DEFAULT_DEPTH_LABEL_FONT_SIZE,
  DEPTH_LABEL_MAX_FONT_SIZE,
  DEPTH_LABEL_MIN_FONT_SIZE,
  ILLUSTRATION_LINE_MAX_WIDTH,
  ILLUSTRATION_LINE_MIN_WIDTH,
} from '../../domain/types';

type ContourDuplicateMode = 'inside' | 'outside';

/**
 * Build a duplicated set of points for a contour.
 *
 * For a closed loop:
 *   - 'inside'  → scaled toward the centroid (smaller copy fits within).
 *   - 'outside' → scaled away from the centroid (larger copy surrounds).
 * For an open polyline:
 *   - 'inside'  → shifted toward the bottom-right.
 *   - 'outside' → shifted toward the top-left.
 *
 * The offset / scale magnitude is small enough that the duplicate is
 * clearly distinguishable but not visually disruptive.
 */
function duplicateContourPoints(
  points: Point[],
  closed: boolean,
  mode: ContourDuplicateMode,
): Point[] {
  if (points.length === 0) return [];
  if (!closed) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const dxMag = Math.max(2, (maxX - minX) * 0.05);
    const dyMag = Math.max(2, (maxY - minY) * 0.05);
    const sign = mode === 'inside' ? 1 : -1; // bottom-right vs top-left
    const dx = dxMag * sign;
    const dy = dyMag * sign;
    return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  }
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  const cx = sx / points.length;
  const cy = sy / points.length;
  const scale = mode === 'inside' ? 0.85 : 1.15;
  return points.map((p) => ({
    x: cx + (p.x - cx) * scale,
    y: cy + (p.y - cy) * scale,
  }));
}

export default function Inspector() {
  const selection = useSiteStore((s) => s.editor.selection);
  const site = useSiteStore((s) => s.site);
  const clearSelection = useSiteStore((s) => s.clearSelection);
  const mutate = useSiteStore((s) => s.mutateSite);
  const readOnly = useSiteStore((s) => s.editor.readOnly);

  const deleteSelection = () => {
    if (selection.length === 0) return;
    const ids = {
      poi: new Set<string>(),
      bearing: new Set<string>(),
      sounding: new Set<string>(),
      contour: new Set<string>(),
      depthLabel: new Set<string>(),
      subpoi: new Set<string>(),
      illustration: new Set<string>(),
      illustrationLine: new Set<string>(),
      note: new Set<string>(),
      shoreline: new Set<string>(),
      // Routes are managed from the dedicated Plans page; the universal
      // delete here doesn't drop waypoints. Track the kind so the index
      // type stays exhaustive.
      waypoint: new Set<string>(),
    };
    for (const sel of selection) ids[sel.kind].add(sel.id);
    mutate((d) => {
      if (ids.poi.size) {
        d.layers.poi.pois = d.layers.poi.pois.filter((p) => !ids.poi.has(p.id));
        d.layers.poi.bearings = d.layers.poi.bearings.filter(
          (b) => !ids.poi.has(b.fromId) && !ids.poi.has(b.toId),
        );
        d.layers.subPoi.items = d.layers.subPoi.items.filter((s) => !ids.poi.has(s.parentId));
      }
      if (ids.bearing.size) {
        d.layers.poi.bearings = d.layers.poi.bearings.filter((b) => !ids.bearing.has(b.id));
      }
      if (ids.sounding.size) {
        d.layers.measurements.soundings = d.layers.measurements.soundings.filter(
          (s) => !ids.sounding.has(s.id),
        );
      }
      if (ids.contour.size) {
        d.layers.depth.contours = d.layers.depth.contours.filter((c) => !ids.contour.has(c.id));
      }
      if (ids.depthLabel.size && d.layers.depth.labels) {
        d.layers.depth.labels = d.layers.depth.labels.filter((l) => !ids.depthLabel.has(l.id));
      }
      if (ids.subpoi.size) {
        d.layers.subPoi.items = d.layers.subPoi.items.filter((s) => !ids.subpoi.has(s.id));
      }
      if (ids.illustration.size) {
        d.layers.illustrations.items = d.layers.illustrations.items.filter(
          (i) => !ids.illustration.has(i.id),
        );
        // The same selection kind covers both layers — also drop any matched
        // reference imagery.
        d.layers.references.items = d.layers.references.items.filter(
          (i) => !ids.illustration.has(i.id),
        );
      }
      if (ids.illustrationLine.size && d.layers.illustrations.lines) {
        d.layers.illustrations.lines = d.layers.illustrations.lines.filter(
          (l) => !ids.illustrationLine.has(l.id),
        );
      }
      if (ids.note.size) {
        d.layers.notes.notes = d.layers.notes.notes.filter((n) => !ids.note.has(n.id));
      }
      if (ids.shoreline.size) {
        d.layers.waterBody.shoreline = d.layers.waterBody.shoreline.filter(
          (s) => !ids.shoreline.has(s.id),
        );
      }
    });
    clearSelection();
  };

  let body: React.ReactNode = (
    <p className="text-sm text-water-700">Select an item to edit it.</p>
  );

  if (selection.length > 1) {
    body = (
      <div className="space-y-3 text-sm">
        <p className="text-water-900">{selection.length} items selected.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={deleteSelection}
            className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
          >
            Delete all
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded border border-water-300 px-3 py-1 text-xs text-water-900 hover:bg-water-100"
          >
            Clear selection
          </button>
        </div>
        <p className="text-xs text-water-700">
          Or press <kbd className="rounded bg-water-100 px-1">Delete</kbd> /
          <kbd className="ml-1 rounded bg-water-100 px-1">Esc</kbd>.
        </p>
      </div>
    );
  } else if (selection.length === 1) {
    const sel = selection[0]!;
    switch (sel.kind) {
      case 'poi': {
        const poi = site.layers.poi.pois.find((p) => p.id === sel.id);
        if (poi) body = <PoiEditor poi={poi} />;
        break;
      }
      case 'bearing': {
        const b = site.layers.poi.bearings.find((b) => b.id === sel.id);
        if (b) body = <BearingEditor bearing={b} />;
        break;
      }
      case 'sounding': {
        const s = site.layers.measurements.soundings.find((s) => s.id === sel.id);
        if (s) body = <SoundingEditor sounding={s} />;
        break;
      }
      case 'contour': {
        const c = site.layers.depth.contours.find((c) => c.id === sel.id);
        if (c) body = <ContourEditor contour={c} />;
        break;
      }
      case 'depthLabel': {
        const l = site.layers.depth.labels?.find((l) => l.id === sel.id);
        if (l) body = <DepthLabelEditor label={l} />;
        break;
      }
      case 'subpoi': {
        const s = site.layers.subPoi.items.find((s) => s.id === sel.id);
        if (s) body = <SubPoiEditor sub={s} />;
        break;
      }
      case 'illustration': {
        const inIllustrations = site.layers.illustrations.items.find((i) => i.id === sel.id);
        const inReferences = inIllustrations
          ? null
          : site.layers.references.items.find((i) => i.id === sel.id);
        if (inIllustrations) body = <IllustrationEditor it={inIllustrations} source="illustrations" />;
        else if (inReferences) body = <IllustrationEditor it={inReferences} source="references" />;
        break;
      }
      case 'illustrationLine': {
        const ln = (site.layers.illustrations.lines ?? []).find((l) => l.id === sel.id);
        if (ln) body = <IllustrationLineEditor line={ln} />;
        break;
      }
      case 'note': {
        const n = site.layers.notes.notes.find((n) => n.id === sel.id);
        if (n) body = <NoteEditor note={n} />;
        break;
      }
      case 'shoreline': {
        const sh = site.layers.waterBody.shoreline.find((s) => s.id === sel.id);
        if (sh) body = <ShorelineEditor sh={sh} />;
        break;
      }
    }
  }

  return (
    <aside className="flex h-full w-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-water-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-water-700">
        <span>Inspector{readOnly ? ' · view only' : ''}</span>
        {selection.length === 1 && !readOnly && (
          <button
            type="button"
            onClick={deleteSelection}
            className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700"
            title="Delete (or press Delete / Backspace)"
          >
            Delete
          </button>
        )}
      </div>
      <fieldset
        disabled={readOnly}
        className="flex-1 overflow-y-auto p-3 disabled:opacity-90 [&[disabled]_input]:cursor-default [&[disabled]_select]:cursor-default [&[disabled]_textarea]:cursor-default"
      >
        {body}
      </fieldset>
    </aside>
  );
}

function PoiEditor({ poi }: { poi: POI }) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const update = (fn: (p: POI) => void) =>
    mutate((d) => {
      const p = d.layers.poi.pois.find((p) => p.id === poi.id);
      if (p) fn(p);
    });
  return (
    <div className="space-y-3 text-sm">
      <Field label="Label">
        <input
          type="text"
          className={inputClass}
          value={poi.number ?? ''}
          placeholder="1, 2, A, B…"
          onChange={(e) => {
            const raw = e.target.value.trim();
            update((p) => {
              if (raw === '') {
                p.number = undefined;
                return;
              }
              // If the user typed digits, store as a number so auto-numbering
              // can still bump from this value; otherwise store the raw label.
              const asNum = Number(raw);
              p.number = /^-?\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(asNum)
                ? asNum
                : raw;
            });
          }}
        />
      </Field>
      <Field label="Name">
        <input
          className={inputClass}
          value={poi.name}
          onChange={(e) => update((p) => void (p.name = e.target.value))}
        />
      </Field>
      <Field label="Type">
        <select
          className={inputClass}
          value={poi.type}
          onChange={(e) => update((p) => void (p.type = e.target.value as POI['type']))}
        >
          {[
            { v: 'wreck', label: 'Wreck' },
            { v: 'vehicle', label: 'Vehicle' },
            { v: 'natural', label: 'Natural feature' },
            { v: 'structure', label: 'Structure' },
            { v: 'anchor', label: 'Anchor' },
            { v: 'mooring', label: 'Mooring' },
            { v: 'entry_exit', label: 'Entry / exit point' },
            { v: 'landmark', label: 'Landmark' },
            { v: 'other', label: 'Other' },
          ].map((t) => (
            <option key={t.v} value={t.v}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Depth (m)">
        <input
          type="number"
          className={inputClass}
          value={poi.depth ?? ''}
          onChange={(e) =>
            update((p) => void (p.depth = e.target.value === '' ? undefined : Number(e.target.value)))
          }
        />
      </Field>
      <Field label="Label position">
        <select
          className={inputClass}
          value={poi.labelPosition ?? 'right'}
          onChange={(e) =>
            update(
              (p) => void (p.labelPosition = e.target.value as POI['labelPosition']),
            )
          }
        >
          <option value="right">Right (default)</option>
          <option value="left">Left</option>
          <option value="above">Above</option>
          <option value="below">Below</option>
          <option value="hidden">Hidden</option>
        </select>
      </Field>
      <Field label="Notes">
        <textarea
          className={`${inputClass} h-24`}
          value={poi.notes ?? ''}
          onChange={(e) => update((p) => void (p.notes = e.target.value || undefined))}
        />
      </Field>
    </div>
  );
}

function BearingEditor({ bearing }: { bearing: Bearing }) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const site = useSiteStore((s) => s.site);
  const [anchor, setAnchor] = useState<'start' | 'end'>('start');
  const update = (fn: (b: Bearing) => void) =>
    mutate((d) => {
      const x = d.layers.poi.bearings.find((b) => b.id === bearing.id);
      if (x) fn(x);
    });

  const fromPoi = site.layers.poi.pois.find((p) => p.id === bearing.fromId);
  const toPoi = site.layers.poi.pois.find((p) => p.id === bearing.toId);
  const canApply =
    bearing.distanceM != null &&
    bearing.distanceM > 0 &&
    !!fromPoi?.position &&
    !!toPoi?.position;

  /**
   * Move one POI so the bearing/distance match the values in the editor.
   * The chosen anchor stays put; the other POI is repositioned along the
   * bearing ray at the configured distance.
   */
  const applyPositions = () => {
    mutate((d) => {
      const b = d.layers.poi.bearings.find((x) => x.id === bearing.id);
      if (!b || b.distanceM == null) return;
      const from = d.layers.poi.pois.find((p) => p.id === b.fromId);
      const to = d.layers.poi.pois.find((p) => p.id === b.toId);
      if (!from || !to) return;
      const θ = (b.bearingDeg * Math.PI) / 180;
      const ux = Math.sin(θ);
      const uy = -Math.cos(θ);
      const dist = b.distanceM;
      if (anchor === 'start') {
        const base = from.position;
        if (!base) return;
        to.position = { x: base.x + dist * ux, y: base.y + dist * uy };
      } else {
        const base = to.position;
        if (!base) return;
        from.position = { x: base.x - dist * ux, y: base.y - dist * uy };
      }
      // Reverse becomes the canonical 180° complement again.
      b.reverseBearingDeg = ((b.bearingDeg + 180) % 360 + 360) % 360;
    });
  };

  return (
    <div className="space-y-3 text-sm">
      <Field label="Bearing (°)">
        <input
          type="number"
          className={inputClass}
          value={bearing.bearingDeg}
          onChange={(e) => update((b) => void (b.bearingDeg = Number(e.target.value)))}
        />
      </Field>
      <Field label="Reverse bearing (°)">
        <input
          type="number"
          className={inputClass}
          value={bearing.reverseBearingDeg ?? ''}
          placeholder={`auto (${(bearing.bearingDeg + 180) % 360})`}
          onChange={(e) =>
            update((b) => void (b.reverseBearingDeg = e.target.value === '' ? undefined : Number(e.target.value)))
          }
        />
      </Field>
      <Field label="Distance (m)">
        <input
          type="number"
          className={inputClass}
          value={bearing.distanceM ?? ''}
          onChange={(e) =>
            update((b) => void (b.distanceM = e.target.value === '' ? undefined : Number(e.target.value)))
          }
        />
      </Field>
      <Field label="Label">
        <input
          className={inputClass}
          value={bearing.label ?? ''}
          onChange={(e) => update((b) => void (b.label = e.target.value || undefined))}
        />
      </Field>
      <Field label={`Label size (${(bearing.labelFontSize ?? DEFAULT_BEARING_FONT_SIZE).toFixed(1)})`}>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={bearing.labelFontSize ?? DEFAULT_BEARING_FONT_SIZE}
            onChange={(e) => {
              const v = Number(e.target.value);
              update((b) => void (b.labelFontSize = v));
            }}
            className="flex-1"
            aria-label="Bearing label size"
          />
          <button
            type="button"
            onClick={() => update((b) => void (b.labelFontSize = undefined))}
            className="rounded border border-water-200 px-2 py-0.5 text-xs text-water-700 hover:bg-water-100"
            title="Reset to default"
          >
            Reset
          </button>
        </div>
      </Field>
      <div className="rounded border border-water-200 bg-water-50/40 p-2">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-water-600">
          Apply to positions
        </div>
        <p className="mb-2 text-[11px] text-water-700">
          Move one POI so the bearing &amp; distance match the values above. The
          anchor POI stays put; the other one is repositioned.
        </p>
        <Field label="Anchor">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setAnchor('start')}
              className={`flex-1 rounded border px-2 py-1 text-xs font-medium ${
                anchor === 'start'
                  ? 'border-water-700 bg-water-700 text-white'
                  : 'border-water-300 bg-white text-water-900 hover:bg-water-100'
              }`}
              title={fromPoi ? `Anchor ${fromPoi.name}` : 'Anchor start POI'}
            >
              Start{fromPoi ? ` (${fromPoi.name})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setAnchor('end')}
              className={`flex-1 rounded border px-2 py-1 text-xs font-medium ${
                anchor === 'end'
                  ? 'border-water-700 bg-water-700 text-white'
                  : 'border-water-300 bg-white text-water-900 hover:bg-water-100'
              }`}
              title={toPoi ? `Anchor ${toPoi.name}` : 'Anchor end POI'}
            >
              End{toPoi ? ` (${toPoi.name})` : ''}
            </button>
          </div>
        </Field>
        <button
          type="button"
          onClick={applyPositions}
          disabled={!canApply}
          className="mt-2 w-full rounded bg-water-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-water-800 disabled:cursor-not-allowed disabled:bg-water-300"
          title={
            !canApply
              ? 'Set a distance and ensure both POIs have positions'
              : `Move the ${anchor === 'start' ? 'end' : 'start'} POI`
          }
        >
          Update positions
        </button>
      </div>
    </div>
  );
}

function SoundingEditor({ sounding }: { sounding: DepthSounding }) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const depthRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    depthRef.current?.focus();
    depthRef.current?.select();
  }, [sounding.id]);
  const update = (fn: (s: DepthSounding) => void) =>
    mutate((d) => {
      const s = d.layers.measurements.soundings.find((s) => s.id === sounding.id);
      if (s) fn(s);
    });
  return (
    <div className="space-y-3 text-sm">
      <Field label="Depth (m)">
        <input
          ref={depthRef}
          type="number"
          className={inputClass}
          value={sounding.depth}
          onChange={(e) => update((s) => void (s.depth = Number(e.target.value)))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="x">
          <input
            type="number"
            className={inputClass}
            value={Math.round(sounding.x * 10) / 10}
            onChange={(e) => update((s) => void (s.x = Number(e.target.value)))}
          />
        </Field>
        <Field label="y">
          <input
            type="number"
            className={inputClass}
            value={Math.round(sounding.y * 10) / 10}
            onChange={(e) => update((s) => void (s.y = Number(e.target.value)))}
          />
        </Field>
      </div>
    </div>
  );
}

function DepthLabelEditor({ label }: { label: DepthLabel }) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const update = (fn: (l: DepthLabel) => void) =>
    mutate((d) => {
      const l = d.layers.depth.labels?.find((l) => l.id === label.id);
      if (l) fn(l);
    });
  const labelKind: 'contour' | 'reference' =
    label.kind ?? (label.origin === 'derived' ? 'contour' : 'reference');
  return (
    <div className="space-y-3 text-sm">
      <Field label="Depth (m)">
        <input
          type="number"
          className={inputClass}
          value={label.depth}
          onChange={(e) => update((l) => void (l.depth = Number(e.target.value)))}
        />
      </Field>
      <Field label="Kind">
        <select
          className={inputClass}
          value={labelKind}
          onChange={(e) =>
            update((l) => void (l.kind = e.target.value as 'contour' | 'reference'))
          }
        >
          <option value="reference">Reference (dark)</option>
          <option value="contour">Contour (water blue)</option>
        </select>
      </Field>
      <Field
        label={`Label size (${(label.fontSize ?? DEFAULT_DEPTH_LABEL_FONT_SIZE).toFixed(1)})`}
      >
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={DEPTH_LABEL_MIN_FONT_SIZE}
            max={DEPTH_LABEL_MAX_FONT_SIZE}
            step={0.5}
            value={label.fontSize ?? DEFAULT_DEPTH_LABEL_FONT_SIZE}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              update((l) => void (l.fontSize = v));
            }}
            className="flex-1 accent-water-600"
            aria-label="Depth label size"
          />
          <button
            type="button"
            onClick={() => update((l) => void (l.fontSize = undefined))}
            className="rounded border border-water-200 px-2 py-0.5 text-xs text-water-700 hover:bg-water-100"
            title="Reset to default"
          >
            Reset
          </button>
        </div>
      </Field>
      <p className="text-xs text-water-700">
        Position: ({Math.round(label.x * 10) / 10}, {Math.round(label.y * 10) / 10}) ·{' '}
        {label.origin ?? 'manual'}
      </p>
    </div>
  );
}

function ContourEditor({ contour }: { contour: ContourLine }) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const setSelection = useSiteStore((s) => s.setSelection);
  const update = (fn: (c: ContourLine) => void) =>
    mutate((d) => {
      const c = d.layers.depth.contours.find((c) => c.id === contour.id);
      if (c) fn(c);
    });
  const duplicate = (mode: 'inside' | 'outside') => {
    const newId = crypto.randomUUID();
    mutate((d) => {
      const src = d.layers.depth.contours.find((c) => c.id === contour.id);
      if (!src) return;
      const closed = !!src.closed;
      // Depth shift: inside is deeper (+5 m), outside is shallower (-5 m,
      // clamped at 0 so we never land on a negative depth).
      const depthDelta = mode === 'inside' ? 5 : -5;
      const newDepth = Math.max(0, src.depth + depthDelta);
      const dup: ContourLine = {
        ...src,
        id: newId,
        origin: 'manual',
        depth: newDepth,
        // Drop the override label so the new depth shows through; the user
        // can re-set a custom label after if needed.
        label: undefined,
        points: duplicateContourPoints(src.points, closed, mode),
      };
      const idx = d.layers.depth.contours.findIndex((c) => c.id === contour.id);
      if (idx >= 0) d.layers.depth.contours.splice(idx + 1, 0, dup);
      else d.layers.depth.contours.push(dup);
    });
    setSelection({ kind: 'contour', id: newId });
  };
  return (
    <div className="space-y-3 text-sm">
      <Field label="Duplicate contour">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => duplicate('inside')}
            className="flex-1 rounded border border-water-300 bg-white px-2 py-1 text-xs font-medium text-water-900 hover:bg-water-100"
            title={
              contour.closed
                ? 'Place a smaller copy inside the loop, +5 m depth'
                : 'Place a copy toward the bottom-right, +5 m depth'
            }
          >
            Inside (+5 m)
          </button>
          <button
            type="button"
            onClick={() => duplicate('outside')}
            className="flex-1 rounded border border-water-300 bg-white px-2 py-1 text-xs font-medium text-water-900 hover:bg-water-100"
            title={
              contour.closed
                ? 'Place a larger copy around the loop, −5 m depth'
                : 'Place a copy toward the top-left, −5 m depth'
            }
          >
            Outside (−5 m)
          </button>
        </div>
      </Field>
      <Field label="Depth (m)">
        <input
          type="number"
          className={inputClass}
          value={contour.depth}
          onChange={(e) => update((c) => void (c.depth = Number(e.target.value)))}
        />
      </Field>
      <Field label="Label override">
        <input
          className={inputClass}
          placeholder={`${contour.depth}m`}
          value={contour.label ?? ''}
          onChange={(e) => update((c) => void (c.label = e.target.value || undefined))}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-water-900">
        <input
          type="checkbox"
          checked={!!contour.labelHidden}
          onChange={(e) => update((c) => void (c.labelHidden = e.target.checked))}
        />
        Hide label
      </label>
      {!contour.labelHidden && (
        <>
          <Field label={`Label position along line (${Math.round((contour.labelOffset ?? 0.5) * 100)}%)`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={contour.labelOffset ?? 0.5}
              onChange={(e) =>
                update((c) => void (c.labelOffset = Number(e.target.value)))
              }
              className="w-full accent-water-600"
            />
          </Field>
          <Field label={`Repeat label (×${contour.labelRepeat ?? 1})`}>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={contour.labelRepeat ?? 1}
              onChange={(e) =>
                update((c) => void (c.labelRepeat = Number(e.target.value)))
              }
              className="w-full accent-water-600"
            />
          </Field>
        </>
      )}
      <Field label="Closed loop">
        <input
          type="checkbox"
          checked={!!contour.closed}
          onChange={(e) => update((c) => void (c.closed = e.target.checked))}
        />
      </Field>
      <p className="text-xs text-water-700">
        {contour.points.length} pts · {contour.origin}
      </p>
    </div>
  );
}

function SubPoiEditor({ sub }: { sub: SubPOI }) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const update = (fn: (s: SubPOI) => void) =>
    mutate((d) => {
      const s = d.layers.subPoi.items.find((s) => s.id === sub.id);
      if (s) fn(s);
    });
  return (
    <div className="space-y-3 text-sm">
      <Field label="Name">
        <input
          className={inputClass}
          value={sub.name}
          onChange={(e) => update((s) => void (s.name = e.target.value))}
        />
      </Field>
      <Field label="Category">
        <select
          className={inputClass}
          value={sub.category}
          onChange={(e) => update((s) => void (s.category = e.target.value as SubPOI['category']))}
        >
          {[
            { v: 'fish', label: 'Fish / wildlife' },
            { v: 'coral', label: 'Coral / flora' },
            { v: 'hazard_high', label: 'Hazard — high risk' },
            { v: 'hazard_standard', label: 'Hazard — standard' },
            { v: 'hazard_awareness', label: 'Hazard — awareness' },
            { v: 'access', label: 'Access (entry / exit / swim-through)' },
            { v: 'photo_spot', label: 'Photo spot' },
            { v: 'note', label: 'Note' },
            { v: 'other', label: 'Other' },
          ].map((c) => (
            <option key={c.v} value={c.v}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Label position">
        <select
          className={inputClass}
          value={sub.labelPosition ?? 'right'}
          onChange={(e) =>
            update(
              (s) => void (s.labelPosition = e.target.value as SubPOI['labelPosition']),
            )
          }
        >
          <option value="right">Right (default)</option>
          <option value="left">Left</option>
          <option value="above">Above</option>
          <option value="below">Below</option>
          <option value="hidden">Hidden</option>
        </select>
      </Field>
      <Field label="Notes">
        <textarea
          className={`${inputClass} h-20`}
          value={sub.notes ?? ''}
          onChange={(e) => update((s) => void (s.notes = e.target.value || undefined))}
        />
      </Field>
    </div>
  );
}

function IllustrationLineEditor({ line }: { line: IllustrationLine }) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const update = (fn: (l: IllustrationLine) => void) =>
    mutate((d) => {
      const ln = d.layers.illustrations.lines?.find((l) => l.id === line.id);
      if (ln) fn(ln);
    });
  return (
    <div className="space-y-3 text-sm">
      <Field label="Label">
        <input
          className={inputClass}
          value={line.label ?? ''}
          placeholder="Optional text drawn along the line"
          onChange={(e) =>
            update((l) => void (l.label = e.target.value || undefined))
          }
        />
      </Field>
      <Field label="Label position">
        <select
          className={inputClass}
          value={line.labelPosition ?? 'above'}
          onChange={(e) =>
            update(
              (l) => void (l.labelPosition = e.target.value as IllustrationLineLabelPosition),
            )
          }
        >
          <option value="above">Above</option>
          <option value="below">Below</option>
          <option value="on">On the line</option>
          <option value="hidden">Hidden</option>
        </select>
      </Field>
      <Field label={`Width (${(typeof line.width === 'number' ? line.width : 0.5).toFixed(1)})`}>
        <input
          type="range"
          min={ILLUSTRATION_LINE_MIN_WIDTH}
          max={ILLUSTRATION_LINE_MAX_WIDTH}
          step={0.1}
          value={typeof line.width === 'number' ? line.width : 0.5}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v)) return;
            update((l) => void (l.width = v));
          }}
          className="w-full accent-water-600"
        />
      </Field>
      <Field label="Style">
        <select
          className={inputClass}
          value={line.style ?? 'solid'}
          onChange={(e) =>
            update((l) => void (l.style = e.target.value as IllustrationLineStyle))
          }
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
        </select>
      </Field>
      <Field label="Colour">
        <input
          type="color"
          className={inputClass}
          value={line.color ?? '#374151'}
          onChange={(e) => update((l) => void (l.color = e.target.value))}
        />
      </Field>
      <p className="text-xs text-water-700">{line.points.length} pts · open polyline</p>
    </div>
  );
}

function IllustrationEditor({
  it,
  source = 'illustrations',
}: {
  it: Illustration;
  source?: 'illustrations' | 'references';
}) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const update = (fn: (i: Illustration) => void) =>
    mutate((d) => {
      const x = d.layers[source].items.find((i) => i.id === it.id);
      if (x) fn(x);
    });
  const moveToLayer = (target: 'illustrations' | 'references') => {
    if (target === source) return;
    mutate((d) => {
      const idx = d.layers[source].items.findIndex((i) => i.id === it.id);
      if (idx < 0) return;
      const [item] = d.layers[source].items.splice(idx, 1);
      if (item) d.layers[target].items.push(item);
    });
  };
  return (
    <div className="space-y-3 text-sm">
      {/* Uploaded images can sit on either the Illustration layer (decoration
          baked into the map) or the Reference imagery layer (guidance
          backdrop, locked separately). Primitive shapes always live on the
          Illustration layer. */}
      {it.kind === 'image' && (
        <Field label="Layer">
          <select
            className={inputClass}
            value={source}
            onChange={(e) =>
              moveToLayer(e.target.value as 'illustrations' | 'references')
            }
          >
            <option value="illustrations">Illustration (map decoration)</option>
            <option value="references">Reference imagery (guidance backdrop)</option>
          </select>
        </Field>
      )}
      <Field label="Caption">
        <input
          className={inputClass}
          value={it.caption ?? ''}
          onChange={(e) => update((i) => void (i.caption = e.target.value || undefined))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Width">
          <input
            type="number"
            className={inputClass}
            value={Math.round(it.width)}
            onChange={(e) => update((i) => void (i.width = Number(e.target.value)))}
          />
        </Field>
        <Field label="Height">
          <input
            type="number"
            className={inputClass}
            value={Math.round(it.height)}
            onChange={(e) => update((i) => void (i.height = Number(e.target.value)))}
          />
        </Field>
      </div>
      <Field label="Rotation (°)">
        <input
          type="number"
          className={inputClass}
          value={it.rotationDeg ?? 0}
          onChange={(e) => update((i) => void (i.rotationDeg = Number(e.target.value)))}
        />
      </Field>
      <Field label="Placement">
        <select
          className={inputClass}
          value={it.placement}
          onChange={(e) => update((i) => void (i.placement = e.target.value as Illustration['placement']))}
        >
          <option value="under">Under</option>
          <option value="over">Over</option>
        </select>
      </Field>
      <Field label="Opacity">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={it.opacity ?? 1}
          onChange={(e) => update((i) => void (i.opacity = Number(e.target.value)))}
          className="w-full"
        />
      </Field>
    </div>
  );
}

const NOTE_BG_PRESETS = [
  '#fef3c7', // amber-100 (default)
  '#fde68a', // amber-200
  '#fee2e2', // red-100
  '#dcfce7', // green-100
  '#dbeafe', // blue-100
  '#e9d5ff', // purple-100
  '#f5f5f5', // neutral-100
  '#1f2937', // slate-800 (dark)
] as const;

const NOTE_TEXT_PRESETS = [
  '#7c2d12', // amber-900 (default)
  '#1f2937', // slate-800
  '#7f1d1d', // red-900
  '#14532d', // green-900
  '#1e3a8a', // blue-900
  '#581c87', // purple-900
  '#000000', // black
  '#ffffff', // white
] as const;

function NoteEditor({ note }: { note: Note }) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const update = (fn: (n: Note) => void) =>
    mutate((d) => {
      const n = d.layers.notes.notes.find((n) => n.id === note.id);
      if (n) fn(n);
    });
  const bg = note.color ?? '#fef3c7';
  const txt = note.textColor ?? '#7c2d12';
  const opacity = note.bgOpacity ?? 1;
  const transparent = bg === 'transparent';
  return (
    <div className="space-y-3 text-sm">
      <Field label="Text">
        <textarea
          className={`${inputClass} h-32`}
          value={note.text}
          onChange={(e) => update((n) => void (n.text = e.target.value))}
        />
      </Field>
      <Field label="Background">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1">
            {NOTE_BG_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => update((n) => void (n.color = c))}
                title={c}
                className={`h-6 w-6 rounded border ${
                  bg === c ? 'border-water-700 ring-2 ring-water-300' : 'border-water-300'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <button
              type="button"
              onClick={() => update((n) => void (n.color = 'transparent'))}
              title="No background"
              className={`flex h-6 w-6 items-center justify-center rounded border bg-white text-[9px] uppercase tracking-tight ${
                transparent ? 'border-water-700 ring-2 ring-water-300' : 'border-water-300'
              }`}
            >
              none
            </button>
            <input
              type="color"
              value={transparent ? '#fef3c7' : bg}
              onChange={(e) => update((n) => void (n.color = e.target.value))}
              className="h-6 w-9 cursor-pointer rounded border border-water-300"
              title="Custom colour"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-water-700">
            <span className="w-16 shrink-0">Transparency</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) =>
                update((n) => void (n.bgOpacity = Number(e.target.value)))
              }
              className="flex-1 accent-water-600"
              disabled={transparent}
            />
            <span className="w-9 text-right">{Math.round(opacity * 100)}%</span>
          </label>
        </div>
      </Field>
      <Field label="Text colour">
        <div className="flex flex-wrap items-center gap-1">
          {NOTE_TEXT_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => update((n) => void (n.textColor = c))}
              title={c}
              className={`h-6 w-6 rounded border ${
                txt === c ? 'border-water-700 ring-2 ring-water-300' : 'border-water-300'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={txt}
            onChange={(e) => update((n) => void (n.textColor = e.target.value))}
            className="h-6 w-9 cursor-pointer rounded border border-water-300"
            title="Custom colour"
          />
        </div>
      </Field>
      <Field label="Connector">
        <select
          className={inputClass}
          value={note.connector?.style ?? 'none'}
          onChange={(e) => {
            const v = e.target.value;
            update((n) => {
              if (v === 'none') {
                n.connector = undefined;
              } else {
                const target =
                  n.connector?.target ??
                  // Default offset: 30 world units down-right of the note.
                  (n.position
                    ? { x: n.position.x + 30, y: n.position.y + 30 }
                    : { x: 30, y: 30 });
                n.connector = { target, style: v as 'line' | 'arrow' | 'dot' };
              }
            });
          }}
        >
          <option value="none">None</option>
          <option value="line">Line</option>
          <option value="arrow">Arrow</option>
          <option value="dot">Dot</option>
        </select>
      </Field>
      {note.connector && (
        <p className="text-xs text-water-700">
          Drag the amber dot on the canvas to position the connector target.
        </p>
      )}
    </div>
  );
}

function ShorelineEditor({ sh }: { sh: ShorelinePath }) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const update = (fn: (s: ShorelinePath) => void) =>
    mutate((d) => {
      const s = d.layers.waterBody.shoreline.find((s) => s.id === sh.id);
      if (s) fn(s);
    });
  return (
    <div className="space-y-3 text-sm">
      <Field label="Shape">
        <select
          className={inputClass}
          value={sh.shape ?? 'shoreline'}
          onChange={(e) =>
            update((s) => {
              const v = e.target.value as 'shoreline' | 'lake' | 'cave';
              s.shape = v;
              s.closed = v !== 'shoreline';
            })
          }
        >
          <option value="shoreline">Shoreline (open curve)</option>
          <option value="lake">Lake / pool (closed)</option>
          <option value="cave">Cave (closed, heavy)</option>
        </select>
      </Field>
      <Field label="Label">
        <input
          className={inputClass}
          value={sh.label ?? ''}
          onChange={(e) => update((s) => void (s.label = e.target.value || undefined))}
        />
      </Field>
      <Field label="Closed">
        <input
          type="checkbox"
          checked={sh.closed}
          onChange={(e) => update((s) => void (s.closed = e.target.checked))}
        />
      </Field>
      <p className="text-xs text-water-700">{sh.points.length} pts</p>
    </div>
  );
}

const inputClass =
  'w-full rounded border border-water-200 px-2 py-1 disabled:bg-water-50 disabled:text-water-700 disabled:cursor-default';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-water-700">{label}</span>
      {children}
    </label>
  );
}
