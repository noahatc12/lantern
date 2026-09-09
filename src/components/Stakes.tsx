import { useState } from 'react';
import { isVaultItems, read, write } from '../lib/storage';
import type { VaultItem } from '../lib/storage';

/**
 * E9 Stakes. Not a game: a thing you bolt onto one.
 *
 * The entire strip-game category is one mechanic attached to fifteen different
 * base games. Treating it as one feature rather than fifteen games is the single
 * biggest saving in the whole design, and it turns every prediction and timer
 * game on the shelf into a second version of itself for almost nothing.
 *
 * Two decisions worth stating.
 *
 * The ledger is tapped by you rather than inferred by the app. The app does not
 * know who won: it knows a button was pressed. A ledger that quietly guesses is
 * worse than one you keep yourself, because you would have to check it anyway.
 *
 * And a skip never costs a stake, at any tier, in any game. If skipping started
 * costing something, people would stop skipping, and the free skip is load
 * bearing for the entire rest of the app.
 */

export type StakeKind = 'none' | 'layers' | 'control' | 'owed';

const OPTIONS: { kind: StakeKind; label: string; blurb: string }[] = [
  { kind: 'none', label: 'Nothing', blurb: 'Play for its own sake. This is the default.' },
  { kind: 'layers', label: 'Layers', blurb: 'Whoever loses takes something off. The app keeps count.' },
  { kind: 'control', label: 'Control', blurb: 'Whoever wins directs the next two minutes.' },
  { kind: 'owed', label: 'Owed', blurb: 'Whoever loses owes one, written into the vault.' },
];

const KEY = 'vault.items';

interface Props {
  names: [string, string];
  kind: StakeKind;
  onKind: (k: StakeKind) => void;
}

export default function Stakes({ names, kind, onKind }: Props) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<[number, number]>([0, 0]);
  const [owing, setOwing] = useState<0 | 1 | null>(null);
  const [text, setText] = useState('');
  const [wrote, setWrote] = useState(false);

  const current = OPTIONS.find((o) => o.kind === kind) ?? OPTIONS[0]!;

  function saveIou(from: 0 | 1, body: string) {
    const items = read<VaultItem[]>(KEY, [], isVaultItems);
    write(KEY, [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        from,
        text: body,
        createdAt: Date.now(),
      },
      ...items,
    ]);
    setWrote(true);
    setOwing(null);
    setText('');
  }

  return (
    <div className="stakes">
      <button
        className="stakes__bar"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="stakes__label">stakes</span>
        <span className="stakes__value">{current.label.toLowerCase()}</span>
        {kind === 'layers' && (
          <span className="stakes__score">
            {names[0]} {count[0]} &middot; {names[1]} {count[1]}
          </span>
        )}
        <span className="stakes__chev" aria-hidden="true">
          {open ? '∨' : '∧'}
        </span>
      </button>

      {open && (
        <div className="stakes__body">
          <div className="stakes__opts">
            {OPTIONS.map((o) => (
              <button
                key={o.kind}
                className={`filter ${kind === o.kind ? 'is-on' : ''}`}
                onClick={() => {
                  onKind(o.kind);
                  setCount([0, 0]);
                  setWrote(false);
                }}
                aria-pressed={kind === o.kind}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="stakes__blurb">{current.blurb}</p>

          {kind === 'layers' && (
            <div className="pairbtns">
              {names.map((n, i) => (
                <button
                  key={n + i}
                  className="btn btn--pick"
                  onClick={() =>
                    setCount(i === 0 ? [count[0] + 1, count[1]] : [count[0], count[1] + 1])
                  }
                >
                  {n} loses one ({count[i]})
                </button>
              ))}
            </div>
          )}

          {kind === 'owed' && owing === null && (
            <div className="pairbtns">
              {names.map((n, i) => (
                <button
                  key={n + i}
                  className="btn btn--pick"
                  onClick={() => {
                    setOwing(i as 0 | 1);
                    setWrote(false);
                  }}
                >
                  {n} owes one
                </button>
              ))}
            </div>
          )}

          {kind === 'owed' && owing !== null && (
            <>
              <textarea
                className="answer answer--vault"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`what ${names[owing]} owes, specifically`}
                rows={2}
                aria-label="What is owed"
              />
              <div className="pairbtns">
                <button className="btn" onClick={() => setOwing(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn--primary"
                  disabled={!text.trim()}
                  onClick={() => saveIou(owing, text.trim())}
                >
                  Into the vault
                </button>
              </div>
            </>
          )}

          {wrote && <p className="stakes__blurb">Written. It is in the vault now.</p>}

          {kind !== 'none' && (
            <p className="stakes__fine">
              A skip never costs a stake. That stays free in every game, at every tier.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
