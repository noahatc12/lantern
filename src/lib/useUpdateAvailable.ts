import { useEffect, useState } from 'react';

declare const __BUILD_ID__: string;

/**
 * Detects that a newer build has been deployed.
 *
 * iOS caches an installed home-screen web app aggressively, so a reopened app
 * can keep serving an old bundle indefinitely. The workaround is to close it
 * fully from the app switcher, which Noah needed telling four separate times.
 * That is a defect in the app, not in the user.
 *
 * Checks on mount and whenever the app is brought back to the foreground, which
 * is exactly when a stale bundle would otherwise be served. Deliberately does
 * NOT reload on its own: a reload mid-session would drop whatever you were in
 * the middle of, and this app has screens you would not want interrupted.
 */
export function useUpdateAvailable(): boolean {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (cancelled || stale) return;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (!cancelled && id && id !== __BUILD_ID__) setStale(true);
      } catch {
        // Offline, or the file is not there yet. Silence is correct: a failed
        // check must never look like an available update.
      }
    }

    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [stale]);

  return stale;
}
