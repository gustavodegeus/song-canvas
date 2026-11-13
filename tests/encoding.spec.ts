import { test, expect } from '@playwright/test';

test('copied artwork loops have continuous timing and retain exactly the full AAC encode', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser-only Vite source import.
    const { FFmpeg } = await import('/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js');
    // @ts-expect-error Browser-only Vite source import.
    const { encodeVideo } = await import('/src/media/encoder.ts');
    // @ts-expect-error Browser-only Vite source import.
    const { renderArtwork, pngBlob } = await import('/src/artwork/renderer.ts');
    const open = async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({ coreURL: `${location.origin}/ffmpeg/ffmpeg-core.js`, wasmURL: `${location.origin}/ffmpeg/ffmpeg-core.wasm` });
      return ffmpeg;
    };
    const source = await open();
    // Non-integral duration exercises two loop boundaries and a partial final
    // GOP. A different final tone makes the ending distinct from the intro.
    const code = await source.exec(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=4',
      '-f', 'lavfi', '-i', 'sine=frequency=1100:sample_rate=44100:duration=0.37',
      '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1', '-c:a', 'libmp3lame', 'source.mp3']);
    if (code !== 0) throw new Error('Could not generate the original test audio.');
    const original = await source.readFile('source.mp3');
    source.terminate();
    const fractions: number[] = [];
    const stages: string[] = [];
    const blob = await encodeVideo(new File([original], 'Test.mp3', { type: 'audio/mpeg' }),
      await pngBlob((await renderArtwork('Our Song', 'soccer')).canvas), new AbortController().signal,
      (progress: { fraction?: number; stage: string }) => {
        if (progress.fraction !== undefined) fractions.push(progress.fraction);
        stages.push(progress.stage);
      });
    const verify = await open();
    const run = async (args: string[]) => { if (await verify.exec(args) !== 0) throw new Error(`Verification failed: ${args.join(' ')}`); };
    try {
      await verify.writeFile('video.mp4', new Uint8Array(await blob.arrayBuffer()));
      await verify.writeFile('source.mp3', original);
      await verify.ffprobe(['-v', 'error', '-show_streams', '-show_format', '-of', 'json', 'video.mp4', '-o', 'info.json']);
      const info = JSON.parse(await verify.readFile('info.json', 'utf8'));
      await verify.ffprobe(['-v', 'error', '-select_streams', 'v:0', '-show_packets', '-of', 'json', 'video.mp4', '-o', 'packets.json']);
      const { packets } = JSON.parse(await verify.readFile('packets.json', 'utf8'));
      await run(['-i', 'source.mp3', '-map', '0:a:0', '-vn', '-c:a', 'aac', '-b:a', '256k', 'reference.m4a']);
      await run(['-i', 'reference.m4a', '-map', '0:a:0', '-c:a', 'copy', '-f', 'adts', 'reference.aac']);
      await run(['-i', 'video.mp4', '-map', '0:a:0', '-c:a', 'copy', '-f', 'adts', 'actual.aac']);
      const reference = await verify.readFile('reference.aac');
      const actual = await verify.readFile('actual.aac');
      const identicalAudio = reference.length === actual.length && reference.every((value: number, i: number) => value === actual[i]);
      await run(['-ss', '0', '-i', 'video.mp4', '-frames:v', '1', 'first.png']);
      await run(['-ss', '2', '-i', 'video.mp4', '-frames:v', '1', 'repeated.png']);
      const first = await verify.readFile('first.png');
      const repeated = await verify.readFile('repeated.png');
      const identicalFrame = first.length === repeated.length && first.every((value: number, i: number) => value === repeated[i]);
      return { info, pts: packets.map((p: { pts_time: string }) => Number(p.pts_time)),
        dts: packets.map((p: { dts_time: string }) => Number(p.dts_time)), identicalAudio,
        audioBytes: actual.length, identicalFrame, fractions, stages };
    } finally { verify.terminate(); }
  });
  expect(result.identicalAudio).toBe(true); // No lost ending or altered AAC packets.
  expect(result.audioBytes).toBeGreaterThan(10000);
  expect(result.identicalFrame).toBe(true); // A loop restart does not change artwork.
  expect(result.pts.length).toBeGreaterThan(100);
  expect(result.pts[0]).toBe(0);
  for (let i = 1; i < result.pts.length; i++) {
    expect(result.pts[i] - result.pts[i - 1]).toBeCloseTo(1 / 24, 5);
    expect(result.dts[i]).toBeGreaterThan(result.dts[i - 1]);
  }
  const video = result.info.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  const audio = result.info.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
  expect(video.codec_name).toBe('h264');
  expect(video.width).toBe(1920);
  expect(video.height).toBe(1080);
  expect(video.avg_frame_rate).toBe('24/1');
  expect(audio.codec_name).toBe('aac');
  expect(Number(audio.duration)).toBeCloseTo(4.37, 1);
  expect(Number(video.duration)).toBeGreaterThanOrEqual(Number(audio.duration) - 1 / 24);
  expect(result.fractions.at(-1)).toBe(1);
  for (let i = 1; i < result.fractions.length; i++) expect(result.fractions[i]).toBeGreaterThanOrEqual(result.fractions[i - 1]);
  expect(result.stages).toContain('Preparing the artwork once…');
  expect(result.stages).toContain('Adding your complete song…');
});
