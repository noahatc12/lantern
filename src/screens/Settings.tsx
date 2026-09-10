import { useState } from 'react';
import type { Tier } from '../types';
import { TIER_LABEL } from '../lib/engineMeta';
import { useScreenTop } from '../lib/useScreenTop';
import type { Deck } from '../types';
import Inspect from './Inspect';
import Icon from '../components/Icon';
import { useNavState } from '../lib/transition';

/**
 * Settings and its four sub-screens, ported from the canvas.
 *
 * The props screen is the one that matters most, and the one the canvas got
 * subtly wrong. It listed six plausible items; the content asks for two. A
 * toggle that filters nothing is worse than no toggle, because the guardrail
 * line on Tonight then states a filter the deck is not applying. So the list is
 * derived from the sealed content at runtime: it can name an item only if some
 * card actually requires it, and the count next to each one is the real number
 * of things that item unlocks.
 */

type Sub = 'root' | 'names' | 'props' | 'privacy' | 'reset' | 'inspect';

interface Props {
  names: [string, string];
  defaultTier: Tier;
  availableProps: string[];
  /** Every prop the content actually asks for, with how much it gates. */
  knownProps: { name: string; gates: number }[];
  decks: Deck[];
  onNames: (n: [string, string]) => void;
  onDefaultTier: (t: Tier) => void;
  onProps: (p: string[]) => void;
  onForgetSeen: () => void;
  onLock: () => void;
  onEraseAll: () => void;
  onBack?: () => void;
}

export default function Settings(p: Props) {
  const [sub, setSub] = useNavState<Sub>('root');
  const [a, setA] = useState(p.names[0]);
  const [b, setB] = useState(p.names[1]);

  const back = () => setSub('root');

  // Each sub-screen is a screen. Opening Privacy from a scrolled settings list
  // must start at the top of Privacy, not wherever the finger happened to be.
  useScreenTop(sub);

  if (sub === 'inspect') {
    return <Inspect decks={p.decks} onBack={back} />;
  }

  if (sub === 'names') {
    return (
      <main className="screen" data-screen="settings.names">
        <button className="backbtn" onClick={back} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <p className="h1">Names</p>
        <div className="stack" style={{ marginBottom: 18 }}>
          <input className="field" value={a} onChange={(e) => setA(e.target.value)} aria-label="First name" />
          <input className="field" value={b} onChange={(e) => setB(e.target.value)} aria-label="Second name" />
        </div>
        <p className="lede">
          Used to say whose turn it is and who owes what. Stored on this device only,
          never sent anywhere.
        </p>
        <button
          className="btn btn--primary btn--big"
          disabled={!a.trim() || !b.trim()}
          onClick={() => {
            p.onNames([a.trim(), b.trim()]);
            back();
          }}
        >
          Done
        </button>
      </main>
    );
  }

  if (sub === 'props') {
    const missing = p.knownProps.filter((x) => !p.availableProps.includes(x.name));
    const gated = missing.reduce((n, x) => n + x.gates, 0);
    return (
      <main className="screen" data-screen="settings.props">
        <button className="backbtn" onClick={back} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <p className="h1" style={{ marginBottom: 8 }}>
          What you have to hand
        </p>
        <p className="lede">
          Cards that need something you do not have are filtered out before they can be
          drawn, rather than drawn and then skipped.
        </p>
        {p.knownProps.length === 0 ? (
          <div className="emptybox">
            <p className="emptybox__title">Nothing in the decks needs an item.</p>
            <p className="emptybox__text">
              Every card can be played with what is already in the room, so there is
              nothing to declare here.
            </p>
          </div>
        ) : (
          <>
            <div className="stack" style={{ marginBottom: 22 }}>
              {p.knownProps.map(({ name, gates }) => {
                const on = p.availableProps.includes(name);
                return (
                  <button
                    key={name}
                    className={`prop ${on ? 'is-on' : ''}`}
                    onClick={() =>
                      p.onProps(
                        on
                          ? p.availableProps.filter((x) => x !== name)
                          : [...p.availableProps, name],
                      )
                    }
                    aria-pressed={on}
                  >
                    <span className="prop__label">{name}</span>
                    <span className="prop__gates">
                      {gates} card{gates === 1 ? '' : 's'}
                    </span>
                    <span className="prop__mark">
                      <Icon name={on ? 'check' : 'plus'} size={17} />
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="emptybox__text">
              {gated === 0
                ? 'Nothing is being filtered out.'
                : `${gated} card${gated === 1 ? '' : 's'} filtered out for want of ${missing
                    .map((x) => x.name)
                    .join(' or ')}.`}
            </p>
          </>
        )}
      </main>
    );
  }

  if (sub === 'privacy') {
    return (
      <main className="screen" data-screen="settings.privacy">
        <button className="backbtn" onClick={back} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <p className="h1">What this app can and cannot do</p>
        <div className="stack">
          <div className="fact">
            <p className="fact__label fact__label--ok">no accounts</p>
            <p className="fact__text">
              There is nothing to sign into. Everything lives in this browser&rsquo;s storage,
              on this phone.
            </p>
          </div>
          <div className="fact">
            <p className="fact__label fact__label--ok">no requests</p>
            <p className="fact__text">
              No analytics, no fonts from a CDN, no error reporting. A page about two
              people&rsquo;s evening should not be leaking a referrer to anyone.
            </p>
          </div>
          <div className="fact">
            <p className="fact__label fact__label--ok">content sealed</p>
            <p className="fact__text">
              The card decks ship encrypted. Your passphrase derives the key here, in the
              page, and the plain text never touches a server or a disk.
            </p>
          </div>
          <div className="fact">
            <p className="fact__label fact__label--ok">works with no signal</p>
            <p className="fact__text">
              The whole app and the sealed bundle are kept on the phone after the first
              visit, so it opens and plays with the network off entirely. It only reaches
              out to notice that a newer version exists.
            </p>
          </div>
          <div className="fact">
            <p className="fact__label fact__label--warn">what is written down</p>
            <p className="fact__text">
              Your names, the ceiling, the vault, which cards you have seen, and match
              overlaps. Never a No either of you gave, never who eased off, never who
              stopped.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (sub === 'reset') {
    return (
      <main className="screen screen--center" data-screen="settings.reset">
        <div style={{ margin: 'auto 0' }}>
          <p className="h1 h1--big">Erase everything?</p>
          <p className="lede">
            Names, the ceiling, the vault, saved results and seen-card memory.
            Immediately, with no bin and no undo. The sealed bundle stays; everything you
            and {p.names[1] || 'they'} put in does not.
          </p>
        </div>
        <div className="stack">
          <button className="btn btn--danger btn--big" onClick={p.onEraseAll}>
            Erase it all
          </button>
          <button className="btn btn--big" onClick={back}>
            Keep it
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen" data-screen="settings">
      {p.onBack && (
        <button className="backbtn" onClick={p.onBack} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
      )}
      <p className="h1 h1--big">Settings</p>

      <p className="eyebrow">this phone</p>
      <div className="rows">
        <button className="row2" onClick={() => setSub('names')}>
          <span className="row2__label">Names</span>
          <span className="row2__value">
            {p.names[0]} &amp; {p.names[1]}
          </span>
        </button>
        <button className="row2" onClick={() => setSub('props')}>
          <span className="row2__label">What you have to hand</span>
          <span className="row2__value">
            {p.availableProps.length} of {p.knownProps.length}
          </span>
        </button>
        <button className="row2" onClick={() => setSub('privacy')}>
          <span className="row2__label">Privacy</span>
          <span className="row2__value">local only</span>
        </button>
      </div>

      <p className="eyebrow">defaults</p>
      <div className="guardrails" style={{ marginTop: 0, marginBottom: 26 }}>
        <p style={{ margin: '0 0 12px', color: 'var(--ink-mid)', fontSize: 14.5 }}>
          Ceiling each session opens at
        </p>
        {/* Same control as Tonight, wick and all. Stripped to bare numerals it
            had no visible selected state at all, so the one setting on this
            screen that changes what gets dealt was also the least legible. */}
        <div className="wick" aria-hidden="true">
          <div className="wick__fill" style={{ width: `${(p.defaultTier / 5) * 100}%` }} />
        </div>
        <div className="tiers__row">
          {([1, 2, 3, 4, 5] as Tier[]).map((t) => (
            <button
              key={t}
              className={`tier ${t === p.defaultTier ? 'is-on' : ''}`}
              onClick={() => p.onDefaultTier(t)}
              aria-pressed={t === p.defaultTier}
            >
              <span className="tier__n">{t}</span>
              <span className="tier__label">{TIER_LABEL[t]}</span>
            </button>
          ))}
        </div>
        <p className="emptybox__text" style={{ marginTop: 14 }}>
          Opens at {TIER_LABEL[p.defaultTier]}. A session never starts higher than this,
          wherever you left it last night.
        </p>
      </div>

      <p className="eyebrow">content</p>
      <div className="rows">
        <button className="row2" onClick={() => setSub('inspect')}>
          <span className="row2__label">Look through everything</span>
          <span className="row2__value">{p.decks.length} games</span>
        </button>
        <div className="row2">
          <span className="row2__label">Bundle</span>
          <span className="row2__value">sealed &middot; {p.decks.length} games</span>
        </div>
        <button className="row2" onClick={p.onForgetSeen}>
          <span className="row2__label">Seen-card memory</span>
          <span className="row2__value">forget</span>
        </button>
        <button className="row2" onClick={p.onLock}>
          <span className="row2__label">Lock now</span>
          <span className="row2__value">requires passphrase</span>
        </button>
      </div>

      <button className="card--danger" onClick={() => setSub('reset')}>
        Erase everything on this device
      </button>

      <p className="foot">
        Lantern &middot; no accounts, no analytics, no third-party requests.
        <br />
        Content is decrypted in your browser and never uploaded.
      </p>
    </main>
  );
}
