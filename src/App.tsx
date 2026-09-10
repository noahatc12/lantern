import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { installSafeAreaVars } from './lib/safeArea';
import { forget, hasContent, tryCached } from './lib/content';
import type { Bundle } from './lib/content';
import { propsUsed } from './lib/deck';
import { record } from './lib/history';
import { StartedContext } from './lib/started';
import { useNavState } from './lib/transition';
import { useEdgeBack } from './lib/useEdgeBack';
import {
  isBool,
  isNames,
  isProps,
  isResume,
  isTier,
  clearAll,
  keys,
  read,
  remove,
  write,
} from './lib/storage';
import type { Resume } from './lib/storage';
import { useUpdateAvailable } from './lib/useUpdateAvailable';
import type { Deck, Tier } from './types';
import Unlock from './screens/Unlock';
import Onboard from './screens/Onboard';
import Tonight from './screens/Tonight';
import Shelf from './screens/Shelf';
import Vault from './screens/Vault';
import Settings from './screens/Settings';
import TabBar from './components/TabBar';
import FloorBar from './components/FloorBar';
import Stakes from './components/Stakes';
import Mark from './components/Mark';
import type { StakeKind } from './components/Stakes';
import type { Tab } from './components/TabBar';
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
import LeaderGame from './games/LeaderGame';
import QuizGame from './games/QuizGame';
import AuthoredGame from './games/AuthoredGame';
import RelayGame from './games/RelayGame';
import StagedGame from './games/StagedGame';
import StoryGame from './games/StoryGame';
import BodyMapGame from './games/BodyMapGame';
import OrderedGame from './games/OrderedGame';

type Names = [string, string];

type Route =
  | { at: 'boot' }
  | { at: 'missing' }
  | { at: 'locked' }
  | { at: 'onboard' }
  | { at: 'tabs' }
  | { at: 'game'; deck: Deck };

/** How long a game stays offered as "pick up where you were". */
const RESUME_WINDOW = 18 * 3600 * 1000;

/**
 * App wraps the screen body so the update banner can sit above every screen
 * without threading it through each of the many early returns below.
 */
export default function App() {
  const updateReady = useUpdateAvailable();
  return (
    <>
      {updateReady && <UpdateBanner />}
      <AppBody />
    </>
  );
}

function UpdateBanner() {
  return (
    <button className="updatebar" onClick={() => window.location.reload()}>
      A newer version is ready. Tap to reload.
    </button>
  );
}

/**
 * One suggestion, stable for the day.
 *
 * Recomputing a random pick on every render means the card under your thumb
 * changes as you reach for it. Seeding from the date makes it stable while you
 * are looking at it and different tomorrow, which is the behaviour "start here"
 * implies. Skips whatever is already offered as resume, so the screen never
 * makes the same suggestion twice in two places.
 */
function suggestFor(decks: Deck[], skip: string | null): Deck | null {
  const pool = decks.filter((d) => d.id !== skip && d.engine !== 'vault');
  if (pool.length === 0) return decks[0] ?? null;
  const day = Math.floor(Date.now() / 86400000);
  return pool[day % pool.length] ?? null;
}

function AppBody() {
  // Test hook. The harness sets this to prove the error boundary actually
  // catches, recovers and records. Inert unless deliberately set.
  if (read<boolean>('__crashtest', false) === true) {
    throw new Error('deliberate crash from the test hook');
  }

  const [route, setRoute] = useNavState<Route>({ at: 'boot' });
  const [tab, setTab] = useNavState<Tab>('tonight');
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [names, setNames] = useState<Names>(() => read<Names>('names', ['', ''], isNames));

  /**
   * Two ceilings, not one.
   *
   * `defaultTier` is where every session opens and is the thing that persists.
   * `maxTier` is tonight's live ceiling: raising it is a decision made in the
   * room, and it should not silently still be raised next week when one of you
   * opens the app alone. So the live ceiling is deliberately NOT written to
   * disk. Existing installs seed the default from the old single value.
   */
  const [defaultTier, setDefaultTier] = useState<Tier>(() =>
    read<Tier>('defaultTier', read<Tier>('maxTier', 2, isTier), isTier),
  );
  const [maxTier, setMaxTier] = useState<Tier>(defaultTier);

  const [availableProps, setAvailableProps] = useState<string[]>(() =>
    read<string[]>('props', [], isProps),
  );
  const [resume, setResume] = useState<Resume | null>(() =>
    read<Resume | null>('resume', null, isResume),
  );

  /**
   * Stopped is App state, not engine state, so that one implementation covers
   * every game and no future engine can quietly ship without a stop.
   */
  const [stopped, setStopped] = useState(false);

  /**
   * The stakes modifier, per game rather than per session. Restricted to the
   * engines that have a win condition: bolting a forfeit onto a sorting game or
   * a repair conversation is the one way this feature does damage.
   */
  const [stake, setStake] = useState<StakeKind>('none');

  /**
   * When the current deck was opened, so leaving it can record how long it was
   * actually played. A ref rather than state: nothing renders from it, and it
   * must not cause the game underneath to re-render mid-round.
   */
  const openedAt = useRef(0);

  /**
   * Set by the Rules screen when a game is actually started. Without it the app
   * would have to guess from how long the screen was open, which mislabels both
   * a short game and a phone left lying on a rules screen.
   */
  const startedDeck = useRef<string | null>(null);

  useEffect(() => {
    installSafeAreaVars();
    void (async () => {
      if (!(await hasContent())) {
        setRoute({ at: 'missing' });
        return;
      }
      const cached = await tryCached();
      if (cached) {
        setBundle(cached);
        setRoute(onboardedAlready() ? { at: 'tabs' } : { at: 'onboard' });
      } else {
        setRoute({ at: 'locked' });
      }
    })();
  }, []);

  function onboardedAlready(): boolean {
    // An install from before onboarding existed has names but no flag. Sending
    // those two back through a first-run flow would be a regression dressed up
    // as a feature, so names standing in for the flag is deliberate.
    const flag = read<boolean>('onboarded', false, isBool);
    const n = read<Names>('names', ['', ''], isNames);
    return flag || (n[0].length > 0 && n[1].length > 0);
  }

  /**
   * Scroll behaviour on navigation.
   *
   * Forward into a screen goes to the top. Back to a list RESTORES where you
   * were, which is what every list-and-detail interface does and what your hands
   * expect. An earlier blanket "reset on every navigation" fixed opening a game
   * part-way down and broke returning to the list in the same stroke.
   *
   * Layout effect rather than effect, so the position is set before paint and
   * you never see a flash at the top.
   */
  const listScroll = useRef(0);
  const restoring = useRef(false);
  // Stopping is a screen change even though the route is unchanged, so it has
  // to be part of the key. Without it, Stop from halfway down a play screen
  // leaves you halfway down the stop screen.
  const routeKey =
    route.at === 'game' ? `game:${route.deck.id}:${stopped}` : `${route.at}:${tab}`;

  useLayoutEffect(() => {
    if (restoring.current) {
      window.scrollTo(0, listScroll.current);
      restoring.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.scrollingElement?.scrollTo(0, 0);
  }, [routeKey]);

  /**
   * Swiping in from the left edge leaves whatever you are in. Declared here
   * rather than per screen so there is one implementation and no screen can
   * quietly not have it.
   */
  useEdgeBack(route.at === 'game' ? leaveGame : undefined);

  const decks = bundle?.decks ?? [];

  /**
   * The prop vocabulary comes from the content, never from a hand-written list.
   * A settings toggle for an item no card requires is a control that does
   * nothing, and it makes the guardrail line on Tonight claim filtering that is
   * not happening.
   */
  const knownProps = useMemo(
    () =>
      propsUsed(decks).map((name) => ({
        name,
        gates: countGated(decks, name),
      })),
    [decks],
  );

  function onUnlocked(b: Bundle) {
    setBundle(b);
    setRoute(onboardedAlready() ? { at: 'tabs' } : { at: 'onboard' });
  }

  function openDeck(deck: Deck) {
    setStopped(false);
    setStake('none');
    if (deck.engine === 'vault') {
      setTab('vault');
      setRoute({ at: 'tabs' });
      return;
    }
    listScroll.current = window.scrollY;
    openedAt.current = Date.now();
    startedDeck.current = null;
    const mark: Resume = { deckId: deck.id, at: Date.now() };
    setResume(mark);
    write('resume', mark);
    setRoute({ at: 'game', deck });
  }

  function leaveGame() {
    if (route.at === 'game' && startedDeck.current === route.deck.id) {
      record(route.deck.id, openedAt.current, Date.now() - openedAt.current);
    }
    startedDeck.current = null;
    openedAt.current = 0;
    restoring.current = true;
    setStopped(false);
    setRoute({ at: 'tabs' });
  }

  /**
   * Ease off drops tonight's ceiling one step and says nothing about who did
   * it. Every engine derives its pool from maxTier, so the deck follows on the
   * next draw without anything else being told.
   */
  function easeOff() {
    setMaxTier((t) => (t > 1 ? ((t - 1) as Tier) : t));
  }

  function noteStart(deckId: string) {
    startedDeck.current = deckId;
  }

  function pickTab(next: Tab) {
    setTab(next);
    setRoute({ at: 'tabs' });
  }

  if (route.at === 'boot') {
    return (
      <main className="gate">
        <span className="mark--lit">
          <Mark size={34} />
        </span>
        <p className="gate__hint">opening</p>
      </main>
    );
  }

  if (route.at === 'missing') return <Unlock missing onUnlocked={onUnlocked} />;
  if (route.at === 'locked') return <Unlock missing={false} onUnlocked={onUnlocked} />;

  if (route.at === 'onboard') {
    return (
      <Onboard
        initialNames={names}
        initialTier={defaultTier}
        onDone={(n, t) => {
          setNames(n);
          write('names', n);
          setDefaultTier(t);
          write('defaultTier', t);
          setMaxTier(t);
          write('onboarded', true);
          setRoute({ at: 'tabs' });
        }}
      />
    );
  }

  if (!bundle) return null;

  if (route.at === 'game') {
    const deck = route.deck;

    if (stopped) {
      return (
        <main className="stopped" data-screen="stopped">
          <h1 className="stopped__title">Stopped.</h1>
          <p className="stopped__body">
            That is the whole feature. No score, no record, and no question about who
            called it.
          </p>
          <button className="btn btn--big" onClick={leaveGame}>
            Back
          </button>
        </main>
      );
    }

    const common = { deck, names, maxTier, availableProps, onExit: leaveGame };
    // Only where there is something to win. Never on compare or match: a
    // forfeit attached to Conflict Lab or a yes/no/maybe sort turns a
    // conversation into a game with a loser.
    const canStake = ['draw', 'leader', 'quiz', 'timer', 'endurance'].includes(deck.engine);
    const floor = (
      <FloorBar
        tier={maxTier}
        onBack={leaveGame}
        onEase={easeOff}
        onStop={() => setStopped(true)}
      />
    );
    const body = (() => {
    switch (deck.engine) {
      case 'match':
        return <MatchGame {...common} />;
      case 'predict':
        return <PredictGame {...common} />;
      case 'timer':
        return <TimerGame deck={deck} onExit={leaveGame} />;
      case 'ladder':
        return <LadderGame {...common} />;
      case 'compare':
        return <CompareGame {...common} />;
      case 'scale':
        return <ScaleGame {...common} />;
      case 'builder':
        return <BuilderGame deck={deck} maxTier={maxTier} availableProps={availableProps} onExit={leaveGame} />;
      case 'vault':
        return <VaultGame deck={deck} names={names} decks={decks} onExit={leaveGame} />;
      case 'endurance':
        return <EnduranceGame {...common} />;
      case 'leader':
        return <LeaderGame {...common} />;
      case 'quiz':
        return <QuizGame {...common} />;
      case 'authored':
        return <AuthoredGame {...common} />;
      case 'relay':
        return <RelayGame {...common} />;
      case 'staged':
        return <StagedGame {...common} />;
      case 'story':
        return <StoryGame {...common} />;
      case 'bodymap':
        return <BodyMapGame {...common} />;
      case 'ordered':
        return <OrderedGame {...common} />;
      default:
        return <DrawGame {...common} />;
    }
    })();

    // The vault is a place rather than a round, so a stop control there would
    // be stopping nothing.
    return (
      <StartedContext.Provider value={noteStart}>
        {body}
        {canStake && <Stakes names={names} kind={stake} onKind={setStake} />}
        {deck.engine !== 'vault' && floor}
      </StartedContext.Provider>
    );
  }

  const resumeDeck =
    resume && Date.now() - resume.at < RESUME_WINDOW
      ? (decks.find((d) => d.id === resume.deckId && d.tierRange[0] <= maxTier) ?? null)
      : null;

  const inCeiling = decks.filter((d) => d.tierRange[0] <= maxTier);

  return (
    <>
      {tab === 'tonight' && (
        <Tonight
          decks={decks}
          names={names}
          maxTier={maxTier}
          suggested={suggestFor(inCeiling, resumeDeck?.id ?? null)}
          resume={resumeDeck}
          availableProps={availableProps}
          knownProps={knownProps}
          onPick={openDeck}
          onShuffle={() => {
            const pool = inCeiling.filter((d) => d.engine !== 'vault');
            const pick = pool[Math.floor(Math.random() * pool.length)];
            if (pick) openDeck(pick);
          }}
          onShelf={() => pickTab('shelf')}
          onTier={setMaxTier}
        />
      )}

      {tab === 'shelf' && (
        <Shelf decks={decks} maxTier={maxTier} onPick={openDeck} onTier={setMaxTier} />
      )}

      {tab === 'vault' && <Vault decks={decks} names={names} onPick={openDeck} />}

      {tab === 'settings' && (
        <Settings
          names={names}
          defaultTier={defaultTier}
          availableProps={availableProps}
          knownProps={knownProps}
          decks={decks}
          onNames={(n) => {
            setNames(n);
            write('names', n);
          }}
          onDefaultTier={(t) => {
            setDefaultTier(t);
            write('defaultTier', t);
            // Lowering the default below tonight's live ceiling should take
            // effect now rather than next time. Raising it should not: that is
            // a decision for the room, made on Tonight.
            if (t < maxTier) setMaxTier(t);
          }}
          onProps={(p) => {
            setAvailableProps(p);
            write('props', p);
          }}
          onForgetSeen={() => {
            for (const k of keys()) if (k.startsWith('seen.')) remove(k);
          }}
          onLock={() => {
            forget();
            setBundle(null);
            setRoute({ at: 'locked' });
          }}
          onEraseAll={() => {
            // The content key is a decryption credential, not something either
            // of you put in. Erasing your data should not also demand the
            // passphrase again.
            clearAll(['contentKey']);
            setNames(['', '']);
            setDefaultTier(2);
            setMaxTier(2);
            setAvailableProps([]);
            setResume(null);
            setTab('tonight');
            setRoute({ at: 'onboard' });
          }}
        />
      )}

      <TabBar tab={tab} onPick={pickTab} />
    </>
  );
}

/** How many cards or slot options this prop is the gate on. */
function countGated(decks: Deck[], name: string): number {
  let n = 0;
  for (const deck of decks) {
    for (const card of deck.cards) if (card.props?.includes(name)) n++;
    const slots = (deck as Deck & { slotDefs?: { options?: { props?: string[] }[] }[] })
      .slotDefs;
    for (const def of slots ?? [])
      for (const opt of def.options ?? []) if (opt.props?.includes(name)) n++;
  }
  return n;
}
