import { FFmpeg } from '@ffmpeg/ffmpeg';
import { checkDuration } from './audio';
import { artworkCommand, assembleCommand, templateFrames, VIDEO_FPS } from './encoding-plan';

export interface RenderProgress { stage: string; fraction?: number }
interface Probe {
  format?: { duration?: string; format_name?: string };
  streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string; avg_frame_rate?: string }[];
}

/** Each job owns its worker and virtual FS. Cancel/retry never reuses a poisoned core. */
export async function encodeVideo(audio: File, artwork: Blob, signal: AbortSignal,
  onProgress: (progress: RenderProgress) => void): Promise<Blob> {
  signal.throwIfAborted();
  const ffmpeg = new FFmpeg();
  let logs: string[] = [];
  const abort = () => ffmpeg.terminate();
  signal.addEventListener('abort', abort, { once: true });
  const probe = async (input: string): Promise<Probe> => {
    try { await ffmpeg.deleteFile('probe.json'); } catch { /* First probe has no previous output. */ }
    const code = await ffmpeg.ffprobe(['-v', 'error', '-show_format', '-show_streams', '-of', 'json', input, '-o', 'probe.json']);
    // core 0.12.10 leaves the return-value sentinel at -1 even for a successful
    // FFprobe run. Require a fresh, parseable report with both streams and format.
    try {
      const report = JSON.parse(await ffmpeg.readFile('probe.json', 'utf8') as string) as Probe;
      if ((code !== 0 && code !== -1) || !report.format || !report.streams?.length) throw new Error();
      return report;
    } catch { throw new Error('We could not inspect the audio/video file. Please try another MP3.'); }
  };
  try {
    onProgress({ stage: 'Preparing the local video studio…' });
    ffmpeg.on('log', ({ message }) => { logs.push(message); if (logs.length > 12) logs.shift(); });
    const base = new URL(`${import.meta.env.BASE_URL}ffmpeg/`, document.baseURI).href;
    await ffmpeg.load({ coreURL: `${base}ffmpeg-core.js`, wasmURL: `${base}ffmpeg-core.wasm` });
    signal.throwIfAborted();
    onProgress({ stage: 'Reading your song…' });
    await ffmpeg.writeFile('audio.mp3', new Uint8Array(await audio.arrayBuffer()));
    await ffmpeg.writeFile('artwork.png', new Uint8Array(await artwork.arrayBuffer()));
    const input = await probe('audio.mp3');
    if (input.format?.format_name !== 'mp3' || !input.streams?.some(stream => stream.codec_type === 'audio')) {
      throw new Error('Please choose a valid MP3 audio file.');
    }
    const duration = Number(input.format?.duration);
    checkDuration(duration);
    const frames = templateFrames(duration);
    let phase: 'artwork' | 'audio' | 'idle' = 'idle';
    let lastFraction = 0;
    ffmpeg.on('progress', ({ time }) => {
      if (phase === 'idle') return;
      const elapsed = Math.max(0, time / 1_000_000);
      const fraction = phase === 'artwork'
        ? 0.04 + 0.22 * Math.min(1, elapsed / (frames / VIDEO_FPS))
        : 0.26 + 0.71 * Math.min(1, elapsed / duration);
      lastFraction = Math.max(lastFraction, fraction);
      onProgress({ stage: phase === 'artwork' ? 'Preparing the artwork once…' : 'Adding your complete song…', fraction: lastFraction });
    });
    const run = async (args: string[]) => {
      signal.throwIfAborted();
      logs = [];
      const code = await ffmpeg.exec(args);
      signal.throwIfAborted();
      if (code !== 0) {
        if (logs.some(line => /memory|alloc|out of bounds/i.test(line))) throw new Error('Your browser ran out of memory. Try a desktop browser and close other tabs.');
        throw new Error('The video could not be created. Please retry; for longer songs, use a desktop browser.');
      }
    };
    // Encode at most two seconds of artwork once. Each loop begins with a
    // keyframe and has no cross-loop references or B-frame timestamp offsets.
    phase = 'artwork';
    onProgress({ stage: 'Preparing the artwork once…', fraction: 0.04 });
    await run(artworkCommand(frames));
    phase = 'audio';
    lastFraction = 0.26;
    onProgress({ stage: 'Adding your complete song…', fraction: 0.26 });
    // Only audio is encoded here. The H.264 packets are copied with continuous
    // timestamps; no repeated PNG decoding or full-song 1080p re-encoding.
    await run(assembleCommand());
    phase = 'idle';
    onProgress({ stage: 'Checking your finished video…', fraction: 0.99 });
    const output = await probe('video.mp4');
    const video = output.streams?.find(stream => stream.codec_type === 'video');
    const sound = output.streams?.find(stream => stream.codec_type === 'audio');
    if (video?.codec_name !== 'h264' || video.width !== 1920 || video.height !== 1080 || sound?.codec_name !== 'aac') {
      throw new Error('The generated video did not pass its format checks. Please retry.');
    }
    const audioDuration = Number(sound.duration);
    const videoDuration = Number(video.duration);
    const [numerator, denominator] = (video.avg_frame_rate ?? '').split('/').map(Number);
    const fps = numerator / denominator;
    if (!Number.isFinite(videoDuration) || !Number.isFinite(fps) || Math.abs(fps - VIDEO_FPS) > 0.001
      || videoDuration < audioDuration - 1 / VIDEO_FPS || videoDuration > audioDuration + 0.25) {
      throw new Error('The video timing did not pass its completeness check. No video will be published.');
    }
    // Allow MP3/AAC encoder padding, never a materially shortened performance.
    if (!Number.isFinite(audioDuration) || Math.abs(audioDuration - duration) > 0.25) {
      throw new Error('The audio duration did not pass its completeness check. No video will be published.');
    }
    const bytes = await ffmpeg.readFile('video.mp4');
    if (typeof bytes === 'string' || bytes.byteLength === 0) throw new Error('The rendered video is empty. Please retry.');
    signal.throwIfAborted();
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
    onProgress({ stage: 'Your video is ready.', fraction: 1 });
    return blob;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (error instanceof Error && /fetch|import|load|network/i.test(error.message)) {
      throw new Error('The video studio could not load. Check your connection and retry. Your song has not been uploaded.');
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    ffmpeg.terminate();
  }
}
