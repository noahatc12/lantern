import { useState } from 'react';
import type { Deck, Tier } from '../types';

/**
 * E7 Ladder. The Ask runs on this.
 *
 * Both must opt in to each rung, and one tap of ENOUGH ends it with no
 * discussion. Consent stops being one decision at the start and becomes N small
 * ones, which is both safer and much better paced.
 *
 * The end screen is deliberately neutral and NEVER records who ended it. That
 * is a storage guarantee, not a copy choice: if stopping is attributable, it
 * has a social cost, and then nobody stops.
 */

interface Props {
  deck: Deck & { rungs?: number; rule?: string };
  names: [string, string];
  maxTier: Tier;
  onExit: () => void;
}

export default function LadderGame({ deck, names, maxTier, onExit }: Props) {
  const rungs = [...deck.cards]
    .map((c) => c as typeof c & { rung?: number })
    .filter((c) => c.tier <= maxTier)
    .sort((a, b) => (a.rung ?? 0) - (b.rung ?? 0));

  const [i, setI] = useState(0);
  const [optedIn, setOptedIn] = useState<[boolean, boolean]>([false, false]);
  const [ended, setEnded] = useState(false);

  const card = rungs[i];
  const both = optedIn[0] && optedIn[1];

  if (ended || !card) {
    return (
      <main className="stopped">
        <h1 className="stopped__title">
          {ended ? `You stopped at rung ${i + 1}.` : 'That was the last rung.'}
        </h1>
        <p className="stopped__body">
          No score, and no record of who called it.
        </p>
        <button className="btn" onClick={onExit}>
          Back
        </button>
      </main>
    );
  }

  return (
    <main className="play">
      <header className="play__top">
        <button className="play__back" onClick={onExit} aria-label="Back">
          &larr;
        </button>
        <span className="play__deck">{deck.title}</span>
        <span className="play__tier">
          rung {i + 1} / {rungs.length}
        </span>
      </header>

      <section className="play__stage">
        {!both ? (
          <>
            <p className="card card--quiet">Both of you in for the next rung?</p>
            <div className="optin">
              {names.map((n, idx) => (
                <button
                  key={n}
                  className={`btn optin__btn ${optedIn[idx] ? 'is-on' : ''}`}
                  onClick={() => {
                    const next: [boolean, boolean] = [...optedIn] as [boolean, boolean];
                    next[idx] = true;
                    setOptedIn(next);
                  }}
                >
                  {optedIn[idx] ? `${n} ✓` : n}
                </button>
              ))}
            </div>
            <button className="btn btn--ghost" onClick={() => setEnded(true)}>
              Enough
            </button>
            <p className="play__note">
              Either of you can end it. No reason asked, and nothing is recorded.
            </p>
          </>
        ) : (
          <>
            <p className="card">{card.text}</p>
            {deck.rule && <p className="play__note">{deck.rule}</p>}
            <div className="play__actions">
              <button className="btn btn--ghost" onClick={() => setEnded(true)}>
                Enough
              </button>
              <button
                className="btn btn--primary"
                onClick={() => {
                  setI(i + 1);
                  setOptedIn([false, false]);
                }}
              >
                Next rung
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
