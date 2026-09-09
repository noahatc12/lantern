import { useMemo, useState } from 'react';
import type { Card, Deck, Tier } from '../types';
import { mulberry32, playable, shuffle } from '../lib/deck';
import Handoff from '../components/Handoff';
import Rules from '../components/Rules';
import Empty from '../components/Empty';
import { useScreenTop } from '../lib/useScreenTop';

/**
 * E13 Quiz. One of you answers as the other, then finds out.
 *
 * The output that matters is the MISSES, not the score. A miss is a thing
 * neither of you knew you disagreed about, and it is the only reason to play;
 * the score exists so it feels like a game and is deliberately never kept
 * anywhere past the end screen.
 *
 * Two modes, because the same mechanic makes two quite different games:
 *
 *   live     one question at a time, the subject alternating, no running total.
 *            Slow, conversational, and the misses are discussed as they happen.
 *   preseed  the subject answers a batch privately up front, then the other
 *            runs the whole batch at speed and everything is revealed at once.
 *
 * Nothing here is written to disk. The answers are the most personal thing the
 * app ever holds and it holds them only in memory, only while the round runs.
 */

type Mode = 'live' | 'preseed';

interface Props {
  deck: Deck & { mode?: Mode; batch?: number; subject?: 'alternate' | 'fixed' };
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

interface Round {
  card: Card;
  /** Whose life the question is about. */
  subject: 0 | 1;
  real: string;
  guess: string;
  /** Undefined until someone marks it. */
  hit?: boolean;
}

type Phase =
  | { step: 'rules' }
  | { step: 'seed'; i: number }
  | { step: 'handoff'; to: 0 | 1; next: Phase }
  | { step: 'guess'; i: number }
  | { step: 'real'; i: number }
  | { step: 'reveal'; i: number }
  | { step: 'scoreboard' }
  | { step: 'over' };

export default function QuizGame({ deck, names, maxTier, availableProps, onExit }: Props) {
  const mode: Mode = deck.mode ?? 'live';
  const batch = deck.batch ?? 10;
  const alternating = (deck.subject ?? 'alternate') === 'alternate';

  const pool = useMemo(
    () =>
      shuffle(
        playable(deck.cards, maxTier, availableProps),
        mulberry32(Date.now() & 0xffffffff),
      ),
    [deck, maxTier, availableProps],
  );

  const size = mode === 'preseed' ? Math.min(batch, pool.length) : pool.length;

  const [rounds, setRounds] = useState<Round[]>([]);
  const [phase, setPhase] = useState<Phase>({ step: 'rules' });
  const [draft, setDraft] = useState('');
  /** Whose life the questions are about right now. */
  const [subject, setSubject] = useState<0 | 1>(0);

  useScreenTop(`${phase.step}-${'i' in phase ? phase.i : ''}-${subject}`);

  if (pool.length === 0) return <Empty onExit={onExit} />;

  const guesser: 0 | 1 = subject === 0 ? 1 : 0;
  const at = (i: number) => rounds[i];

  function start() {
    const first: Round[] = pool.slice(0, size).map((card) => ({
      card,
      subject: 0,
      real: '',
      guess: '',
    }));
    setRounds(first);
    setSubject(0);
    setDraft('');
    setPhase(mode === 'preseed' ? { step: 'seed', i: 0 } : { step: 'guess', i: 0 });
  }

  function setRound(i: number, patch: Partial<Round>) {
    setRounds((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  }

  /* ---------------------------------------------------------------- rules */

  if (phase.step === 'rules') {
    return (
      <Rules deck={deck} onExit={onExit} onStart={start} startLabel="Start">
        <p className="play__note">
          {mode === 'preseed'
            ? `${size} questions about ${names[0]}, answered by ${names[0]} first.`
            : `${pool.length} questions available at this ceiling.`}
        </p>
      </Rules>
    );
  }

  /* --------------------------------------------------------------- seeding */

  if (phase.step === 'seed') {
    const r = at(phase.i);
    if (!r) return <Empty onExit={onExit} />;
    const last = phase.i === size - 1;
    return (
      <main className="play" data-screen={`quiz.seed.${phase.i}`}>
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            &larr;
          </button>
          <span className="play__deck">{names[subject]}, privately</span>
          <span className="play__tier">
            {phase.i + 1} / {size}
          </span>
        </header>
        <section className="play__stage play__stage--form">
          <p className="card">{r.card.text}</p>
          <textarea
            className="answer"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="your real answer"
            rows={3}
            aria-label="Your real answer"
          />
          <button
            className="btn btn--primary"
            disabled={!draft.trim()}
            onClick={() => {
              setRound(phase.i, { real: draft.trim(), subject });
              setDraft('');
              setPhase(
                last
                  ? { step: 'handoff', to: guesser, next: { step: 'guess', i: 0 } }
                  : { step: 'seed', i: phase.i + 1 },
              );
            }}
          >
            {last ? 'Done, pass the phone' : 'Next'}
          </button>
          <p className="play__note">
            Answer honestly rather than memorably. They are guessing what is true, not
            what would be funny.
          </p>
        </section>
      </main>
    );
  }

  /* -------------------------------------------------------------- handoff */

  if (phase.step === 'handoff') {
    const to = phase.to;
    const next = phase.next;
    return <Handoff to={names[to]} onContinue={() => setPhase(next)} />;
  }

  /* --------------------------------------------------------------- guess */

  if (phase.step === 'guess') {
    const r = at(phase.i);
    if (!r) return <Empty onExit={onExit} />;
    const last = phase.i === size - 1;
    return (
      <main className="play" data-screen={`quiz.guess.${phase.i}`}>
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            &larr;
          </button>
          <span className="play__deck">
            {names[guesser]} answers for {names[subject]}
          </span>
          <span className="play__tier">
            {phase.i + 1} / {size}
          </span>
        </header>
        <section className="play__stage play__stage--form">
          <p className="card">{r.card.text}</p>
          <textarea
            className="answer"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`what ${names[subject]} would say`}
            rows={3}
            aria-label={`What ${names[subject]} would say`}
          />
          <button
            className="btn btn--primary"
            disabled={!draft.trim()}
            onClick={() => {
              setRound(phase.i, { guess: draft.trim(), subject });
              setDraft('');
              if (mode === 'preseed') {
                setPhase(
                  last
                    ? { step: 'handoff', to: subject, next: { step: 'scoreboard' } }
                    : { step: 'guess', i: phase.i + 1 },
                );
              } else {
                setPhase({
                  step: 'handoff',
                  to: subject,
                  next: { step: 'real', i: phase.i },
                });
              }
            }}
          >
            {mode === 'preseed' && !last ? 'Next' : 'Lock it in'}
          </button>
          <p className="play__note">
            Guess what they would actually say. Being wrong is the useful outcome, not
            the losing one.
          </p>
        </section>
      </main>
    );
  }

  /* ---------------------------------------------------------------- real */

  if (phase.step === 'real') {
    const r = at(phase.i);
    if (!r) return <Empty onExit={onExit} />;
    return (
      <main className="play" data-screen={`quiz.real.${phase.i}`}>
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            &larr;
          </button>
          <span className="play__deck">{names[subject]}, your turn</span>
        </header>
        <section className="play__stage play__stage--form">
          <p className="card">{r.card.text}</p>
          <textarea
            className="answer"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="your real answer"
            rows={3}
            aria-label="Your real answer"
          />
          <button
            className="btn btn--primary"
            disabled={!draft.trim()}
            onClick={() => {
              setRound(phase.i, { real: draft.trim() });
              setDraft('');
              setPhase({ step: 'reveal', i: phase.i });
            }}
          >
            Show both
          </button>
          <p className="play__note">
            {names[guesser]} has already locked theirs in. You cannot see it yet.
          </p>
        </section>
      </main>
    );
  }

  /* -------------------------------------------------------------- reveal */

  if (phase.step === 'reveal') {
    const r = at(phase.i);
    if (!r) return <Empty onExit={onExit} />;
    const last = phase.i === size - 1;
    const mark = (hit: boolean) => {
      setRound(phase.i, { hit });
      if (last) {
        setPhase({ step: 'over' });
        return;
      }
      const nextSubject: 0 | 1 = alternating ? (subject === 0 ? 1 : 0) : subject;
      setSubject(nextSubject);
      setPhase({
        step: 'handoff',
        to: nextSubject === 0 ? 1 : 0,
        next: { step: 'guess', i: phase.i + 1 },
      });
    };

    return (
      <main className="play" data-screen={`quiz.reveal.${phase.i}`}>
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            &larr;
          </button>
          <span className="play__deck">{r.card.text}</span>
        </header>
        <section className="play__stage">
          <div className="compare__side">
            <p className="compare__name">{names[subject]} really said</p>
            <p className="compare__text">{r.real}</p>
          </div>
          <div className="compare__side">
            <p className="compare__name">{names[guesser]} guessed</p>
            <p className="compare__text">{r.guess}</p>
          </div>

          <p className="play__note">
            {names[subject]} decides. Close enough counts; this is not a spelling test.
          </p>
          <div className="play__actions">
            <button className="btn btn--ghost" onClick={() => mark(false)}>
              Not even close
            </button>
            <button className="btn btn--primary" onClick={() => mark(true)}>
              Close enough
            </button>
          </div>
          {/* Only once something has been marked. Ending from an unmarked
              reveal produced a summary that said "no misses" while the miss was
              still on the screen you tapped it from. Back and Stop are both
              there for anyone who wants out before then. */}
          {rounds.some((r) => r.hit !== undefined) && (
            <button
              className="btn"
              style={{ marginTop: 12 }}
              onClick={() => setPhase({ step: 'over' })}
            >
              That is enough for tonight
            </button>
          )}
        </section>
      </main>
    );
  }

  /* ----------------------------------------------------------- scoreboard */

  if (phase.step === 'scoreboard') {
    const marked = rounds.filter((r) => r.hit !== undefined).length;
    const hits = rounds.filter((r) => r.hit).length;
    return (
      <main className="play" data-screen="quiz.scoreboard">
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            &larr;
          </button>
          <span className="play__deck">{names[subject]} marks them</span>
          <span className="play__tier">
            {hits} / {size}
          </span>
        </header>
        <section className="play__stage">
          <p className="play__note">
            {names[subject]}, mark each one. Close enough counts.
          </p>
          <ul className="marks">
            {rounds.map((r, i) => (
              <li className="markrow" key={r.card.id}>
                <p className="markrow__q">{r.card.text}</p>
                <p className="markrow__pair">
                  <span className="markrow__label">you</span>
                  {r.real}
                </p>
                <p className="markrow__pair">
                  <span className="markrow__label">{names[guesser]}</span>
                  {r.guess}
                </p>
                <div className="markrow__btns">
                  <button
                    className={`filter ${r.hit === false ? 'is-on' : ''}`}
                    onClick={() => setRound(i, { hit: false })}
                    aria-pressed={r.hit === false}
                  >
                    Miss
                  </button>
                  <button
                    className={`filter ${r.hit === true ? 'is-on' : ''}`}
                    onClick={() => setRound(i, { hit: true })}
                    aria-pressed={r.hit === true}
                  >
                    Got it
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            className="btn btn--primary btn--big"
            disabled={marked < size}
            onClick={() => setPhase({ step: 'over' })}
          >
            {marked < size ? `${size - marked} left to mark` : `Done, ${hits} of ${size}`}
          </button>
        </section>
      </main>
    );
  }

  /* ------------------------------------------------------------------ over */

  const answered = rounds.filter((r) => r.hit !== undefined);
  const misses = answered.filter((r) => !r.hit);
  const hits = answered.length - misses.length;

  return (
    <main className="play" data-screen="quiz.over">
      <header className="play__top">
        <button className="play__back" onClick={onExit} aria-label="Back">
          &larr;
        </button>
        <span className="play__deck">{deck.title}</span>
      </header>
      <section className="result">
        <p className="play__eyebrow">
          {hits} of {answered.length} guessed right
        </p>

        <h2 className="result__head">Worth talking about ({misses.length})</h2>
        {misses.length === 0 ? (
          <p className="play__note">
            No misses. Either you know each other well or the questions were too easy.
            Raise the ceiling and try again.
          </p>
        ) : (
          <>
            <p className="play__note" style={{ marginBottom: 12 }}>
              These are the ones neither of you knew you disagreed about. They are the
              reason to play, not the failures.
            </p>
            <ul className="result__list">
              {misses.map((r) => (
                <li key={r.card.id}>
                  <span className="miss__q">{r.card.text}</span>
                  <span className="miss__a">
                    {names[r.subject]}: {r.real}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="play__note">
          The score is gone the moment you leave this screen. Nothing here is written
          down.
        </p>
        <button className="btn btn--big" onClick={onExit}>
          Back
        </button>
      </section>
    </main>
  );
}
