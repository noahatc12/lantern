import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { installSafeAreaVars } from './lib/safeArea';
import { hasContent, tryCached } from './lib/content';
import type { Bundle } from './lib/content';
import { read, write } from './lib/storage';
import type { Deck, Tier } from './types';
import Unlock from './screens/Unlock';
import Home from './screens/Home';
import DrawGame from './games/DrawGame';
import MatchGame from './games/MatchGame';
import PredictGame from './games/PredictGame';
import TimerGame from './games/TimerGame';
import LadderGame from './games/LadderGame';
import CompareGame from './games/CompareGame';
import ScaleGame from './games/ScaleGame';
import BuilderGame from './games/BuilderGame';
import VaultGame from './games/VaultGame';
import EnduranceGame from './games/EnduranceGame';

type Names = [string, string];

type Screen =
  | { at: 'boot' }
  | { at: 'missing' }
  | { at: 'locked' }
  | { at: 'names' }
  | { at: 'home' }
  | { at: 'game'; deck: Deck };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ at: 'boot' });
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [names, setNames] = useState<Names>(() => read<Names>('names', ['', '']));
  const [maxTier, setMaxTier] = useState<Tier>(() => read<Tier>('maxTier', 2));

  useEffect(() => {
    installSafeAreaVars();
    void (async () => {
      if (!(await hasContent())) {
        setScreen({ at: 'missing' });
        return;
      }
      const cached = await tryCached();
      if (cached) {
        setBundle(cached);
        setScreen(names[0] && names[1] ? { at: 'home' } : { at: 'names' });
      } else {
        setScreen({ at: 'locked' });
      }
    })();
    // names is read once at boot on purpose; later edits route explicitly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Reset scroll on every screen change.
   *
   * Without this you scroll the home list, tap a deck, and land halfway down
   * the new screen because the window keeps its scroll position across a React
   * view swap. It shipped, and it was visible in a screenshot I read and
   * approved: the rules screen started mid-sentence and I registered that as a
   * crop rather than as the actual scroll position.
   */
  /**
   * Scroll behaviour on navigation.
   *
   * Forward into a screen goes to the top. Back to the game list RESTORES where
   * you were, which is what every list-and-detail interface does and what your
   * hands expect.
   *
   * I originally reset scroll on every navigation, which fixed opening a game
   * part-way down and broke returning to the list in the same stroke. A blanket
   * rule was the wrong shape: the two directions want opposite things.
   *
   * Layout effect rather than effect, so the position is set before paint and
   * you never see a flash at the top.
   */
  const listScroll = useRef(0);

  useLayoutEffect(() => {
    if (screen.at === 'home') {
      window.scrollTo(0, listScroll.current);
    } else {
      window.scrollTo(0, 0);
      document.scrollingElement?.scrollTo(0, 0);
    }
  }, [screen.at, screen.at === 'game' ? screen.deck.id : null]);

  function onUnlocked(b: Bundle) {
    setBundle(b);
    setScreen(names[0] && names[1] ? { at: 'home' } : { at: 'names' });
  }

  function saveTier(t: Tier) {
    setMaxTier(t);
    write('maxTier', t);
  }

  if (screen.at === 'boot') {
    return (
      <main className="gate">
        <span className="dot" aria-hidden="true" />
        <p className="gate__hint">opening</p>
      </main>
    );
  }

  if (screen.at === 'missing') return <Unlock missing onUnlocked={onUnlocked} />;
  if (screen.at === 'locked') return <Unlock missing={false} onUnlocked={onUnlocked} />;

  if (screen.at === 'names') {
    return (
      <NameSetup
        initial={names}
        onDone={(n) => {
          setNames(n);
          write('names', n);
          setScreen({ at: 'home' });
        }}
      />
    );
  }

  if (!bundle) return null;

  if (screen.at === 'home') {
    return (
      <Home
        decks={bundle.decks}
        names={names}
        maxTier={maxTier}
        onPick={(deck) => {
          listScroll.current = window.scrollY;
          setScreen({ at: 'game', deck });
        }}
        onTier={saveTier}
        onNames={() => {
          listScroll.current = window.scrollY;
          setScreen({ at: 'names' });
        }}
      />
    );
  }

  const deck = screen.deck;
  const back = () => setScreen({ at: 'home' });

  switch (deck.engine) {
    case 'match':
      return <MatchGame deck={deck} names={names} onExit={back} />;
    case 'predict':
      return <PredictGame deck={deck} names={names} maxTier={maxTier} onExit={back} />;
    case 'timer':
      return <TimerGame deck={deck} onExit={back} />;
    case 'ladder':
      return <LadderGame deck={deck} names={names} maxTier={maxTier} onExit={back} />;
    case 'compare':
      return <CompareGame deck={deck} names={names} maxTier={maxTier} onExit={back} />;
    case 'scale':
      return <ScaleGame deck={deck} names={names} maxTier={maxTier} onExit={back} />;
    case 'builder':
      return <BuilderGame deck={deck} maxTier={maxTier} onExit={back} />;
    case 'vault':
      return <VaultGame deck={deck} names={names} onExit={back} />;
    case 'endurance':
      return <EnduranceGame deck={deck} names={names} maxTier={maxTier} onExit={back} />;
    default:
      return <DrawGame deck={deck} names={names} maxTier={maxTier} onExit={back} />;
  }
}

function NameSetup({ initial, onDone }: { initial: Names; onDone: (n: Names) => void }) {
  const [a, setA] = useState(initial[0]);
  const [b, setB] = useState(initial[1]);
  const ready = a.trim().length > 0 && b.trim().length > 0;

  return (
    <main className="gate">
      <h1 className="gate__title">Who is playing?</h1>
      <div className="gate__form">
        <input
          className="gate__input"
          value={a}
          onChange={(e) => setA(e.target.value)}
          placeholder="first name"
          autoCapitalize="words"
        />
        <input
          className="gate__input"
          value={b}
          onChange={(e) => setB(e.target.value)}
          placeholder="second name"
          autoCapitalize="words"
        />
        <button
          className="btn btn--primary"
          disabled={!ready}
          onClick={() => onDone([a.trim(), b.trim()])}
        >
          Done
        </button>
      </div>
      <p className="gate__hint">Stored on this device only.</p>
    </main>
  );
}
