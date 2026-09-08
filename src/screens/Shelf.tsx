import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Deck, Tier } from '../types';
import { BANDS, ENGINE_COLOR, bandFor } from '../lib/engineMeta';

/**
 * Browsing, ported from the canvas.
 *
 * Split out of the landing screen so each answers one question: Tonight says
 * "play this", the shelf says "show me everything". Conflating them made the
 * landing screen a wall of 29 rows.
 *
 * The locked section is the part worth keeping: rather than hiding what sits
 * above tonight's ceiling, it names it and offers to raise. Hiding it invites
 * one person to quietly raise the ceiling to find out what is up there, which
 * is exactly the decision the design wants made out loud.
 */

const FILTERS = [
  { key: 'all', label: 'Everything' },
  { key: 'short', label: 'Short' },
  { key: 'talk', label: 'Talking' },
  { key: 'match', label: 'Sorting' },
  { key: 'timer', label: 'Timed' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

function matchesFilter(d: Deck, f: FilterKey): boolean {
  if (f === 'all') return true;
  if (f === 'short') return d.duration === 'short';
  if (f === 'talk') return d.engine === 'draw' || d.engine === 'compare' || d.engine === 'predict';
  if (f === 'match') return d.engine === 'match' || d.engine === 'scale';
  if (f === 'timer') return d.engine === 'timer' || d.engine === 'endurance';
  return true;
}

interface Props {
  decks: Deck[];
  maxTier: Tier;
  onPick: (deck: Deck) => void;
  onBack?: () => void;
  onTier: (t: Tier) => void;
}

export default function Shelf({ decks, maxTier, onPick, onBack, onTier }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const q = query.trim().toLowerCase();
  const inCeiling = decks.filter((d) => d.tierRange[0] <= maxTier);
  const locked = decks.filter((d) => d.tierRange[0] > maxTier);

  const visible = inCeiling
    .filter((d) => matchesFilter(d, filter))
    .filter((d) => !q || d.title.toLowerCase().includes(q) || d.blurb.toLowerCase().includes(q))
    .sort((a, b) => a.tierRange[0] - b.tierRange[0] || a.title.localeCompare(b.title));

  const grouped = BANDS.map((band) => ({
    band,
    items: visible.filter((d) => bandFor(d.tierRange[0]).key === band.key),
  })).filter((g) => g.items.length > 0);

  const nextTier = Math.min(5, maxTier + 1) as Tier;

  return (
    <main className="screen" data-screen="shelf">
      {onBack && (
        <button className="backbtn" onClick={onBack} aria-label="Back">
          &larr;
        </button>
      )}
      <p className="h1 h1--big">The shelf</p>

      <div className="search">
        <input
          className="search__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search games"
          aria-label="Search games"
        />
      </div>

      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`filter ${filter === f.key ? 'is-on' : ''}`}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
          >
            {f.label}
          </button>
        ))}
      </div>

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
                    {d.tierRange[0] === d.tierRange[1]
                      ? `tier ${d.tierRange[0]}`
                      : `tier ${d.tierRange[0]}–${d.tierRange[1]}`}{' '}
                    &middot; {d.duration}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {visible.length === 0 && (
        <div style={{ padding: '30px 6px', textAlign: 'center' }}>
          <p className="emptybox__title">Nothing matches that.</p>
          <p className="emptybox__text" style={{ marginBottom: 18 }}>
            Try a different word, clear the filters, or raise the ceiling
            {locked.length > 0 && ` — ${locked.length} games sit above tier ${maxTier}`}.
          </p>
          <button
            className="btn"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      {locked.length > 0 && (
        <section className="locked">
          <p className="eyebrow">above tonight&rsquo;s ceiling</p>
          <p className="band__hint">
            {locked.length} game{locked.length === 1 ? '' : 's'} open at tier {nextTier} and up.
            Raising the ceiling is a decision for both of you, in the room.
          </p>
          <ul className="locked__list">
            {locked.slice(0, 6).map((d) => (
              <li className="locked__row" key={d.id}>
                <span className="locked__title">{d.title}</span>
                <span className="locked__rule" />
                <span className="locked__meta">tier {d.tierRange[0]}</span>
              </li>
            ))}
          </ul>
          <button className="btn btn--accent-ghost" onClick={() => onTier(nextTier)}>
            Raise to tier {nextTier}
          </button>
        </section>
      )}
    </main>
  );
}
