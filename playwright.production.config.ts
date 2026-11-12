import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: 'production.spec.ts',
  timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:5175/song-canvas/' },
  webServer: {
    command: 'npm run build && node scripts/serve-subpath.mjs',
    url: 'http://127.0.0.1:5175/song-canvas/',
    reuseExistingServer: false,
    env: { VITE_GOOGLE_CLIENT_ID: '' },
  },
});
