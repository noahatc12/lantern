import { useMemo, useState } from 'react';
import type { Card, Deck, Tier, TrafficLight as Light } from '../types';
import { applyLight, draw, mulberry32, persistSeen, startSession } from '../lib/deck';
import TrafficLightBar from '../components/TrafficLight';

/**
 * E1 Draw, with the ladder. Truth or Dare runs on this.
 *
 * The choice between truth and dare is the mechanic worth preserving: it gives
 * an out that is not a skip, so momentum survives someone not wanting to answer.
 */

interface Props {
  deck: Deck & { split?: string[]; ladder?: boolean; ladderStep?: number };
  names: [string, string];
  maxTier: Tier;
  onExit: () => void;
}

export default function DrawGame({ deck, names, maxTier, onExit }: Props) {
  const [state, setState] = useState(() =>
    startSession({
      deckId: deck.id,
      maxTier,
      availableProps: [],
      ladder: deck.ladder ?? false,
      ladderStep: deck.ladderStep ?? 5,
    }),
  );
  const [card, setCard] = useState<Card | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const rng = useMemo(() => mulberry32(Date.now() & 0xffffffff), []);

  const split = deck.split ?? [];
  const who = names[state.turn === 'a' ? 0 : 1];

  function pull(chosen: string | null) {
    const scoped: Deck = chosen
      ? { ...deck, cards: deck.cards.filter((c) => (c as Card & { kind?: string }).kind === chosen) }
      : deck;
    const res = draw(scoped, state, rng);
    setKind(chosen);
    setCard(res.card);
    setState(res.state);
    persistSeen(res.state);
  }

  function light(l: Light) {
    const next = applyLight(state, l);
    setState(next);
    if (l === 'red') setCard(null);
  }

  if (state.light === 'red') {
    return (
      <main className="stopped">
        <h1 className="stopped__title">Stopped.</h1>
        <p className="stopped__body">That is the whole feature. No score, no record, no question.</p>
        <button className="btn" onClick={onExit}>
          Back
        </button>
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
        <span className="play__tier">tier {state.effectiveTier}</span>
      </header>

      {!card ? (
        <section className="play__stage">
          <p className="play__turn">{who}</p>
          {split.length > 0 ? (
            <div className="play__choices">
              {split.map((s) => (
                <button key={s} className="btn btn--primary btn--big" onClick={() => pull(s)}>
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <button className="btn btn--primary btn--big" onClick={() => pull(null)}>
              Draw
            </button>
          )}
        </section>
      ) : (
        <section className="play__stage">
          {kind && <p className="play__kind">{kind}</p>}
          <p className="card">{card.text}</p>
          <div className="play__actions">
            <button className="btn btn--ghost" onClick={() => pull(kind)}>
              Skip
            </button>
            <button
              className="btn btn--primary"
              onClick={() => {
                setCard(null);
                setKind(null);
              }}
            >
              Done, pass
            </button>
          </div>
          <p className="play__note">Skipping costs nothing and is never shown to anyone.</p>
        </section>
      )}

      {state.effectiveTier >= 4 && <TrafficLightBar current={state.light} onLight={light} />}
    </main>
  );
}
