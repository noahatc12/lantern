import { useMemo, useState } from 'react';
import type { Card, Deck, Tier } from '../types';
import { mulberry32, playable, shuffle } from '../lib/deck';
import Handoff from '../components/Handoff';
import Empty from '../components/Empty';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';
import Icon from '../components/Icon';
import { useNavState } from '../lib/transition';

/**
 * E3 Compare. Both answer the same question privately, then both answers are
 * shown together.
 *
 * No scoring and no matching filter: unlike E4, everything both people wrote is
 * revealed. That is the point, and it is why this engine carries questions
 * rather than desires. Nothing is persisted.
 */

interface Props {
  deck: Deck & { ordered?: boolean };
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

type Phase =
  | { step: 'rules' }
  | { step: 'answer'; who: 0 | 1; first: string }
  | { step: 'handoff'; first: string }
  | { step: 'reveal'; a: string; b: string };

export default function CompareGame({ deck, names, maxTier, availableProps, onExit }: Props) {
  const pool = useMemo(() => {
    const eligible = playable(deck.cards, maxTier, availableProps);
    // Ordered decks are ramps: shuffling one breaks the thing that makes it work.
    return deck.ordered ? eligible : shuffle(eligible, mulberry32(Date.now() & 0xffffffff));
  }, [deck, maxTier, availableProps]);

  const [i, setI] = useState(0);
  const [phase, setPhase] = useNavState<Phase>({ step: 'rules' });
  const [draft, setDraft] = useState('');

  useScreenTop(`${phase.step}-${i}`);

  const card: Card | undefined = pool[i];

  if (phase.step === 'rules') {
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => setPhase({ step: 'answer', who: 0, first: '' })}
        startLabel={`${names[0]} answers first`}
      >
        <p className="play__note">
          {pool.length} question{pool.length === 1 ? '' : 's'} at this ceiling
          {deck.ordered && ', in a fixed order that is part of the design'}.
        </p>
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
      <Handoff
        to={names[1]}
        onContinue={() => {
          setDraft('');
          setPhase({ step: 'answer', who: 1, first: phase.first });
        }}
      />
    );
  }

  if (phase.step === 'answer') {
    const ready = draft.trim().length > 0;
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
        <section className="play__stage play__stage--form">
          <div className="reminder">
            <p className="reminder__label">the question</p>
            <p className="reminder__text">{card.text}</p>
          </div>
          <textarea
            className="answer"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="your answer"
            rows={5}
          />
          <button
            className="btn btn--primary"
            disabled={!ready}
            onClick={() => {
              const mine = draft.trim();
              setDraft('');
              if (phase.who === 0) setPhase({ step: 'handoff', first: mine });
              else setPhase({ step: 'reveal', a: phase.first, b: mine });
            }}
          >
            Done
          </button>
          <p className="play__note">
            {phase.who === 0
              ? `${names[1]} will not see this until they have answered too.`
              : 'Both answers appear together next.'}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="play">
      <header className="play__top">
        <button className="play__back" onClick={onExit} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <span className="play__deck">{deck.title}</span>
        <span className="play__tier">
          {i + 1} / {pool.length}
        </span>
      </header>
      <section className="compare">
        <p className="compare__q">{card.text}</p>
        <div className="compare__side">
          <p className="compare__name">{names[0]}</p>
          <p className="compare__text">{phase.a}</p>
        </div>
        <div className="compare__side">
          <p className="compare__name">{names[1]}</p>
          <p className="compare__text">{phase.b}</p>
        </div>
        <p className="play__note">
          Nothing here is scored or saved. Where the answers differ is the interesting part.
        </p>
        <button
          className="btn btn--primary"
          onClick={() => {
            setI(i + 1);
            setDraft('');
            setPhase({ step: 'answer', who: 0, first: '' });
          }}
        >
          Next question
        </button>
      </section>
    </main>
  );
}
