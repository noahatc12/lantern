import type { CSSProperties } from 'react';
import type { Deck, Tier } from '../types';
import { BANDS, ENGINE_COLOR, bandFor } from '../lib/engineMeta';

interface Props {
  decks: Deck[];
  names: [string, string];
  maxTier: Tier;
  onPick: (deck: Deck) => void;
  onTier: (t: Tier) => void;
  onNames: () => void;
}

const TIER_LABEL: Record<Tier, string> = {
  1: 'anywhere',
  2: 'personal',
  3: 'flirty',
  4: 'explicit',
  5: 'no limit',
};

function tierText(d: Deck): string {
  return d.tierRange[0] === d.tierRange[1]
    ? `tier ${d.tierRange[0]}`
    : `tier ${d.tierRange[0]}–${d.tierRange[1]}`;
}

export default function Home({ decks, names, maxTier, onPick, onTier, onNames }: Props) {
  const visible = decks
    .filter((d) => d.tierRange[0] <= maxTier)
    .sort((a, b) => a.tierRange[0] - b.tierRange[0] || a.title.localeCompare(b.title));

  const grouped = BANDS.map((band) => ({
    band,
    items: visible.filter((d) => bandFor(d.tierRange[0]).key === band.key),
  })).filter((g) => g.items.length > 0);

  return (
    <main className="home">
      <header className="home__top">
        <span className="dot" aria-hidden="true" />
        <h1 className="home__title">Lantern</h1>
        <button className="home__names" onClick={onNames}>
          {names[0]} &amp; {names[1]}
        </button>
      </header>

      <section className="tiers" aria-label="Tier ceiling">
        <p className="eyebrow">tonight goes up to {TIER_LABEL[maxTier]}</p>
        {/* The wick carries the state so the numbers below can stay quiet. */}
        <div className="wick" aria-hidden="true">
          <div className="wick__fill" style={{ width: `${(maxTier / 5) * 100}%` }} />
        </div>
        <div className="tiers__row">
          {([1, 2, 3, 4, 5] as Tier[]).map((t) => (
            <button
              key={t}
              className={`tier ${t === maxTier ? 'is-on' : ''}`}
              onClick={() => onTier(t)}
              aria-pressed={t === maxTier}
            >
              <span className="tier__n">{t}</span>
              <span className="tier__label">{TIER_LABEL[t]}</span>
            </button>
          ))}
        </div>
        <p className="tiers__hint">
          Raising it needs both of you in the room. Lowering it needs one tap from
          either of you, at any point, and is never attributed.
        </p>
      </section>

      {grouped.map(({ band, items }) => (
        <section className="band" key={band.key}>
          <div className="band__head">
            <h2 className="band__title">{band.label}</h2>
            <span className="band__count">{items.length}</span>
          </div>
          <p className="band__hint">{band.hint}</p>

          <ul className="decks">
            {items.map((d) => (
              <li key={d.id}>
                <button
                  className="deckcard"
                  style={{ '--engine': ENGINE_COLOR[d.engine] } as CSSProperties}
                  onClick={() => onPick(d)}
                >
                  <span className="deckcard__title">{d.title}</span>
                  <span className="deckcard__blurb">{d.blurb}</span>
                  <span className="deckcard__meta">
                    {tierText(d)} &middot; {d.duration}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {visible.length === 0 && (
        <p className="play__note">Nothing at this tier yet. Raise the ceiling.</p>
      )}

      <p className="home__foot">
        {visible.length} of {decks.length} games available at this ceiling
      </p>
    </main>
  );
}
