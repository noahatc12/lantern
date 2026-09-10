import { useMemo, useState } from 'react';
import type { Deck } from '../types';
import { isMatchResult, isVaultItems, keys, read, remove, write } from '../lib/storage';
import type { MatchResult, VaultItem } from '../lib/storage';
import { byDeck, minutes, readHistory, whenLabel } from '../lib/history';
import { useScreenTop } from '../lib/useScreenTop';
import Icon from '../components/Icon';

/**
 * The vault: everything the two of you have accumulated, in three parts.
 *
 *   Owed     things one of you owes the other
 *   Yes      everything you have both said yes to, from every sorting deck
 *   Played   what you have actually played, and what you never have
 *
 * The yes list is the one that changes what the app is for. Every sorting deck
 * already produced an overlap, and every one of them was stranded inside the
 * deck that made it, so the answer to "what did we both say yes to" was spread
 * across seven screens and nobody ever went and read all seven. Collected in one
 * place it stops being a game result and starts being a list you act on.
 *
 * The played list is the other half of that. With forty games on the shelf the
 * useful question is not what exists but what you have never tried.
 *
 * The seal is the one thing here that must be real. A sealed IOU that either of
 * you can open early is a countdown, not a seal.
 */

const KEY = 'vault.items';
const DAY = 86400000;
const SEAL_OPTIONS = [0, 3, 7, 30];

type Section = 'owed' | 'yes' | 'played';

const SECTIONS: [Section, string][] = [
  ['owed', 'Owed'],
  ['yes', 'Yes list'],
  ['played', 'Played'],
];

interface SavedResult {
  deckId: string;
  title: string;
  at: number;
  both: string[];
  partial: string[];
}

interface YesItem {
  key: string;
  deckTitle: string;
  text: string;
}

interface Props {
  decks: Deck[];
  names: [string, string];
  onPick?: (deck: Deck) => void;
  onExit?: () => void;
}

function sealedUntil(it: VaultItem): number | null {
  if (it.redeemedAt !== undefined) return null;
  if (it.unlockAt === undefined) return null;
  return it.unlockAt > Date.now() ? it.unlockAt : null;
}

export default function Vault({ decks, names, onPick, onExit }: Props) {
  const [items, setItems] = useState<VaultItem[]>(() =>
    read<VaultItem[]>(KEY, [], isVaultItems),
  );
  const [section, setSection] = useState<Section>('owed');
  const [route, setRoute] = useState<'list' | 'new' | 'result'>('list');
  const [open, setOpen] = useState<SavedResult | null>(null);
  const [query, setQuery] = useState('');

  // Draft state for a new IOU.
  const [who, setWho] = useState<0 | 1>(0);
  const [text, setText] = useState('');
  const [seal, setSeal] = useState(0);

  const [savedVersion, setSavedVersion] = useState(0);

  // Sub-routes and sections are full screens, so they get the same
  // land-at-the-top rule as any other navigation.
  useScreenTop(`${route}-${section}`);

  /**
   * Match results are stored one key per deck, so they cannot be found without
   * enumerating. Reading them here is what makes the yes list possible at all.
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

  /** Every overlap, from every deck, flattened into one list. */
  const { yes, maybe } = useMemo(() => {
    const collect = (pick: (r: SavedResult) => string[]): YesItem[] => {
      const out: YesItem[] = [];
      for (const r of saved) {
        const deck = decks.find((d) => d.id === r.deckId);
        for (const id of pick(r)) {
          const card = deck?.cards.find((c) => c.id === id);
          // A card can vanish if the deck changed since the sort. Saying so beats
          // a blank row, which reads as an answer, and beats dropping it, which
          // would quietly misstate the count.
          out.push({
            key: `${r.deckId}:${id}`,
            deckTitle: r.title,
            text: card?.text ?? 'A card no longer in this deck',
          });
        }
      }
      return out;
    };
    return { yes: collect((r) => r.both), maybe: collect((r) => r.partial) };
  }, [saved, decks]);

  const history = useMemo(() => readHistory(), [section]);
  const plays = useMemo(() => byDeck(history), [history]);
  const playedIds = new Set(plays.map((p) => p.deckId));
  const untried = decks.filter((d) => !playedIds.has(d.id));

  function persist(next: VaultItem[]) {
    setItems(next);
    write(KEY, next);
  }

  /* ------------------------------------------------------------------ new */

  if (route === 'new') {
    return (
      <main className="screen" data-screen="vault.new">
        <button className="backbtn" onClick={() => setRoute('list')} aria-label="Back">
          <Icon name="back" size={20} />
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

  /* --------------------------------------------------------------- result */

  if (route === 'result' && open) {
    const deck = decks.find((d) => d.id === open.deckId);
    const line = (id: string) =>
      deck?.cards.find((c) => c.id === id)?.text ?? 'A card no longer in this deck';
    return (
      <main className="screen" data-screen="vault.result">
        <button className="backbtn" onClick={() => setRoute('list')} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <p className="h1">{open.title}</p>
        <p className="lede">
          Sorted {whenLabel(open.at)}. Only the overlap was ever written down.
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

  /* ----------------------------------------------------------------- list */

  return (
    <main className="screen" data-screen={`vault.${section}`}>
      {onExit && (
        <button className="backbtn" onClick={onExit} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
      )}

      <div className="vault__head">
        <p className="h1 h1--big" style={{ margin: 0, flex: 1 }}>
          The vault
        </p>
        {section === 'owed' && (
          <button className="btn--accent-ghost btn--pill" onClick={() => setRoute('new')}>
            <Icon name="plus" size={16} />
            Write one
          </button>
        )}
      </div>

      <div className="seg" role="tablist" aria-label="What to show">
        {SECTIONS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={section === key}
            className={`seg__btn ${section === key ? 'is-on' : ''}`}
            onClick={() => {
              setSection(key);
              setQuery('');
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'owed' && <Owed items={items} names={names} onPersist={persist} />}

      {section === 'yes' && (
        <YesList
          yes={yes}
          maybe={maybe}
          saved={saved}
          query={query}
          onQuery={setQuery}
          onOpen={(r) => {
            setOpen(r);
            setRoute('result');
          }}
        />
      )}

      {section === 'played' && (
        <Played
          plays={plays}
          untried={untried}
          decks={decks}
          totalSessions={history.length}
          onPick={onPick}
        />
      )}
    </main>
  );
}

/* ====================================================================== owed */

function Owed({
  items,
  names,
  onPersist,
}: {
  items: VaultItem[];
  names: [string, string];
  onPersist: (next: VaultItem[]) => void;
}) {
  return (
    <>
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
                      onPersist(
                        items.map((x) =>
                          x.id === it.id ? { ...x, redeemedAt: Date.now() } : x,
                        ),
                      )
                    }
                  >
                    <Icon name="check" size={16} />
                    Redeem
                  </button>
                )}
                {it.redeemedAt !== undefined && (
                  <span className="iou__state iou__state--done">Redeemed and gone</span>
                )}
                <span style={{ flex: 1 }} />
                <button
                  className="iou__delete"
                  onClick={() => onPersist(items.filter((x) => x.id !== it.id))}
                >
                  <Icon name="trash" size={15} weight={1.7} />
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="foot">
        Redeeming cannot be undone. Delete removes it for good, immediately.
      </p>
    </>
  );
}

/* ======================================================================= yes */

function YesList({
  yes,
  maybe,
  saved,
  query,
  onQuery,
  onOpen,
}: {
  yes: YesItem[];
  maybe: YesItem[];
  saved: SavedResult[];
  query: string;
  onQuery: (q: string) => void;
  onOpen: (r: SavedResult) => void;
}) {
  const q = query.trim().toLowerCase();
  const hit = (it: YesItem) => !q || it.text.toLowerCase().includes(q);
  const shownYes = yes.filter(hit);
  const shownMaybe = maybe.filter(hit);

  if (saved.length === 0) {
    return (
      <div className="emptybox">
        <p className="emptybox__title">Nothing sorted yet.</p>
        <p className="emptybox__text">
          Play any of the sorting games and whatever you both said yes to collects here.
          Bucket List Match works at any ceiling and is the easiest place to start.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="lede">
        Everything you have both said yes to, from every list you have sorted. A no from
        either of you was never written down, so nothing here belongs to one of you
        alone.
      </p>

      <div className="stats">
        <div className="stat">
          <span className="stat__n">{yes.length}</span>
          <span className="stat__label">both yes</span>
        </div>
        <div className="stat">
          <span className="stat__n">{maybe.length}</span>
          <span className="stat__label">worth talking about</span>
        </div>
        <div className="stat">
          <span className="stat__n">{saved.length}</span>
          <span className="stat__label">lists sorted</span>
        </div>
      </div>

      <div className="search">
        <input
          className="search__input"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search your yes list"
          aria-label="Search the yes list"
        />
      </div>

      {shownYes.length === 0 && shownMaybe.length === 0 && (
        <p className="emptybox__text" style={{ padding: '20px 0' }}>
          Nothing matches that.
        </p>
      )}

      {shownYes.length > 0 && (
        <>
          <p className="eyebrow">both yes ({shownYes.length})</p>
          <Grouped items={shownYes} />
        </>
      )}

      {shownMaybe.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 26 }}>
            worth talking about ({shownMaybe.length})
          </p>
          <Grouped items={shownMaybe} maybe />
        </>
      )}

      <p className="eyebrow" style={{ marginTop: 30 }}>
        the sorts themselves
      </p>
      <ul className="rows rows--gap">
        {saved.map((r) => (
          <li key={r.deckId}>
            <button className="row2 row2--card" onClick={() => onOpen(r)}>
              <span className="row2__label">
                <span className="saved__title">{r.title}</span>
                <span className="saved__meta">
                  {whenLabel(r.at)} &middot; {r.partial.length} to talk about
                </span>
              </span>
              <span className="saved__count">{r.both.length}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="emptybox__text" style={{ marginTop: 16 }}>
        Sorting a list again replaces its result. Nothing either of you passed on was ever
        written to this phone.
      </p>
    </>
  );
}

/**
 * Grouped under the list they came from, rather than tagging every single row
 * with its source. Sorting one deck of forty produced forty identical labels
 * down the right-hand side, which is noise pretending to be information. The
 * heading shows even for a single group: where a yes came from is part of what
 * it means, and hiding it whenever there is only one list makes the screen
 * change shape as you sort more.
 */
function Grouped({ items, maybe = false }: { items: YesItem[]; maybe?: boolean }) {
  const groups: { title: string; items: YesItem[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.title === it.deckTitle) last.items.push(it);
    else groups.push({ title: it.deckTitle, items: [it] });
  }

  return (
    <>
      {groups.map((g, i) => (
        <div key={`${g.title}-${i}`}>
          <p className="yes__from">{g.title}</p>
          <ul className="yeses">
            {g.items.map((it) => (
              <li className={`yes ${maybe ? 'yes--maybe' : ''}`} key={it.key}>
                <span className="yes__text">{it.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/* ==================================================================== played */

function Played({
  plays,
  untried,
  decks,
  totalSessions,
  onPick,
}: {
  plays: ReturnType<typeof byDeck>;
  untried: Deck[];
  decks: Deck[];
  totalSessions: number;
  onPick?: (deck: Deck) => void;
}) {
  const title = (id: string) => decks.find((d) => d.id === id)?.title ?? id;
  const totalMs = plays.reduce((n, p) => n + p.totalMs, 0);

  if (totalSessions === 0) {
    return (
      <div className="emptybox">
        <p className="emptybox__title">Nothing played yet.</p>
        <p className="emptybox__text">
          Anything you stay in for more than half a minute lands here, with the date.
          Only that it happened, never what was in it.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="lede">
        What you have actually played. Only the game and the date; never a card, never an
        answer.
      </p>

      <div className="stats">
        <div className="stat">
          <span className="stat__n">{totalSessions}</span>
          <span className="stat__label">sessions</span>
        </div>
        <div className="stat">
          <span className="stat__n">{plays.length}</span>
          <span className="stat__label">games tried</span>
        </div>
        <div className="stat">
          <span className="stat__n stat__n--word">{minutes(totalMs)}</span>
          <span className="stat__label">together</span>
        </div>
      </div>

      <p className="eyebrow">most played</p>
      <ul className="rows rows--gap">
        {plays.slice(0, 12).map((p) => (
          <li key={p.deckId}>
            <div className="row2 row2--card">
              <span className="row2__label">
                <span className="saved__title">{title(p.deckId)}</span>
                <span className="saved__meta">
                  {whenLabel(p.last)} &middot; {minutes(p.totalMs)}
                </span>
              </span>
              <span className="saved__count">
                {p.times}
                <span className="saved__unit">{p.times === 1 ? 'time' : 'times'}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>

      {untried.length > 0 && (
        <>
          <p className="eyebrow" style={{ marginTop: 30 }}>
            never opened ({untried.length})
          </p>
          <p className="band__hint">
            The whole point of a shelf this size. Tap one you have never tried.
          </p>
          <ul className="untried">
            {untried.map((d) => (
              <li key={d.id}>
                <button className="filter" onClick={() => onPick?.(d)} disabled={!onPick}>
                  {d.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
