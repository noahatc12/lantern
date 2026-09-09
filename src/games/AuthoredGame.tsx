import { useState } from 'react';
import type { Deck, Tier } from '../types';
import { isAuthored, read, write } from '../lib/storage';
import type { AuthoredItem } from '../lib/storage';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';

/**
 * E14 Authored. The content is yours, and the app only holds it.
 *
 * Two games ride this, and the thing they share is the part that makes them
 * work: you write privately, the app mixes both sets together, and what comes
 * back out carries no name on it. Anonymous authorship is the whole design.
 * You can put something in without being the person who asked for it, and if it
 * lands badly nobody has to own it. Same protective logic as the sorting games,
 * applied to freeform text.
 *
 * Be honest about the limits of that. With two people and a small pool, phrasing
 * gives you away often enough that this is plausible deniability rather than
 * secrecy, and the app says so on the authoring screen rather than overselling
 * it.
 *
 *   jar     draw whenever you like, in any order
 *   sealed  written in threes, unlocked on a clock, one at a time
 *
 * Delete is real here. This is the only content in the app that someone sat and
 * wrote, so "delete" removing it from the array and nothing else would be the
 * worst possible place to be sloppy.
 */

type Mode = 'jar' | 'sealed';

interface Props {
  deck: Deck & {
    mode?: Mode;
    prompts?: string[];
    /** How many to write in one sitting, for the sealed variant. */
    writeBatch?: number;
    /** Days between one sealed item opening and the next. */
    unlockDays?: number;
  };
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

type Route =
  | { at: 'rules' }
  | { at: 'list' }
  | { at: 'who' }
  | { at: 'write'; by: 0 | 1; n: number }
  | { at: 'drawn'; id: string };

const DAY = 86400000;

export default function AuthoredGame({ deck, names, onExit }: Props) {
  const mode: Mode = deck.mode ?? 'jar';
  const batch = deck.writeBatch ?? 3;
  const unlockDays = deck.unlockDays ?? 7;
  const key = `authored.${deck.id}`;

  const [items, setItems] = useState<AuthoredItem[]>(() =>
    read<AuthoredItem[]>(key, [], isAuthored),
  );
  const [route, setRoute] = useState<Route>({ at: 'rules' });
  const [draft, setDraft] = useState('');
  const [revealed, setRevealed] = useState<string[]>([]);

  useScreenTop(`${route.at}-${'n' in route ? route.n : ''}`);

  function persist(next: AuthoredItem[]) {
    setItems(next);
    write(key, next);
  }

  const now = Date.now();
  const open = items.filter((it) => it.doneAt === undefined);
  const done = items.filter((it) => it.doneAt !== undefined);
  const sealed = open.filter((it) => (it.unlockAt ?? 0) > now);
  const ready = open.filter((it) => (it.unlockAt ?? 0) <= now);

  /**
   * Each sealed item opens one interval after the last one, so writing fifteen
   * in a sitting gives you fifteen weeks rather than fifteen envelopes you burn
   * through in a night. Scarcity is the mechanism.
   *
   * The very first one opens immediately. A game whose first move is "come back
   * in a week" does not get a second sitting, and the spacing still holds from
   * the second onwards.
   */
  function unlockFor(index: number): number {
    const last = items.reduce((t, it) => Math.max(t, it.unlockAt ?? 0), 0);
    return Math.max(last, now) + index * unlockDays * DAY;
  }

  const prompt = (n: number) =>
    deck.prompts && deck.prompts.length > 0
      ? deck.prompts[n % deck.prompts.length]!
      : 'something you want';

  /* ---------------------------------------------------------------- rules */

  if (route.at === 'rules') {
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => setRoute({ at: 'list' })}
        startLabel={items.length === 0 ? 'Start writing' : 'Open it'}
      >
        <p className="play__note">
          {items.length === 0
            ? 'Nothing in it yet. Both of you write some first.'
            : `${open.length} still in there, ${done.length} done.`}
        </p>
      </Rules>
    );
  }

  /* ------------------------------------------------------------------ who */

  if (route.at === 'who') {
    return (
      <main className="screen" data-screen="authored.who">
        <button className="backbtn" onClick={() => setRoute({ at: 'list' })} aria-label="Back">
          &larr;
        </button>
        <p className="h1">Who is writing?</p>
        <p className="lede">
          Take the phone somewhere else. Whatever you write goes in without your name on
          it, and the other one will not know which are yours.
        </p>
        <div className="stack">
          {names.map((n, i) => (
            <button
              key={n + i}
              className="btn btn--big btn--pick"
              onClick={() => {
                setDraft('');
                setRoute({ at: 'write', by: i as 0 | 1, n: 0 });
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="foot">
          Two people and a short list is not real anonymity. Phrasing gives you away and
          that is fine. It is deniability, not secrecy.
        </p>
      </main>
    );
  }

  /* ---------------------------------------------------------------- write */

  if (route.at === 'write') {
    const written = route.n;
    const enough = mode === 'sealed' ? written >= batch : written >= 1;
    return (
      <main className="screen" data-screen="authored.write">
        <button className="backbtn" onClick={() => setRoute({ at: 'list' })} aria-label="Back">
          &larr;
        </button>
        <p className="eyebrow">
          {names[route.by]}, privately &middot; {written} written
        </p>
        <p className="h1">{prompt(written)}</p>

        <textarea
          className="answer answer--vault"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="be specific, and mean it"
          rows={4}
          aria-label="What you want"
        />

        <button
          className="btn btn--primary btn--big"
          disabled={!draft.trim()}
          onClick={() => {
            const item: AuthoredItem = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              by: route.by,
              text: draft.trim(),
              at: Date.now(),
              ...(mode === 'sealed' ? { unlockAt: unlockFor(written) } : {}),
            };
            persist([...items, item]);
            setDraft('');
            setRoute({ at: 'write', by: route.by, n: written + 1 });
          }}
        >
          Put it in
        </button>

        <button
          className="btn btn--big"
          style={{ marginTop: 10 }}
          disabled={!enough && written === 0}
          onClick={() => setRoute({ at: 'list' })}
        >
          {written === 0 ? 'Nothing for now' : `Done, ${written} in`}
        </button>

        <p className="foot">
          {mode === 'sealed'
            ? `Write about ${batch} at a time. Fifteen in one sitting produces fifteen versions of the same idea.`
            : 'Write as many as you like. Ten to fifteen each is about right.'}
        </p>
      </main>
    );
  }

  /* ---------------------------------------------------------------- drawn */

  if (route.at === 'drawn') {
    const item = items.find((it) => it.id === route.id);
    if (!item) {
      setRoute({ at: 'list' });
      return null;
    }
    const isRevealed = revealed.includes(item.id);
    return (
      <main className="play" data-screen="authored.drawn">
        <header className="play__top">
          <button className="play__back" onClick={() => setRoute({ at: 'list' })} aria-label="Back">
            &larr;
          </button>
          <span className="play__deck">{deck.title}</span>
        </header>
        <section className="play__stage">
          <p className="play__eyebrow">
            {isRevealed ? `${names[item.by]} wrote this` : 'one of you wrote this'}
          </p>
          <p className="card">{item.text}</p>

          <div className="play__actions">
            <button
              className="btn btn--ghost"
              onClick={() => setRevealed([...revealed, item.id])}
              disabled={isRevealed}
            >
              {isRevealed ? 'Revealed' : 'Who wrote it?'}
            </button>
            <button
              className="btn btn--primary"
              onClick={() => {
                persist(
                  items.map((it) =>
                    it.id === item.id ? { ...it, doneAt: Date.now() } : it,
                  ),
                );
                setRoute({ at: 'list' });
              }}
            >
              Done, put it away
            </button>
          </div>

          <p className="play__note">
            Nobody has to claim it. The author is only shown if someone taps for it, and
            then only on this screen.
          </p>

          <button
            className="btn btn--danger"
            style={{ marginTop: 18 }}
            onClick={() => {
              persist(items.filter((it) => it.id !== item.id));
              setRoute({ at: 'list' });
            }}
          >
            Delete it instead
          </button>
        </section>
      </main>
    );
  }

  /* ----------------------------------------------------------------- list */

  return (
    <main className="play" data-screen="authored.list">
      <header className="play__top">
        <button className="play__back" onClick={onExit} aria-label="Back">
          &larr;
        </button>
        <span className="play__deck">{deck.title}</span>
        <span className="play__tier">{open.length} left</span>
      </header>

      <section className="play__stage">
        {items.length === 0 ? (
          <div className="emptybox">
            <p className="emptybox__title">Empty so far.</p>
            <p className="emptybox__text">
              Both of you need to put some in before there is anything to draw. Take the
              phone away and write yours, then hand it over.
            </p>
          </div>
        ) : (
          <>
            <p className="stat__n" style={{ fontSize: 44 }}>
              {ready.length}
            </p>
            <p className="play__note" style={{ marginTop: 0 }}>
              {mode === 'sealed'
                ? `${ready.length} ready to open, ${sealed.length} still sealed.`
                : `${ready.length} still in the jar.`}
            </p>
          </>
        )}

        <div className="stack" style={{ marginTop: 20 }}>
          <button
            className="btn btn--primary btn--big"
            disabled={ready.length === 0}
            onClick={() => {
              const pick = ready[Math.floor(Math.random() * ready.length)]!;
              setRoute({ at: 'drawn', id: pick.id });
            }}
          >
            {mode === 'sealed' ? 'Open the next one' : 'Draw one'}
          </button>
          <button className="btn btn--big" onClick={() => setRoute({ at: 'who' })}>
            Add some
          </button>
        </div>

        {sealed.length > 0 && (
          <>
            <p className="eyebrow" style={{ marginTop: 28 }}>
              still sealed ({sealed.length})
            </p>
            <ul className="ious">
              {sealed.map((it) => {
                const days = Math.ceil(((it.unlockAt ?? 0) - now) / DAY);
                return (
                  <li className="iou iou--sealed" key={it.id}>
                    <p className="iou__text">Sealed until it opens.</p>
                    <div className="iou__actions">
                      <span className="iou__state">
                        Opens in {days} day{days === 1 ? '' : 's'}
                      </span>
                      <span style={{ flex: 1 }} />
                      <button
                        className="iou__delete"
                        onClick={() => persist(items.filter((x) => x.id !== it.id))}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {done.length > 0 && (
          <>
            <p className="eyebrow" style={{ marginTop: 28 }}>
              done ({done.length})
            </p>
            <ul className="result__list result__list--quiet">
              {done.map((it) => (
                <li key={it.id}>{it.text}</li>
              ))}
            </ul>
            <button
              className="btn btn--danger"
              style={{ marginTop: 16 }}
              onClick={() => persist(items.filter((it) => it.doneAt === undefined))}
            >
              Clear the done pile
            </button>
          </>
        )}
      </section>
    </main>
  );
}
