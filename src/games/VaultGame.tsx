import type { Deck } from '../types';
import Rules from '../components/Rules';
import { isVaultItems, read } from '../lib/storage';
import type { VaultItem } from '../lib/storage';
import { useScreenTop } from '../lib/useScreenTop';
import { useNavState } from '../lib/transition';
import VaultScreen from '../screens/Vault';

/**
 * E10 Vault, as a deck.
 *
 * Roughly 40% of the physical couples-game category by item count is coupons,
 * IOUs and sealed envelopes, and every paper version fails the same way: it gets
 * lost, or forgotten, or feels silly to hand over. A phone can hold an IOU and
 * surface it three weeks later, which is the one place this format is strictly
 * better than paper rather than a compromise on it.
 *
 * The vault now lives on its own tab, so this is only the route in from the
 * shelf: the rules screen, and then the same one implementation. Two copies of
 * an IOU list backed by the same storage key is how the two drift apart and one
 * of them starts lying about what is owed.
 */

interface Props {
  deck: Deck;
  names: [string, string];
  decks: Deck[];
  onExit: () => void;
}

const KEY = 'vault.items';

export default function VaultGame({ deck, names, decks, onExit }: Props) {
  const [started, setStarted] = useNavState(false);
  const items = read<VaultItem[]>(KEY, [], isVaultItems);

  useScreenTop(String(started));

  if (!started) {
    const open = items.filter((it) => it.redeemedAt === undefined).length;
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => setStarted(true)}
        startLabel="Open the vault"
      >
        <p className="play__note">
          {open} open, {items.length - open} redeemed.
        </p>
      </Rules>
    );
  }

  return <VaultScreen decks={decks} names={names} onExit={onExit} />;
}
