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

function safeAreaInsets(): Record<'top' | 'right' | 'bottom' | 'left', string> {
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
    const inset = safeAreaInsets();
    const vv = window.visualViewport;

    setRows([
      { label: 'display mode', value: displayMode() },
      {
        label: 'viewport',
        value: `${window.innerWidth} x ${window.innerHeight} css px`,
      },
      {
        label: 'visual viewport',
        value: vv ? `${Math.round(vv.width)} x ${Math.round(vv.height)}` : 'unsupported',
      },
      { label: 'device pixel ratio', value: String(window.devicePixelRatio) },
      { label: '100vh resolves to', value: readCssPx('100vh') },
      { label: '100dvh resolves to', value: readCssPx('100dvh') },
      {
        label: 'safe area (t/r/b/l)',
        value: `${inset.top} / ${inset.right} / ${inset.bottom} / ${inset.left}`,
        ok: parseFloat(inset.bottom) > 0 || undefined,
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
    </main>
  );
}
