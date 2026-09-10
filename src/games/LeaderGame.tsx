import { useMemo, useState } from 'react';
import type { Card, Deck, Tier } from '../types';
import { playable, shuffle, mulberry32 } from '../lib/deck';
import Handoff from '../components/Handoff';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';
import Icon from '../components/Icon';

/**
 * E12 Leader. One person holds the role for a whole round.
 *
 * Every other engine here alternates turn by turn, which is fair and is exactly
 * why none of them can express a power dynamic: a role that changes hands every
 * thirty seconds is not a role. This one hands it over on a schedule instead,
 * either when the round runs out or when the follower has missed enough times.
 *
 * The reason the format works at all is that the app is doing the asking.
 * Someone who would never say a given sentence out loud will read it off a
 * screen, and the fiction that it was the app's idea is load-bearing. So the
 * commands are shown as instructions to be read, never as suggestions to be
 * approved: an "are you sure?" step would hand the asking back.
 */

interface Props {
  deck: Deck & { roundLength?: number; missLimit?: number; leadNote?: string };
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

type Phase =
  | { step: 'rules' }
  | { step: 'play' }
  | { step: 'swap' }
  | { step: 'over' };

export default function LeaderGame({ deck, names, maxTier, availableProps, onExit }: Props) {
  const roundLength = deck.roundLength ?? 10;
  const missLimit = deck.missLimit ?? 3;

  const pool = useMemo(
    () => shuffle(playable(deck.cards, maxTier, availableProps), mulberry32(Date.now() & 0xffffffff)),
    [deck, maxTier, availableProps],
  );

  const [phase, setPhase] = useState<Phase>({ step: 'rules' });
  const [leader, setLeader] = useState<0 | 1>(0);
  const [i, setI] = useState(0);
  const [given, setGiven] = useState(0);
  const [misses, setMisses] = useState(0);
  const [rounds, setRounds] = useState(0);
  const [obeyedRun, setObeyedRun] = useState(0);

  useScreenTop(`${phase.step}-${i}-${leader}`);

  const card: Card | undefined = pool[i % Math.max(1, pool.length)];
  const follower = leader === 0 ? 1 : 0;

  function endRound() {
    setRounds((r) => r + 1);
    setPhase({ step: 'swap' });
  }

  /** Next command, or the end of the round if this was the last one. */
  function advance(missed: boolean) {
    if (missed) {
      const next = misses + 1;
      setMisses(next);
      setObeyedRun(0);
      if (next >= missLimit) {
        endRound();
        return;
      }
    } else {
      setObeyedRun((n) => n + 1);
    }
    setI((n) => n + 1);
    const count = given + 1;
    setGiven(count);
    if (count >= roundLength) endRound();
  }

  if (phase.step === 'rules') {
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => {
          setLeader(0);
          setI(0);
          setGiven(0);
          setMisses(0);
          setRounds(0);
          setObeyedRun(0);
          setPhase({ step: 'play' });
        }}
        startLabel={`${names[0]} leads first`}
      >
        <p className="play__note">
          {roundLength} commands a round, {missLimit} misses and it swaps.{' '}
          {pool.length} commands available at this ceiling.
        </p>
      </Rules>
    );
  }

  if (phase.step === 'swap') {
    return (
      <Handoff
        to={names[follower]}
        onContinue={() => {
          setLeader(follower);
          setGiven(0);
          setMisses(0);
          setObeyedRun(0);
          setI((n) => n + 1);
          setPhase({ step: 'play' });
        }}
      />
    );
  }

  if (phase.step === 'over' || !card) {
    return (
      <main className="stopped stopped--outcome" data-screen="leader.over">
        <h1 className="stopped__title">
          {rounds === 0 ? 'That is all of them.' : `${rounds} round${rounds === 1 ? '' : 's'}.`}
        </h1>
        <p className="stopped__body">
          {rounds === 0
            ? 'Nothing left at this ceiling. Raise it, or pick something else.'
            : 'Nobody is keeping score past this screen. Nothing about who missed what is written down.'}
        </p>
        <button className="btn btn--big" onClick={onExit}>
          Back
        </button>
      </main>
    );
  }

  return (
    <main className="play" data-screen={`leader.play.${i}`}>
      <header className="play__top">
        <button className="play__back" onClick={onExit} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <span className="play__deck">{deck.title}</span>
        <span className="play__tier">
          {given + 1} / {roundLength}
        </span>
      </header>

      <section className="play__stage">
        <p className="play__eyebrow">{names[leader]} is giving the orders</p>
        <p className="card" key={card.id}>
          {card.text}
        </p>

        {/* The delivery instruction is the deck's, not the engine's. It is the
            part that differs between games riding this mechanic, and it is also
            content, so it belongs in the sealed bundle rather than in a file
            that ships in a public repo. */}
        <p className="play__note">
          {deck.leadNote
            ? deck.leadNote
                .replace(/\{leader\}/g, names[leader])
                .replace(/\{follower\}/g, names[follower])
            : `${names[leader]}, read it out. How you deliver it is yours to decide.`}
        </p>

        {obeyedRun >= 4 && (
          <p className="nudge">
            {obeyedRun} in a row obeyed. The game only works if some of them are
            traps.
          </p>
        )}

        <div className="play__actions">
          <button className="btn btn--ghost" onClick={() => advance(true)}>
            That was a miss
          </button>
          <button className="btn btn--primary" onClick={() => advance(false)}>
            Done, next
          </button>
        </div>

        <div className="misses" aria-label={`${misses} of ${missLimit} misses`}>
          {Array.from({ length: missLimit }, (_, n) => (
            <span key={n} className={`miss ${n < misses ? 'is-on' : ''}`} />
          ))}
          <span className="misses__label">
            {misses} of {missLimit} misses, then it swaps
          </span>
        </div>
      </section>
    </main>
  );
}
