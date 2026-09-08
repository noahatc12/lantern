import { useState } from 'react';
import type { Deck } from '../types';
import Rules from '../components/Rules';
import { read, write } from '../lib/storage';
import { useScreenTop } from '../lib/useScreenTop';

/**
 * E10 Vault. Deferred redemption.
 *
 * Roughly 40% of the physical couples-game category by item count is coupons,
 * IOUs and sealed envelopes, and every paper version fails the same way: it gets
 * lost, or forgotten, or feels silly to hand over. A phone can hold an IOU and
 * surface it three weeks later, which is the one place this format is strictly
 * better than paper rather than a compromise on it. No competing app does it.
 *
 * The redemption tap is the whole product. Handing someone a paper coupon takes
 * a small act of courage; tapping a button you already own does not.
 *
 * This is the only engine with genuinely long-lived state, so it is also the
 * only one where "delete" has to actually delete.
 */

interface Item {
  id: string;
  from: number;
  text: string;
  createdAt: number;
  unlockAt?: number;
  redeemedAt?: number;
}

interface Props {
  deck: Deck & { locking?: boolean };
  names: [string, string];
  onExit: () => void;
}

const KEY = 'vault.items';

export default function VaultGame({ deck, names, onExit }: Props) {
  const [started, setStarted] = useState(false);
  const [items, setItems] = useState<Item[]>(() => read<Item[]>(KEY, []));
  const [drafting, setDrafting] = useState(false);
  const [author, setAuthor] = useState<0 | 1>(0);
  const [text, setText] = useState('');
  const [lockDays, setLockDays] = useState(0);

  function persist(next: Item[]) {
    setItems(next);
    write(KEY, next);
  }

  const now = Date.now();
  const open = items.filter((it) => !it.redeemedAt);
  const done = items.filter((it) => it.redeemedAt);

  useScreenTop(`${started}-${drafting}`);

  if (!started) {
    return (
      <Rules deck={deck} onExit={onExit} onStart={() => setStarted(true)} startLabel="Open the vault">
        <p className="play__note">
          {open.length} open, {done.length} redeemed.
        </p>
      </Rules>
    );
  }

  if (drafting) {
    return (
      <main className="play">
        <header className="play__top">
          <button className="play__back" onClick={() => setDrafting(false)} aria-label="Back">
            &larr;
          </button>
          <span className="play__deck">New promise</span>
        </header>
        <section className="play__stage play__stage--form">
          <div className="optin">
            {names.map((n, idx) => (
              <button
                key={n}
                className={`btn optin__btn ${author === idx ? 'is-on' : ''}`}
                onClick={() => setAuthor(idx as 0 | 1)}
              >
                {n} owes
              </button>
            ))}
          </div>
          <textarea
            className="answer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="what is owed, specifically"
            rows={4}
          />
          {deck.locking && (
            <div className="lockrow">
              <span className="rolled__label">locked for</span>
              {[0, 7, 30, 365].map((d) => (
                <button
                  key={d}
                  className={`slot__mark ${lockDays === d ? 'is-on' : ''}`}
                  onClick={() => setLockDays(d)}
                >
                  {d === 0 ? 'not locked' : d === 365 ? '1 year' : `${d}d`}
                </button>
              ))}
            </div>
          )}
          <button
            className="btn btn--primary"
            disabled={!text.trim()}
            onClick={() => {
              persist([
                {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  from: author,
                  text: text.trim(),
                  createdAt: Date.now(),
                  ...(lockDays > 0 ? { unlockAt: Date.now() + lockDays * 86400000 } : {}),
                },
                ...items,
              ]);
              setText('');
              setLockDays(0);
              setDrafting(false);
            }}
          >
            Put it in the vault
          </button>
          <p className="play__note">
            Be specific. "A massage" is redeemable; "something nice" is not.
          </p>
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
        <span className="play__tier">{open.length} open</span>
      </header>

      <section className="vault">
        <button className="btn btn--primary btn--big" onClick={() => setDrafting(true)}>
          Write a new one
        </button>

        {open.length === 0 && (
          <p className="play__note">
            Nothing in the vault yet. Write one now and redeem it whenever you feel like it.
          </p>
        )}

        {open.map((it) => {
          const locked = it.unlockAt !== undefined && it.unlockAt > now;
          const days = locked ? Math.ceil((it.unlockAt! - now) / 86400000) : 0;
          return (
            <div className="iou" key={it.id}>
              <p className="iou__who">{names[it.from]} owes</p>
              <p className="iou__text">{locked ? 'Sealed.' : it.text}</p>
              <div className="iou__actions">
                {locked ? (
                  <span className="iou__locked">unlocks in {days}d</span>
                ) : (
                  <button
                    className="btn btn--primary iou__btn"
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
                <button
                  className="btn btn--ghost iou__btn"
                  onClick={() => persist(items.filter((x) => x.id !== it.id))}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}

        {done.length > 0 && (
          <>
            <h2 className="result__head">Redeemed ({done.length})</h2>
            <ul className="result__list result__list--quiet">
              {done.map((it) => (
                <li key={it.id}>
                  {names[it.from]}: {it.text}
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="play__note">
          Redeeming cannot be undone. Delete removes it for good, immediately.
        </p>
      </section>
    </main>
  );
}
