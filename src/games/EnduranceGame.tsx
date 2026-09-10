import { useEffect, useRef, useState } from 'react';
import type { Deck, Tier } from '../types';
import { playable } from '../lib/deck';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';
import Icon from '../components/Icon';

/**
 * E11 Endurance. Two people, one loses by reacting.
 *
 * Inverts the usual incentive: normally escalation is the goal, here restraint
 * is, and the tension does the work. Structurally the most distinctive mechanic
 * in the whole corpus and no other engine expresses it.
 *
 * A draw is a real outcome, not a fallback. Capping the round means nobody sits
 * there indefinitely waiting for the other to crack.
 */

interface Props {
  deck: Deck & { turnSeconds?: number; capSeconds?: number };
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

type Phase =
  | { step: 'rules' }
  | { step: 'playing'; active: 0 | 1; constraint: string }
  | { step: 'over'; loser: 0 | 1 | null };

export default function EnduranceGame({ deck, names, maxTier, availableProps, onExit }: Props) {
  const turnSeconds = deck.turnSeconds ?? 120;
  const capSeconds = deck.capSeconds ?? 1200;
  const constraints = playable(deck.cards, maxTier, availableProps);

  const [phase, setPhase] = useState<Phase>({ step: 'rules' });
  const [turnLeft, setTurnLeft] = useState(turnSeconds);
  const [total, setTotal] = useState(0);
  const origin = useRef(0);

  const playing = phase.step === 'playing';

  useEffect(() => {
    if (!playing) return;
    origin.current = Date.now();
    const id = setInterval(() => {
      const gone = Math.floor((Date.now() - origin.current) / 1000);
      setTurnLeft(Math.max(0, turnSeconds - gone));
      setTotal((t) => t + 0.25);
    }, 250);
    return () => clearInterval(id);
  }, [playing, phase.step === 'playing' ? phase.active : null, turnSeconds]);

  useEffect(() => {
    if (playing && total >= capSeconds) setPhase({ step: 'over', loser: null });
  }, [total, capSeconds, playing]);

  function newConstraint() {
    if (constraints.length === 0) return '';
    return constraints[Math.floor(Math.random() * constraints.length)]!.text;
  }

  useScreenTop(phase.step);

  if (phase.step === 'rules') {
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => {
          setTurnLeft(turnSeconds);
          setTotal(0);
          setPhase({ step: 'playing', active: 0, constraint: newConstraint() });
        }}
        startLabel={`${names[0]} goes first`}
      >
        <p className="play__note">
          {turnSeconds}s turns, {Math.round(capSeconds / 60)} minute cap, then it is a draw.
        </p>
      </Rules>
    );
  }

  if (phase.step === 'over') {
    // stopped--outcome, not a plain stop screen. Naming who broke first is this
    // game's RESULT, not an attribution of who called a halt. Safety stops must
    // never name anyone; a game outcome legitimately does. Keeping both in one
    // class made the safety rule unenforceable, which the monkey caught.
    return (
      <main className="stopped stopped--outcome">
        <h1 className="stopped__title">
          {phase.loser === null ? 'A draw.' : `${names[phase.loser]} broke first.`}
        </h1>
        <p className="stopped__body">
          {phase.loser === null
            ? 'Neither of you cracked inside the cap. You both win, which is its own problem.'
            : `${names[phase.loser === 0 ? 1 : 0]} decides what happens next. Losing is the good outcome here.`}
        </p>
        <button className="btn" onClick={onExit}>
          Back
        </button>
      </main>
    );
  }

  const mm = String(Math.floor(turnLeft / 60)).padStart(2, '0');
  const ss = String(turnLeft % 60).padStart(2, '0');
  const other = phase.active === 0 ? 1 : 0;

  return (
    <main className="play">
      <header className="play__top">
        <button className="play__back" onClick={onExit} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <span className="play__deck">{deck.title}</span>
        <span className="play__tier">{Math.floor(total / 60)}m elapsed</span>
      </header>

      <section className="play__stage">
        <p className="play__eyebrow">{names[phase.active]} is doing the work</p>
        <p className="clock is-running">
          {mm}:{ss}
        </p>
        <p className="card" key={phase.constraint}>
          {phase.constraint}
        </p>

        <div className="play__actions">
          <button
            className="btn btn--ghost"
            onClick={() => {
              setTurnLeft(turnSeconds);
              setPhase({ step: 'playing', active: other, constraint: newConstraint() });
            }}
          >
            Swap turn
          </button>
          <button
            className="btn btn--primary"
            onClick={() => setPhase({ step: 'over', loser: other })}
          >
            {names[other]} gives in
          </button>
        </div>

        <p className="play__note">
          {names[other]} loses by asking for more. Tap for them when they do.
        </p>
      </section>
    </main>
  );
}
