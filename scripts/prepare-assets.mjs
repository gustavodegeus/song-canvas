import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('public/ffmpeg/', root), { recursive: true });
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await copyFile(new URL(`node_modules/@ffmpeg/core/dist/esm/${file}`, root), new URL(`public/ffmpeg/${file}`, root));
}
await mkdir(new URL('public/licenses/', root), { recursive: true });
await copyFile(new URL('node_modules/@fontsource/allura/LICENSE', root), new URL('public/licenses/allura-OFL.txt', root));
for (const pkg of ['react', 'react-dom']) {
  await copyFile(new URL(`node_modules/${pkg}/LICENSE`, root), new URL(`public/licenses/${pkg}-MIT.txt`, root));
}
console.log('Prepared local licenses and single-thread FFmpeg core.');
