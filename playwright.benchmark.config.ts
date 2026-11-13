import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: 'encoding-benchmark.spec.ts',
  timeout: 600_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5176' },
  webServer: {
    command: 'npm run dev -- --port 5176 --strictPort',
    url: 'http://127.0.0.1:5176',
    env: { VITE_GOOGLE_CLIENT_ID: '' },
    reuseExistingServer: false,
  },
});
