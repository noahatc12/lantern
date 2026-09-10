import { useEffect } from 'react';

/**
 * Swipe in from the left edge to go back.
 *
 * The real answer to a control being out of thumb reach is not a bigger button
 * at the top, it is not needing to go there. iOS trained everyone on this
 * gesture and the app is a single page, so the browser's own back does nothing
 * useful; this puts the behaviour back where hands expect it.
 *
 * Ignores anything that starts inside a horizontal scroller, because the filter
 * chips and the level picker both bleed to the left edge and a swipe meant to
 * scroll them would otherwise leave the screen instead.
 */

const EDGE_PX = 28;
const MIN_TRAVEL_PX = 64;
const MAX_DRIFT_PX = 48;
const MAX_MS = 700;

const SCROLLERS = '.filters, .levels, .seals, .stakes__opts, .sides, [data-noswipe]';

export function useEdgeBack(onBack: (() => void) | undefined): void {
  useEffect(() => {
    if (!onBack) return;

    let x = 0;
    let y = 0;
    let at = 0;
    let armed = false;

    function start(e: TouchEvent) {
      const t = e.touches[0];
      if (!t || e.touches.length > 1) {
        armed = false;
        return;
      }
      const target = e.target as Element | null;
      if (target?.closest?.(SCROLLERS)) {
        armed = false;
        return;
      }
      armed = t.clientX <= EDGE_PX;
      x = t.clientX;
      y = t.clientY;
      at = Date.now();
    }

    function end(e: TouchEvent) {
      if (!armed) return;
      armed = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - x;
      const dy = Math.abs(t.clientY - y);
      if (dx >= MIN_TRAVEL_PX && dy <= MAX_DRIFT_PX && Date.now() - at <= MAX_MS) {
        onBack?.();
      }
    }

    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchend', end, { passive: true });
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchend', end);
    };
  }, [onBack]);
}
