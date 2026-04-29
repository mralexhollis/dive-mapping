import { useEffect } from 'react';
import { useSiteStore } from '../state/useSiteStore';

const MOBILE_BREAKPOINT_PX = 768;

/**
 * Auto-collapse the toolbar + sidebar on narrow viewports the first time they
 * cross the breakpoint, so the canvas isn't squeezed to nothing on mobile.
 * The user can still toggle panels back on at any time.
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
}
