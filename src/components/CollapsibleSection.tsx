import { useEffect, useState, type ReactNode } from 'react';

interface CollapsibleSectionProps {
  /** Heading text shown in the bar. */
  title: string;
  /** Children render below the header when expanded. */
  children: ReactNode;
  /**
   * Stable key used to persist open/closed state in localStorage. Different
   * sections must use distinct ids; falsy disables persistence (purely
   * in-memory state).
   */
  storageKey?: string;
  /** Initial open state when there's nothing in localStorage. Defaults to true. */
  defaultOpen?: boolean;
  /** Optional element rendered next to the title (e.g. a status badge). */
  rightAdornment?: ReactNode;
}

/**
 * A simple disclosure section with a clickable header. Used to compose the
 * viewer's right-hand sidebar: each panel (profile, graph, inspector,
 * layers) wraps itself in one of these so divers can fold sections away
 * without losing their selection.
 */
export default function CollapsibleSection({
  title,
  children,
  storageKey,
  defaultOpen = true,
  rightAdornment,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState<boolean>(() => {
    if (!storageKey) return defaultOpen;
    try {
      const v = localStorage.getItem(storageKey);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch {
      // localStorage unavailable; fall back to the default.
    }
    return defaultOpen;
  });

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, open ? '1' : '0');
    } catch {
      // ignore — non-critical persistence
    }
  }, [open, storageKey]);

  return (
    <section className="border-b border-water-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 bg-water-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-water-700 hover:bg-water-100"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="inline-block w-3 text-water-500" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
          <span className="truncate">{title}</span>
        </span>
        {rightAdornment != null && (
          <span className="shrink-0 text-[11px] font-normal normal-case text-water-600">
            {rightAdornment}
          </span>
        )}
      </button>
      {open && <div>{children}</div>}
    </section>
  );
}
