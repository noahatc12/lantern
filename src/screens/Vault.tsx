import { useMemo, useState } from 'react';
import type { Deck } from '../types';
import { isMatchResult, isVaultItems, keys, read, remove, write } from '../lib/storage';
import { useScreenTop } from '../lib/useScreenTop';
import type { MatchResult, VaultItem } from '../lib/storage';

/**
 * The vault, promoted from a deck to a place.
 *
 * It was reachable only by finding "The Vault" in a list of twenty-nine games
 * and sitting through a rules screen, which is backwards: an IOU written three
 * weeks ago has to be visible without anyone remembering to go looking. It is
 * now a tab, and it also holds the saved match results, which were previously
 * reachable only by reopening the exact deck they came from.
 *
 * The seal is the one thing here that must be real. A sealed IOU that either of
 * you can open early is a countdown, not a seal.
 */

const KEY = 'vault.items';
const DAY = 86400000;
const SEAL_OPTIONS = [0, 3, 7, 30];

interface SavedResult {
  deckId: string;
  title: string;
  at: number;
  both: string[];
  partial: string[];
}

interface Props {
  decks: Deck[];
  names: [string, string];
  onExit?: () => void;
}

function sealedUntil(it: VaultItem): number | null {
  if (it.redeemedAt !== undefined) return null;
  if (it.unlockAt === undefined) return null;
  return it.unlockAt > Date.now() ? it.unlockAt : null;
}

export default function Vault({ decks, names, onExit }: Props) {
  const [items, setItems] = useState<VaultItem[]>(() =>
    read<VaultItem[]>(KEY, [], isVaultItems),
  );
  const [route, setRoute] = useState<'list' | 'new' | 'result'>('list');
  const [open, setOpen] = useState<SavedResult | null>(null);

  // Draft state for a new IOU.
  const [who, setWho] = useState<0 | 1>(0);
  const [text, setText] = useState('');
  const [seal, setSeal] = useState(0);

  const [savedVersion, setSavedVersion] = useState(0);

  // Sub-routes are full screens, so they get the same land-at-the-top rule as
  // any other navigation. Without this, opening a saved result from a scrolled
  // vault drops you into the middle of it.
  useScreenTop(route);

  /**
   * Match results are stored one key per deck, so they cannot be found without
   * enumerating. Reading them here is what makes "saved results" a place rather
   * than something you have to remember which deck produced.
   */
  const saved = useMemo<SavedResult[]>(() => {
    void savedVersion;
    const out: SavedResult[] = [];
    for (const k of keys()) {
      if (!k.startsWith('match.')) continue;
      const deckId = k.slice('match.'.length);
      const value = read<MatchResult | null>(k, null, isMatchResult);
      if (!value) continue;
      out.push({
        deckId,
        title: decks.find((d) => d.id === deckId)?.title ?? 'A sort',
        at: value.at,
        both: value.both,
        partial: value.partial,
      });
    }
    return out.sort((a, b) => b.at - a.at);
  }, [decks, savedVersion]);

  function persist(next: VaultItem[]) {
    setItems(next);
    write(KEY, next);
  }

  if (route === 'new') {
    return (
      <main className="screen" data-screen="vault.new">
        <button className="backbtn" onClick={() => setRoute('list')} aria-label="Back">
          &larr;
        </button>
        <p className="h1">Who owes what?</p>

        <p className="eyebrow">owed by</p>
        <div className="pairbtns" style={{ marginBottom: 22 }}>
          {names.map((n, i) => (
            <button
              key={n + i}
              className={`btn btn--pick ${who === i ? 'is-on' : ''}`}
              onClick={() => setWho(i as 0 | 1)}
              aria-pressed={who === i}
            >
              {n}
            </button>
          ))}
        </div>

        <p className="eyebrow">what, exactly</p>
        <textarea
          className="answer answer--vault"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A full hour, no phones, doing whatever you pick."
          rows={4}
          aria-label="What is owed"
        />

        <p className="eyebrow">seal it</p>
        <div className="seals">
          {SEAL_OPTIONS.map((n) => (
            <button
              key={n}
              className={`filter ${seal === n ? 'is-on' : ''}`}
              onClick={() => setSeal(n)}
              aria-pressed={seal === n}
            >
              {n === 0 ? 'Open now' : `${n} days`}
            </button>
          ))}
        </div>
        <p className="emptybox__text" style={{ margin: '10px 0 26px' }}>
          A sealed one cannot be opened early, by either of you. That is the point of
          sealing it.
        </p>

        <button
          className="btn btn--primary btn--big"
          disabled={!text.trim()}
          onClick={() => {
            persist([
              {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                from: who,
                text: text.trim(),
                createdAt: Date.now(),
                ...(seal > 0 ? { unlockAt: Date.now() + seal * DAY } : {}),
              },
              ...items,
            ]);
            setText('');
            setSeal(0);
            setRoute('list');
          }}
        >
          Put it in the vault
        </button>
      </main>
    );
  }

  if (route === 'result' && open) {
    const deck = decks.find((d) => d.id === open.deckId);
    const textOf = (id: string) => deck?.cards.find((c) => c.id === id)?.text;
    // A card can be missing if the deck changed since the sort. Showing a blank
    // row would read as an answer; dropping it silently would misstate the
    // count. Say so instead.
    const line = (id: string) => textOf(id) ?? 'A card no longer in this deck';
    return (
      <main className="screen" data-screen="vault.result">
        <button className="backbtn" onClick={() => setRoute('list')} aria-label="Back">
          &larr;
        </button>
        <p className="h1">{open.title}</p>
        <p className="lede">
          Sorted {new Date(open.at).toLocaleDateString()}. Only the overlap was ever
          written down.
        </p>

        <h2 className="result__head">Both yes ({open.both.length})</h2>
        {open.both.length === 0 ? (
          <p className="play__note">Nothing overlapped that time.</p>
        ) : (
          <ul className="result__list">
            {open.both.map((id) => (
              <li key={id}>{line(id)}</li>
            ))}
          </ul>
        )}

        <h2 className="result__head">Worth talking about ({open.partial.length})</h2>
        {open.partial.length === 0 ? (
          <p className="play__note">Nothing in between.</p>
        ) : (
          <ul className="result__list result__list--quiet">
            {open.partial.map((id) => (
              <li key={id}>{line(id)}</li>
            ))}
          </ul>
        )}

        <button
          className="btn btn--danger"
          style={{ marginTop: 22 }}
          onClick={() => {
            remove(`match.${open.deckId}`);
            setSavedVersion((v) => v + 1);
            setOpen(null);
            setRoute('list');
          }}
        >
          Delete this result
        </button>
      </main>
    );
  }

  return (
    <main className="screen" data-screen="vault">
      {onExit && (
        <button className="backbtn" onClick={onExit} aria-label="Back">
          &larr;
        </button>
      )}
      <div className="vault__head">
        <p className="h1 h1--big" style={{ margin: 0, flex: 1 }}>
          The vault
        </p>
        <button className="btn--accent-ghost btn--pill" onClick={() => setRoute('new')}>
          Write one
        </button>
      </div>
      <p className="lede">
        Things one of you owes the other. A phone remembers three weeks later, which is
        exactly where paper coupon books fail.
      </p>

      {items.length === 0 && (
        <div className="emptybox">
          <p className="emptybox__title">Nothing owed yet.</p>
          <p className="emptybox__text">
            Be specific when you write one. &ldquo;A massage&rdquo; gets redeemed;
            &ldquo;something nice&rdquo; never does.
          </p>
        </div>
      )}

      <ul className="ious">
        {items.map((it) => {
          const until = sealedUntil(it);
          const days = until === null ? 0 : Math.ceil((until - Date.now()) / DAY);
          return (
            <li className={`iou ${until !== null ? 'iou--sealed' : ''}`} key={it.id}>
              <p className="iou__who">{names[it.from] ?? 'Someone'} owes</p>
              <p className="iou__text">
                {until !== null ? 'Sealed until it opens.' : it.text}
              </p>
              <div className="iou__actions">
                {until !== null && (
                  <span className="iou__state">
                    Opens in {days} day{days === 1 ? '' : 's'}
                  </span>
                )}
                {until === null && it.redeemedAt === undefined && (
                  <button
                    className="btn--redeem"
                    onClick={() =>
                      persist(
                        items.map((x) =>
                          x.id === it.id ? { ...x, redeemedAt: Date.now() } : x,
                        ),
                      )
                    }
                  >
                    Redeem
                  </button>
                )}
                {it.redeemedAt !== undefined && (
                  <span className="iou__state iou__state--done">Redeemed and gone</span>
                )}
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

      {saved.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 32 }}>
            saved results
          </p>
          <ul className="rows rows--gap">
            {saved.map((r) => (
              <li key={r.deckId}>
                <button
                  className="row2 row2--card"
                  onClick={() => {
                    setOpen(r);
                    setRoute('result');
                  }}
                >
                  <span className="row2__label">
                    <span className="saved__title">{r.title}</span>
                    <span className="saved__meta">
                      {r.both.length} both yes &middot; {r.partial.length} maybe
                    </span>
                  </span>
                  <span className="saved__count">{r.both.length}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="emptybox__text" style={{ marginTop: 16 }}>
            Only overlaps are stored. Anything either of you passed on was never written
            to this phone.
          </p>
        </>
      )}

      <p className="foot">
        Redeeming cannot be undone. Delete removes it for good, immediately.
      </p>
    </main>
  );
}
