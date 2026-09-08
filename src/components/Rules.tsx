import { useState } from 'react';
import type { Deck } from '../types';
import { RULES } from '../lib/rules';

/**
 * The how-to-play screen every game opens on, restyled to the canvas.
 *
 * Shown before the first round rather than buried behind a help icon, because
 * these games have rules that are not guessable from the buttons, and a rule
 * discovered halfway through has already cost the session.
 *
 * Two changes the canvas gets right. The steps are numbered and ruled, so the
 * order is visible rather than implied by a bullet list. And "worth knowing"
 * starts collapsed: it is the part you want on the second reading and the part
 * that pushes the start button below the fold on the first.
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
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <main className="play play--rules">
      <button className="play__back play__back--solo" onClick={onExit} aria-label="Back">
        &larr;
      </button>

      <section className="rules">
        <p className="eyebrow">{deck.title}</p>
        <p className="rules__summary">{rules.summary}</p>
        <p className="rules__blurb">{deck.blurb}</p>

        <ol className="rules__steps">
          {rules.steps.map((s, i) => (
            <li className="step" key={s}>
              <span className="step__n">{i + 1}</span>
              <span className="step__text">{s}</span>
            </li>
          ))}
        </ol>

        {rules.example && (
          <div className="rules__example">
            <p className="eyebrow">{rules.example.label}</p>
            {rules.example.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        )}

        <button
          className="rules__toggle"
          onClick={() => setNotesOpen(!notesOpen)}
          aria-expanded={notesOpen}
        >
          {notesOpen ? 'Hide what is worth knowing' : `Worth knowing (${rules.notes.length})`}
        </button>
        {notesOpen && (
          <ul className="rules__notes">
            {rules.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

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
