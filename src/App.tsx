import { useEffect, useState } from 'react';

/**
 * Phase 0 shell.
 *
 * Deliberately has no game in it. Its whole job is to report the device facts a
 * headless browser cannot tell us: real safe-area insets, standalone vs browser,
 * whether localStorage actually persists, and whether the crypto the deck
 * encryption depends on exists. Those four have burned previous builds.
 */

type Row = { label: string; value: string; ok?: boolean };

const STORE_KEY = 'lantern.phase0.opens';

function readCssPx(prop: string): string {
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;visibility:hidden;height:${prop}`;
  document.body.appendChild(probe);
  const px = getComputedStyle(probe).height;
  probe.remove();
  return px;
}

type Insets = Record<'top' | 'right' | 'bottom' | 'left', string>;

/** Path 1: env() applied through an inline style attribute. */
function insetsInline(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed',
    'visibility:hidden',
    'top:0;left:0',
    'padding-top:env(safe-area-inset-top)',
    'padding-right:env(safe-area-inset-right)',
    'padding-bottom:env(safe-area-inset-bottom)',
    'padding-left:env(safe-area-inset-left)',
  ].join(';');
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = {
    top: cs.paddingTop,
    right: cs.paddingRight,
    bottom: cs.paddingBottom,
    left: cs.paddingLeft,
  };
  probe.remove();
  return out;
}

/** Path 2: the same env() applied through a stylesheet rule instead. */
function insetsStylesheet(): Insets {
  const probe = document.createElement('div');
  probe.className = 'sa-probe';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = {
    top: cs.paddingTop,
    right: cs.paddingRight,
    bottom: cs.paddingBottom,
    left: cs.paddingLeft,
  };
  probe.remove();
  return out;
}

/**
 * Sentinel. env(safe-area-inset-top, 999px) returns the fallback only when the
 * UA has not defined that variable at all. So 999px means "env undefined here"
 * and 0px means "env defined and genuinely zero" - different bugs, different
 * fixes, and this one number separates them.
 */
function insetSentinel(): { top: string; bottom: string } {
  const probe = document.createElement('div');
  probe.className = 'sa-sentinel';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = { top: cs.paddingTop, bottom: cs.paddingBottom };
  probe.remove();
  return out;
}

function storageProbe(): { ok: boolean; opens: number; note: string } {
  try {
    const prev = Number(localStorage.getItem(STORE_KEY) ?? '0');
    const next = prev + 1;
    localStorage.setItem(STORE_KEY, String(next));
    return {
      ok: true,
      opens: next,
      note: next > 1 ? 'persisted across reloads' : 'first open on this device',
    };
  } catch (err) {
    return { ok: false, opens: 0, note: err instanceof Error ? err.message : 'blocked' };
  }
}

function displayMode(): string {
  const modes = ['standalone', 'minimal-ui', 'fullscreen', 'browser'];
  const hit = modes.find((m) => window.matchMedia(`(display-mode: ${m})`).matches);
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  if (iosStandalone) return 'standalone (iOS home screen)';
  return hit ?? 'unknown';
}

export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [overflow, setOverflow] = useState<number | null>(null);

  useEffect(() => {
    const store = storageProbe();
    const inline = insetsInline();
    const sheet = insetsStylesheet();
    const sentinel = insetSentinel();
    const vv = window.visualViewport;

    const meta = document
      .querySelector('meta[name="viewport"]')
      ?.getAttribute('content');
    const coverPresent = Boolean(meta && meta.includes('viewport-fit=cover'));

    // Derived independently of env(): on a notched phone the window is inset
    // from the physical screen, so the difference is the inset the OS applied,
    // whether or not env() reports it.
    const impliedVertical = window.screen.height - window.innerHeight;

    setRows([
      { label: 'display mode', value: displayMode() },
      {
        label: 'viewport',
        value: `${window.innerWidth} x ${window.innerHeight} css px`,
      },
      {
        label: 'screen',
        value: `${window.screen.width} x ${window.screen.height} css px`,
      },
      {
        label: 'screen - window',
        value: `${impliedVertical}px vertical (inset the OS actually applied)`,
      },
      {
        label: 'visual viewport',
        value: vv ? `${Math.round(vv.width)} x ${Math.round(vv.height)}` : 'unsupported',
      },
      { label: 'device pixel ratio', value: String(window.devicePixelRatio) },
      { label: '100vh resolves to', value: readCssPx('100vh') },
      { label: '100dvh resolves to', value: readCssPx('100dvh') },
      {
        label: 'viewport-fit=cover',
        value: coverPresent ? 'present' : 'MISSING from the meta tag',
        ok: coverPresent,
      },
      {
        label: 'safe area, inline',
        value: `${inline.top} / ${inline.right} / ${inline.bottom} / ${inline.left}`,
      },
      {
        label: 'safe area, stylesheet',
        value: `${sheet.top} / ${sheet.right} / ${sheet.bottom} / ${sheet.left}`,
        // The two paths measure the same thing. Disagreement means the probe is
        // wrong, not the device.
        ok: sheet.top === inline.top && sheet.bottom === inline.bottom,
      },
      {
        label: 'env() sentinel',
        value:
          parseFloat(sentinel.top) === 999
            ? `${sentinel.top} / ${sentinel.bottom} -> env is UNDEFINED here`
            : `${sentinel.top} / ${sentinel.bottom} -> env is defined`,
      },
      {
        label: 'localStorage',
        value: `${store.note} (open #${store.opens})`,
        ok: store.ok,
      },
      {
        label: 'crypto.subtle',
        value: window.crypto?.subtle ? 'available' : 'MISSING (deck encryption needs this)',
        ok: Boolean(window.crypto?.subtle),
      },
      {
        label: 'secure context',
        value: window.isSecureContext ? 'yes' : 'no (crypto.subtle will be unavailable)',
        ok: window.isSecureContext,
      },
      { label: 'touch points', value: String(navigator.maxTouchPoints) },
      { label: 'user agent', value: navigator.userAgent },
    ]);

    const measure = () => {
      const el = document.documentElement;
      setOverflow(el.scrollWidth - el.clientWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <main className="shell">
      <header className="shell__head">
        <span className="dot" aria-hidden="true" />
        <h1>Lantern</h1>
        <p className="shell__sub">Phase 0. Shell only, no games yet.</p>
      </header>

      <section className="panel" aria-label="Device report">
        <h2 className="panel__title">Device report</h2>
        <dl className="rows">
          {rows.map((r) => (
            <div className="row" key={r.label}>
              <dt>{r.label}</dt>
              <dd data-ok={r.ok === undefined ? undefined : String(r.ok)}>{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel" aria-label="Layout check">
        <h2 className="panel__title">Layout check</h2>
        <p className="check" data-ok={overflow === null ? undefined : String(overflow === 0)}>
          {overflow === null
            ? 'measuring...'
            : overflow === 0
              ? 'no horizontal overflow'
              : `HORIZONTAL OVERFLOW: ${overflow}px`}
        </p>
        <p className="hint">
          The band below sits inside the bottom safe area. If it is flush against the home
          indicator or cut off, the inset is not resolving and every bottom sheet will have
          the same bug.
        </p>
      </section>

      <footer className="shell__foot">
        <span>bottom safe-area probe</span>
      </footer>

      {/*
        The decisive test. Numbers told us env() reads 0; they cannot tell us
        whether that is correct. The real question is whether content at the
        bottom of the viewport gets obscured by the home indicator, and looking
        at a marker pinned there answers it directly.

        RAW sits at viewport bottom 0. SAFE sits above env(safe-area-inset-bottom).
        If env() is 0 they overlap exactly. If RAW is cut off or sits under the
        home indicator, we need a manual constant instead of trusting env().
      */}
      <div className="edge edge--safe">
        <span>SAFE inset</span>
      </div>
      <div className="edge edge--raw">
        <span>RAW bottom 0 &mdash; fully visible?</span>
      </div>
    </main>
  );
}
