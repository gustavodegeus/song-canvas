import { useEffect, useRef, useState, type DragEvent } from 'react';
import { motifs, type Motif } from './artwork/motifs';
import DrawingPicker from './DrawingPicker';
import { pngBlob, renderArtwork } from './artwork/renderer';
import { downloadBlob, formatDuration, inferTitle, inspectAudio, safeFilename } from './media/audio';
import type { RenderProgress } from './media/encoder';
import { authorize, clearAuthorization, youtubeConfigured } from './youtube/auth';
import { uploadVideo, validateMetadata, videoTitleError, type UploadResult, type UploadSession, type Visibility } from './youtube/upload';

type Busy = 'reading' | 'encoding' | 'uploading' | undefined;
interface Artwork { canvas: HTMLCanvasElement; title: string; motif: Motif }
interface Song { file: File; duration: number }
interface Video { blob: Blob; url: string; png: Blob; title: string; duration: number }
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const cancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export default function App() {
  const [song, setSong] = useState<Song>();
  const [title, setTitle] = useState('Your Song');
  const [motif, setMotif] = useState<Motif>('heart');
  const [confirmed, setConfirmed] = useState(false);
  const [art, setArt] = useState<Artwork>();
  const [artError, setArtError] = useState('');
  const [artLoading, setArtLoading] = useState(true);
  const [video, setVideo] = useState<Video>();
  // Listing metadata is independent of the artwork title and rendered media.
  const [youtubeTitle, setYoutubeTitle] = useState('');
  const [busy, setBusy] = useState<Busy>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState<RenderProgress>();
  const [dragging, setDragging] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [madeForKids, setMadeForKids] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [session, setSession] = useState<UploadSession>();
  const [published, setPublished] = useState<UploadResult>();
  const [songURL, setSongURL] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | undefined>(undefined);
  const lock = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let valid = true;
    setArtLoading(true);
    setArtError('');
    const timer = setTimeout(() => {
      renderArtwork(title, motif).then(result => {
        if (valid) { setArt({ canvas: result.canvas, title: title.trim(), motif }); setArtLoading(false); }
      }).catch(error => {
        if (valid) { setArt(undefined); setArtError(message(error)); setArtLoading(false); }
      });
    }, 180);
    return () => { valid = false; clearTimeout(timer); };
  }, [title, motif]);
  useEffect(() => {
    if (host.current && art) {
      art.canvas.setAttribute('role', 'img');
      art.canvas.setAttribute('aria-label', `Notebook artwork for ${art.title}, ${motifs[art.motif].label}`);
      host.current.replaceChildren(art.canvas);
    }
  }, [art, video]);
  useEffect(() => {
    if (!song) return;
    const url = URL.createObjectURL(song.file);
    setSongURL(url);
    return () => URL.revokeObjectURL(url);
  }, [song]);
  useEffect(() => {
    if (!video) return;
    reviewHeading.current?.focus();
    return () => URL.revokeObjectURL(video.url);
  }, [video]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (busy || video) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, video]);
  useEffect(() => () => active.current?.abort(), []);

  const artworkReady = art && !artLoading && art.title === title.trim() && art.motif === motif && !artError;
  const listingTitleError = video ? videoTitleError(youtubeTitle) : undefined;
  const resetResult = () => { setSession(undefined); setPublished(undefined); setReviewed(false); setError(''); setNotice(''); };
  const begin = (kind: Busy) => {
    if (lock.current) return;
    lock.current = true;
    const controller = new AbortController();
    active.current = controller;
    setBusy(kind); setError(''); setNotice('');
    return controller;
  };
  const finish = () => { lock.current = false; active.current = undefined; setBusy(undefined); setProgress(undefined); };

  async function selectFiles(files: File[]) {
    if (busy || video || lock.current) return;
    if (files.length !== 1) { setError('Please add one MP3 at a time.'); return; }
    const controller = begin('reading');
    if (!controller) return;
    setProgress({ stage: 'Getting to know your song…' });
    try {
      const duration = await inspectAudio(files[0], controller.signal);
      controller.signal.throwIfAborted();
      setSong({ file: files[0], duration });
      setTitle(inferTitle(files[0].name));
      setConfirmed(false);
      resetResult();
    } catch (error) { if (!cancelled(error)) setError(message(error)); }
    finally { finish(); if (fileInput.current) fileInput.current.value = ''; }
  }
  function drop(event: DragEvent) {
    event.preventDefault(); setDragging(false);
    void selectFiles(Array.from(event.dataTransfer.files));
  }
  async function generate() {
    if (!song || !artworkReady || !confirmed) return;
    const controller = begin('encoding');
    if (!controller) return;
    try {
      const png = await pngBlob(art.canvas);
      controller.signal.throwIfAborted();
      const { encodeVideo } = await import('./media/encoder');
      const blob = await encodeVideo(song.file, png, controller.signal, setProgress);
      controller.signal.throwIfAborted();
      resetResult();
      setYoutubeTitle(art.title);
      setVideo({ blob, url: URL.createObjectURL(blob), png, title: art.title, duration: song.duration });
    } catch (error) {
      if (cancelled(error)) setNotice('Video creation cancelled. Your song and artwork are still here.');
      else setError(message(error));
    } finally { finish(); }
  }
  async function publish() {
    if (!video || !reviewed || published) return;
    const controller = begin('uploading');
    if (!controller) return;
    try {
      const metadata = { title: youtubeTitle, visibility, madeForKids };
      validateMetadata(metadata);
      setProgress({ stage: 'Connecting to your YouTube channel…' });
      const token = await authorize(controller.signal);
      setProgress({ stage: session ? 'Checking your upload so we can resume…' : 'Sending your video to YouTube…', fraction: 0 });
      const result = await uploadVideo(video.blob, metadata, token,
        controller.signal, fraction => setProgress({ stage: 'Sending your video to YouTube…', fraction }), setSession, session);
      setPublished(result);
      setSession(undefined);
    } catch (error) {
      if (cancelled(error)) setNotice('Upload stopped. You can resume in this tab. If it was nearly finished, check YouTube Studio before starting another upload.');
      else setError(message(error));
    } finally { finish(); }
  }
  function edit() {
    if (session || published) {
      if (!window.confirm('Check YouTube Studio before creating another upload: this video may already exist there. Continue editing?')) return;
    }
    setVideo(undefined); resetResult();
  }
  async function downloadArtwork() {
    try {
      if (video) downloadBlob(video.png, `${safeFilename(video.title)}-artwork.png`);
      else if (artworkReady) downloadBlob(await pngBlob(art.canvas), `${safeFilename(art.title)}-artwork.png`);
    } catch (error) { setError(message(error)); }
  }

  return <main>
    <header><a className="wordmark" href="./">song canvas<span aria-hidden="true">♪</span></a><span className="badge">Your little music studio</span></header>
    <section className="intro"><p className="eyebrow">A little music. A little magic.</p><h1>Give your song<br />a place to shine.</h1><p>From your first note to their next favorite song.</p></section>
    <nav className="steps" aria-label="Your progress">
      {['Add your song', 'Make it yours', 'Review & publish'].map((label, i) => <span key={label} aria-current={(video ? i === 2 : song ? i === 1 : i === 0) ? 'step' : undefined} className={(video ? i <= 2 : song ? i <= 1 : i === 0) ? 'active' : ''}><b>{i + 1}</b>{label}</span>)}
    </nav>
    <section className="studio" aria-label={video ? 'Review your music video' : 'Customize your notebook artwork'}>
      <div className="left-column">
        <div className="preview">
          {video ? <video key={video.url} src={video.url} controls playsInline preload="metadata" aria-label={`Music video for ${video.title}`} />
            : <div id="artwork" ref={host} aria-busy={artLoading} />}
          <div className="caption"><span>{video ? 'YOUR SONG, READY TO SHARE' : 'YOUR NOTEBOOK, YOUR STORY'}</span><span>1920 × 1080 · {video ? 'MP4' : 'PNG'}</span></div>
        </div>
        {!video && <section className={`dropzone ${dragging ? 'dragging' : ''}`} aria-label="Add your MP3"
          onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
          <span className="drop-icon" aria-hidden="true">♫</span>
          <div><h2>{song ? song.file.name : 'Start with a song.'}</h2><p>{song ? `${formatDuration(song.duration)} · ${(song.file.size / 1024 / 1024).toFixed(1)} MB · Stays in your browser` : 'Drop your MP3 here. Up to 10 minutes, all yours.'}</p></div>
          <input ref={fileInput} id="audio-file" type="file" tabIndex={-1} aria-label="Choose MP3 file" accept=".mp3,audio/mpeg" disabled={Boolean(busy)} onChange={event => { if (event.target.files?.length) void selectFiles(Array.from(event.target.files)); }} className="sr-only" />
          <button type="button" className="secondary browse" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>{song ? 'Change song' : 'Choose MP3'}</button>
        </section>}
        {!video && songURL && <audio className="song-player" src={songURL} controls preload="metadata" aria-label="Listen to your original MP3" />}
        {!video && <p className="local-note">No account needed to create. Nothing leaves your device until you choose to upload.</p>}
        {video && <div className="review-note"><p className="eyebrow">Take a moment</p><p>Play it through. Check your title, drawing, and the final note before sharing.</p><p className="field-note">{formatDuration(video.duration)} of original music · H.264 + AAC · {(video.blob.size / 1024 / 1024).toFixed(1)} MB</p></div>}
      </div>
      <aside className="controls">
        {!video ? <>
          <p className="eyebrow">The notebook</p><h2>Make it yours.</h2><p className="hint">Your song deserves a little personality. We’ll keep the sunset just as it is.</p>
          <label htmlFor="title">Song title</label>
          <input id="title" value={title} maxLength={160} disabled={Boolean(busy)} onChange={event => { setTitle(event.target.value); setConfirmed(false); setError(''); }} aria-describedby="title-note" />
          <p id="title-note" className="field-note">{song ? 'Taken from your filename. Make it exactly right.' : 'Try a title, or add your MP3 to get started.'}</p>
          {song && <label className="check"><input type="checkbox" checked={confirmed} disabled={Boolean(busy)} onChange={event => setConfirmed(event.target.checked)} />Yes, this is the correct song title.</label>}
          <DrawingPicker value={motif} onChange={setMotif} disabled={Boolean(busy)} />
          <p id="status" role="status" aria-live="polite">{artError || (artLoading ? 'Writing your song into the scene…' : 'Your artwork is ready. The sunset stays the same.')}</p>
          <button className="primary" type="button" disabled={!song || !confirmed || !artworkReady || Boolean(busy)} onClick={() => void generate()}>Create my video <span aria-hidden="true">↗</span></button>
          {!song && <p className="field-note">Add an MP3 to create your video.</p>}
          <button id="download" className="secondary" type="button" disabled={!artworkReady || Boolean(busy)} onClick={() => void downloadArtwork()}>Download artwork</button>
          <p className="field-note">Full HD, entirely in your browser. We prepare the artwork once, then add your complete song. Keep this tab open; desktop works best.</p>
        </> : <>
          <p className="eyebrow">Ready when you are</p><h2 ref={reviewHeading} tabIndex={-1}>One last listen.</h2><p className="hint">Happy with how it looks and sounds? Let’s give it an audience.</p>
          <div className="video-title">
            <label htmlFor="youtube-title">YouTube video title</label>
            <textarea id="youtube-title" rows={3} value={youtubeTitle} maxLength={200}
              disabled={Boolean(busy || session || published)}
              aria-invalid={Boolean(listingTitleError)}
              aria-describedby={`youtube-title-help youtube-title-count${listingTitleError ? ' youtube-title-error' : ''}`}
              onChange={event => { setYoutubeTitle(event.target.value); setReviewed(false); setError(''); }} />
            <p id="youtube-title-help" className="field-note">Add artist names or other details here. This only changes the YouTube listing—not your artwork or video. No description will be added.</p>
            <p id="youtube-title-count" className="title-count">{[...youtubeTitle].length} / 100 characters</p>
            {listingTitleError && <p id="youtube-title-error" className="title-error" role="alert">{listingTitleError}</p>}
          </div>
          {!published && <>
            <label htmlFor="visibility">Who can watch?</label><select id="visibility" value={visibility} disabled={Boolean(busy || session)} onChange={event => { setVisibility(event.target.value as Visibility); setReviewed(false); }}><option value="public">Everyone · Public</option><option value="unlisted">Anyone with the link · Unlisted</option><option value="private">Only you · Private</option></select>
            <label className="check"><input type="checkbox" checked={madeForKids} disabled={Boolean(busy || session)} onChange={event => { setMadeForKids(event.target.checked); setReviewed(false); }} />This video is made for kids.</label><p className="field-note audience-note">Default: not made for kids. Confirm the correct audience for this song; family-friendly is not the same as made for kids.</p>
            <label className="check review-check"><input type="checkbox" checked={reviewed} disabled={Boolean(busy)} onChange={event => setReviewed(event.target.checked)} />I reviewed the video, YouTube title, and audience setting, and I have the rights to share this music and artwork.</label>
            <button type="button" className="primary" disabled={!reviewed || Boolean(busy) || !youtubeConfigured || Boolean(listingTitleError)} onClick={() => void publish()}>{session ? 'Resume YouTube upload' : visibility === 'public' ? 'Publish to YouTube' : 'Upload to YouTube'} <span aria-hidden="true">↗</span></button>
            {!youtubeConfigured && <p className="config-note">YouTube publishing needs a Google client ID configured for this site. Downloads are ready to use.</p>}
            <p className="field-note">{visibility === 'public' ? 'This requests public publication. YouTube may restrict unaudited apps to private uploads.' : `This will request ${visibility} visibility.`} Google sign-in opens only when you choose to upload.</p>
            {youtubeConfigured && !session && <button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => { clearAuthorization(); setNotice('The next upload will ask you to choose a Google account.'); }}>Choose a different Google account next time</button>}
            {session && <p className="field-note">Your upload session is saved in this tab. Settings are locked so a retry can resume safely. Reconnect with the same Google account if authorization expires.</p>}
          </>}
          {published && <section className="success" role="status"><p className="eyebrow">Upload received</p><h3>Your song is on its way.</h3><p>{published.uploadStatus === 'processed' ? 'YouTube reports that processing is complete. Check the video on your channel.' : 'YouTube may still be processing your video. The link may not play immediately.'}</p><p><strong>Reported visibility: {published.visibility ?? 'not confirmed'}.</strong></p>{published.visibility && published.visibility !== visibility && <p className="warning">YouTube did not apply your requested visibility. Unaudited API projects may be restricted to private uploads. Check YouTube Studio.</p>}{['failed', 'rejected', 'deleted'].includes(published.uploadStatus ?? '') && <p className="warning">YouTube reported: {published.uploadStatus}. Check YouTube Studio for details.</p>}<a className="button-link primary" href={`https://www.youtube.com/watch?v=${published.id}`} target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a><a href="https://studio.youtube.com/" target="_blank" rel="noopener noreferrer">Check processing in YouTube Studio ↗</a></section>}
          <div className="download-actions"><button type="button" className="secondary" onClick={() => downloadBlob(video.blob, `${safeFilename(video.title)}-YouTube.mp4`)}>Download MP4</button><button id="download" type="button" className="secondary" onClick={() => void downloadArtwork()}>Download artwork</button></div>
          <button type="button" className="text-button" disabled={Boolean(busy)} onClick={edit}>← Back to artwork</button>
        </>}
        {busy && <section className="progress-panel" aria-label="Operation progress"><p role="status" aria-live="polite">{progress?.stage ?? 'Working…'}</p><progress max={1} value={progress?.fraction} aria-label={progress?.stage ?? 'Progress'} /><div className="progress-bottom"><span>{progress?.fraction === undefined ? 'One moment…' : `${Math.floor(progress.fraction * 100)}% · estimated`}</span><button type="button" className="text-button" onClick={() => active.current?.abort()}>Cancel</button></div></section>}
        {error && <p role="alert" className="error">{error}</p>}
        {notice && <p role="status" className="notice">{notice}</p>}
      </aside>
    </section>
    <footer><span>Made for the songs only you can make.</span><span><a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy</a> · <a href={`${import.meta.env.BASE_URL}terms.html`}>Terms</a> · <a href={`${import.meta.env.BASE_URL}licenses/ffmpeg-notice.txt`}>Open source</a></span></footer>
  </main>;
}
