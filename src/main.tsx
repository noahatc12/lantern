import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/app.css';
import './styles/screens.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

/**
 * Offline. Registered only in a real build: a worker caching the dev server's
 * assets would serve them back after the dev server had moved on, which is a
 * confusing way to lose an afternoon.
 *
 * Failure is silent on purpose. No service worker means the app still works
 * with a signal, and an error here must never stop it opening.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
