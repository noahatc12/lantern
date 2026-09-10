import { useMemo, useState } from 'react';
import type { Card, Deck, Tier } from '../types';
import { mulberry32, playable, shuffle } from '../lib/deck';
import Empty from '../components/Empty';
import Handoff from '../components/Handoff';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';
import Icon from '../components/Icon';
import { useNavState } from '../lib/transition';

/**
 * E17 Story. A direction, a forced opening, and then you talk.
 *
 * The opening line does the hardest part, which is starting. Left to yourself
 * you spend the first minute deciding which story this is; handed a first
 * sentence you are already telling one.
 *
 * The other half is that your partner also submitted a line and you cannot tell
 * which is which, so the story you end up telling was partly chosen by them.
 * Two players is below the format's intended count, so the hand is bigger and
 * the line pool is deep to compensate for a shuffle that only ever holds two.
 */

interface Props {
  deck: Deck & { lines?: { text: string; tier: Tier }[]; handSize?: number };
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

type Phase =
  | { step: 'rules' }
  | { step: 'prompt' }
  | { step: 'pick'; who: 0 | 1; first: string | null }
  | { step: 'handoff'; to: 0 | 1; next: Phase }
  | { step: 'choose'; lines: string[] }
  | { step: 'telling'; line: string }
  | { step: 'question'; line: string };

export default function StoryGame({ deck, names, maxTier, availableProps, onExit }: Props) {
  const handSize = deck.handSize ?? 5;

  const prompts = useMemo(
    () =>
      shuffle(
        playable(deck.cards, maxTier, availableProps),
        mulberry32(Date.now() & 0xffffffff),
      ),
    [deck, maxTier, availableProps],
  );

  const lines = useMemo(
    () => playable(deck.lines ?? [], maxTier, availableProps),
    [deck, maxTier, availableProps],
  );

  const [phase, setPhase] = useNavState<Phase>({ step: 'rules' });
  const [round, setRound] = useState(0);
  /** Whose story it is this round. */
  const [teller, setTeller] = useState<0 | 1>(0);

  useScreenTop(`${phase.step}-${round}-${'who' in phase ? phase.who : ''}`);

  if (prompts.length === 0 || lines.length < handSize) return <Empty onExit={onExit} />;

  const prompt: Card = prompts[round % prompts.length]!;
  const other: 0 | 1 = teller === 0 ? 1 : 0;

  /** A fresh hand each time, seeded per round and per person. */
  function hand(who: 0 | 1): string[] {
    const rng = mulberry32((round + 1) * 7919 + who * 104729);
    return shuffle(lines, rng)
      .slice(0, handSize)
      .map((l) => l.text);
  }

  /* ---------------------------------------------------------------- rules */

  if (phase.step === 'rules') {
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => {
          setRound(0);
          setTeller(0);
          setPhase({ step: 'prompt' });
        }}
        startLabel={`${names[0]} tells the first one`}
      >
        <p className="play__note">
          {prompts.length} directions and {lines.length} opening lines at this ceiling.
        </p>
      </Rules>
    );
  }

  /* --------------------------------------------------------------- prompt */

  if (phase.step === 'prompt') {
    return (
      <main className="play" data-screen={`story.prompt.${round}`}>
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <span className="play__deck">{names[teller]} is telling this one</span>
        </header>
        <section className="play__stage">
          <p className="play__eyebrow">the direction</p>
          <p className="card" key={prompt.id}>
            {prompt.text}
          </p>
          <button
            className="btn btn--primary btn--big"
            onClick={() => setPhase({ step: 'pick', who: other, first: null })}
          >
            {names[other]} picks a line first
          </button>
          <p className="play__note">
            You each pick an opening line in private. Then {names[teller]} sees both,
            without knowing which is whose, and tells the story that follows one of them.
          </p>
        </section>
      </main>
    );
  }

  /* ----------------------------------------------------------------- pick */

  if (phase.step === 'pick') {
    const mine = hand(phase.who);
    return (
      <main className="play" data-screen={`story.pick.${round}.${phase.who}`}>
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <span className="play__deck">{names[phase.who]}, privately</span>
        </header>
        <section className="play__stage">
          <p className="play__eyebrow">pick one to put in</p>
          <ul className="lines">
            {mine.map((l) => (
              <li key={l}>
                <button
                  className="lineopt"
                  onClick={() => {
                    if (phase.first === null) {
                      setPhase({
                        step: 'handoff',
                        to: teller,
                        next: { step: 'pick', who: teller, first: l },
                      });
                    } else {
                      const both = shuffle(
                        [phase.first, l],
                        mulberry32(Date.now() & 0xffffffff),
                      );
                      setPhase({ step: 'choose', lines: both });
                    }
                  }}
                >
                  {l}
                </button>
              </li>
            ))}
          </ul>
          <p className="play__note">
            Pick the one you would most want to hear them tell, not the one you would
            find easiest.
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

  /* --------------------------------------------------------------- choose */

  if (phase.step === 'choose') {
    return (
      <main className="play" data-screen={`story.choose.${round}`}>
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <span className="play__deck">{names[teller]} chooses</span>
        </header>
        <section className="play__stage">
          <p className="play__eyebrow">{prompt.text}</p>
          <ul className="lines">
            {phase.lines.map((l) => (
              <li key={l}>
                <button className="lineopt" onClick={() => setPhase({ step: 'telling', line: l })}>
                  {l}
                </button>
              </li>
            ))}
          </ul>
          <p className="play__note">
            One of these is yours and one is theirs. You are not told which.
          </p>
        </section>
      </main>
    );
  }

  /* -------------------------------------------------------------- telling */

  if (phase.step === 'telling') {
    return (
      <main className="play" data-screen={`story.telling.${round}`}>
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <span className="play__deck">{names[teller]} is telling it</span>
        </header>
        <section className="play__stage">
          <p className="play__eyebrow">start here</p>
          <p className="card">{phase.line}</p>
          <button
            className="btn btn--primary btn--big"
            onClick={() => setPhase({ step: 'question', line: phase.line })}
          >
            Told it
          </button>
          <p className="play__note">
            No time limit and no interruptions. {names[other]} listens and saves their
            question for the end.
          </p>
        </section>
      </main>
    );
  }

  /* ------------------------------------------------------------- question */

  return (
    <main className="play" data-screen={`story.question.${round}`}>
      <header className="play__top">
        <button className="play__back" onClick={onExit} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <span className="play__deck">{names[other]} asks</span>
      </header>
      <section className="play__stage">
        <p className="play__eyebrow">one question, then swap</p>
        <p className="card card--quiet">
          Ask one thing about what they just told you. One, not four.
        </p>
        <div className="play__actions">
          <button className="btn btn--ghost" onClick={onExit}>
            That is enough
          </button>
          <button
            className="btn btn--primary"
            onClick={() => {
              setRound(round + 1);
              setTeller(other);
              setPhase({ step: 'prompt' });
            }}
          >
            Swap, {names[other]} tells one
          </button>
        </div>
        <p className="play__note">
          Nothing from this is written down anywhere. It happened and that is all.
        </p>
      </section>
    </main>
  );
}
