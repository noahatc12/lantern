import { useState } from 'react';
import type { Deck, Tier } from '../types';
import Handoff from '../components/Handoff';

/**
 * E2 Predict, authored variant. Two Truths and a Turn-On runs on this.
 *
 * The deniability is the mechanic: you are not confessing, you are playing a
 * guessing game that happens to contain a real answer. Nothing is stored.
 */

interface Props {
  deck: Deck & { slotCount?: number };
  names: [string, string];
  maxTier: Tier;
  onExit: () => void;
}

type Phase =
  | { step: 'prompt' }
  | { step: 'write'; slots: string[]; real: number | null }
  | { step: 'handoff'; slots: string[]; real: number }
  | { step: 'guess'; slots: string[]; real: number }
  | { step: 'reveal'; slots: string[]; real: number; picked: number };

export default function PredictGame({ deck, names, maxTier, onExit }: Props) {
  const slotCount = deck.slotCount ?? 3;
  const pool = deck.cards.filter((c) => c.tier <= maxTier);
  const [prompt] = useState(() => pool[Math.floor(Math.random() * pool.length)] ?? deck.cards[0]!);
  const [phase, setPhase] = useState<Phase>({ step: 'prompt' });

  const back = (
    <button className="play__back" onClick={onExit} aria-label="Back">
      &larr;
    </button>
  );

  if (phase.step === 'prompt') {
    return (
      <main className="play">
        <header className="play__top">
          {back}
          <span className="play__deck">{deck.title}</span>
        </header>
        <section className="play__stage">
          <p className="card">{prompt.text}</p>
          <p className="play__note">
            {names[0]} writes. Make the real one something you actually mean, or the
            game does nothing.
          </p>
          <button
            className="btn btn--primary btn--big"
            onClick={() =>
              setPhase({ step: 'write', slots: Array(slotCount).fill(''), real: null })
            }
          >
            Start
          </button>
        </section>
      </main>
    );
  }

  if (phase.step === 'write') {
    const filled = phase.slots.every((s) => s.trim().length > 0);
    return (
      <main className="play">
        <header className="play__top">
          {back}
          <span className="play__deck">{names[0]}, privately</span>
        </header>
        <section className="play__stage play__stage--form">
          {phase.slots.map((s, i) => (
            <label key={i} className="slot">
              <span className="slot__n">{i + 1}</span>
              <input
                className="slot__input"
                value={s}
                placeholder={i === 0 ? 'something true' : i === 1 ? 'something true' : 'the real one'}
                onChange={(e) => {
                  const slots = [...phase.slots];
                  slots[i] = e.target.value;
                  setPhase({ ...phase, slots });
                }}
              />
              <button
                type="button"
                className={`slot__mark ${phase.real === i ? 'is-on' : ''}`}
                onClick={() => setPhase({ ...phase, real: i })}
                aria-label={`Mark ${i + 1} as the real one`}
              >
                {phase.real === i ? 'real' : 'mark'}
              </button>
            </label>
          ))}
          <p className="play__note">Mark which one is real. They will not see the mark.</p>
          <button
            className="btn btn--primary"
            disabled={!filled || phase.real === null}
            onClick={() =>
              setPhase({ step: 'handoff', slots: phase.slots, real: phase.real as number })
            }
          >
            Done
          </button>
        </section>
      </main>
    );
  }

  if (phase.step === 'handoff') {
    return (
      <Handoff
        to={names[1]}
        onContinue={() => setPhase({ step: 'guess', slots: phase.slots, real: phase.real })}
      />
    );
  }

  if (phase.step === 'guess') {
    return (
      <main className="play">
        <header className="play__top">
          {back}
          <span className="play__deck">{names[1]}, which is real?</span>
        </header>
        <section className="play__stage">
          <div className="guesses">
            {phase.slots.map((s, i) => (
              <button
                key={i}
                className="guess"
                onClick={() => setPhase({ ...phase, step: 'reveal', picked: i })}
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const right = phase.picked === phase.real;
  return (
    <main className="play">
      <header className="play__top">
        {back}
        <span className="play__deck">{right ? 'Correct' : 'Not that one'}</span>
      </header>
      <section className="play__stage">
        <p className="play__kind">the real one</p>
        <p className="card">{phase.slots[phase.real]}</p>
        <p className="play__note">
          One follow-up question, then swap. The question is the point, not the score.
        </p>
        <button className="btn btn--primary" onClick={() => setPhase({ step: 'prompt' })}>
          Swap
        </button>
      </section>
    </main>
  );
}
