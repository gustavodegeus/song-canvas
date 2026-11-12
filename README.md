# Song Canvas

A small, warm music studio in your browser. Turn an MP3 into notebook artwork and a YouTube-ready video without sending it to an application server.

## What works

- MP3 selection or drag-and-drop; editable filename-derived title with explicit confirmation.
- Eight original, bundled SVG themes: hearts, drums, mountains, balanced stones, broken chains, beach/palms, traveler/road, and Bahia architecture.
- Handwritten lettering, red underline, measured wrapping, Portuguese accents, and perspective alignment on the supplied notebook.
- Immutable 1920 × 1080 background with pixel-level tests outside the notebook edit mask.
- Local PNG download and **real FFmpeg.wasm H.264/AAC MP4 encoding** with progress, cancellation, retry, output inspection, video review, and downloads.
- Optional browser OAuth and direct YouTube resumable uploads, with server-offset recovery, quota/authorization errors, and actual reported visibility.
- Responsive React + TypeScript interface; self-hosted fonts and WASM; no backend, database, authentication server, telemetry, or paid API.
- Privacy/terms pages, CI checks, and a manual GitHub Pages deployment workflow.

## Run

Requires Node 22.12+ (or a supported newer release).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. A public Google client ID is **not needed** to create/download artwork and videos. FFmpeg's approximately 31 MB core loads on the first video request, not initial page load.

```sh
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm run test:production
```

The production smoke test serves the built app at `/song-canvas/` without COOP/COEP headers and performs an actual encode/download. Browser tests use a separate development server on port 5174 and mock Google; they never publish videos. Screenshots are generated under `test-results/` (gitignored). A generated two-second test tone is included under `tests/fixtures/`.

## Connect YouTube

1. Create a Google Cloud project and enable **YouTube Data API v3**.
2. Configure the OAuth consent screen with the app name, support contact, website, privacy policy, and terms URLs. Add the `https://www.googleapis.com/auth/youtube.upload` scope. If the app is in testing, add the Google accounts that will test it.
3. Create an OAuth **Web application** client. Add the exact JavaScript origins you will use, for example `http://127.0.0.1:5173` and `https://gustavodegeus.github.io`. Origins do **not** include `/song-canvas/`. Register `http://localhost:5173` separately if you use it.
4. Copy `.env.example` to `.env.local`, set `VITE_GOOGLE_CLIENT_ID` to the public web client ID, and restart Vite. **Never place a client secret in this app.**
5. For Pages builds, set the repository Actions variable `VITE_GOOGLE_CLIENT_ID` to the same client ID (or the production client ID).
6. Generate/review a video, confirm rights and audience, then click **Publish to YouTube**. Google sign-in loads only at this point. The first authorization lets you select the account; later uploads reuse an unexpired in-memory token. An account-reset action is available before an upload session starts.

No API key is needed for these authenticated uploads. Tokens and upload sessions stay in memory; they are not in localStorage, URLs, the repository, or an app database. Reloading/closing the tab loses the session. On an interrupted upload, retry **in the same tab** to resume from YouTube's confirmed offset; settings are locked once a session exists. A 401 prompts reconnection on the next upload click. Use the same account to resume.

Defaults: song title as video title, no description, music category, public requested, and not made for kids visibly selected by default. The user confirms the audience/rights before publishing. YouTube title restrictions are validated without silently changing the title.

**External setup remains necessary:** Google OAuth verification and a separate YouTube API compliance audit may be required for public use. Unaudited API projects may be restricted to private uploads. The UI reports actual returned visibility, not merely what was requested. Upload acceptance is not processing completion: the app provides a video link and YouTube Studio link, not a claim that a video is already publicly playable. This version does not poll processing status or manage/delete videos.

A manual desktop test has confirmed the complete local-render → Google authorization → YouTube upload flow. Automated OAuth/API responses remain mocks; test again with the deployed origin and each invited account.

## GitHub Pages

- Enable **Settings → Pages → Source: GitHub Actions**.
- Set the public OAuth client ID variable if publishing should be enabled; leave it blank for a local-render-only site.
- Review privacy/terms/contact details and third-party distribution obligations below.
- Push the repository, then run **Actions → Deploy to GitHub Pages → Run workflow**.

Deployment is deliberately manual. Relative Vite asset paths support repository subpaths; tests cover the built worker, font, artwork, WASM, and downloads under `/song-canvas/`. The single-thread core does not require `SharedArrayBuffer` or custom isolation headers unavailable on standard GitHub Pages.

To preview from a phone on your LAN, run `npm run dev -- --host 0.0.0.0`; use HTTPS hosting and configured Google origins for real OAuth testing. A phone viewport test is not a real-device performance guarantee.

## Files and architecture

- `src/App.tsx`: workflow and approachable responsive UI.
- `src/artwork/`: canonical geometry, transparent ink layout, inverse projective warp, and bundled SVG motifs.
- `src/media/audio.ts`: MP3 validation, metadata, filename handling, and downloads.
- `src/media/encoder.ts`: a worker and virtual filesystem per job, authoritative FFprobe checks, full-audio encode, output codec/resolution/duration checks, and cleanup.
- `src/youtube/`: Google Identity Services authorization and resumable chunked upload protocol.
- `scripts/prepare-assets.mjs`: copies the pinned single-thread core and license assets locally at install/dev/build time. Generated core files are not committed.
- `references/`: original master, approved visual references, and Python prototype; not shipped in the public build.
- `public/artwork/master-1920.png`: one-time resized canonical background, shared across all songs.

The CPU warp samples premultiplied-alpha ink, not a paper-colored rectangle, and preserves untouched pixels exactly. Pixel identity applies to the **PNG** outside the editable mask relative to the resized canonical master—not to the smaller original or lossy H.264 frames.

Encoding: 1920 × 1080, 24 fps, libx264, ultrafast/still-image tuning, CRF 22, yuv420p, AAC 256 kbps, explicit audio mapping, shortest-stream termination, and MP4 fast-start. Output audio duration is checked against the MP3 with an encoder-padding tolerance. No speed changes, fades, remastering, or intentional trimming. MP3-to-AAC re-encodes the compressed audio; it cannot preserve original MP3 bytes.

## Limits and remaining validation

- Maximum song duration: 10 minutes; maximum input size: 80 MB. Browser and FFprobe both check the input. The size limit is a memory safeguard, not a promised browser capacity.
- Real two-second 1080p encoding/playback/download and cancellation/retry are tested in Chromium. **Ten-minute real-song benchmarks and physical iOS/Android, Safari, and Firefox tests are still pending.** Longer songs may take substantial time or exhaust memory, particularly on mobile. Desktop is recommended.
- Keep the tab open while creating/uploading. Backgrounding a mobile browser may suspend it. Do not promise background work after closing the app.
- Resumable sessions retry transient failures with backoff. They are not persisted across reloads. Never silently create a new upload after an ambiguous final response; check YouTube Studio to avoid duplicates.
- The newly added six illustrations follow the approved direction but still deserve your visual review.

## Licenses and release checks

Allura is SIL OFL; its license is shipped in `public/licenses/`. Original SVG drawings are included in source. Confirm your rights to use/distribute the supplied master/reference artwork before publishing this site.

The unmodified **@ffmpeg/core 0.12.10 is GPL-2.0-or-later**, including GPL-enabled codecs; the JavaScript wrapper's MIT license does not replace it. GPL text, upstream source/build pointers, React notices, and font license are shipped under `public/licenses/`. Before public binary distribution, review and satisfy the corresponding-source and dependency/build-input obligations; do not assume a license link alone fulfills them. Verify exact upstream corresponding source for the distributed core. No public deployment has been performed by this implementation.
