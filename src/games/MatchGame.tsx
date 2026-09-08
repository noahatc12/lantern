import { useState } from 'react';
import type { Card, Deck } from '../types';
import Handoff from '../components/Handoff';
import { write } from '../lib/storage';

/**
 * E4 Match-reveal. The centrepiece engine.
 *
 * THE INVARIANT: the app never writes the non-matching answers to disk. Both
 * raw lists live in component state during the run; when the second person
 * finishes, the intersection is computed and ONLY that is persisted. A "no"
 * that only one person gave stops existing the moment the match runs.
 *
 * That is why the raw maps are local consts here rather than anything stored,
 * and why nothing calls write() until after the intersection exists.
 */

type Choice = 'yes' | 'no' | 'maybe';
type Answers = Record<string, Choice>;

interface Props {
  deck: Deck;
  names: [string, string];
  onExit: () => void;
}

type Phase =
  | { step: 'intro' }
  | { step: 'sorting'; who: 0 | 1; i: number; answers: Answers }
  | { step: 'handoff'; first: Answers }
  | { step: 'result'; both: Card[]; partial: Card[] };

export default function MatchGame({ deck, names, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>({ step: 'intro' });
  const [firstAnswers, setFirstAnswers] = useState<Answers | null>(null);

  function choose(p: Extract<Phase, { step: 'sorting' }>, choice: Choice) {
    const answers = { ...p.answers, [deck.cards[p.i]!.id]: choice };
    const next = p.i + 1;

    if (next < deck.cards.length) {
      setPhase({ ...p, i: next, answers });
      return;
    }

    if (p.who === 0) {
      setFirstAnswers(answers);
      setPhase({ step: 'handoff', first: answers });
      return;
    }

    // Second person done. Compute the intersection, then let both raw maps fall
    // out of scope. Nothing but the overlap is ever written.
    const a = firstAnswers ?? {};
    const b = answers;
    const both: Card[] = [];
    const partial: Card[] = [];
    for (const card of deck.cards) {
      const x = a[card.id];
      const y = b[card.id];
      if (x === 'no' || y === 'no' || !x || !y) continue;
      if (x === 'yes' && y === 'yes') both.push(card);
      else partial.push(card);
    }
    write(`match.${deck.id}`, {
      at: Date.now(),
      both: both.map((c) => c.id),
      partial: partial.map((c) => c.id),
    });
    setFirstAnswers(null);
    setPhase({ step: 'result', both, partial });
  }

  if (phase.step === 'intro') {
    return (
      <main className="play">
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            &larr;
          </button>
          <span className="play__deck">{deck.title}</span>
        </header>
        <section className="play__stage">
          <p className="card card--quiet">
            One of you sorts the whole deck alone, then hands the phone over. The app
            shows only what you both said yes or maybe to.
          </p>
          <p className="play__note">
            Anything either of you says no to is never shown, and never written down.
            Take it to another room.
          </p>
          <button
            className="btn btn--primary btn--big"
            onClick={() => setPhase({ step: 'sorting', who: 0, i: 0, answers: {} })}
          >
            {names[0]} starts
          </button>
        </section>
      </main>
    );
  }

  if (phase.step === 'handoff') {
    return (
      <Handoff
        to={names[1]}
        onContinue={() => setPhase({ step: 'sorting', who: 1, i: 0, answers: {} })}
      />
    );
  }

  if (phase.step === 'sorting') {
    const card = deck.cards[phase.i]!;
    return (
      <main className="play">
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Leave, discarding this sort">
            &larr;
          </button>
          <span className="play__deck">{names[phase.who]}</span>
          <span className="play__tier">
            {phase.i + 1} / {deck.cards.length}
          </span>
        </header>
        <section className="play__stage">
          <p className="card">{card.text}</p>
          <div className="sort">
            <button className="btn sort__no" onClick={() => choose(phase, 'no')}>
              No
            </button>
            <button className="btn sort__maybe" onClick={() => choose(phase, 'maybe')}>
              Maybe
            </button>
            <button className="btn sort__yes" onClick={() => choose(phase, 'yes')}>
              Yes
            </button>
          </div>
          <p className="play__note">Nobody sees this but you, unless you both said yes.</p>
        </section>
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
      </header>
      <section className="result">
        <h2 className="result__head">Both yes ({phase.both.length})</h2>
        {phase.both.length === 0 ? (
          <p className="play__note">Nothing overlapped this time.</p>
        ) : (
          <ul className="result__list">
            {phase.both.map((c) => (
              <li key={c.id}>{c.text}</li>
            ))}
          </ul>
        )}

        <h2 className="result__head">Worth talking about ({phase.partial.length})</h2>
        {phase.partial.length === 0 ? (
          <p className="play__note">Nothing in between.</p>
        ) : (
          <ul className="result__list result__list--quiet">
            {phase.partial.map((c) => (
              <li key={c.id}>{c.text}</li>
            ))}
          </ul>
        )}

        <p className="play__note">
          Everything else is gone. It was never written down.
        </p>
      </section>
    </main>
  );
}
