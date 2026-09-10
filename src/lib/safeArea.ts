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
 * The top inset was left at whatever env() said until 2026-09-10, when Noah
 * reported the navigation buttons being hard to reach on an iPhone 14 because
 * of the notch. Same failure as the bottom, one edge over, and it hid for
 * longer because nothing up there gets visibly struck through.
 *
 * Re-check when iOS changes. If a future version reports correctly, the shim
 * becomes a no-op on its own, because env() would then exceed the floor.
 */

const IOS_HOME_INDICATOR_PX = 34;
const DEFAULT_FLOOR_PX = 16;

/**
 * The top has the same problem as the bottom, and it went unnoticed for longer
 * because nothing is visibly struck through up there. env() reports 0 on this
 * device while the notch and the status bar still occupy the strip, so any
 * screen that trusted --safe-top put its back button under them.
 *
 * 47 is the notched iPhone status-bar inset in portrait. A Dynamic Island phone
 * wants 59, and the two cannot be told apart from JavaScript with any
 * reliability, so this errs 12px low there rather than costing every other
 * device 12px of screen. Same trade the bottom makes, in the same direction:
 * cheap when wrong, and the layout adds its own margin on top.
 */
const IOS_NOTCH_PX = 47;

/** Enough that a control is never flush against the top edge on anything. */
const TOP_FLOOR_PX = 12;

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
  standalone: boolean;
}

export function installSafeAreaVars(): SafeAreaResult {
  const envTop = envPx('top');
  const envBottom = envPx('bottom');

  // Not gated on standalone. Safari hides its toolbar on scroll, which lets
  // content reach the same strip, and over-reserving costs a few pixels while
  // under-reserving puts a button under the indicator.
  const needsShim = envBottom === 0 && hasHomeIndicator();
  const bottom = needsShim
    ? IOS_HOME_INDICATOR_PX
    : Math.max(envBottom, DEFAULT_FLOOR_PX);

  const topShimmed = envTop === 0 && hasHomeIndicator();
  const top = topShimmed ? IOS_NOTCH_PX : Math.max(envTop, TOP_FLOOR_PX);

  const root = document.documentElement;
  root.style.setProperty('--safe-bottom', `${bottom}px`);
  root.style.setProperty('--safe-top', `${top}px`);

  return {
    top,
    bottom,
    shimmed: needsShim || topShimmed,
    standalone: isStandalone(),
  };
}
