export const MAX_SECONDS = 600;
export const MAX_BYTES = 80 * 1024 * 1024;

export function inferTitle(filename: string): string {
  return filename.replace(/\.mp3$/iu, '').trim();
}
export function safeFilename(title: string): string {
  return title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 120) || 'song';
}
export function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
export function checkDuration(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('We could not read this song’s duration. Please try another MP3.');
  // Encoder padding can add a few milliseconds to an exactly ten-minute MP3.
  if (duration > MAX_SECONDS + 0.1) throw new Error('Please choose a song that is 10 minutes or shorter.');
}

export async function inspectAudio(file: File, signal: AbortSignal): Promise<number> {
  signal.throwIfAborted();
  if (!/\.mp3$/iu.test(file.name)) throw new Error('Please choose an MP3 file.');
  if (!file.size) throw new Error('This file is empty. Please choose another MP3.');
  if (file.size > MAX_BYTES) throw new Error('Please choose an MP3 smaller than 80 MB.');
  // MIME types are unreliable across OSes. Confirm an ID3 header or MP3 frame sync;
  // FFprobe performs authoritative format validation before encoding.
  const header = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  signal.throwIfAborted();
  const id3 = header[0] === 73 && header[1] === 68 && header[2] === 51;
  const frame = header.some((value, i) => value === 255 && (header[i + 1] & 0xe0) === 0xe0);
  if (!id3 && !frame) throw new Error('This does not appear to be an MP3. Please choose another file.');
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      audio.onloadedmetadata = audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
    };
    const aborted = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      cleanup();
      try { checkDuration(duration); resolve(duration); } catch (error) { reject(error); }
    };
    audio.onerror = () => { cleanup(); reject(new Error('Your browser could not read this MP3. Please try another file.')); };
    timer = setTimeout(() => { cleanup(); reject(new Error('Reading this MP3 took too long. Please try again.')); }, 20_000);
    signal.addEventListener('abort', aborted, { once: true });
    audio.src = url;
  });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
