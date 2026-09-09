/**
 * The lantern.
 *
 * Was a plain accent dot, which said nothing and matched the app icon not at
 * all: the icon was a ring on the old accent, drawn before the canvas moved the
 * palette. One glyph now, in one colour, used in the header, on the unlock
 * screen and as the home-screen icon, so the thing on your home screen and the
 * thing at the top of the app are the same object.
 *
 * Drawn rather than imported so it inherits the accent token and stays sharp at
 * any size. It has to survive being 14px next to a word and 180px on a home
 * screen, which is why it is five strokes and a flame and nothing else.
 */

export default function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <g
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.4 5.2a1.6 1.6 0 0 1 3.2 0" />
        <path d="M9.2 6.6h5.6" />
        <path d="M10.1 6.6c-1 2.4-1.2 5-.5 7.3M13.9 6.6c1 2.4 1.2 5 .5 7.3" />
        <path d="M8.8 14.6h6.4" />
        <path d="M9.7 14.6v1.9h4.6v-1.9" />
      </g>
      <path
        d="M12 8.6c1.4 1.4 2 2.6 2 3.6a2 2 0 0 1-4 0c0-1 .6-2.2 2-3.6z"
        fill="currentColor"
      />
    </svg>
  );
}
