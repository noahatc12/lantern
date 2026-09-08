import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * Catches render errors and offers a way out.
 *
 * Without this, a thrown error unmounts the tree and leaves a black screen with
 * no explanation and no route back. On a phone, with no console open, that is
 * indistinguishable from the app being broken forever.
 *
 * Nothing phones home, by design, so the error is written to localStorage
 * instead. That is the only place a report can survive long enough to be read,
 * and it means a crash you hit on Tuesday is still legible on Wednesday.
 *
 * Two exits, deliberately ordered by cost: reload first, and only then the
 * destructive one. Clearing storage means re-entering the passphrase and losing
 * vault items and match results, so it is labelled as what it is rather than
 * offered as a friendly "fix it" button.
 */

const ERROR_KEY = 'lantern.lastError';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      localStorage.setItem(
        ERROR_KEY,
        JSON.stringify({
          at: new Date().toISOString(),
          message: error.message,
          stack: (error.stack ?? '').slice(0, 2000),
          component: (info.componentStack ?? '').slice(0, 2000),
        }),
      );
    } catch {
      // Storage itself may be the thing that is broken. Never throw from here.
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="stopped">
        <h1 className="stopped__title">That did not work.</h1>
        <p className="stopped__body">
          Something broke while drawing this screen. Nothing you have saved is affected,
          and the details are written to this device so they can be looked at later.
        </p>

        <pre className="crashlog">{error.message || 'unknown error'}</pre>

        <button className="btn btn--primary" onClick={() => window.location.reload()}>
          Reload
        </button>

        <button
          className="btn btn--ghost"
          onClick={() => {
            if (
              !window.confirm(
                'Clear everything stored on this device? You will need the passphrase again, and vault items and match results will be gone.',
              )
            ) {
              return;
            }
            try {
              for (const k of Object.keys(localStorage)) {
                if (k.startsWith('lantern.')) localStorage.removeItem(k);
              }
            } catch {
              /* nothing useful to do */
            }
            window.location.reload();
          }}
        >
          Start over, clearing this device
        </button>
      </main>
    );
  }
}
