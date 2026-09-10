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

import Icon from './Icon';
import type { IconName } from './Icon';

export type Tab = 'tonight' | 'shelf' | 'vault' | 'settings';

const ICONS: Record<Tab, IconName> = {
  tonight: 'lamp',
  shelf: 'shelf',
  vault: 'lock',
  settings: 'sliders',
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
            <Icon name={ICONS[key]} size={21} />
            <span className="tabbtn__label">{label}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
