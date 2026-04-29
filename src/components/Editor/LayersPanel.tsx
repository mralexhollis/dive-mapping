import { useState } from 'react';
import { useSiteStore, type Selection, type SelectionKind } from '../../state/useSiteStore';
import type { LayerKey, Site } from '../../domain/types';

const LAYER_LABELS: Record<LayerKey, string> = {
  waterBody: 'Water body',
  depth: 'Depth',
  measurements: 'Measurements',
  poi: 'POIs & bearings',
  subPoi: 'Sub-POIs',
  illustrations: 'Illustrations',
  notes: 'Notes',
};

interface EntityRow {
  kind: SelectionKind;
  id: string;
  label: string;
  sub?: string;
}

function entitiesForLayer(site: Site, key: LayerKey): EntityRow[] {
  switch (key) {
    case 'waterBody':
      return site.layers.waterBody.shoreline.map((sh, i) => ({
        kind: 'shoreline',
        id: sh.id,
        label: sh.label || `${capitalise(sh.shape ?? 'shoreline')} ${i + 1}`,
        sub: `${sh.points.length} pts${sh.closed ? ' · closed' : ''}`,
      }));
    case 'depth':
      return [
        ...site.layers.depth.contours.map((c) => ({
          kind: 'contour' as const,
          id: c.id,
          label: c.label || `${c.depth} m contour`,
          sub: `${c.points.length} pts · ${c.origin}`,
        })),
        ...(site.layers.depth.labels ?? []).map((l) => ({
          kind: 'depthLabel' as const,
          id: l.id,
          label: `${l.depth} m label`,
          sub: l.kind ?? (l.origin === 'derived' ? 'contour' : 'reference'),
        })),
      ];
    case 'measurements':
      return site.layers.measurements.soundings.map((s, i) => ({
        kind: 'sounding' as const,
        id: s.id,
        label: `Measurement ${i + 1}`,
        sub: `${s.depth} m`,
      }));
    case 'poi':
      return [
        ...site.layers.poi.pois.map((p) => ({
          kind: 'poi' as const,
          id: p.id,
          label: p.name,
          sub: p.depth != null ? `${p.depth} m · ${p.type}` : p.type,
        })),
        ...site.layers.poi.bearings.map((b) => {
          const a = site.layers.poi.pois.find((p) => p.id === b.fromId)?.name ?? '?';
          const z = site.layers.poi.pois.find((p) => p.id === b.toId)?.name ?? '?';
          return {
            kind: 'bearing' as const,
            id: b.id,
            label: `${a} → ${z}`,
            sub: `${Math.round(b.bearingDeg)}°${b.distanceM != null ? ` · ${b.distanceM} m` : ''}`,
          };
        }),
      ];
    case 'subPoi':
      return site.layers.subPoi.items.map((s) => {
        const parent = site.layers.poi.pois.find((p) => p.id === s.parentId)?.name ?? '?';
        return {
          kind: 'subpoi',
          id: s.id,
          label: s.name,
          sub: `${s.category} · on ${parent}`,
        };
      });
    case 'illustrations':
      return site.layers.illustrations.items.map((it, i) => ({
        kind: 'illustration',
        id: it.id,
        label: it.caption || it.primitive || `Illustration ${i + 1}`,
        sub: `${Math.round(it.width)}×${Math.round(it.height)}${
          it.rotationDeg ? ` · ${Math.round(it.rotationDeg)}°` : ''
        }`,
      }));
    case 'notes':
      return site.layers.notes.notes.map((n, i) => ({
        kind: 'note',
        id: n.id,
        label: n.text.slice(0, 24) || `Note ${i + 1}`,
      }));
  }
}

export default function LayersPanel() {
  const site = useSiteStore((s) => s.site);
  const layers = site.layers;
  const layerOrder = site.layerOrder;
  const setVisible = useSiteStore((s) => s.setLayerVisible);
  const setLocked = useSiteStore((s) => s.setLayerLocked);
  const setOpacity = useSiteStore((s) => s.setLayerOpacity);
  const readOnly = useSiteStore((s) => s.editor.readOnly);
  const selection = useSiteStore((s) => s.editor.selection);
  const setSelection = useSiteStore((s) => s.setSelection);
  const [expanded, setExpanded] = useState<Partial<Record<LayerKey, boolean>>>({});

  const ordered = [...layerOrder].reverse();

  const toggle = (k: LayerKey) =>
    setExpanded((e) => ({ ...e, [k]: !e[k] }));

  const isSelected = (kind: SelectionKind, id: string) =>
    selection.some((s: Selection) => s.kind === kind && s.id === id);

  return (
    <aside className="flex max-h-[55vh] w-full flex-col bg-white">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-water-700">
        Layers
      </div>
      <ul className="flex-1 overflow-y-auto">
        {ordered.map((key) => {
          const layer = layers[key];
          const pct = Math.round(layer.opacity * 100);
          const rows = entitiesForLayer(site, key);
          const isOpen = !!expanded[key];
          return (
            <li key={key} className="border-b border-water-100 text-xs">
              <div className="flex items-center gap-1.5 px-2 py-1">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="w-4 text-left text-water-500 hover:text-water-900"
                  title={isOpen ? 'Collapse' : 'Expand'}
                >
                  {isOpen ? '▾' : '▸'}
                </button>
                <button
                  type="button"
                  onClick={() => setVisible(key, !layer.visible)}
                  className="rounded px-1 leading-none hover:bg-water-100"
                  title={layer.visible ? 'Hide' : 'Show'}
                >
                  {layer.visible ? '👁' : '◌'}
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setLocked(key, !layer.locked)}
                    className="rounded px-1 leading-none hover:bg-water-100"
                    title={layer.locked ? 'Unlock' : 'Lock'}
                  >
                    {layer.locked ? '🔒' : '🔓'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="flex-1 truncate text-left text-water-900"
                >
                  {LAYER_LABELS[key]}
                  <span className="ml-1 text-water-500">({rows.length})</span>
                </button>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={pct}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value)));
                    setOpacity(key, v / 100);
                  }}
                  className="w-12 rounded border border-water-200 px-1 py-0.5 text-right text-xs"
                  aria-label={`${LAYER_LABELS[key]} opacity percent`}
                />
                <span className="text-water-500">%</span>
              </div>
              {isOpen && (
                <ul className="bg-water-50/60 pb-1">
                  {rows.length === 0 ? (
                    <li className="px-7 py-1 text-[11px] italic text-water-500">none</li>
                  ) : (
                    rows.map((row) => {
                      const sel = isSelected(row.kind, row.id);
                      return (
                        <li key={`${row.kind}:${row.id}`}>
                          <button
                            type="button"
                            onClick={() => setSelection({ kind: row.kind, id: row.id })}
                            className={`block w-full truncate px-7 py-0.5 text-left text-[11px] ${
                              sel ? 'bg-amber-100 text-amber-900' : 'hover:bg-water-100/70'
                            }`}
                          >
                            <span className="font-medium text-water-900">{row.label}</span>
                            {row.sub && (
                              <span className="ml-1 text-water-500">— {row.sub}</span>
                            )}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
