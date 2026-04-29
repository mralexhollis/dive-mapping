import { useState } from 'react';
import { useSiteStore } from '../../state/useSiteStore';
import { generateContours, mergeContours } from '../../domain/contours';
import type { DepthSounding } from '../../domain/types';

interface Props {
  onClose: () => void;
}

export default function ContourGeneratorDialog({ onClose }: Props) {
  const soundings = useSiteStore((s) => s.site.layers.measurements.soundings);
  const shoreline = useSiteStore((s) => s.site.layers.waterBody.shoreline);
  const mutate = useSiteStore((s) => s.mutateSite);
  const [minDepth, setMinDepth] = useState(0);
  const [maxDepth, setMaxDepth] = useState(20);
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
      // Replace any auto-derived depth labels; preserve manual ones.
      const manual = (d.layers.depth.labels ?? []).filter((l) => l.origin !== 'derived');
      const derived = next
        .filter((c) => c.points.length > 0)
        .map((c) => {
          const mid = c.points[Math.floor(c.points.length / 2)]!;
          return {
            id: crypto.randomUUID(),
            x: mid.x,
            y: mid.y,
            depth: c.depth,
            origin: 'derived' as const,
            kind: 'contour' as const,
          };
        });
      d.layers.depth.labels = [...manual, ...derived];
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
