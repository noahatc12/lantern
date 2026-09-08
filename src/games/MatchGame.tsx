import { useMemo, useState } from 'react';
import type { Card, Deck, Tier } from '../types';
import { playable } from '../lib/deck';
import Empty from '../components/Empty';
import Handoff from '../components/Handoff';
import Rules from '../components/Rules';
import { isMatchResult, read, write } from '../lib/storage';
import { useScreenTop } from '../lib/useScreenTop';

/**
 * E4 Match-reveal. The centrepiece engine.
 *
 * THE INVARIANT: the app never writes the non-matching answers to disk. Both
 * raw maps live in component state during the run; when the second person
 * finishes, the intersection is computed and ONLY that is persisted. A "no"
 * that one person gave has nowhere to persist to, so it stops existing the
 * moment the match runs.
 *
 * Nothing here calls write() before the overlap exists. That ordering is the
 * guarantee.
 */

type Choice = 'yes' | 'no' | 'maybe';
type Answers = Record<string, Choice>;

interface Saved {
  at: number;
  both: string[];
  partial: string[];
}

interface Props {
  deck: Deck;
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

type Phase =
  | { step: 'rules' }
  | { step: 'sorting'; who: 0 | 1; i: number; answers: Answers }
  | { step: 'handoff' }
  | { step: 'result'; both: Card[]; partial: Card[] };

export default function MatchGame({ deck, names, maxTier, availableProps, onExit }: Props) {
  /**
   * The ceiling applies here too.
   *
   * This engine sorted `deck.cards` outright, so a deck spanning tiers 3 to 5
   * dealt its tier-5 cards at a ceiling of 3. Onboarding says nothing above the
   * ceiling is ever drawn; for every sorting deck that was simply untrue, and it
   * is the one promise the whole safety layer rests on. Memoised so the pool
   * cannot renumber underneath a sort that is already running.
   */
  const pool = useMemo(
    () => playable(deck.cards, maxTier, availableProps),
    [deck, maxTier, availableProps],
  );

  const [phase, setPhase] = useState<Phase>({ step: 'rules' });
  const [firstAnswers, setFirstAnswers] = useState<Answers | null>(null);
  const saved = read<Saved | null>(`match.${deck.id}`, null, isMatchResult);

  const byId = (ids: string[]) =>
    ids.map((id) => deck.cards.find((c) => c.id === id)).filter((c): c is Card => Boolean(c));

  function choose(p: Extract<Phase, { step: 'sorting' }>, choice: Choice) {
    const answers = { ...p.answers, [pool[p.i]!.id]: choice };
    const next = p.i + 1;

    if (next < pool.length) {
      setPhase({ ...p, i: next, answers });
      return;
    }

    if (p.who === 0) {
      setFirstAnswers(answers);
      setPhase({ step: 'handoff' });
      return;
    }

    const a = firstAnswers ?? {};
    const both: Card[] = [];
    const partial: Card[] = [];
    for (const card of pool) {
      const x = a[card.id];
      const y = answers[card.id];
      if (!x || !y || x === 'no' || y === 'no') continue;
      if (x === 'yes' && y === 'yes') both.push(card);
      else partial.push(card);
    }

    // Only the overlap is written. Both raw maps go out of scope here.
    write(`match.${deck.id}`, {
      at: Date.now(),
      both: both.map((c) => c.id),
      partial: partial.map((c) => c.id),
    });
    setFirstAnswers(null);
    setPhase({ step: 'result', both, partial });
  }

  useScreenTop(phase.step + (phase.step === 'sorting' ? String(phase.i) : ''));

  // Ease off can drop the ceiling below this deck's opening tier while you are
  // inside it, which empties the pool under a sort that is already running.
  if (pool.length === 0 && phase.step !== 'result') return <Empty onExit={onExit} />;

  if (phase.step === 'rules') {
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => setPhase({ step: 'sorting', who: 0, i: 0, answers: {} })}
        startLabel={`${names[0]} sorts first`}
      >
        <p className="play__note">{pool.length} cards to sort. Takes a few minutes.</p>
        {saved && (
          <button
            className="btn btn--ghost"
            onClick={() =>
              setPhase({
                step: 'result',
                both: byId(saved.both),
                partial: byId(saved.partial),
              })
            }
          >
            See your last result
          </button>
        )}
      </Rules>
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
    const card = pool[phase.i]!;
    const pct = Math.round((phase.i / pool.length) * 100);
    return (
      <main className="play">
        <header className="play__top">
          <button
            className="play__back"
            onClick={onExit}
            aria-label="Leave, discarding this sort"
          >
            &larr;
          </button>
          <span className="play__deck">{names[phase.who]}, alone</span>
          <span className="play__tier">
            {phase.i + 1} / {pool.length}
          </span>
        </header>
        <div className="bar" aria-hidden="true">
          <div className="bar__fill" style={{ width: `${pct}%` }} />
        </div>
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
          <p className="play__note">
            Only shown if you both said yes or maybe. A no from either of you is never
            revealed and never saved.
          </p>
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
          Everything else is gone. It was never written down. This result is saved so you
          can come back to it.
        </p>
        <button
          className="btn"
          onClick={() => setPhase({ step: 'sorting', who: 0, i: 0, answers: {} })}
        >
          Run it again
        </button>
      </section>
    </main>
  );
}
