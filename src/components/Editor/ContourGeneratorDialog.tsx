import { useMemo, useState } from 'react';
import { useSiteStore } from '../../state/useSiteStore';
import { generateContours, mergeContours } from '../../domain/contours';
import type { DepthSounding } from '../../domain/types';

interface Props {
  onClose: () => void;
}

export default function ContourGeneratorDialog({ onClose }: Props) {
  const site = useSiteStore((s) => s.site);
  const soundings = site.layers.measurements.soundings;
  const shoreline = site.layers.waterBody.shoreline;
  const mutate = useSiteStore((s) => s.mutateSite);

  // Compute the deepest depth seen anywhere in the site so the dialog opens
  // already covering 0 → deepest. Recomputed on each open via useMemo
  // (the dialog only mounts on demand).
  const deepest = useMemo(() => {
    let m = 0;
    for (const s of soundings) if (s.depth > m) m = s.depth;
    for (const p of site.layers.poi.pois) {
      if (p.depth != null && p.depth > m) m = p.depth;
    }
    for (const sp of site.layers.subPoi.items) {
      if (sp.depth != null && sp.depth > m) m = sp.depth;
    }
    for (const c of site.layers.depth.contours) if (c.depth > m) m = c.depth;
    for (const l of site.layers.depth.labels ?? []) if (l.depth > m) m = l.depth;
    // Round up to the next nice number so the dialog covers a margin past
    // the deepest reading.
    if (m === 0) return 20;
    return Math.ceil(m);
  }, [site, soundings]);

  const [minDepth, setMinDepth] = useState(0);
  const [maxDepth, setMaxDepth] = useState(deepest);
  const [step, setStep] = useState(2);
  const [includeShoreAsZero, setIncludeShoreAsZero] = useState(true);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const depths: number[] = [];
  for (let d = minDepth; d <= maxDepth + 1e-9; d += step) {
    depths.push(Math.round(d * 1000) / 1000);
  }

  // Count the virtual shore vertices we'd inject (everything except caves).
  const shoreSamples: DepthSounding[] = [];
  if (includeShoreAsZero) {
    for (const sh of shoreline) {
      const shape = sh.shape ?? 'shoreline';
      if (shape === 'cave') continue;
      sh.points.forEach((p, i) => {
        shoreSamples.push({ id: `__shore-${sh.id}-${i}`, x: p.x, y: p.y, depth: 0 });
      });
    }
  }

  const totalSamples = soundings.length + shoreSamples.length;

  const generate = () => {
    const all = [...soundings, ...shoreSamples];
    const next = generateContours(all, { depths });
    mutate((d) => {
      d.layers.depth.contours = mergeContours(d.layers.depth.contours, next);
      // Contour lines now render their own depth label, so we no longer
      // create separate `DepthLabel` entries for them. Remove any leftover
      // derived labels from earlier versions; manual reference labels stay.
      d.layers.depth.labels = (d.layers.depth.labels ?? []).filter(
        (l) => l.origin !== 'derived',
      );
    });
    setPreviewCount(next.length);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="w-80 rounded-lg border border-water-200 bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-water-900">Generate contours</h2>
        <p className="mt-1 text-xs text-water-700">
          From {soundings.length} depth measurement{soundings.length === 1 ? '' : 's'}
          {includeShoreAsZero && shoreSamples.length > 0
            ? ` + ${shoreSamples.length} shoreline points (= 0 m)`
            : ''}
          . Manual contours are preserved.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs text-water-700">Min depth</span>
            <input
              type="number"
              className="w-full rounded border border-water-200 px-2 py-1"
              value={minDepth}
              onChange={(e) => setMinDepth(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-water-700">Max depth</span>
            <input
              type="number"
              className="w-full rounded border border-water-200 px-2 py-1"
              value={maxDepth}
              onChange={(e) => setMaxDepth(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-water-700">Step</span>
            <input
              type="number"
              className="w-full rounded border border-water-200 px-2 py-1"
              value={step}
              min={0.1}
              onChange={(e) => setStep(Number(e.target.value))}
            />
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-xs text-water-900">
          <input
            type="checkbox"
            checked={includeShoreAsZero}
            onChange={(e) => setIncludeShoreAsZero(e.target.checked)}
            className="mt-0.5 accent-water-600"
          />
          <span>
            Treat water body / shoreline as <strong>0 m</strong> when interpolating.
            Caves are excluded automatically.
          </span>
        </label>
        <p className="mt-2 text-xs text-water-700">
          Will draw {depths.length} levels: {depths.slice(0, 6).join(', ')}
          {depths.length > 6 ? ` … ${depths[depths.length - 1]}` : ''}
        </p>
        {previewCount != null && (
          <p className="mt-1 text-xs text-water-900">Generated {previewCount} polylines.</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm text-water-700 hover:bg-water-100"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="rounded bg-water-600 px-3 py-1.5 text-sm text-white hover:bg-water-700 disabled:bg-water-300"
            onClick={generate}
            disabled={totalSamples < 3 || step <= 0 || maxDepth < minDepth}
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
