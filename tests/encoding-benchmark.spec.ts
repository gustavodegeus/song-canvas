import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('compare legacy encoding with static-loop assembly and a longer synthetic song', async ({ page }) => {
  const seconds = Number(process.env.BENCHMARK_SECONDS ?? '20.37');
  const longSeconds = Number(process.env.LONG_BENCHMARK_SECONDS ?? '216.37');
  for (const duration of [seconds, longSeconds]) {
    if (!Number.isFinite(duration) || duration < 2 || duration > 600) throw new Error('Benchmark durations must be between 2 and 600 seconds.');
  }
  await page.goto('/');
  const results = await page.evaluate(async ({ seconds, longSeconds }) => {
    // @ts-expect-error Browser-only Vite source import.
    const { FFmpeg } = await import('/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js');
    // @ts-expect-error Browser-only Vite source import.
    const { artworkCommand, assembleCommand, templateFrames } = await import('/src/media/encoding-plan.ts');
    // @ts-expect-error Browser-only Vite source import.
    const { renderArtwork, pngBlob } = await import('/src/artwork/renderer.ts');
    const ffmpeg = new FFmpeg();
    let logs: string[] = [];
    ffmpeg.on('log', ({ message }: { message: string }) => { logs.push(message); if (logs.length > 8) logs.shift(); });
    await ffmpeg.load({ coreURL: `${location.origin}/ffmpeg/ffmpeg-core.js`, wasmURL: `${location.origin}/ffmpeg/ffmpeg-core.wasm` });
    const run = async (args: string[]) => {
      logs = [];
      if (await ffmpeg.exec(args) !== 0) throw new Error(logs.join('\n'));
    };
    const inspect = async () => {
      try { await ffmpeg.deleteFile('info.json'); } catch { /* First report. */ }
      await ffmpeg.ffprobe(['-v', 'error', '-show_streams', '-show_format', '-of', 'json', 'video.mp4', '-o', 'info.json']);
      const report = JSON.parse(await ffmpeg.readFile('info.json', 'utf8'));
      const video = report.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
      const audio = report.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
      const bytes = (await ffmpeg.readFile('video.mp4')).byteLength;
      return { bytes, width: video.width, height: video.height, fps: video.avg_frame_rate,
        videoCodec: video.codec_name, audioCodec: audio.codec_name,
        videoDuration: Number(video.duration), audioDuration: Number(audio.duration) };
    };
    const generate = (duration: number) => run(['-y', '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=44100:duration=${duration}`, '-c:a', 'libmp3lame', 'audio.mp3']);
    try {
      await ffmpeg.writeFile('artwork.png', new Uint8Array(await (await pngBlob((await renderArtwork('Our Song', 'soccer')).canvas)).arrayBuffer()));
      await generate(seconds);
      let start = performance.now();
      // Previous production command retained only in this opt-in benchmark.
      await run(['-y', '-loop', '1', '-framerate', '24', '-i', 'artwork.png', '-i', 'audio.mp3',
        '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage',
        '-crf', '22', '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-b:a', '256k',
        '-shortest', '-movflags', '+faststart', 'video.mp4']);
      const legacy = { elapsedSeconds: (performance.now() - start) / 1000, ...await inspect() };
      const optimized = async (duration: number) => {
        start = performance.now();
        await run(artworkCommand(templateFrames(duration)));
        const preparedSeconds = (performance.now() - start) / 1000;
        await run(assembleCommand());
        const elapsedSeconds = (performance.now() - start) / 1000;
        return { elapsedSeconds, preparedSeconds, ...await inspect() };
      };
      const fast = await optimized(seconds);
      await generate(longSeconds);
      const long = await optimized(longSeconds);
      return { method: 'Warm single-thread FFmpeg core, identical PNG and synthetic MP3; excludes core loading and fixture generation.',
        seconds, longSeconds, speedup: legacy.elapsedSeconds / fast.elapsedSeconds, legacy, fast, long };
    } finally { ffmpeg.terminate(); }
  }, { seconds, longSeconds });
  for (const report of [results.legacy, results.fast, results.long]) {
    expect(report.width).toBe(1920);
    expect(report.height).toBe(1080);
    expect(report.fps).toBe('24/1');
    expect(report.videoCodec).toBe('h264');
    expect(report.audioCodec).toBe('aac');
    expect(report.videoDuration).toBeGreaterThanOrEqual(report.audioDuration - 1 / 24);
    expect(report.videoDuration - report.audioDuration).toBeLessThan(0.25);
  }
  expect(results.fast.elapsedSeconds).toBeLessThan(results.legacy.elapsedSeconds);
  expect(results.fast.audioDuration).toBeCloseTo(seconds, 1);
  expect(results.long.audioDuration).toBeCloseTo(longSeconds, 1);
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/video-benchmark.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
});
