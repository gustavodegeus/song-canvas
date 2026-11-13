import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const mp3 = readFileSync(new URL('./fixtures/tone.mp3', import.meta.url));

test('full local encode, review, mocked OAuth upload, and actual private visibility', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const outbound: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5174') && !request.url().startsWith('blob:')) outbound.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create my video' })).toBeDisabled();
  await page.locator('#audio-file').setInputFiles({ name: 'Minha Canção.mp3', mimeType: 'audio/mpeg', buffer: mp3 });
  await expect(page.locator('#title')).toHaveValue('Minha Canção');
  await expect(page.getByRole('button', { name: 'Create my video' })).toBeDisabled();
  await page.getByLabel('Yes, this is the correct song title.').check();
  await page.getByLabel('Rhythm & swing').check();
  await expect(page.getByRole('button', { name: 'Create my video' })).toBeEnabled();
  await page.getByRole('button', { name: 'Create my video' }).click();
  await expect(page.getByRole('heading', { name: 'One last listen.' })).toBeVisible({ timeout: 90_000 });
  const video = page.locator('video');
  await expect(video).toHaveJSProperty('videoWidth', 1920);
  await expect(video).toHaveJSProperty('videoHeight', 1080);
  const duration = await video.evaluate((node: HTMLVideoElement) => node.duration);
  expect(duration).toBeGreaterThanOrEqual(1.95);
  expect(duration).toBeLessThan(3);
  expect(outbound).toEqual([]); // No media or metadata uploaded during rendering.
  await expect(page.getByRole('button', { name: 'Publish to YouTube' })).toBeDisabled();
  await expect(page.getByLabel('This video is made for kids.')).not.toBeChecked();

  const listing = page.getByRole('textbox', { name: 'YouTube video title' });
  await expect(listing).toHaveValue('Minha Canção');
  const originalVideoSource = await video.getAttribute('src');
  const downloadArtworkHash = async () => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download artwork' }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('Minha Canção-artwork.png');
    return createHash('sha256').update(readFileSync((await download.path())!)).digest('hex');
  };
  const originalArtwork = await downloadArtworkHash();
  await page.getByLabel(/I reviewed the video/).check();
  await listing.fill('');
  await expect(page.getByRole('alert')).toContainText('enter a YouTube video title');
  await listing.fill('a'.repeat(101));
  await expect(page.getByRole('alert')).toContainText('100 characters');
  await page.getByLabel(/I reviewed the video/).check();
  await expect(page.getByRole('button', { name: 'Publish to YouTube' })).toBeDisabled();
  await listing.fill('A <title>');
  await expect(page.getByRole('alert')).toContainText('cannot include');
  const listingTitle = 'Minha Canção | Música Autoral | Sample Artist';
  await listing.fill(listingTitle);
  await expect(page.getByLabel(/I reviewed the video/)).not.toBeChecked();
  await expect(listing).toHaveAttribute('aria-invalid', 'false');
  await expect(video).toHaveAttribute('src', originalVideoSource!);
  await expect(video).toHaveAttribute('aria-label', 'Music video for Minha Canção');
  expect(await downloadArtworkHash()).toBe(originalArtwork);

  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'application/javascript', body: `window.google={accounts:{oauth2:{initTokenClient(config){return {requestAccessToken(){config.callback({access_token:'test-only',expires_in:3600,scope:'https://www.googleapis.com/auth/youtube.upload'})}}}}}};` }));
  let metadata: unknown;
  let uploaded = 0;
  let sessions = 0;
  let interrupted = false;
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Location, Range', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS' };
  await page.route('https://www.googleapis.com/**', async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    expect(req.headers().authorization).toBe('Bearer test-only');
    if (req.method() === 'POST') {
      metadata = req.postDataJSON();
      sessions++;
      await route.fulfill({ status: 200, headers: { ...headers, Location: 'https://www.googleapis.com/resumable/test-session' } });
    } else {
      if (!interrupted) {
        interrupted = true;
        await route.fulfill({ status: 401, headers, body: '{"error":{"code":401}}' });
        return;
      }
      if (req.headers()['content-range'].startsWith('bytes */')) {
        await route.fulfill({ status: 308, headers }); // Resume from server-confirmed byte 0.
        return;
      }
      uploaded += req.postDataBuffer()?.length ?? 0;
      await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ id: 'test_video', status: { privacyStatus: 'private', uploadStatus: 'uploaded' } }) });
    }
  });
  await page.getByLabel(/I reviewed the video/).check();
  await page.getByRole('button', { name: 'Publish to YouTube' }).click();
  await expect(page.getByRole('alert')).toContainText('authorization expired');
  await expect(listing).toBeDisabled();
  await expect(listing).toHaveValue(listingTitle);
  await page.getByRole('button', { name: 'Resume YouTube upload' }).click();
  await expect(page.getByRole('link', { name: 'Open on YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=test_video');
  await expect(page.getByText('Reported visibility: private.')).toBeVisible();
  await expect(page.getByText(/YouTube did not apply your requested visibility/)).toBeVisible();
  expect(metadata).toEqual({ snippet: { title: listingTitle, categoryId: '10' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } });
  expect(sessions).toBe(1);
  await expect(listing).toBeDisabled();
  expect(uploaded).toBeGreaterThan(10000);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/review-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/review-mobile.png', fullPage: true });
});

test('invalid inputs and changed titles require confirmation', async ({ page }) => {
  await page.goto('/');
  await page.locator('#audio-file').setInputFiles({ name: 'fake.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('not audio') });
  await expect(page.getByRole('alert')).toContainText('does not appear to be an MP3');
  await page.locator('#audio-file').setInputFiles({ name: 'Song.mp3', mimeType: 'audio/mpeg', buffer: mp3 });
  await page.getByLabel('Yes, this is the correct song title.').check();
  await page.locator('#title').fill('A new title');
  await expect(page.getByLabel('Yes, this is the correct song title.')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Create my video' })).toBeDisabled();
});

test('cancelled encoding can be retried', async ({ page }) => {
  await page.goto('/');
  await page.locator('#audio-file').setInputFiles({ name: 'Song.mp3', mimeType: 'audio/mpeg', buffer: mp3 });
  await page.getByLabel('Yes, this is the correct song title.').check();
  await page.getByRole('button', { name: 'Create my video' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Video creation cancelled.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create my video' })).toBeEnabled();
  await page.getByRole('button', { name: 'Create my video' }).click();
  await expect(page.getByRole('heading', { name: 'One last listen.' })).toBeVisible({ timeout: 90_000 });
});
