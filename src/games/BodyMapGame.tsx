import { useState } from 'react';
import type { Deck, Tier } from '../types';
import { isBodyMaps, read, write } from '../lib/storage';
import type { BodyMaps } from '../lib/storage';
import Handoff from '../components/Handoff';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';
import Icon from '../components/Icon';

/**
 * E18 Body map. The only game here whose output is a picture.
 *
 * A list of body parts is forgettable. A map is glanceable, and you will
 * actually look at it again, which is why this is worth the extra build over
 * another sorting deck covering the same ground.
 *
 * Two deliberate departures from the rest of the app:
 *
 * It STORES BOTH MAPS, where every sorting game stores only the overlap. That is
 * not an inconsistency: the point of this one is seeing the two maps beside each
 * other, so both people produce theirs knowing it will be shown. The screen says
 * so before either of you starts, and nothing else in the app works this way.
 *
 * And it is painted rather than rated one region at a time. Eighteen separate
 * rating screens is a chore nobody finishes; picking a level and then tapping
 * everywhere it applies takes under a minute. Five labelled levels rather than a
 * raw nought to ten, because the words are what people actually mean and a
 * slider implies a precision nobody has about this.
 */

/**
 * Region layout, on a five column grid.
 *
 * The columns are what make it read as a body rather than a bar chart: the
 * outer two are arms and sides, the middle three are the torso, and the torso
 * regions span all three. An earlier three column version placed regions
 * arbitrarily and the result looked like a chart, which loses the entire reason
 * for making this a map instead of another list.
 */
interface Region {
  id: string;
  label: string;
  col: number;
  row: number;
  span?: number;
}

const FRONT: Region[] = [
  { id: 'head', label: 'Head and hair', col: 3, row: 1 },
  { id: 'ears', label: 'Ears', col: 2, row: 2 },
  { id: 'face', label: 'Face', col: 3, row: 2 },
  { id: 'mouth', label: 'Mouth', col: 4, row: 2 },
  { id: 'neck', label: 'Neck and throat', col: 3, row: 3 },
  { id: 'shoulders', label: 'Shoulders', col: 2, row: 4, span: 3 },
  { id: 'arms', label: 'Arms', col: 1, row: 5 },
  { id: 'chest', label: 'Chest', col: 2, row: 5, span: 3 },
  { id: 'wrists', label: 'Wrists', col: 5, row: 5 },
  { id: 'hands', label: 'Hands', col: 1, row: 6 },
  { id: 'stomach', label: 'Stomach', col: 2, row: 6, span: 3 },
  { id: 'ribs', label: 'Ribs and sides', col: 5, row: 6 },
  { id: 'lower', label: 'Lower stomach', col: 2, row: 7, span: 3 },
  { id: 'hips', label: 'Hips', col: 2, row: 8 },
  { id: 'between', label: 'Between your legs', col: 3, row: 8, span: 2 },
  { id: 'thighs', label: 'Thighs', col: 2, row: 9 },
  { id: 'inner', label: 'Inner thighs', col: 3, row: 9 },
  { id: 'knees', label: 'Behind the knees', col: 4, row: 9 },
  { id: 'feet', label: 'Feet and ankles', col: 3, row: 10 },
];

const BACK: Region[] = [
  { id: 'b-scalp', label: 'Scalp', col: 3, row: 1 },
  { id: 'b-ears', label: 'Behind the ears', col: 2, row: 2, span: 3 },
  { id: 'b-neck', label: 'Back of the neck', col: 3, row: 3 },
  { id: 'b-blades', label: 'Shoulder blades', col: 2, row: 4, span: 3 },
  { id: 'b-arms', label: 'Backs of the arms', col: 1, row: 5 },
  { id: 'b-upper', label: 'Upper back', col: 2, row: 5, span: 3 },
  { id: 'b-sides', label: 'Sides and waist', col: 5, row: 5 },
  { id: 'b-spine', label: 'Down the spine', col: 2, row: 6, span: 3 },
  { id: 'b-lower', label: 'Lower back', col: 2, row: 7, span: 3 },
  { id: 'b-backside', label: 'Backside', col: 2, row: 8, span: 3 },
  { id: 'b-thighs', label: 'Backs of the thighs', col: 2, row: 9, span: 2 },
  { id: 'b-calves', label: 'Calves', col: 4, row: 9 },
  { id: 'b-soles', label: 'Soles of the feet', col: 3, row: 10 },
];

export const REGIONS = [...FRONT, ...BACK];

const LEVELS: { value: number; label: string }[] = [
  { value: 0, label: 'not here' },
  { value: 3, label: 'maybe' },
  { value: 5, label: 'yes' },
  { value: 8, label: 'more of this' },
  { value: 10, label: 'as much as you like' },
];

type Painted = Record<string, number>;

interface Props {
  deck: Deck;
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

type Phase =
  | { step: 'rules' }
  | { step: 'paint'; who: 0 | 1 }
  | { step: 'handoff' }
  | { step: 'reveal' };

function heat(v: number | undefined): string {
  if (v === undefined) return 'is-unset';
  if (v === 0) return 'is-none';
  if (v <= 3) return 'is-low';
  if (v <= 5) return 'is-mid';
  if (v <= 8) return 'is-high';
  return 'is-max';
}

export default function BodyMapGame({ deck, names, onExit }: Props) {
  const key = `bodymap.${deck.id}`;

  const [saved, setSaved] = useState<BodyMaps | null>(() =>
    read<BodyMaps | null>(key, null, isBodyMaps),
  );
  const [phase, setPhase] = useState<Phase>({ step: 'rules' });
  const [level, setLevel] = useState(5);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [mine, setMine] = useState<Painted>({});
  const [first, setFirst] = useState<Painted | null>(null);

  useScreenTop(`${phase.step}-${'who' in phase ? phase.who : ''}-${side}`);

  const shown = side === 'front' ? FRONT : BACK;

  /* ---------------------------------------------------------------- rules */

  if (phase.step === 'rules') {
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => {
          setMine({});
          setFirst(null);
          setSide('front');
          setLevel(5);
          setPhase({ step: 'paint', who: 0 });
        }}
        startLabel={`${names[0]} maps theirs first`}
      >
        <p className="play__note">
          {REGIONS.length} places, front and back.{' '}
          {saved && 'You have mapped this before; starting again replaces it.'}
        </p>
        {saved && (
          <button className="btn btn--ghost" onClick={() => setPhase({ step: 'reveal' })}>
            See the maps you made
          </button>
        )}
      </Rules>
    );
  }

  /* -------------------------------------------------------------- handoff */

  if (phase.step === 'handoff') {
    return (
      <Handoff
        to={names[1]}
        onContinue={() => {
          setMine({});
          setSide('front');
          setLevel(5);
          setPhase({ step: 'paint', who: 1 });
        }}
      />
    );
  }

  /* ---------------------------------------------------------------- paint */

  if (phase.step === 'paint') {
    const done = Object.keys(mine).length;
    return (
      <main className="play" data-screen={`bodymap.paint.${phase.who}`}>
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <span className="play__deck">{names[phase.who]}, privately</span>
          <span className="play__tier">
            {done} / {REGIONS.length}
          </span>
        </header>

        <section className="play__stage">
          <p className="play__eyebrow">pick a level, then tap everywhere it applies</p>
          <div className="levels">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                className={`level ${heat(l.value)} ${level === l.value ? 'is-on' : ''}`}
                onClick={() => setLevel(l.value)}
                aria-pressed={level === l.value}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="sides">
            {(['front', 'back'] as const).map((s) => (
              <button
                key={s}
                className={`filter ${side === s ? 'is-on' : ''}`}
                onClick={() => setSide(s)}
                aria-pressed={side === s}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="figure" role="group" aria-label={`Your ${side}`}>
            {shown.map((r) => (
              <button
                key={r.id}
                className={`region ${heat(mine[r.id])}`}
                style={{
                  gridColumn: r.span ? `${r.col} / span ${r.span}` : r.col,
                  gridRow: r.row,
                }}
                onClick={() => setMine({ ...mine, [r.id]: level })}
                aria-label={`${r.label}: ${
                  mine[r.id] === undefined
                    ? 'not set'
                    : LEVELS.find((l) => l.value === mine[r.id])?.label
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            className="btn btn--primary btn--big"
            disabled={done < 6}
            onClick={() => {
              if (phase.who === 0) {
                setFirst(mine);
                setPhase({ step: 'handoff' });
              } else {
                const both: BodyMaps = { at: Date.now(), a: first ?? {}, b: mine };
                setSaved(both);
                write(key, both);
                setPhase({ step: 'reveal' });
              }
            }}
          >
            {done < 6 ? `${6 - done} more to go` : 'Done'}
          </button>

          <p className="play__note">
            Anything you leave blank stays blank. Both maps are shown side by side at the
            end, so put down what you actually mean.
          </p>
        </section>
      </main>
    );
  }

  /* --------------------------------------------------------------- reveal */

  const maps = saved ?? { at: Date.now(), a: first ?? {}, b: mine };
  const both = (r: Region) => Math.min(maps.a[r.id] ?? 0, maps.b[r.id] ?? 0);
  const gap = (r: Region) => Math.abs((maps.a[r.id] ?? 0) - (maps.b[r.id] ?? 0));
  const disagreements = REGIONS.filter((r) => gap(r) >= 5).sort((x, y) => gap(y) - gap(x));
  const agreed = REGIONS.filter((r) => both(r) >= 5);

  const Figure = ({ pick, label }: { pick: (r: Region) => number; label: string }) => (
    <div className="mapcard">
      <p className="eyebrow">{label}</p>
      {(['front', 'back'] as const).map((s) => (
        <div className="figure figure--small" key={s} aria-label={`${label}, ${s}`}>
          {(s === 'front' ? FRONT : BACK).map((r) => (
            <span
              key={r.id}
              className={`region region--flat ${heat(pick(r))}`}
              style={{
                gridColumn: r.span ? `${r.col} / span ${r.span}` : r.col,
                gridRow: r.row,
              }}
              title={r.label}
            />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <main className="play" data-screen="bodymap.reveal">
      <header className="play__top">
        <button className="play__back" onClick={onExit} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <span className="play__deck">{deck.title}</span>
      </header>

      <section className="play__stage">
        <div className="maps">
          <Figure label={names[0]} pick={(r) => maps.a[r.id] ?? 0} />
          <Figure label={names[1]} pick={(r) => maps.b[r.id] ?? 0} />
          <Figure label="both" pick={both} />
        </div>

        <p className="eyebrow" style={{ marginTop: 24 }}>
          where you both said yes ({agreed.length})
        </p>
        {agreed.length === 0 ? (
          <p className="play__note">Nothing overlapped as a yes this time.</p>
        ) : (
          <ul className="result__list">
            {agreed.map((r) => (
              <li key={r.id}>{r.label}</li>
            ))}
          </ul>
        )}

        <p className="eyebrow" style={{ marginTop: 24 }}>
          where the maps disagree ({disagreements.length})
        </p>
        {disagreements.length === 0 ? (
          <p className="play__note">The two maps broadly agree.</p>
        ) : (
          <>
            <p className="play__note" style={{ marginBottom: 10 }}>
              This is the interesting part. One of you wants far more here than the other
              expects, and neither of you knew.
            </p>
            <ul className="result__list result__list--quiet">
              {disagreements.map((r) => (
                <li key={r.id}>
                  {r.label}
                  <span className="miss__a">
                    {names[0]} {maps.a[r.id] ?? 0}, {names[1]} {maps.b[r.id] ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="play__note" style={{ marginTop: 18 }}>
          Both maps are saved on this phone, because seeing them beside each other is the
          whole game. Nothing else in the app keeps both sides.
        </p>
        <button
          className="card--danger"
          style={{ marginTop: 18 }}
          onClick={() => {
            write(key, null);
            setSaved(null);
            onExit();
          }}
        >
          Delete both maps
        </button>
      </section>
    </main>
  );
}
