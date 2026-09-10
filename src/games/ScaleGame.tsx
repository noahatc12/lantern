import { useMemo, useState } from 'react';
import type { Card, Deck, Tier } from '../types';
import { mulberry32, playable, shuffle } from '../lib/deck';
import Handoff from '../components/Handoff';
import Empty from '../components/Empty';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';
import Icon from '../components/Icon';

/**
 * E5 Scale. Both rate the same thing 0 to 10, and the GAP is revealed before
 * the numbers.
 *
 * Gap-first is deliberate. Showing the raw numbers first makes it a comparison
 * of who wanted it more; showing the distance first keeps attention on the
 * difference, which is the only actionable part.
 */

interface Props {
  deck: Deck & { explainThreshold?: number };
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

type Phase =
  | { step: 'rules' }
  | { step: 'rate'; who: 0 | 1; first: number | null }
  | { step: 'handoff'; first: number }
  | { step: 'gap'; a: number; b: number; shown: boolean };

const VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function ScaleGame({ deck, names, maxTier, availableProps, onExit }: Props) {
  const threshold = deck.explainThreshold ?? 4;
  const pool = useMemo(
    () =>
      shuffle(
        playable(deck.cards, maxTier, availableProps),
        mulberry32(Date.now() & 0xffffffff),
      ),
    [deck, maxTier, availableProps],
  );

  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>({ step: 'rules' });
  useScreenTop(`${phase.step}-${i}`);

  const card: Card | undefined = pool[i];

  if (phase.step === 'rules') {
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => setPhase({ step: 'rate', who: 0, first: null })}
        startLabel={`${names[0]} rates first`}
      >
        <p className="play__note">{pool.length} to rate at this ceiling.</p>
      </Rules>
    );
  }

  if (!card) {
    return (
      <Empty
        title="That is all of them."
        body="Raise the ceiling for more, or come back another night."
        onExit={onExit}
      />
    );
  }

  if (phase.step === 'handoff') {
    return (
      <Handoff to={names[1]} onContinue={() => setPhase({ step: 'rate', who: 1, first: phase.first })} />
    );
  }

  if (phase.step === 'rate') {
    return (
      <main className="play">
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <span className="play__deck">{names[phase.who]}, privately</span>
          <span className="play__tier">
            {i + 1} / {pool.length}
          </span>
        </header>
        <section className="play__stage">
          <p className="card">{card.text}</p>
          <p className="play__note">0 is not for me. 10 is yes, tonight.</p>
          <div className="scale">
            {VALUES.map((v) => (
              <button
                key={v}
                className="scale__btn"
                onClick={() => {
                  if (phase.who === 0) setPhase({ step: 'handoff', first: v });
                  else setPhase({ step: 'gap', a: phase.first as number, b: v, shown: false });
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const gap = Math.abs(phase.a - phase.b);
  const both = Math.min(phase.a, phase.b);

  return (
    <main className="play">
      <header className="play__top">
        <button className="play__back" onClick={onExit} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <span className="play__deck">{deck.title}</span>
      </header>
      <section className="play__stage">
        <p className="card card--quiet">{card.text}</p>
        {!phase.shown ? (
          <>
            <p className="gapnum">{gap}</p>
            <p className="play__note">
              {gap === 0
                ? 'You rated it identically.'
                : `You are ${gap} apart.`}
              {gap >= threshold && ' Worth one sentence each on why.'}
            </p>
            <button
              className="btn btn--primary"
              onClick={() => setPhase({ ...phase, shown: true })}
            >
              Show the numbers
            </button>
          </>
        ) : (
          <>
            <div className="scores">
              <div>
                <p className="compare__name">{names[0]}</p>
                <p className="gapnum gapnum--small">{phase.a}</p>
              </div>
              <div>
                <p className="compare__name">{names[1]}</p>
                <p className="gapnum gapnum--small">{phase.b}</p>
              </div>
            </div>
            <p className="play__note">
              {both >= 7
                ? 'You both want this. It belongs on the shortlist.'
                : both <= 3
                  ? 'Neither of you is keen. Let it go.'
                  : 'Lukewarm from at least one of you.'}
            </p>
            <button
              className="btn btn--primary"
              onClick={() => {
                setI(i + 1);
                setPhase({ step: 'rate', who: 0, first: null });
              }}
            >
              Next
            </button>
          </>
        )}
      </section>
    </main>
  );
}
