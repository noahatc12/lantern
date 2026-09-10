import { useState } from 'react';
import type { Deck, Tier } from '../types';
import { playable } from '../lib/deck';
import Empty from '../components/Empty';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';
import Icon from '../components/Icon';

/**
 * E7 Ladder. The Ask runs on this.
 *
 * Both must opt in to each rung, and one tap of Enough ends it with no
 * discussion. Consent stops being one decision at the start and becomes N small
 * ones.
 *
 * The end screen NEVER records or displays who ended it. That is a storage
 * guarantee, not a copy choice: if stopping is attributable it has a social
 * cost, and then nobody stops.
 */

interface Props {
  deck: Deck & { rungs?: number; rule?: string };
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

export default function LadderGame({ deck, names, maxTier, availableProps, onExit }: Props) {
  const rungs = playable(deck.cards, maxTier, availableProps)
    .map((c) => c as typeof c & { rung?: number })
    .sort((a, b) => (a.rung ?? 0) - (b.rung ?? 0));

  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [optedIn, setOptedIn] = useState<[boolean, boolean]>([false, false]);
  const [ended, setEnded] = useState(false);
  const [asker, setAsker] = useState<0 | 1>(0);

  useScreenTop(`${started}-${i}-${optedIn[0]}${optedIn[1]}-${ended}`);

  const card = rungs[i];
  const both = optedIn[0] && optedIn[1];

  if (!started) {
    return (
      <Rules deck={deck} onExit={onExit} onStart={() => setStarted(true)}>
        <p className="play__note">
          {rungs.length} rungs available at this ceiling
          {rungs.length < deck.cards.length && ', raise it for more'}.
        </p>
      </Rules>
    );
  }

  if (rungs.length === 0) {
    return (
      <main className="play">
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <span className="play__deck">{deck.title}</span>
        </header>
        <section className="play__stage">
          <p className="card card--quiet">Nothing available at this ceiling. Raise it.</p>
        </section>
      </main>
    );
  }

  if (!card) {
    return (
      <Empty
        title="That was the last rung."
        body="Raise the ceiling for more, or come back another night."
        onExit={onExit}
      />
    );
  }

  if (ended) {
    return (
      <main className="stopped">
        <h1 className="stopped__title">
          You stopped at rung {i + 1}.
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
          <Icon name="back" size={20} />
        </button>
        <span className="play__deck">{deck.title}</span>
        <span className="play__tier">
          rung {i + 1} / {rungs.length}
        </span>
      </header>

      <section className="play__stage">
        {!both ? (
          <>
            <p className="card card--quiet">Both of you in for rung {i + 1}?</p>
            <div className="optin">
              {names.map((n, idx) => (
                <button
                  key={n}
                  className={`btn optin__btn ${optedIn[idx] ? 'is-on' : ''}`}
                  onClick={() => {
                    const next: [boolean, boolean] = [optedIn[0], optedIn[1]];
                    next[idx] = !next[idx];
                    setOptedIn(next);
                  }}
                >
                  {optedIn[idx] ? `${n} in` : n}
                </button>
              ))}
            </div>
            <button className="btn btn--ghost" onClick={() => setEnded(true)}>
              Enough
            </button>
            <p className="play__note">
              Either of you can end it here. No reason asked, and nothing is recorded.
            </p>
          </>
        ) : (
          <>
            <p className="play__eyebrow">{names[asker]} asks</p>
            <p className="card" key={card.id}>
              {card.text}
            </p>
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
                  setAsker(asker === 0 ? 1 : 0);
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
