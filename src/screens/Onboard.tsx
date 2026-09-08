import { useState } from 'react';
import type { Tier } from '../types';
import { TIER_LABEL } from '../lib/engineMeta';

/**
 * Three-step onboarding, ported from the canvas.
 *
 * The app previously dropped you at a bare names form. That is fine for the
 * person who built it and useless for the other person, who arrives with no
 * idea that a ceiling exists, that lowering it takes one tap, or that stopping
 * is never attributed. Those three facts are the whole safety model, and
 * discovering them mid-session is too late.
 */

interface Props {
  initialNames: [string, string];
  initialTier: Tier;
  onDone: (names: [string, string], tier: Tier) => void;
}

export default function Onboard({ initialNames, initialTier, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState(initialNames[0]);
  const [b, setB] = useState(initialNames[1]);
  const [tier, setTier] = useState<Tier>(initialTier);

  const namesReady = a.trim().length > 0 && b.trim().length > 0;
  const canNext = step !== 0 || namesReady;

  return (
    <main className="ob" data-screen={`onboard.${step}`}>
      <div className="ob__dots" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`ob__dot ${i <= step ? 'is-on' : ''}`} />
        ))}
      </div>

      {step === 0 && (
        <>
          <p className="eyebrow">first, who is playing</p>
          <p className="ob__title">Two names. Stored on this phone and nowhere else.</p>
          <div className="stack">
            <input
              className="field"
              value={a}
              onChange={(e) => setA(e.target.value)}
              placeholder="first name"
              autoCapitalize="words"
              aria-label="First name"
            />
            <input
              className="field"
              value={b}
              onChange={(e) => setB(e.target.value)}
              placeholder="second name"
              autoCapitalize="words"
              aria-label="Second name"
            />
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <p className="eyebrow">set the ceiling together</p>
          <p className="ob__title">Nothing above this is ever drawn.</p>
          <p className="ob__body">
            Raising it needs both of you in the room. Lowering it needs one tap from
            either of you, at any point, and is never attributed.
          </p>
          <div className="wick" aria-hidden="true">
            <div className="wick__fill" style={{ width: `${(tier / 5) * 100}%` }} />
          </div>
          <div className="tiers__row">
            {([1, 2, 3, 4, 5] as Tier[]).map((t) => (
              <button
                key={t}
                className={`tier ${t === tier ? 'is-on' : ''}`}
                onClick={() => setTier(t)}
                aria-pressed={t === tier}
              >
                <span className="tier__n">{t}</span>
                <span className="tier__label">{TIER_LABEL[t]}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <p className="eyebrow">two controls, always there</p>
          <p className="ob__title">Stopping costs nothing.</p>
          <div className="stack">
            <div className="ctrl ctrl--ease">
              <span className="ctrl__chip">Ease off</span>
              <span className="ctrl__text">
                Drops the ceiling one step for the rest of the session. The deck follows
                immediately.
              </span>
            </div>
            <div className="ctrl ctrl--stop">
              <span className="ctrl__chip">Stop</span>
              <span className="ctrl__text">
                Ends it in one tap. No confirm dialog, no score, and no record of which of
                you pressed it.
              </span>
            </div>
          </div>
          <p className="ob__body" style={{ marginTop: 20 }}>
            Neither is ever attributed or counted. If using them cost something socially,
            people would stop using them and the whole layer would be decorative.
          </p>
        </>
      )}

      <div className="ob__foot">
        {step > 0 && (
          <button className="btn" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        <button
          className="btn btn--primary"
          disabled={!canNext}
          onClick={() => {
            if (step < 2) setStep(step + 1);
            else onDone([a.trim(), b.trim()], tier);
          }}
        >
          {step === 0 ? 'Next' : step === 1 ? 'Got it' : 'Start'}
        </button>
      </div>
    </main>
  );
}
