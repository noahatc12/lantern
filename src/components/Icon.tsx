import type { ReactElement } from 'react';

/**
 * One icon family, drawn once.
 *
 * The app had fifty three back arrows that were a text arrow character,
 * rendered in the body font. A typographic arrow is not an icon: it is thin
 * where everything around it is solid, it sits on the text baseline rather than
 * optically centred, and its weight changes with the font. It looked flimsy
 * because it was.
 *
 * Everything here is on one 24 grid at one stroke weight, which is the part
 * that makes a set read as a set. The canvas drew these at 1.4 to 1.6 across
 * five different viewBoxes; normalised and thickened to 1.9, they stop looking
 * like clip art from three sources and start looking deliberate.
 *
 * Sized in px rather than em so an icon next to 13px text and an icon next to
 * 17px text are the same object.
 */

export type IconName =
  | 'back'
  | 'next'
  | 'forward'
  | 'check'
  | 'plus'
  | 'minus'
  | 'trash'
  | 'reroll'
  | 'search'
  | 'down'
  | 'up'
  | 'ease'
  | 'stop'
  | 'lamp'
  | 'shelf'
  | 'lock'
  | 'sliders';

const PATHS: Record<IconName, ReactElement> = {
  back: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  next: <path d="M9 5.5 15.5 12 9 18.5" />,
  forward: <path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5" />,
  check: <path d="M5 12.4 9.8 17 19 6.8" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  minus: <path d="M5.5 12h13" />,
  trash: (
    <>
      <path d="M4 6.6h16" />
      <path d="M9.2 6.6V3.9h5.6v2.7" />
      <path d="M5.9 6.6l1 13.2h10.2l1-13.2" />
    </>
  ),
  reroll: (
    <>
      <path d="M20 12a8 8 0 1 1-2.8-6.1" />
      <path d="M20.5 3.4v5h-5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.6" cy="10.6" r="6.4" />
      <path d="M15.4 15.4 20.5 20.5" />
    </>
  ),
  down: <path d="M5.5 9 12 15.5 18.5 9" />,
  up: <path d="M5.5 15 12 8.5 18.5 15" />,
  ease: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 3.8a8.2 8.2 0 0 0 0 16.4z" fill="currentColor" stroke="none" />
    </>
  ),
  stop: <path d="M8.4 3.5h7.2L20.5 8.4v7.2l-4.9 4.9H8.4l-4.9-4.9V8.4z" />,
  lamp: (
    <>
      <circle cx="12" cy="13.4" r="6.4" />
      <path d="M12 7V3.8" />
      <circle cx="12" cy="13.4" r="2.4" fill="currentColor" stroke="none" />
    </>
  ),
  shelf: (
    <>
      <rect x="3.6" y="4.6" width="16.8" height="6.2" rx="2" />
      <rect x="3.6" y="13.2" width="16.8" height="6.2" rx="2" />
    </>
  ),
  lock: (
    <>
      <rect x="4.6" y="10.4" width="14.8" height="9.8" rx="2.6" />
      <path d="M8 10.4V8a4 4 0 0 1 8 0v2.4" />
    </>
  ),
  sliders: (
    <>
      <path d="M3.8 8.6h16.4M3.8 15.4h16.4" />
      <circle cx="9" cy="8.6" r="2.6" fill="var(--panel-deep)" />
      <circle cx="15" cy="15.4" r="2.6" fill="var(--panel-deep)" />
    </>
  ),
};

interface Props {
  name: IconName;
  size?: number;
  /** Thinner only where an icon sits inside very small text. */
  weight?: number;
}

export default function Icon({ name, size = 18, weight = 1.9 }: Props) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
