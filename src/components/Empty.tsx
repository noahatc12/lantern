/**
 * Nothing left to play here.
 *
 * Reachable in one obvious way now that Ease off lowers the ceiling from inside
 * a game: drop below a deck's opening tier and its pool is empty while you are
 * standing in it. Two engines indexed straight into that empty pool and threw,
 * which turns a safety control into a crash. Any engine that deals from a pool
 * needs this screen, so it is one component rather than five near-copies.
 */

import { useScreenTop } from '../lib/useScreenTop';

interface Props {
  title?: string;
  body?: string;
  onExit: () => void;
}

export default function Empty({ title, body, onExit }: Props) {
  // Arriving here is navigation even though the App-level route has not moved:
  // ease off drops the ceiling and the game you are standing in empties out.
  // Without this you land on it at whatever scroll the last screen had.
  useScreenTop('empty');

  return (
    <main className="stopped" data-screen="empty">
      <h1 className="stopped__title">{title ?? 'Nothing here at this ceiling.'}</h1>
      <p className="stopped__body">
        {body ?? 'Raise it back up when you both want to, or pick something else.'}
      </p>
      <button className="btn btn--big" onClick={onExit}>
        Back
      </button>
    </main>
  );
}
