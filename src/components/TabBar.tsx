/**
 * The four places, from the canvas.
 *
 * Tonight, the shelf, the vault and settings were previously reachable only
 * through buttons stacked on the landing screen, so the vault in particular was
 * three taps and a rules screen deep. A tab bar makes all four one tap from
 * anywhere, which is the only reason a three-week-old IOU ever gets seen again.
 *
 * Hidden during play. A game is a modal thing: offering a tab out mid-round
 * turns "stop" into an accident rather than a decision.
 */

import type { ReactElement } from 'react';

export type Tab = 'tonight' | 'shelf' | 'vault' | 'settings';

const ICONS: Record<Tab, ReactElement> = {
  tonight: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="13.4" r="6.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7V3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="13.4" r="2.4" fill="currentColor" />
    </svg>
  ),
  shelf: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.6" y="4.6" width="16.8" height="6.2" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.6" y="13.2" width="16.8" height="6.2" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  vault: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.6" y="10.4" width="14.8" height="9.8" rx="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 10.4V8a4 4 0 018 0v2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.8 8.6h16.4M3.8 15.4h16.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="8.6" r="2.5" fill="var(--bg)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="15.4" r="2.5" fill="var(--bg)" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
};

const LABELS: [Tab, string][] = [
  ['tonight', 'Tonight'],
  ['shelf', 'Shelf'],
  ['vault', 'Vault'],
  ['settings', 'Settings'],
];

export default function TabBar({ tab, onPick }: { tab: Tab; onPick: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {LABELS.map(([key, label]) => (
        <button
          key={key}
          className={`tabbtn ${tab === key ? 'is-on' : ''}`}
          onClick={() => onPick(key)}
          aria-current={tab === key ? 'page' : undefined}
        >
          <span className="tabbtn__rule" aria-hidden="true" />
          <span className="tabbtn__body">
            {ICONS[key]}
            <span className="tabbtn__label">{label}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
