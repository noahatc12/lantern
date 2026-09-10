import type { Tier } from '../types';
import Icon from './Icon';

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
        <Icon name="back" size={17} />
        Back
      </button>
      <span className="floor__gap" />
      {tier > 1 && (
        <button type="button" className="floor__btn floor__btn--ease" onClick={onEase}>
          <Icon name="ease" size={17} />
          Ease off
        </button>
      )}
      <button type="button" className="floor__btn floor__btn--stop" onClick={onStop}>
        <Icon name="stop" size={17} />
        Stop
      </button>
    </div>
  );
}
