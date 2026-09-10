import { useEffect, useRef, useState } from 'react';
import type { Deck, Tier } from '../types';
import { isStages, read, write } from '../lib/storage';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';
import Icon from '../components/Icon';

/**
 * E16 Staged. Stages unlocked in order, one per sitting, over weeks.
 *
 * The only thing in the app with a clinical evidence base, and the mechanism is
 * the opposite of everything else here: remove the goal, and attention becomes
 * available for sensation. That only works if the stages are not rushed, so the
 * gate is real. The next one does not open until this one is marked done by
 * both of you, and the app will not offer a way around it.
 *
 * Said once, plainly, on the first screen: this is a self-directed adaptation
 * of something normally done with a trained professional, and it is not
 * therapy. Then the app gets out of the way.
 *
 * Progress is the one thing here that persists, because a protocol run over
 * weeks that forgets where you were is not a protocol.
 */

interface Stage {
  title: string;
  rule: string;
  cue: string;
  minutes: number;
  debrief: string[];
}

interface Props {
  deck: Deck & { stages?: Stage[]; disclaimer?: string };
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

type Phase =
  | { step: 'rules' }
  | { step: 'stages' }
  | { step: 'brief'; n: number }
  | { step: 'timer'; n: number; side: 0 | 1 }
  | { step: 'debrief'; n: number };

export default function StagedGame({ deck, names, onExit }: Props) {
  const stages = deck.stages ?? [];
  const key = `stages.${deck.id}`;

  const [done, setDone] = useState<number[]>(() => read<number[]>(key, [], isStages));
  const [phase, setPhase] = useState<Phase>({ step: 'rules' });
  const [left, setLeft] = useState(0);
  const [marked, setMarked] = useState<[boolean, boolean]>([false, false]);

  const origin = useRef(0);
  const running = phase.step === 'timer';
  const stage = 'n' in phase ? stages[phase.n] : undefined;

  useScreenTop(`${phase.step}-${'n' in phase ? phase.n : ''}-${'side' in phase ? phase.side : ''}`);

  useEffect(() => {
    if (!running || !stage) return;
    origin.current = Date.now();
    setLeft(stage.minutes * 60);
    const id = setInterval(() => {
      const gone = Math.floor((Date.now() - origin.current) / 1000);
      setLeft(Math.max(0, stage.minutes * 60 - gone));
    }, 250);
    return () => clearInterval(id);
    // Restarting the clock is exactly what should happen when the side changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, 'n' in phase ? phase.n : -1, 'side' in phase ? phase.side : -1]);

  function persist(next: number[]) {
    setDone(next);
    write(key, next);
  }

  const nextOpen = done.length;

  /* ---------------------------------------------------------------- rules */

  if (phase.step === 'rules') {
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => setPhase({ step: 'stages' })}
        startLabel={done.length === 0 ? 'Start at stage one' : `Continue at stage ${nextOpen + 1}`}
      >
        <p className="play__note">
          {done.length} of {stages.length} stages done. One per sitting, in order.
        </p>
      </Rules>
    );
  }

  /* --------------------------------------------------------------- stages */

  if (phase.step === 'stages') {
    return (
      <main className="screen" data-screen="staged.list">
        <button className="backbtn" onClick={onExit} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <p className="h1 h1--big">{deck.title}</p>

        {deck.disclaimer && <p className="disclaimer">{deck.disclaimer}</p>}

        <ul className="stages">
          {stages.map((s, n) => {
            const isDone = done.includes(n);
            const isOpen = n === nextOpen;
            return (
              <li className={`stage ${isDone ? 'is-done' : ''} ${isOpen ? 'is-open' : ''}`} key={s.title}>
                <div className="stage__head">
                  <span className="stage__n">{n + 1}</span>
                  <span className="stage__title">{s.title}</span>
                  <span className="stage__state">
                    {isDone ? 'done' : isOpen ? 'open' : 'locked'}
                  </span>
                </div>
                <p className="stage__rule">{isDone || isOpen ? s.rule : 'Opens when the one before it is done.'}</p>
                {isOpen && (
                  <button
                    className="btn btn--primary"
                    onClick={() => {
                      setMarked([false, false]);
                      setPhase({ step: 'brief', n });
                    }}
                  >
                    Start stage {n + 1}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {done.length === stages.length && stages.length > 0 && (
          <>
            <p className="foot">
              All four done. The attention you practised in stage one is the part that
              carries; the stages were only how you got there.
            </p>
            <button className="btn btn--danger" onClick={() => persist([])}>
              Start the whole thing over
            </button>
          </>
        )}
      </main>
    );
  }

  if (!stage) {
    setPhase({ step: 'stages' });
    return null;
  }

  /* ---------------------------------------------------------------- brief */

  if (phase.step === 'brief') {
    return (
      <main className="play" data-screen={`staged.brief.${phase.n}`}>
        <header className="play__top">
          <button className="play__back" onClick={() => setPhase({ step: 'stages' })} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <span className="play__deck">Stage {phase.n + 1}</span>
          <span className="play__tier">{stage.minutes} min each</span>
        </header>
        <section className="play__stage">
          <p className="play__eyebrow">{stage.title}</p>
          <p className="card">{stage.rule}</p>
          <div className="reminder">
            <p className="reminder__label">what to pay attention to</p>
            <p className="reminder__text">{stage.cue}</p>
          </div>
          <button
            className="btn btn--primary btn--big"
            onClick={() => setPhase({ step: 'timer', n: phase.n, side: 0 })}
          >
            {names[0]} receives first
          </button>
          <p className="play__note">
            The receiver says nothing except to redirect. This is not aimed at arousal,
            and treating it as foreplay removes the whole mechanism.
          </p>
        </section>
      </main>
    );
  }

  /* ---------------------------------------------------------------- timer */

  if (phase.step === 'timer') {
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    const first = phase.side === 0;
    return (
      <main className="play" data-screen={`staged.timer.${phase.n}.${phase.side}`}>
        <header className="play__top">
          <button className="play__back" onClick={() => setPhase({ step: 'stages' })} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <span className="play__deck">Stage {phase.n + 1}</span>
          <span className="play__tier">{first ? 'first half' : 'second half'}</span>
        </header>
        <section className="play__stage">
          <p className="play__eyebrow">{names[phase.side]} is receiving</p>
          <p className="clock">
            {mm}:{ss}
          </p>
          <p className="card card--quiet">{stage.cue}</p>

          {left === 0 ? (
            <button
              className="btn btn--primary btn--big"
              onClick={() =>
                first
                  ? setPhase({ step: 'timer', n: phase.n, side: 1 })
                  : setPhase({ step: 'debrief', n: phase.n })
              }
            >
              {first ? 'Swap over' : 'Done, talk about it'}
            </button>
          ) : (
            <button
              className="btn btn--big"
              onClick={() =>
                first
                  ? setPhase({ step: 'timer', n: phase.n, side: 1 })
                  : setPhase({ step: 'debrief', n: phase.n })
              }
            >
              {first ? 'Swap early' : 'Finish early'}
            </button>
          )}

          <p className="play__note">
            {left === 0
              ? 'Time. Swap without hurrying.'
              : 'No talking except to redirect. Attention on temperature, pressure and texture.'}
          </p>
        </section>
      </main>
    );
  }

  /* -------------------------------------------------------------- debrief */

  const bothMarked = marked[0] && marked[1];

  return (
    <main className="play" data-screen={`staged.debrief.${phase.n}`}>
      <header className="play__top">
        <button className="play__back" onClick={() => setPhase({ step: 'stages' })} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <span className="play__deck">Stage {phase.n + 1}, afterwards</span>
      </header>
      <section className="play__stage">
        <p className="play__eyebrow">two questions, out loud</p>
        <ul className="rules__steps">
          {stage.debrief.map((q, n) => (
            <li className="step" key={q}>
              <span className="step__n">{n + 1}</span>
              <span className="step__text">{q}</span>
            </li>
          ))}
        </ul>

        <p className="play__note" style={{ marginTop: 18 }}>
          Nothing you say is written down. The next stage opens when you have both marked
          this one done, and that gate is the point: rushing removes the mechanism.
        </p>

        <div className="pairbtns" style={{ marginTop: 12 }}>
          {names.map((n, idx) => (
            <button
              key={n + idx}
              className={`btn btn--pick ${marked[idx] ? 'is-on' : ''}`}
              aria-pressed={marked[idx]}
              onClick={() => {
                const next: [boolean, boolean] = [marked[0], marked[1]];
                next[idx] = !next[idx];
                setMarked(next);
              }}
            >
              {n} is done
            </button>
          ))}
        </div>

        <button
          className="btn btn--primary btn--big"
          style={{ marginTop: 14 }}
          disabled={!bothMarked}
          onClick={() => {
            if (!done.includes(phase.n)) persist([...done, phase.n].sort((a, b) => a - b));
            setPhase({ step: 'stages' });
          }}
        >
          {bothMarked ? `Unlock stage ${phase.n + 2}` : 'Both of you have to mark it'}
        </button>
      </section>
    </main>
  );
}
