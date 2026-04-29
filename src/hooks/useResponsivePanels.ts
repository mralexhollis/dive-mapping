import { useEffect, useRef } from 'react';
import { useSiteStore } from '../state/useSiteStore';

const MOBILE_BREAKPOINT_PX = 768;

/**
 * Auto-collapse the toolbar + sidebar on narrow viewports the first time they
 * cross the breakpoint, so the canvas isn't squeezed to nothing on mobile.
 * The user can still toggle panels back on at any time.
 *
 * Also pops the sidebar (Inspector + Layers) open the moment a selection is
 * made, so users discover where the Inspector lives on mobile without
 * hunting for the toggle.
 */
export function useResponsivePanels(): void {
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const apply = (mobile: boolean) => {
      const store = useSiteStore.getState();
      store.setToolbarCollapsed(mobile);
      store.setSidebarCollapsed(mobile);
    };
    apply(mq.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // Auto-open the sidebar when the user makes a selection. Tracks the previous
  // selection length so we only react to "0 → non-zero" transitions, not on
  // every selection change.
  const prevHadSelection = useRef(false);
  useEffect(() => {
    return useSiteStore.subscribe((state) => {
      const has = state.editor.selection.length > 0;
      if (has && !prevHadSelection.current && state.editor.sidebarCollapsed) {
        state.setSidebarCollapsed(false);
      }
      prevHadSelection.current = has;
    });
  }, []);
}
