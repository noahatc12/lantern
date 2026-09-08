import { useState } from 'react';
import type { Deck, Tier } from '../types';
import { playable } from '../lib/deck';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';

/**
 * E8 Builder. Assembles a prompt from independent slot pools.
 *
 * Best content-to-authoring ratio in the app: three pools of a dozen entries
 * make well over a thousand combinations from thirty-six authored lines.
 *
 * Per-slot reroll matters more than it looks. A whole-prompt reroll throws away
 * the two thirds that were fine, so people stop rerolling and just accept
 * things they did not want.
 */

interface SlotOption {
  text: string;
  tier: Tier;
  /** Physical items this option needs. Filtered out when you do not have them. */
  props?: string[];
}

interface SlotDef {
  key: string;
  label: string;
  options: SlotOption[];
}

interface Props {
  deck: Deck & { slotDefs?: SlotDef[] };
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

function pick(options: SlotOption[], maxTier: Tier, have: string[]): string {
  const usable = playable(options, maxTier, have);
  if (usable.length === 0) return '';
  return usable[Math.floor(Math.random() * usable.length)]!.text;
}

export default function BuilderGame({ deck, maxTier, availableProps, onExit }: Props) {
  const defs = deck.slotDefs ?? [];
  const [started, setStarted] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  useScreenTop(started);

  function rollAll() {
    const next: Record<string, string> = {};
    for (const d of defs) next[d.key] = pick(d.options, maxTier, availableProps);
    setValues(next);
  }

  const usable = defs.filter((d) => playable(d.options, maxTier, availableProps).length > 0);

  if (!started) {
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => {
          rollAll();
          setStarted(true);
        }}
        startLabel="Roll"
      >
        <p className="play__note">
          {usable.length} parts,{' '}
          {usable.reduce((n, d) => n + playable(d.options, maxTier, availableProps).length, 0)}{' '}
          options at this ceiling.
        </p>
      </Rules>
    );
  }

  if (usable.length === 0) {
    return (
      <main className="play">
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            &larr;
          </button>
          <span className="play__deck">{deck.title}</span>
        </header>
        <section className="play__stage">
          <p className="card card--quiet">Nothing available at this ceiling. Raise it.</p>
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

      <section className="play__stage">
        <div className="slots">
          {usable.map((d) => (
            <div className="rolled" key={d.key}>
              <p className="rolled__label">{d.label}</p>
              <p className="rolled__value">{values[d.key]}</p>
              <button
                className="rolled__reroll"
                onClick={() =>
                  setValues({ ...values, [d.key]: pick(d.options, maxTier, availableProps) })
                }
                aria-label={`Reroll ${d.label}`}
              >
                reroll
              </button>
            </div>
          ))}
        </div>

        <p className="play__note">
          Reroll any single part. Either of you can veto without explaining.
        </p>

        <div className="play__actions">
          <button className="btn btn--ghost" onClick={rollAll}>
            Roll all
          </button>
          <button className="btn btn--primary" onClick={rollAll}>
            Done, next
          </button>
        </div>
      </section>
    </main>
  );
}
