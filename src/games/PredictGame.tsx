import { useState } from 'react';
import type { Deck, Tier } from '../types';
import { playable } from '../lib/deck';
import Empty from '../components/Empty';
import Handoff from '../components/Handoff';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';
import Icon from '../components/Icon';
import { useNavState } from '../lib/transition';

/**
 * E2 Predict, authored variant. Two Truths and a Turn-On runs on this.
 *
 * The deniability is the mechanic: you are not confessing, you are playing a
 * guessing game that happens to contain a real answer. Nothing is stored.
 *
 * Swapping genuinely swaps: the writer alternates AND a new prompt is drawn.
 * Previously both were frozen for the life of the component, so "Swap" replayed
 * the identical round with the same person writing.
 */

interface Props {
  deck: Deck & { slotCount?: number };
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

/**
 * The round's three lines live outside the phase on purpose.
 *
 * They used to be carried inside it, which was tidy right up until the phase
 * became the thing that drives a screen cross-fade: every keystroke in a slot
 * was then a navigation, so typing a sentence flashed the whole screen once per
 * letter and raced the transition it had just started. What is on screen and
 * what has been typed into it are two different pieces of state and only one of
 * them is a screen.
 */
type Phase =
  | { step: 'rules' }
  | { step: 'prompt' }
  | { step: 'write' }
  | { step: 'handoff' }
  | { step: 'guess' }
  | { step: 'reveal'; picked: number };

export default function PredictGame({ deck, names, maxTier, availableProps, onExit }: Props) {
  const slotCount = deck.slotCount ?? 3;
  const pool = playable(deck.cards, maxTier, availableProps);

  const [phase, setPhase] = useNavState<Phase>({ step: 'rules' });
  const [slots, setSlots] = useState<string[]>(() => Array(slotCount).fill(''));
  const [real, setReal] = useState<number | null>(null);
  const [writer, setWriter] = useState<0 | 1>(0);
  const [used, setUsed] = useState<string[]>([]);
  const [prompt, setPrompt] = useState(() => pool[Math.floor(Math.random() * pool.length)]);

  /** Fresh prompt each round, avoiding repeats until the pool is spent. */
  function nextPrompt() {
    const unseen = pool.filter((c) => !used.includes(c.id));
    const from = unseen.length > 0 ? unseen : pool;
    const picked = from[Math.floor(Math.random() * from.length)];
    setUsed(unseen.length > 0 ? [...used, picked?.id ?? ''] : [picked?.id ?? '']);
    setPrompt(picked);
  }

  const back = (
    <button className="play__back" onClick={onExit} aria-label="Back">
      <Icon name="back" size={20} />
    </button>
  );

  useScreenTop(phase.step);

  // Same as the sorting engines: the ceiling can fall out from under a round
  // that is already open, and indexing an empty pool threw rather than saying so.
  if (!prompt) return <Empty onExit={onExit} />;

  if (phase.step === 'rules') {
    return <Rules deck={deck} onExit={onExit} onStart={() => setPhase({ step: 'prompt' })} />;
  }

  if (!prompt) {
    return (
      <main className="play">
        <header className="play__top">
          {back}
          <span className="play__deck">{deck.title}</span>
        </header>
        <section className="play__stage">
          <p className="card card--quiet">Nothing available at this tier. Raise the ceiling.</p>
        </section>
      </main>
    );
  }

  if (phase.step === 'prompt') {
    return (
      <main className="play">
        <header className="play__top">
          {back}
          <span className="play__deck">{deck.title}</span>
          <span className="play__tier">tier {prompt.tier}</span>
        </header>
        <section className="play__stage">
          <p className="play__eyebrow">{names[writer]} writes</p>
          <p className="card" key={prompt.id}>
            {prompt.text}
          </p>
          <p className="play__note">
            Make the real one something you actually mean, or the round does nothing.
          </p>
          <button
            className="btn btn--primary btn--big"
            onClick={() =>
              {
                setSlots(Array(slotCount).fill(''));
                setReal(null);
                setPhase({ step: 'write' });
              }
            }
          >
            {names[writer]} is ready
          </button>
        </section>
      </main>
    );
  }

  if (phase.step === 'write') {
    const filled = slots.every((s) => s.trim().length > 0);
    return (
      <main className="play">
        <header className="play__top">
          {back}
          <span className="play__deck">{names[writer]}, privately</span>
        </header>
        <section className="play__stage play__stage--form">
          <div className="reminder">
            <p className="reminder__label">writing about</p>
            <p className="reminder__text">{prompt.text}</p>
          </div>
          <p className="play__note">
            Two lines true but unremarkable. One line the real answer. Mark the real one.
          </p>
          {slots.map((s, i) => (
            <label key={i} className="slot">
              <span className="slot__n">{i + 1}</span>
              <input
                className="slot__input"
                value={s}
                placeholder={i === slotCount - 1 ? 'and another' : 'something about you'}
                onChange={(e) => {
                  const next = [...slots];
                  next[i] = e.target.value;
                  setSlots(next);
                }}
              />
              <button
                type="button"
                className={`slot__mark ${real === i ? 'is-on' : ''}`}
                onClick={() => setReal(i)}
                aria-label={`Mark line ${i + 1} as the real one`}
              >
                {real === i ? 'real' : 'mark'}
              </button>
            </label>
          ))}
          <p className="play__note">
            Tap mark on the real one. {names[writer === 0 ? 1 : 0]} never sees the mark.
          </p>
          <button
            className="btn btn--primary"
            disabled={!filled || real === null}
            onClick={() =>
              setPhase({ step: 'handoff' })
            }
          >
            {filled && real !== null ? 'Done' : 'Fill all three and mark one'}
          </button>
        </section>
      </main>
    );
  }

  if (phase.step === 'handoff') {
    return (
      <Handoff
        to={names[writer === 0 ? 1 : 0]}
        onContinue={() => setPhase({ step: 'guess' })}
      />
    );
  }

  if (phase.step === 'guess') {
    return (
      <main className="play">
        <header className="play__top">
          {back}
          <span className="play__deck">
            {names[writer === 0 ? 1 : 0]}, which one is real?
          </span>
        </header>
        <section className="play__stage">
          <div className="guesses">
            {slots.map((s, i) => (
              <button
                key={i}
                className="guess"
                onClick={() => setPhase({ step: 'reveal', picked: i })}
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const right = phase.step === 'reveal' && phase.picked === real;
  return (
    <main className="play">
      <header className="play__top">
        {back}
        <span className="play__deck">{right ? 'Correct' : 'Not that one'}</span>
      </header>
      <section className="play__stage">
        <p className="play__kind">the real one</p>
        <p className="card">{real === null ? '' : slots[real]}</p>
        <p className="play__note">
          Ask one follow-up question about it. The question is the point, not the score.
        </p>
        <button
          className="btn btn--primary"
          onClick={() => {
            setWriter(writer === 0 ? 1 : 0);
            nextPrompt();
            setPhase({ step: 'prompt' });
          }}
        >
          Swap, {names[writer === 0 ? 1 : 0]} writes
        </button>
      </section>
    </main>
  );
}
