import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
// @ts-expect-error plain JS build helper, no types needed
import { writeServiceWorker } from './scripts/sw.mjs';
import react from '@vitejs/plugin-react';

/**
 * One build id, used in two places: compiled into the bundle, and written to
 * dist/version.json. The running app compares the two to notice that a newer
 * build has been deployed.
 *
 * Generated here rather than in a separate script so the two can never drift.
 * A version check that compares a stale constant to a fresh file is worse than
 * no check, because it reports "up to date" while being wrong.
 */
const BUILD_ID = new Date().toISOString();

export default defineConfig({
  // GitHub Pages project site: https://<user>.github.io/<repo>/
  base: '/lantern/',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    {
      name: 'lantern-write-version',
      apply: 'build',
      closeBundle() {
        writeFileSync(
          path.resolve('dist', 'version.json'),
          JSON.stringify({ id: BUILD_ID }),
          'utf8',
        );
        // After version.json, because the worker reads the build id from it.
        // Generated here rather than by a separate command so a service worker
        // built from a different dist/ than the one being served cannot exist.
        const sw = writeServiceWorker();
        this.info?.(`service worker: ${sw.files} files precached`);
      },
    },
  ],
  build: { outDir: 'dist', sourcemap: false },
});
