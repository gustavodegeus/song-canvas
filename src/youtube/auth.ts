const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
export const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';
export const youtubeConfigured = clientId.endsWith('.apps.googleusercontent.com');

interface TokenResponse { access_token?: string; expires_in?: number; scope?: string; error?: string }
interface GoogleIdentity {
  accounts: { oauth2: {
    initTokenClient(config: {
      client_id: string; scope: string;
      callback: (response: TokenResponse) => void;
      error_callback: (error: { type: string }) => void;
    }): { requestAccessToken(options: { prompt: string }): void };
  } };
}
declare global { interface Window { google?: GoogleIdentity } }
let token: { value: string; expires: number } | undefined;
let scriptPromise: Promise<void> | undefined;

function loadIdentity(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  return scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const timer = setTimeout(() => failed(), 20_000);
    const failed = () => {
      clearTimeout(timer);
      script.remove();
      scriptPromise = undefined;
      reject(new Error('Google sign-in could not load. Check your connection and try again.'));
    };
    script.onerror = failed;
    script.onload = () => {
      clearTimeout(timer);
      if (window.google?.accounts.oauth2) resolve(); else failed();
    };
    document.head.append(script);
  });
}

export function clearAuthorization() { token = undefined; }

/** Called only by an explicit upload/retry gesture. No tokens in localStorage or URLs. */
export async function authorize(signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  if (!youtubeConfigured) throw new Error('YouTube publishing is not configured yet. You can still download your video.');
  if (token && token.expires > Date.now() + 60_000) return token.value;
  await loadIdentity();
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', aborted, { once: true });
    const done = () => signal.removeEventListener('abort', aborted);
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: response => {
        done();
        if (signal.aborted) return;
        if (response.error || !response.access_token) {
          reject(new Error('YouTube access was not granted. Your video is still available to download.'));
          return;
        }
        if (!response.scope?.split(' ').includes(SCOPE)) {
          reject(new Error('Please allow the YouTube upload permission to publish your video.'));
          return;
        }
        token = { value: response.access_token, expires: Date.now() + Number(response.expires_in ?? 3600) * 1000 };
        resolve(token.value);
      },
      error_callback: error => {
        done();
        if (signal.aborted) return;
        reject(new Error(error.type === 'popup_failed_to_open'
          ? 'Please allow Google’s sign-in popup, then click the upload button again.'
          : 'Sign-in was closed. Your video is safe; try again when you’re ready.'));
      },
    });
    client.requestAccessToken({ prompt: 'select_account' });
  });
}
