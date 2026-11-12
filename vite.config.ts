import { defineConfig } from 'vite';

// Relative asset URLs also work when deployed under /song-canvas/.
export default defineConfig({
  base: './',
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg'] },
});
