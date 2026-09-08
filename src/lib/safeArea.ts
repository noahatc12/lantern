/**
 * Safe-area shim.
 *
 * MEASURED, not assumed. iPhone 14, iOS 18.7, Safari 26.6.1, 2026-09-07:
 *
 *   viewport-fit=cover .......... present in the served meta tag
 *   env() sentinel .............. defined (not missing, not unsupported)
 *   env(safe-area-inset-*) ...... 0px on all four sides
 *   home indicator .............. still physically overlays content at bottom:0
 *
 * So env() is defined and wrong: it reports no inset while the OS continues to
 * reserve the strip. A visual probe pinned to bottom:0 was struck through by the
 * indicator. Both an inline-style and a stylesheet measurement path agreed on 0,
 * which rules out the probe being at fault.
 *
 * Consequence: env() cannot be trusted as the sole source on this platform.
 * This installs --safe-bottom / --safe-top as the single place layout reads
 * from, using env() where it reports something usable and a measured constant
 * where it does not.
 *
 * Re-check when iOS changes. If a future version reports correctly, the shim
 * becomes a no-op on its own, because env() would then exceed the floor.
 */

const IOS_HOME_INDICATOR_PX = 34;
const DEFAULT_FLOOR_PX = 16;

function envPx(side: 'top' | 'bottom'): number {
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;visibility:hidden;top:0;left:0;padding-${side}:env(safe-area-inset-${side})`;
  document.body.appendChild(probe);
  const raw = getComputedStyle(probe)[side === 'top' ? 'paddingTop' : 'paddingBottom'];
  probe.remove();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function isStandalone(): boolean {
  if ((window.navigator as { standalone?: boolean }).standalone === true) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Macintosh, so touch points disambiguate it.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * True for devices with a gesture bar rather than a home button. 812 css px is
 * the shortest such iPhone (X, 11 Pro, 12 mini at 780). Using screen height is
 * crude but it only ever costs a few extra pixels of bottom padding when wrong,
 * whereas being wrong the other way puts a button under the indicator.
 */
function hasHomeIndicator(): boolean {
  return isIOS() && Math.max(window.screen.width, window.screen.height) >= 780;
}

export interface SafeAreaResult {
  top: number;
  bottom: number;
  shimmed: boolean;
}

export function installSafeAreaVars(): SafeAreaResult {
  const envTop = envPx('top');
  const envBottom = envPx('bottom');

  const needsShim = envBottom === 0 && hasHomeIndicator() && isStandalone();
  const bottom = needsShim
    ? IOS_HOME_INDICATOR_PX
    : Math.max(envBottom, DEFAULT_FLOOR_PX);
  const top = Math.max(envTop, 0);

  const root = document.documentElement;
  root.style.setProperty('--safe-bottom', `${bottom}px`);
  root.style.setProperty('--safe-top', `${top}px`);

  return { top, bottom, shimmed: needsShim };
}
