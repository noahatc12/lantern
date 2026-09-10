import { useMemo, useState } from 'react';
import type { Deck, Tier } from '../types';
import { mulberry32, playable, shuffle } from '../lib/deck';
import { isStories, read, write } from '../lib/storage';
import type { Story } from '../lib/storage';
import Empty from '../components/Empty';
import Rules from '../components/Rules';
import { useScreenTop } from '../lib/useScreenTop';
import Icon from '../components/Icon';

/**
 * E15 Relay. One sentence each, passing the phone.
 *
 * A sentence is nothing to write, which is the point: neither of you has to
 * decide what the story is, and neither of you can steer it alone. What comes
 * out is usually better than either would have written and is unmistakably
 * yours.
 *
 * Two rules do the work. Only the last two sentences are visible, so nobody
 * edits backwards and the thing keeps moving. And there is a hard character
 * cap, because one person writing paragraphs turns a relay into an audience.
 *
 * Delete is real. It removes the storage key rather than hiding a row, because
 * this is the one place in the app where the two of you wrote something
 * together and "deleted" has to mean deleted.
 */

interface Props {
  deck: Deck & { maxSentences?: number; charCap?: number };
  names: [string, string];
  maxTier: Tier;
  availableProps: string[];
  onExit: () => void;
}

type Phase =
  | { step: 'rules' }
  | { step: 'writing' }
  | { step: 'whole' }
  | { step: 'saved' };

export default function RelayGame({ deck, names, maxTier, availableProps, onExit }: Props) {
  const maxSentences = deck.maxSentences ?? 20;
  const charCap = deck.charCap ?? 140;
  const key = `relay.${deck.id}`;

  const openings = useMemo(
    () =>
      shuffle(
        playable(deck.cards, maxTier, availableProps),
        mulberry32(Date.now() & 0xffffffff),
      ),
    [deck, maxTier, availableProps],
  );

  const [phase, setPhase] = useState<Phase>({ step: 'rules' });
  const [lines, setLines] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [turn, setTurn] = useState<0 | 1>(0);
  const [saved, setSaved] = useState<Story[]>(() => read<Story[]>(key, [], isStories));

  useScreenTop(`${phase.step}-${lines.length}`);

  if (openings.length === 0) return <Empty onExit={onExit} />;

  const opening = openings[0]!;
  const written = lines.length;
  const left = maxSentences - written;
  const tail = lines.slice(-2);

  function persist(next: Story[]) {
    setSaved(next);
    write(key, next);
  }

  /* ---------------------------------------------------------------- rules */

  if (phase.step === 'rules') {
    return (
      <Rules
        deck={deck}
        onExit={onExit}
        onStart={() => {
          setLines([opening.text]);
          setDraft('');
          setTurn(0);
          setPhase({ step: 'writing' });
        }}
        startLabel={`${names[0]} goes second`}
      >
        <p className="play__note">
          {maxSentences} sentences, {charCap} characters each.{' '}
          {saved.length > 0 && `${saved.length} kept from before.`}
        </p>
        {saved.length > 0 && (
          <button className="btn btn--ghost" onClick={() => setPhase({ step: 'saved' })}>
            Read the ones you kept
          </button>
        )}
      </Rules>
    );
  }

  /* ---------------------------------------------------------------- saved */

  if (phase.step === 'saved') {
    return (
      <main className="screen" data-screen="relay.saved">
        <button
          className="backbtn"
          onClick={() => setPhase({ step: 'rules' })}
          aria-label="Back"
        >
          <Icon name="back" size={20} />
        </button>
        <p className="h1 h1--big">Kept</p>
        {saved.length === 0 && (
          <div className="emptybox">
            <p className="emptybox__title">Nothing kept.</p>
            <p className="emptybox__text">Anything you deleted is genuinely gone.</p>
          </div>
        )}
        {saved.map((story) => (
          <div className="story" key={story.id}>
            <p className="eyebrow">{new Date(story.at).toLocaleDateString()}</p>
            <p className="story__text">{story.lines.join(' ')}</p>
            <button
              className="btn btn--danger"
              onClick={() => persist(saved.filter((s) => s.id !== story.id))}
            >
              Delete this one
            </button>
          </div>
        ))}
      </main>
    );
  }

  /* ---------------------------------------------------------------- whole */

  if (phase.step === 'whole') {
    return (
      <main className="play" data-screen="relay.whole">
        <header className="play__top">
          <button className="play__back" onClick={onExit} aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <span className="play__deck">{written} sentences</span>
        </header>
        <section className="play__stage">
          <p className="story__text">{lines.join(' ')}</p>
          <div className="play__actions">
            <button
              className="btn btn--ghost"
              onClick={() => {
                // Nothing to remove: it was never written down. Say so rather
                // than pretending a delete happened.
                setLines([]);
                setPhase({ step: 'rules' });
              }}
            >
              Delete it
            </button>
            <button
              className="btn btn--primary"
              onClick={() => {
                persist([
                  { id: `${Date.now()}`, at: Date.now(), lines },
                  ...saved,
                ]);
                setLines([]);
                setPhase({ step: 'saved' });
              }}
            >
              Keep it
            </button>
          </div>
          <p className="play__note">
            Delete removes it for good and immediately. Until you tap Keep, this only
            exists on this screen.
          </p>
        </section>
      </main>
    );
  }

  /* -------------------------------------------------------------- writing */

  const over = charCap - draft.length;

  return (
    <main className="play" data-screen={`relay.writing.${written}`}>
      <header className="play__top">
        <button className="play__back" onClick={onExit} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        <span className="play__deck">{names[turn]}, one sentence</span>
        <span className="play__tier">{left} left</span>
      </header>

      <section className="play__stage play__stage--form">
        <div className="reminder">
          <p className="reminder__label">
            {tail.length > 1 ? 'the story so far' : 'it opens with'}
          </p>
          {tail.map((l, i) => (
            <p className="reminder__text" key={i}>
              {l}
            </p>
          ))}
        </div>

        <textarea
          className="answer"
          value={draft}
          maxLength={charCap}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="one sentence, then pass it"
          rows={3}
          aria-label="Your sentence"
        />
        <p className={`cap ${over < 20 ? 'is-low' : ''}`}>{over} characters left</p>

        <button
          className="btn btn--primary btn--big"
          disabled={!draft.trim()}
          onClick={() => {
            const next = [...lines, draft.trim()];
            setLines(next);
            setDraft('');
            setTurn(turn === 0 ? 1 : 0);
            if (next.length >= maxSentences) setPhase({ step: 'whole' });
          }}
        >
          Add it and pass
        </button>

        <button
          className="btn btn--big"
          style={{ marginTop: 10 }}
          disabled={written < 3}
          onClick={() => setPhase({ step: 'whole' })}
        >
          {written < 3 ? 'A bit more first' : 'Stop here and read it'}
        </button>

        <p className="play__note">
          You can only see the last two sentences. That is deliberate: nobody edits
          backwards and it keeps moving.
        </p>
      </section>
    </main>
  );
}
