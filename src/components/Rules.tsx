import type { Deck } from '../types';
import { RULES } from '../lib/rules';

/**
 * The how-to-play screen every game opens on.
 *
 * Shown before the first round rather than buried behind a help icon, because
 * these games have rules that are not guessable from the buttons, and a rule
 * discovered halfway through has already cost the session.
 */

interface Props {
  deck: Deck;
  onStart: () => void;
  onExit: () => void;
  /** Extra controls, e.g. reviewing a previous result. */
  children?: React.ReactNode;
  startLabel?: string;
}

export default function Rules({ deck, onStart, onExit, children, startLabel }: Props) {
  const rules = RULES[deck.engine];

  return (
    <main className="play">
      <header className="play__top">
        <button className="play__back" onClick={onExit} aria-label="Back">
          &larr;
        </button>
        <span className="play__deck">{deck.title}</span>
      </header>

      <section className="rules">
        <p className="rules__summary">{rules.summary}</p>
        <p className="rules__blurb">{deck.blurb}</p>

        <h2 className="rules__head">How it goes</h2>
        <ol className="rules__steps">
          {rules.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>

        <h2 className="rules__head">Worth knowing</h2>
        <ul className="rules__notes">
          {rules.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>

        <div className="rules__actions">
          <button className="btn btn--primary btn--big" onClick={onStart}>
            {startLabel ?? 'Start'}
          </button>
          {children}
        </div>
      </section>
    </main>
  );
}
