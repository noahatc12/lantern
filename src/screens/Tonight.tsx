import type { CSSProperties } from 'react';
import type { Deck, Tier } from '../types';
import { ENGINE_COLOR, TIER_LABEL } from '../lib/engineMeta';

/**
 * The landing screen, ported from the canvas.
 *
 * The previous home was 29 identical rows, which asks "what do you want?" of two
 * people who opened the app precisely because they had not decided. This answers
 * with ONE suggestion, keeps browsing one tap away, and states tonight's
 * guardrails where both people can see them rather than burying them.
 */

interface Props {
  decks: Deck[];
  names: [string, string];
  maxTier: Tier;
  suggested: Deck | null;
  resume: Deck | null;
  availableProps: string[];
  /** Props the content asks for, and how many items each one gates. */
  knownProps: { name: string; gates: number }[];
  onPick: (deck: Deck) => void;
  onShuffle: () => void;
  onShelf: () => void;
  onTier: (t: Tier) => void;
}

function clockLabel(): string {
  const h = new Date().getHours();
  if (h < 5) return 'late';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'late';
}

function greeting(names: [string, string]): string {
  const h = new Date().getHours();
  if (h < 5) return `Still up, ${names[0]} and ${names[1]}.`;
  if (h < 12) return 'A slow morning is its own kind of night in.';
  if (h < 17) return 'Nobody needs it to be dark.';
  if (h < 22) return `Evening, ${names[0]} and ${names[1]}.`;
  return 'The good hour.';
}

export default function Tonight({
  decks,
  names,
  maxTier,
  suggested,
  resume,
  availableProps,
  knownProps,
  onPick,
  onShuffle,
  onShelf,
  onTier,
}: Props) {
  const visible = decks.filter((d) => d.tierRange[0] <= maxTier);
  const above = decks.length - visible.length;

  // Stated from what the content actually requires, not from a fixed list. The
  // guardrail panel is where both people check what tonight is, so a line here
  // that overstates the filtering is worse than no line at all.
  const missing = knownProps.filter((x) => !availableProps.includes(x.name));
  const gated = missing.reduce((n, x) => n + x.gates, 0);

  return (
    <main className="screen" data-screen="tonight">
      <header className="tonight__head">
        <span className="dot" aria-hidden="true" />
        <span className="tonight__name">Lantern</span>
        <span className="tonight__clock">{clockLabel()}</span>
      </header>

      <p className="greeting">{greeting(names)}</p>

      {resume && (
        <button className="resume" onClick={() => onPick(resume)}>
          <span style={{ flex: 1 }}>
            <span className="resume__eyebrow">pick up where you were</span>
            <span className="resume__title">{resume.title}</span>
            <span className="resume__meta">{resume.blurb}</span>
          </span>
        </button>
      )}

      <section className="tiers" aria-label="Tier ceiling">
        <p className="eyebrow">tonight goes up to {TIER_LABEL[maxTier]}</p>
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
      </section>

      <p className="eyebrow">start here</p>
      {suggested ? (
        <button
          className="suggest"
          style={{ '--engine': ENGINE_COLOR[suggested.engine] } as CSSProperties}
          onClick={() => onPick(suggested)}
        >
          <span className="suggest__title">{suggested.title}</span>
          <span className="suggest__blurb">{suggested.blurb}</span>
          <span className="chips">
            <span className="chip">
              {suggested.tierRange[0] === suggested.tierRange[1]
                ? `tier ${suggested.tierRange[0]}`
                : `tier ${suggested.tierRange[0]}–${suggested.tierRange[1]}`}
            </span>
            <span className="chip">{suggested.duration}</span>
            <span className="chip">{suggested.engine}</span>
          </span>
        </button>
      ) : (
        <p className="play__note">Nothing available at this ceiling. Raise it.</p>
      )}

      <div className="pairbtns">
        <button className="btn" onClick={onShuffle}>
          Surprise us
        </button>
        <button className="btn" onClick={onShelf}>
          Browse all {visible.length}
        </button>
      </div>

      <section className="guardrails">
        <p className="eyebrow">tonight&rsquo;s guardrails</p>
        <div className="guard">
          <span className="guard__dot" style={{ background: 'var(--accent)' }} />
          <span className="guard__text">
            Ceiling {maxTier}, {TIER_LABEL[maxTier]}.{' '}
            {above > 0
              ? `${above} game${above === 1 ? '' : 's'} sit above it and cannot be drawn.`
              : 'Everything is in play.'}
          </span>
        </div>
        <div className="guard">
          <span className="guard__dot" style={{ background: 'var(--ok)' }} />
          <span className="guard__text">
            {knownProps.length === 0
              ? 'Nothing in the decks needs an item you have to fetch.'
              : gated === 0
                ? 'Everything the decks ask for is to hand, so nothing is filtered out.'
                : `${gated} card${gated === 1 ? '' : 's'} filtered out for want of ${missing
                    .map((x) => x.name)
                    .join(' or ')}.`}
          </span>
        </div>
        <div className="guard">
          <span className="guard__dot" style={{ background: 'var(--bad)' }} />
          <span className="guard__text">
            Ease off and Stop sit on every play screen. Neither is ever attributed.
          </span>
        </div>
      </section>

      <p className="foot">
        {names[0]} &amp; {names[1]} &middot; {visible.length} of {decks.length} games available
      </p>
    </main>
  );
}
