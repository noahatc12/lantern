import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project site: https://<user>.github.io/<repo>/
export default defineConfig({
  base: '/lantern/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
