import { useEffect, useRef, useState } from 'react';
import type { Deck } from '../types';

/**
 * E6 Timer. The Long Kiss runs on this.
 *
 * Constraint plus duration. Cards carry an `at` in seconds and surface as the
 * clock passes them. There is deliberately no stop button beyond leaving:
 * ending early is the failure mode the timer exists to prevent.
 */

interface Props {
  deck: Deck & { totalSeconds?: number };
  onExit: () => void;
}

export default function TimerGame({ deck, onExit }: Props) {
  const total = deck.totalSeconds ?? 300;
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef<number>(0);

  useEffect(() => {
    if (!running) return;
    started.current = Date.now() - elapsed * 1000;
    const id = setInterval(() => {
      const e = Math.floor((Date.now() - started.current) / 1000);
      setElapsed(e >= total ? total : e);
      if (e >= total) setRunning(false);
    }, 250);
    return () => clearInterval(id);
    // elapsed intentionally excluded: including it restarts the interval every tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, total]);

  const cues = [...deck.cards]
    .map((c) => c as typeof c & { at?: number })
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const current = cues.filter((c) => (c.at ?? 0) <= elapsed).pop() ?? cues[0];

  const left = total - elapsed;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const done = elapsed >= total;

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

        {!running && elapsed === 0 && (
          <>
            <p className="card card--quiet">{deck.blurb}</p>
            <button className="btn btn--primary btn--big" onClick={() => setRunning(true)}>
              Start
            </button>
          </>
        )}

        {running && current && <p className="card">{current.text}</p>}

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
