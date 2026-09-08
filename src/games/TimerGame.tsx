import { useEffect, useRef, useState } from 'react';
import type { Deck } from '../types';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';

/**
 * E6 Timer. The Long Kiss runs on this.
 *
 * Cards carry an `at` in seconds and surface as the clock passes them. There is
 * deliberately no pause: ending early is the failure mode the timer exists to
 * prevent, and a pause button is just a slower way to do it. Leaving the game
 * is always possible via back, which is an explicit choice rather than a nudge.
 */

interface Props {
  deck: Deck & { totalSeconds?: number };
  onExit: () => void;
}

export default function TimerGame({ deck, onExit }: Props) {
  const total = deck.totalSeconds ?? 300;
  const [started, setStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const origin = useRef(0);

  useEffect(() => {
    if (!running) return;
    origin.current = Date.now() - elapsed * 1000;
    const id = setInterval(() => {
      const e = Math.floor((Date.now() - origin.current) / 1000);
      if (e >= total) {
        setElapsed(total);
        setRunning(false);
      } else {
        setElapsed(e);
      }
    }, 250);
    return () => clearInterval(id);
    // elapsed is read once when the interval starts; including it would restart
    // the interval every tick and drift the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, total]);

  const cues = [...deck.cards]
    .map((c) => c as typeof c & { at?: number })
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const current = cues.filter((c) => (c.at ?? 0) <= elapsed).pop() ?? cues[0];
  const upcoming = cues.find((c) => (c.at ?? 0) > elapsed);

  const left = total - elapsed;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const done = elapsed >= total;
  const pct = Math.min(100, (elapsed / total) * 100);

  useScreenTop(`${started}-${running}`);

  if (!started) {
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => setStarted(true)}
        startLabel="Got it"
      >
        <p className="play__note">
          {Math.round(total / 60)} minutes, {cues.length} instructions.
        </p>
      </Rules>
    );
  }

  return (
    <main className="play">
      <header className="play__top">
        <button className="play__back" onClick={onExit} aria-label="Back">
          &larr;
        </button>
        <span className="play__deck">{deck.title}</span>
      </header>

      <section className="play__stage">
        <p className="clock" aria-live="off">
          {done ? 'done' : `${mm}:${ss}`}
        </p>

        {running && (
          <div className="bar" aria-hidden="true">
            <div className="bar__fill" style={{ width: `${pct}%` }} />
          </div>
        )}

        {!running && elapsed === 0 && (
          <>
            <p className="card card--quiet">
              Put the phone where you can both see it. Do not stop before the clock does.
            </p>
            <button className="btn btn--primary btn--big" onClick={() => setRunning(true)}>
              Start the clock
            </button>
          </>
        )}

        {running && current && (
          <>
            <p className="card">{current.text}</p>
            {upcoming && (
              <p className="play__note">
                next change in {(upcoming.at ?? 0) - elapsed}s
              </p>
            )}
          </>
        )}

        {done && (
          <>
            <p className="card card--quiet">That was longer than it sounded.</p>
            <button
              className="btn"
              onClick={() => {
                setElapsed(0);
                setRunning(false);
              }}
            >
              Again
            </button>
          </>
        )}
      </section>
    </main>
  );
}
