import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { flushSync } from 'react-dom';

/**
 * Cross-fade between screens instead of cutting between them.
 *
 * Entrance animations alone are a jump cut: the old screen is gone in a single
 * frame and the new one fades up from nothing, so every navigation has a hole
 * in the middle of it. That hole is what reads as "not smooth", and no amount
 * of easing on the entrance fixes it, because the problem is the exit that was
 * never there.
 *
 * The View Transitions API does the exit properly. It snapshots the page,
 * applies the state change, snapshots again, and cross-fades the two, which is
 * the one thing that cannot be done from React state alone without keeping the
 * outgoing screen mounted and threading an exit class through twenty
 * components.
 *
 * `flushSync` is required and is the whole trick: the browser has to see the new
 * DOM synchronously inside the callback, and React's normal batching would
 * apply it after the snapshot was taken.
 *
 * Unsupported browsers and anyone who asked their phone for less motion get the
 * plain state change, which is exactly what the app did before this existed.
 */

interface ViewTransition {
  finished?: Promise<void>;
  ready?: Promise<void>;
  updateCallbackDone?: Promise<void>;
}

type Doc = Document & {
  startViewTransition?: (cb: () => void) => ViewTransition;
};

function wants(): boolean {
  const doc = document as Doc;
  if (typeof doc.startViewTransition !== 'function') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Run a navigation state change as a cross-fade where the browser can. */
export function withTransition(fn: () => void): void {
  if (!wants()) {
    fn();
    return;
  }
  const transition = (document as Doc).startViewTransition!(() => {
    flushSync(fn);
  });

  // Tapping through the app faster than a transition can finish is normal, and
  // the browser handles it correctly by abandoning the old one. It also rejects
  // that transition's promises, and nobody is awaiting them, so without this
  // every quick double tap raised an unhandled AbortError. The state change has
  // already happened by then; there is genuinely nothing to recover from.
  const hush = (pending?: Promise<void>) => {
    if (pending) void pending.catch(() => {});
  };
  hush(transition.finished);
  hush(transition.ready);
  hush(transition.updateCallbackDone);
}

/**
 * useState for the piece of state that decides which screen is showing.
 *
 * Swapping this in is what makes every phase change inside a game transition
 * too, without touching the dozens of call sites that set it.
 */
export function useNavState<T>(initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);

  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    withTransition(() => setValue(next));
  }, []);

  return [value, set];
}
