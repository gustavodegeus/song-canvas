import { clearAuthorization } from './auth';

export type Visibility = 'public' | 'unlisted' | 'private';
export interface UploadMetadata { title: string; visibility: Visibility; madeForKids: boolean }
export interface UploadResult { id: string; visibility?: Visibility; uploadStatus?: string }
interface ApiVideo { id?: string; status?: { privacyStatus?: Visibility; uploadStatus?: string } }
export interface UploadSession { url: string; total: number; metadataKey: string; offset: number }
const CHUNK = 8 * 1024 * 1024; // Must be a multiple of 256 KiB.
const RETRYABLE = [0, 408, 429, 500, 502, 503, 504];

export class UploadError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function metadataKey(metadata: UploadMetadata) { return JSON.stringify(metadata); }
export function validateMetadata(metadata: UploadMetadata) {
  if (!metadata.title.trim() || [...metadata.title].length > 100 || /[<>]/u.test(metadata.title)) {
    throw new Error('YouTube titles must be 1–100 characters and cannot include < or >. Go back to artwork to edit the song title.');
  }
}
export function metadataBody(metadata: UploadMetadata) {
  return { snippet: { title: metadata.title, categoryId: '10' },
    status: { privacyStatus: metadata.visibility, selfDeclaredMadeForKids: metadata.madeForKids } };
}
export function uploadedOffset(range: string | null): number {
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/i.exec(range);
  if (!match) throw new Error('YouTube returned an unexpected upload offset. Please retry.');
  return Number(match[1]) + 1;
}
function errorMessage(status: number, body: string): string {
  let reason = '';
  try { reason = JSON.parse(body).error?.errors?.[0]?.reason ?? ''; } catch { /* HTTP fallback */ }
  if (status === 401) {
    clearAuthorization();
    return 'Your YouTube authorization expired. Click the upload button to reconnect and resume.';
  }
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') return 'The app’s YouTube quota is exhausted. Download your video or retry after the quota resets.';
  if (reason === 'uploadLimitExceeded') return 'Your channel has reached its YouTube upload limit. Try again later.';
  if (reason === 'youtubeSignupRequired') return 'This Google account needs a YouTube channel before it can upload videos.';
  if (status === 403) return 'YouTube did not allow this upload. Check your channel permissions and the app’s API approval.';
  if (status === 404 || status === 410) return 'This upload session is no longer available. Check YouTube Studio before starting a new upload to avoid duplicates.';
  return 'The upload was interrupted. Keep this tab open and retry to resume, or download your video.';
}

interface HttpResult { status: number; body: string; range: string | null; location: string | null }
function request(url: string, method: string, token: string, signal: AbortSignal,
  headers: Record<string, string>, body?: Blob | string,
  onProgress?: (bytes: number) => void): Promise<HttpResult> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const aborted = () => xhr.abort();
    const done = () => signal.removeEventListener('abort', aborted);
    xhr.open(method, url);
    xhr.timeout = 180_000;
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = event => onProgress?.(event.loaded);
    xhr.onload = () => { done(); resolve({ status: xhr.status, body: xhr.responseText,
      range: xhr.getResponseHeader('Range'), location: xhr.getResponseHeader('Location') }); };
    xhr.onerror = xhr.ontimeout = () => { done(); reject(new UploadError(errorMessage(0, ''), 0)); };
    xhr.onabort = () => { done(); reject(new DOMException('Cancelled', 'AbortError')); };
    signal.addEventListener('abort', aborted, { once: true });
    xhr.send(body);
  });
}
function completed(response: HttpResult): UploadResult | undefined {
  if (response.status !== 200 && response.status !== 201) return;
  const video = JSON.parse(response.body) as ApiVideo;
  if (!video.id || !/^[\w-]+$/.test(video.id)) throw new Error('YouTube accepted the upload but returned no video link. Check YouTube Studio before retrying.');
  return { id: video.id, visibility: video.status?.privacyStatus, uploadStatus: video.status?.uploadStatus };
}
function ensureSessionUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['www.googleapis.com', 'youtube.googleapis.com'].includes(parsed.hostname)) {
    throw new Error('YouTube returned an unexpected upload destination. Nothing was sent there.');
  }
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, ms);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

/** Sessions stay in memory; a retry queries the server offset before sending more bytes.
 * Never silently starts a second upload after an ambiguous final response.
 */
export async function uploadVideo(blob: Blob, metadata: UploadMetadata, token: string, signal: AbortSignal,
  onProgress: (fraction: number) => void, onSession: (session: UploadSession) => void,
  previous?: UploadSession): Promise<UploadResult> {
  signal.throwIfAborted();
  validateMetadata(metadata);
  let session = previous;
  if (session && (session.total !== blob.size || session.metadataKey !== metadataKey(metadata))) {
    throw new Error('The upload settings changed. Reset the upload before starting a new session.');
  }
  if (!session) {
    const init = await request('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      'POST', token, signal, { 'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(blob.size) }, JSON.stringify(metadataBody(metadata)));
    if (init.status !== 200 || !init.location) throw new UploadError(errorMessage(init.status, init.body), init.status);
    ensureSessionUrl(init.location);
    session = { url: init.location, total: blob.size, metadataKey: metadataKey(metadata), offset: 0 };
    onSession(session);
  }
  ensureSessionUrl(session.url);
  let needsStatus = Boolean(previous);
  let retries = 0;
  while (true) {
    signal.throwIfAborted();
    try {
      const start = session.offset;
      const end = Math.min(start + CHUNK, blob.size);
      const response = needsStatus
        ? await request(session.url, 'PUT', token, signal, { 'Content-Range': `bytes */${blob.size}` }, new Blob([]))
        : await request(session.url, 'PUT', token, signal, { 'Content-Type': 'video/mp4',
          'Content-Range': `bytes ${start}-${end - 1}/${blob.size}` }, blob.slice(start, end),
          bytes => onProgress(Math.min(0.999, (start + bytes) / blob.size)));
      const result = completed(response);
      if (result) { onProgress(1); return result; }
      if (response.status !== 308) throw new UploadError(errorMessage(response.status, response.body), response.status);
      const offset = uploadedOffset(response.range);
      if (offset < 0 || offset > blob.size) throw new Error('YouTube returned an invalid upload position.');
      if (!needsStatus && offset <= start) throw new UploadError('YouTube has not received the last chunk. Please retry.', 503);
      session.offset = offset;
      onSession({ ...session });
      onProgress(Math.min(0.999, offset / blob.size));
      if (offset === blob.size) throw new Error('All bytes were received but YouTube has not confirmed the video. Retry to check the same session.');
      needsStatus = false;
      retries = 0;
    } catch (error) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (!(error instanceof UploadError) || !RETRYABLE.includes(error.status) || retries >= 3) throw error;
      await delay(1000 * 2 ** retries++, signal);
      needsStatus = true;
    }
  }
}
