import type { TrafficLight as Light } from '../types';

/**
 * Persistent stop control. Present on every tier-4-and-above screen.
 *
 * Three rules, all deliberate:
 *   - Red takes one tap. No confirm dialog, no "are you sure". A stop control
 *     that argues with you is not a stop control.
 *   - Yellow lowers the session one tier and says nothing about who pressed it.
 *   - Neither is ever attributed or scored. Using them has to cost nothing, or
 *     people stop using them and the whole safety layer becomes decorative.
 */

interface Props {
  onLight: (light: Light) => void;
  current: Light;
}

export default function TrafficLight({ onLight, current }: Props) {
  if (current === 'red') return null;

  return (
    <div className="tl" role="group" aria-label="Session controls">
      <button
        type="button"
        className="tl__btn tl__btn--yellow"
        onClick={() => onLight('yellow')}
      >
        Ease off
      </button>
      <button
        type="button"
        className="tl__btn tl__btn--red"
        onClick={() => onLight('red')}
      >
        Stop
      </button>
    </div>
  );
}
