export const VIDEO_FPS = 24;
const MAX_TEMPLATE_FRAMES = VIDEO_FPS * 2;

/** One short, closed GOP can be copied for the whole song without re-encoding
 * thousands of identical 1080p frames. Short songs get a shorter template.
 */
export function templateFrames(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('A valid audio duration is required.');
  return Math.min(MAX_TEMPLATE_FRAMES, Math.max(1, Math.ceil(duration * VIDEO_FPS)));
}

export function artworkCommand(frames: number): string[] {
  return [
    '-hide_banner', '-y', '-loop', '1', '-framerate', String(VIDEO_FPS), '-i', 'artwork.png',
    '-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage',
    '-crf', '22', '-pix_fmt', 'yuv420p', '-g', String(frames), '-keyint_min', String(frames),
    '-sc_threshold', '0', '-bf', '0', '-x264-params', 'open-gop=0', '-video_track_timescale', '24000',
    'artwork-loop.mp4',
  ];
}

export function assembleCommand(): string[] {
  return [
    '-hide_banner', '-y', '-stream_loop', '-1', '-i', 'artwork-loop.mp4', '-i', 'audio.mp3',
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k',
    '-shortest', '-movflags', '+faststart', 'video.mp4',
  ];
}
