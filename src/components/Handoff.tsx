import { useEffect, useState } from 'react';

/**
 * The pass-the-phone screen.
 *
 * Shared by every engine where one person answers privately: predict, compare,
 * match, scale. Build it once and four engines get it.
 *
 * The screen must be genuinely blank before the handover. A brief flash of the
 * previous answer defeats the entire point, so the content is unmounted rather
 * than hidden, and there is a short forced delay before the continue control is
 * even tappable.
 */

interface Props {
  to: string;
  onContinue: () => void;
  /** Milliseconds before the continue control becomes active. */
  holdMs?: number;
}

export default function Handoff({ to, onContinue, holdMs = 700 }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), holdMs);
    return () => clearTimeout(t);
  }, [holdMs]);

  return (
    <div className="handoff" role="dialog" aria-label={`Pass the phone to ${to}`}>
      <p className="handoff__eyebrow">pass the phone</p>
      <p className="handoff__to">{to}</p>
      <button
        type="button"
        className="handoff__go"
        disabled={!ready}
        onClick={onContinue}
      >
        {ready ? "I'm ready" : 'one moment'}
      </button>
    </div>
  );
}
