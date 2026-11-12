import { test, expect } from '@playwright/test';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Location, Range', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS' };

test('expired authorization resumes from the server offset without a duplicate video', async ({ page }) => {
  let starts = 0;
  const ranges: string[] = [];
  await page.route('https://www.googleapis.com/**', async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: cors }); return; }
    if (req.method() === 'POST') {
      starts++;
      await route.fulfill({ status: 200, headers: { ...cors, Location: 'https://www.googleapis.com/session/resume-test' } });
      return;
    }
    const range = req.headers()['content-range'];
    ranges.push(range);
    if (range === 'bytes 0-8388607/10485760' || range === 'bytes */10485760') {
      await route.fulfill({ status: 308, headers: { ...cors, Range: 'bytes=0-8388607' } });
    } else if (req.headers().authorization === 'Bearer expired-token') {
      await route.fulfill({ status: 401, headers: cors, body: '{"error":{"code":401}}' });
    } else {
      await route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"id":"resumed_video","status":{"privacyStatus":"public","uploadStatus":"uploaded"}}' });
    }
  });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite browser-only module import.
    const { uploadVideo } = await import('/src/youtube/upload.ts');
    const blob = new Blob([new Uint8Array(10 * 1024 * 1024)], { type: 'video/mp4' });
    const metadata = { title: 'A song', visibility: 'public', madeForKids: false };
    let session, failure = '';
    const values: number[] = [];
    try { await uploadVideo(blob, metadata, 'expired-token', new AbortController().signal, (n: number) => values.push(n), (s: unknown) => { session = s; }); }
    catch (error) { failure = (error as Error).message; }
    const completed = await uploadVideo(blob, metadata, 'new-token', new AbortController().signal, (n: number) => values.push(n), () => {}, session);
    return { completed, failure, last: values.at(-1) };
  });
  expect(starts).toBe(1);
  expect(result.failure).toContain('authorization expired');
  expect(result.completed.id).toBe('resumed_video');
  expect(result.last).toBe(1);
  expect(ranges).toEqual(['bytes 0-8388607/10485760', 'bytes 8388608-10485759/10485760', 'bytes */10485760', 'bytes 8388608-10485759/10485760']);
});

test('quota failures do not send any video bytes', async ({ page }) => {
  let puts = 0;
  await page.route('https://www.googleapis.com/**', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: cors }); return; }
    if (route.request().method() === 'PUT') puts++;
    await route.fulfill({ status: 403, headers: cors, contentType: 'application/json', body: '{"error":{"errors":[{"reason":"quotaExceeded"}]}}' });
  });
  await page.goto('/');
  const failure = await page.evaluate(async () => {
    // @ts-expect-error Vite browser-only module import.
    const { uploadVideo } = await import('/src/youtube/upload.ts');
    try { await uploadVideo(new Blob(['video']), { title: 'Song', visibility: 'public', madeForKids: false }, 'test-only', new AbortController().signal, () => {}, () => {}); }
    catch (error) { return (error as Error).message; }
  });
  expect(failure).toContain('quota');
  expect(puts).toBe(0);
});
