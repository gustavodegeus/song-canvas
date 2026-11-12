import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testIgnore: 'production.spec.ts',
  timeout: 120_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174' },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    env: { VITE_GOOGLE_CLIENT_ID: 'browser-tests.apps.googleusercontent.com' },
    reuseExistingServer: false,
  },
});
