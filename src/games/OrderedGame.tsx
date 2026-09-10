import { useEffect, useRef, useState } from 'react';
import type { Card, Deck, Tier } from '../types';
import { playable } from '../lib/deck';
import { isProgress, read, remove, write } from '../lib/storage';
import type { Progress } from '../lib/storage';
import Empty from '../components/Empty';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';
import Icon from '../components/Icon';

/**
 * E19 Ordered. A fixed sequence, in acts, that survives being put down.
 *
 * The order is the mechanism rather than a convenience: the late questions work
 * because the early ones came first, and shuffling turns a ramp into a pile. So
 * nothing here randomises, and the deck's own order is the order.
 *
 * Both people answer out loud, which is why this is not the compare engine.
 * Typing thirty six answers into a phone is a different and much worse evening,
 * and the protocol this implements is a conversation.
 *
 * Progress persists, because forty five to ninety minutes is more than one
 * sitting for most people and a sequence that forgets where you were is not a
 * sequence. It is the only thing saved. No answers, ever.
 */

interface Props {
  deck: Deck & { acts?: number; finaleSeconds?: number; resumable?: boolean };
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

type ActCard = Card & { act?: number };

type Phase =
  | { step: 'rules' }
  | { step: 'asking' }
  | { step: 'break'; after: number }
  | { step: 'finale' }
  | { step: 'done' };

export default function OrderedGame({ deck, names, maxTier, availableProps, onExit }: Props) {
  const key = `progress.${deck.id}`;
  const finaleSeconds = deck.finaleSeconds ?? 0;

  // No shuffle, ever. Only the ceiling and the props narrow it.
  const pool = playable(deck.cards, maxTier, availableProps) as ActCard[];

  const saved = read<Progress | null>(key, null, isProgress);
  const [i, setI] = useState(saved?.i ?? 0);
  const [phase, setPhase] = useState<Phase>({ step: 'rules' });
  const [left, setLeft] = useState(finaleSeconds);
  const origin = useRef(0);

  const running = phase.step === 'finale';

  useScreenTop(`${phase.step}-${i}`);

  useEffect(() => {
    if (!running) return;
    origin.current = Date.now();
    setLeft(finaleSeconds);
    const id = setInterval(() => {
      const gone = Math.floor((Date.now() - origin.current) / 1000);
      setLeft(Math.max(0, finaleSeconds - gone));
    }, 250);
    return () => clearInterval(id);
  }, [running, finaleSeconds]);

  if (pool.length === 0) return <Empty onExit={onExit} />;

  const card = pool[i];
  const actOf = (n: number) => pool[n]?.act ?? 1;
  const acts = deck.acts ?? Math.max(...pool.map((c) => c.act ?? 1));
  const inAct = pool.filter((c) => (c.act ?? 1) === actOf(i)).length;
  const posInAct = pool.slice(0, i).filter((c) => (c.act ?? 1) === actOf(i)).length + 1;

  function saveAt(n: number) {
    if (deck.resumable === false) return;
    write(key, { i: n, at: Date.now() });
  }

  function next() {
    const n = i + 1;
    if (n >= pool.length) {
      remove(key);
      setPhase(finaleSeconds > 0 ? { step: 'finale' } : { step: 'done' });
      return;
    }
    setI(n);
    saveAt(n);
    if (actOf(n) !== actOf(i)) setPhase({ step: 'break', after: actOf(i) });
  }

  /* ---------------------------------------------------------------- rules */

  if (phase.step === 'rules') {
    const partway = (saved?.i ?? 0) > 0;
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => setPhase({ step: 'asking' })}
        startLabel={
          partway ? `Pick up at question ${(saved?.i ?? 0) + 1}` : 'Start at the first one'
        }
      >
        <p className="play__note">
          {pool.length} questions in {acts} set{acts === 1 ? '' : 's'}, in a fixed order.
          {partway && ` You stopped at ${(saved?.i ?? 0) + 1} last time.`}
        </p>
        {partway && (
          <button
            className="btn btn--ghost"
            onClick={() => {
              remove(key);
              setI(0);
              setPhase({ step: 'asking' });
            }}
          >
            Start again from the beginning
          </button>
        )}
      </Rules>
    );
  }

  /* ---------------------------------------------------------------- break */

  if (phase.step === 'break') {
    return (
      <main className="play" data-screen={`ordered.break.${phase.after}`}>
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <span className="play__deck">{deck.title}</span>
        </header>
        <section className="play__stage">
          <p className="play__eyebrow">end of set {phase.after}</p>
          <p className="card">
            {phase.after < acts
              ? 'The next set asks for more than this one did. That is the design.'
              : 'One set left.'}
          </p>
          <button
            className="btn btn--primary btn--big"
            onClick={() => setPhase({ step: 'asking' })}
          >
            Keep going
          </button>
          <button className="btn btn--big" style={{ marginTop: 10 }} onClick={onExit}>
            Stop here for tonight
          </button>
          <p className="play__note">
            Stopping is normal. Three sittings is a normal way to do this, and the app
            remembers exactly where you were.
          </p>
        </section>
      </main>
    );
  }

  /* --------------------------------------------------------------- finale */

  if (phase.step === 'finale') {
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    return (
      <main className="play" data-screen="ordered.finale">
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <span className="play__deck">the last part</span>
        </header>
        <section className="play__stage">
          <p className="play__eyebrow">no talking</p>
          <p className={`clock ${left > 0 ? 'is-running' : ''}`}>
            {mm}:{ss}
          </p>
          <p className="card card--quiet">
            Look at each other and say nothing until the clock runs out.
          </p>
          <button
            className="btn btn--primary btn--big"
            onClick={() => setPhase({ step: 'done' })}
          >
            {left === 0 ? 'Done' : 'Stop early'}
          </button>
          <p className="play__note">
            This is part of the protocol rather than decoration, and it is longer than it
            sounds.
          </p>
        </section>
      </main>
    );
  }

  /* ----------------------------------------------------------------- done */

  if (phase.step === 'done') {
    return (
      <main className="stopped stopped--outcome" data-screen="ordered.done">
        <h1 className="stopped__title">All of them.</h1>
        <p className="stopped__body">
          Nothing either of you said was written down. Your place has been cleared, so
          starting again starts at the first question.
        </p>
        <button className="btn btn--big" onClick={onExit}>
          Back
        </button>
      </main>
    );
  }

  /* --------------------------------------------------------------- asking */

  if (!card) return <Empty onExit={onExit} />;

  return (
    <main className="play" data-screen={`ordered.asking.${i}`}>
      <header className="play__top">
        <button className="play__back" onClick={onExit} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <span className="play__deck">
          set {actOf(i)} of {acts}
        </span>
        <span className="play__tier">
          {posInAct} / {inAct}
        </span>
      </header>
      <section className="play__stage">
        <p className="play__eyebrow">both of you answer, out loud</p>
        <p className="card" key={card.id}>
          {card.text}
        </p>
        <button className="btn btn--primary btn--big" onClick={next}>
          Next question
        </button>
        <p className="play__note">
          {names[0]} and {names[1]} both answer this one before moving on. Answer at
          length; one-word answers are the only way to waste this.
        </p>
      </section>
    </main>
  );
}
