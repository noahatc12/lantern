import { useMemo, useState } from 'react';
import type { Deck, Tier } from '../types';
import { rulesFor } from '../lib/rules';
import { ENGINE_COLOR, TIER_LABEL } from '../lib/engineMeta';
import { useScreenTop } from '../lib/useScreenTop';

/**
 * Read every card in the app without playing anything.
 *
 * Two people are about to hand this back and forth, and one of them wrote none
 * of it. Being able to sit down alone and read the whole thing first is the
 * difference between trusting the app and finding out mid-evening what tier 5
 * of a deck you had never opened actually says.
 *
 * Deliberately ignores tonight's ceiling. A vetting screen that hides the
 * material you most want to vet is worse than no vetting screen. It shows the
 * tier on every line instead, so what you are reading is never ambiguous.
 *
 * Nothing here counts as playing. It is not a game route, so it writes no
 * history, no seen-cards and no progress: reading the deck should not make the
 * app think you spent an evening on it.
 */

interface SlotOption {
  text: string;
  tier: Tier;
  props?: string[];
}

interface Stage {
  title: string;
  rule: string;
  cue: string;
  minutes: number;
  debrief: string[];
}

type FullDeck = Deck & {
  slotDefs?: { key: string; label: string; options: SlotOption[] }[];
  lines?: SlotOption[];
  stages?: Stage[];
  prompts?: string[];
  split?: string[];
};

interface Hit {
  deckId: string;
  deckTitle: string;
  text: string;
  tier?: Tier;
  where: string;
}

interface Props {
  decks: Deck[];
  onBack: () => void;
}

/** Everything readable in a deck, flattened, for counting and searching. */
function contentsOf(deck: FullDeck): Hit[] {
  const out: Hit[] = [];
  for (const c of deck.cards) {
    out.push({ deckId: deck.id, deckTitle: deck.title, text: c.text, tier: c.tier, where: 'card' });
  }
  for (const def of deck.slotDefs ?? []) {
    for (const o of def.options) {
      out.push({
        deckId: deck.id,
        deckTitle: deck.title,
        text: o.text,
        tier: o.tier,
        where: def.label,
      });
    }
  }
  for (const l of deck.lines ?? []) {
    out.push({ deckId: deck.id, deckTitle: deck.title, text: l.text, tier: l.tier, where: 'opening line' });
  }
  for (const p of deck.prompts ?? []) {
    out.push({ deckId: deck.id, deckTitle: deck.title, text: p, where: 'writing prompt' });
  }
  for (const st of deck.stages ?? []) {
    out.push({ deckId: deck.id, deckTitle: deck.title, text: st.rule, where: st.title });
    out.push({ deckId: deck.id, deckTitle: deck.title, text: st.cue, where: st.title });
  }
  return out;
}

export default function Inspect({ decks, onBack }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useScreenTop(`${openId ?? 'list'}`);

  const all = decks as FullDeck[];
  const counts = useMemo(
    () => new Map(all.map((d) => [d.id, contentsOf(d).length])),
    [all],
  );
  const total = useMemo(
    () => [...counts.values()].reduce((n, c) => n + c, 0),
    [counts],
  );

  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (q.length < 2) return [];
    return all
      .flatMap(contentsOf)
      .filter((h) => h.text.toLowerCase().includes(q))
      .slice(0, 200);
  }, [all, q]);

  const open = openId ? all.find((d) => d.id === openId) : undefined;

  /* --------------------------------------------------------------- detail */

  if (open) {
    const rules = rulesFor(open);
    const byTier = new Map<number, Hit[]>();
    for (const h of contentsOf(open).filter((x) => x.where === 'card')) {
      const t = h.tier ?? 0;
      byTier.set(t, [...(byTier.get(t) ?? []), h]);
    }

    return (
      <main className="screen" data-screen={`inspect.${open.id}`}>
        <button className="backbtn" onClick={() => setOpenId(null)} aria-label="Back">
          &larr;
        </button>
        <p className="eyebrow">
          {open.engine} &middot; tier {open.tierRange[0]}
          {open.tierRange[1] !== open.tierRange[0] && ` to ${open.tierRange[1]}`} &middot;{' '}
          {open.duration}
        </p>
        <p className="h1">{open.title}</p>
        <p className="lede">{open.blurb}</p>

        <p className="eyebrow">how it goes</p>
        <p className="inspect__summary">{rules.summary}</p>
        <ol className="rules__steps" style={{ marginBottom: 18 }}>
          {rules.steps.map((s, i) => (
            <li className="step" key={s}>
              <span className="step__n">{i + 1}</span>
              <span className="step__text">{s}</span>
            </li>
          ))}
        </ol>
        <ul className="rules__notes" style={{ marginBottom: 26 }}>
          {rules.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>

        {open.split && open.split.length > 0 && (
          <>
            <p className="eyebrow">the choices each turn</p>
            <div className="filters" style={{ marginBottom: 22 }}>
              {open.split.map((s) => (
                <span className="filter" key={s}>
                  {s}
                </span>
              ))}
            </div>
          </>
        )}

        {[...byTier.keys()]
          .sort((a, b) => a - b)
          .map((t) => (
            <section key={t}>
              <p className="eyebrow">
                tier {t}, {TIER_LABEL[t as Tier] ?? 'unset'} ({byTier.get(t)!.length})
              </p>
              <ul className="yeses">
                {byTier.get(t)!.map((h, i) => (
                  <li className="yes" key={`${t}-${i}`}>
                    <span className="yes__text">{h.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

        {(open.slotDefs ?? []).map((def) => (
          <section key={def.key}>
            <p className="eyebrow" style={{ marginTop: 24 }}>
              {def.label} ({def.options.length})
            </p>
            <ul className="yeses">
              {def.options.map((o) => (
                <li className="yes" key={o.text}>
                  <span className="yes__text">{o.text}</span>
                  <span className="yes__deck">tier {o.tier}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {open.lines && open.lines.length > 0 && (
          <section>
            <p className="eyebrow" style={{ marginTop: 24 }}>
              opening lines ({open.lines.length})
            </p>
            <ul className="yeses">
              {open.lines.map((l) => (
                <li className="yes" key={l.text}>
                  <span className="yes__text">{l.text}</span>
                  <span className="yes__deck">tier {l.tier}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {open.prompts && open.prompts.length > 0 && (
          <section>
            <p className="eyebrow" style={{ marginTop: 24 }}>
              what it asks you to write ({open.prompts.length})
            </p>
            <ul className="yeses">
              {open.prompts.map((p) => (
                <li className="yes" key={p}>
                  <span className="yes__text">{p}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {open.stages && open.stages.length > 0 && (
          <section>
            <p className="eyebrow" style={{ marginTop: 24 }}>
              stages ({open.stages.length})
            </p>
            <ul className="stages">
              {open.stages.map((st, i) => (
                <li className="stage is-open" key={st.title}>
                  <div className="stage__head">
                    <span className="stage__n">{i + 1}</span>
                    <span className="stage__title">{st.title}</span>
                    <span className="stage__state">{st.minutes} min</span>
                  </div>
                  <p className="stage__rule">{st.rule}</p>
                  <p className="stage__rule">{st.cue}</p>
                  <ul className="rules__notes">
                    {st.debrief.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}

        {counts.get(open.id) === 0 && (
          <div className="emptybox">
            <p className="emptybox__title">Nothing written in yet.</p>
            <p className="emptybox__text">
              This one runs on what the two of you put into it, so it starts empty on
              purpose.
            </p>
          </div>
        )}
      </main>
    );
  }

  /* ----------------------------------------------------------------- list */

  return (
    <main className="screen" data-screen="inspect">
      <button className="backbtn" onClick={onBack} aria-label="Back">
        &larr;
      </button>
      <p className="h1 h1--big">Look through everything</p>
      <p className="lede">
        Every card in every game, at every tier, without playing anything. Reading is not
        playing: nothing here is recorded, and tonight&rsquo;s ceiling is ignored on
        purpose so there is nothing you cannot check.
      </p>

      <div className="stats">
        <div className="stat">
          <span className="stat__n">{decks.length}</span>
          <span className="stat__label">games</span>
        </div>
        <div className="stat">
          <span className="stat__n">{total}</span>
          <span className="stat__label">things to read</span>
        </div>
      </div>

      <div className="search">
        <input
          className="search__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every card"
          aria-label="Search every card"
        />
      </div>

      {q.length >= 2 ? (
        <>
          <p className="eyebrow">
            {hits.length === 200 ? 'first 200 matches' : `${hits.length} matches`}
          </p>
          {hits.length === 0 ? (
            <p className="emptybox__text" style={{ padding: '18px 0' }}>
              Nothing anywhere matches that.
            </p>
          ) : (
            <ul className="yeses">
              {hits.map((h, i) => (
                <li className="yes" key={`${h.deckId}-${i}`}>
                  <span className="yes__text">{h.text}</span>
                  <span className="yes__deck">
                    {h.deckTitle}
                    {h.tier ? ` · t${h.tier}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <ul className="rows rows--gap">
          {[...all]
            .sort((a, b) => a.tierRange[0] - b.tierRange[0] || a.title.localeCompare(b.title))
            .map((d) => (
              <li key={d.id}>
                <button
                  className="row2 row2--card"
                  style={{ borderLeft: `3px solid ${ENGINE_COLOR[d.engine]}` }}
                  onClick={() => setOpenId(d.id)}
                >
                  <span className="row2__label">
                    <span className="saved__title">{d.title}</span>
                    <span className="saved__meta">
                      {d.engine} &middot; tier {d.tierRange[0]}
                      {d.tierRange[1] !== d.tierRange[0] && ` to ${d.tierRange[1]}`}
                    </span>
                  </span>
                  <span className="saved__count">
                    {counts.get(d.id)}
                    <span className="saved__unit">to read</span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </main>
  );
}
