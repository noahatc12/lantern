import type { Tier } from '../types';

/**
 * The floor: Ease off and Stop, on every play screen.
 *
 * These used to live inside the draw engine, and only above tier 3. So the
 * onboarding line "Ease off and Stop sit on every play screen" was true of one
 * engine out of ten, and the whole safety layer was thinner than the copy
 * claimed. Lifting it to the App level makes the claim structurally true
 * instead of individually re-implemented, which is also the only version that
 * cannot rot as engines are added.
 *
 * Neither control is attributed or counted. That is not a UI preference: if
 * using one cost anything socially, people would stop using them and the layer
 * would be decorative.
 *
 * It also carries Back, because a play screen's only other way out was a chevron
 * in the top-left corner, which is the hardest place on the phone to reach.
 */

interface Props {
  tier: Tier;
  onBack: () => void;
  onEase: () => void;
  onStop: () => void;
}

export default function FloorBar({ tier, onBack, onEase, onStop }: Props) {
  return (
    <div className="floor" role="group" aria-label="Session controls">
      {/* Back lives down here as well as at the top. The top one is where the
          eye looks for it; this one is where the thumb already is, which on a
          6.1 inch phone is not the same place. */}
      <button type="button" className="floor__btn floor__back" onClick={onBack}>
        <svg width="9" height="15" viewBox="0 0 10 17" fill="none" aria-hidden="true">
          <path
            d="M8 1L1.5 8.5 8 16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back
      </button>
      <span className="floor__gap" />
      {tier > 1 && (
        <button type="button" className="floor__btn floor__btn--ease" onClick={onEase}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="6.1" stroke="currentColor" strokeWidth="1.4" />
            <path d="M7 .9a6.1 6.1 0 000 12.2z" fill="currentColor" />
          </svg>
          Ease off
        </button>
      )}
      <button type="button" className="floor__btn floor__btn--stop" onClick={onStop}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M4.9 1h4.2L13 4.9v4.2L9.1 13H4.9L1 9.1V4.9z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
        Stop
      </button>
    </div>
  );
}
