import { createContext, useContext } from 'react';

/**
 * "This game was actually started", reported by the one screen that knows.
 *
 * Every engine opens on the shared Rules component and none of them starts any
 * other way, so Rules is the single place where "reading about it" becomes
 * "playing it". App provides the sink; Rules calls it. The alternative was a
 * duration threshold in App, which is a guess about the same fact and gets both
 * ends wrong.
 */
export const StartedContext = createContext<(deckId: string) => void>(() => {});

export function useNoteStart(): (deckId: string) => void {
  return useContext(StartedContext);
}
