import type { Deck, Tier } from '../types';

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

export default function Home({ decks, names, maxTier, onPick, onTier, onNames }: Props) {
  const visible = decks.filter((d) => d.tierRange[0] <= maxTier);

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
        <p className="tiers__label">tonight goes up to</p>
        <div className="tiers__row">
          {([1, 2, 3, 4, 5] as Tier[]).map((t) => (
            <button
              key={t}
              className={`tier ${t === maxTier ? 'is-on' : ''}`}
              onClick={() => onTier(t)}
            >
              <span className="tier__n">{t}</span>
              <span className="tier__label">{TIER_LABEL[t]}</span>
            </button>
          ))}
        </div>
        <p className="play__note">Set it together before you start. Either of you can lower it mid-game.</p>
      </section>

      <ul className="decks">
        {visible.map((d) => (
          <li key={d.id}>
            <button className="deckcard" onClick={() => onPick(d)}>
              <span className="deckcard__title">{d.title}</span>
              <span className="deckcard__blurb">{d.blurb}</span>
              <span className="deckcard__meta">
                {d.tierRange[0] === d.tierRange[1]
                  ? `tier ${d.tierRange[0]}`
                  : `tier ${d.tierRange[0]}–${d.tierRange[1]}`}
                {' · '}
                {d.duration}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {visible.length === 0 && (
        <p className="play__note">Nothing at this tier yet. Raise the ceiling.</p>
      )}
    </main>
  );
}
