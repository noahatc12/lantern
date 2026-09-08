import { useMemo, useState } from 'react';
import type { Card, Deck, Tier, TrafficLight as Light } from '../types';
import {
  applyLight,
  currentTier,
  draw,
  mulberry32,
  nextTurn,
  persistSeen,
  poolProgress,
  resetSeen,
  startSession,
} from '../lib/deck';
import TrafficLightBar from '../components/TrafficLight';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';

/**
 * E1 Draw, with the ladder. Truth or Dare runs on this.
 *
 * Two interactions that look similar and are not:
 *   Skip  - draw a replacement for the SAME person. No turn passes.
 *   Done  - the turn is finished, so the turn passes.
 * Folding those together made skipping silently hand the phone over.
 */

type KindCard = Card & { kind?: string };

interface Props {
  deck: Deck & { split?: string[]; ladder?: boolean; ladderStep?: number };
  names: [string, string];
  maxTier: Tier;
  onExit: () => void;
}

export default function DrawGame({ deck, names, maxTier, onExit }: Props) {
  const [started, setStarted] = useState(false);
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
  const [exhausted, setExhausted] = useState(false);
  const rng = useMemo(() => mulberry32(Date.now() & 0xffffffff), []);

  const split = deck.split ?? [];
  const who = names[state.turn === 'a' ? 0 : 1];
  const progress = poolProgress(deck, state);

  function pull(chosen: string | null) {
    const scoped: Deck = chosen
      ? { ...deck, cards: deck.cards.filter((c) => (c as KindCard).kind === chosen) }
      : deck;
    const res = draw(scoped, state, rng);
    if (!res.card) {
      setExhausted(true);
      return;
    }
    setExhausted(false);
    setKind(chosen);
    setCard(res.card);
    setState(res.state);
    persistSeen(res.state);
  }

  function done() {
    setState(nextTurn(state));
    setCard(null);
    setKind(null);
  }

  function light(l: Light) {
    setState(applyLight(state, l));
    if (l === 'red') setCard(null);
  }

  useScreenTop(`${started}-${card?.id ?? 'none'}-${state.light}`);

  if (!started) {
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => setStarted(true)}
        startLabel={`${names[0]} goes first`}
      >
        <p className="play__note">
          {progress.seen > 0
            ? `${progress.seen} of ${progress.total} cards seen at this ceiling.`
            : `${progress.total} cards available at this ceiling.`}
        </p>
        {progress.seen > 0 && (
          <button
            className="btn btn--ghost"
            onClick={() => {
              resetSeen(deck.id);
              setState({ ...state, drawn: [] });
            }}
          >
            Start the deck over
          </button>
        )}
      </Rules>
    );
  }

  if (state.light === 'red') {
    return (
      <main className="stopped">
        <h1 className="stopped__title">Stopped.</h1>
        <p className="stopped__body">
          That is the whole feature. No score, no record, and no question about who called it.
        </p>
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
        <span className="play__tier">tier {currentTier(state)}</span>
      </header>

      {!card ? (
        <section className="play__stage">
          <p className="play__eyebrow">your turn</p>
          <p className="play__turn">{who}</p>
          {exhausted ? (
            <>
              <p className="card card--quiet">
                Nothing left to draw at this tier. Raise the ceiling or start the deck over.
              </p>
              <button
                className="btn"
                onClick={() => {
                  resetSeen(deck.id);
                  setState({ ...state, drawn: [] });
                  setExhausted(false);
                }}
              >
                Start the deck over
              </button>
            </>
          ) : split.length > 0 ? (
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
            <button className="btn btn--primary" onClick={done}>
              Done, pass
            </button>
          </div>
          <p className="play__note">
            Skip gives {who} a different card. It costs no turn and is never shown to anyone.
          </p>
        </section>
      )}

      {currentTier(state) >= 4 && <TrafficLightBar current={state.light} onLight={light} />}
    </main>
  );
}
