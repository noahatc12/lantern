import { useEffect } from 'react';

/**
 * Scroll to the top whenever the given key changes.
 *
 * App-level navigation already resets scroll, but a "screen" is not only an
 * App-level route. Every game is a small state machine whose phases are
 * full-screen views, and moving between them kept the previous scroll
 * position. So the rules screen, which is long and scrollable, dropped you
 * partway down the game when you started it.
 *
 * The monkey caught this within 250 random interactions, immediately after I
 * had "fixed" the same bug one level up. Point fixes address the instance;
 * this addresses the class.
 */
export function useScreenTop(key: unknown): void {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.scrollingElement?.scrollTo(0, 0);
  }, [key]);
}
