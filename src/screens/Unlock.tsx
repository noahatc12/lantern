import { useState } from 'react';
import { unlock } from '../lib/content';
import type { Bundle } from '../lib/content';
import Mark from '../components/Mark';

interface Props {
  onUnlocked: (bundle: Bundle) => void;
  missing: boolean;
}

export default function Unlock({ onUnlocked, missing }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      onUnlocked(await unlock(value));
    } catch {
      // Deliberately vague. Distinguishing "wrong passphrase" from other
      // failures would tell an attacker their guess was well formed.
      setError('That did not open it.');
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <main className="gate">
        <h1 className="gate__title">Nothing sealed yet</h1>
        <p className="gate__hint">
          Run <code>npm run seal</code> with your passphrase, commit
          <code> public/content.enc</code>, and push.
        </p>
      </main>
    );
  }

  return (
    <main className="gate">
      <span className="mark--lit">
        <Mark size={54} />
      </span>
      <h1 className="gate__title">Lantern</h1>
      <form className="gate__form" onSubmit={submit}>
        <label className="gate__label" htmlFor="pp">
          passphrase
        </label>
        <input
          id="pp"
          className="gate__input"
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
        />
        <button className="btn btn--primary" type="submit" disabled={busy || !value.trim()}>
          {busy ? 'opening' : 'Open'}
        </button>
        {error && <p className="gate__error">{error}</p>}
      </form>
      <p className="gate__hint">Unlocking takes a second. That is the key derivation, on purpose.</p>
    </main>
  );
}
