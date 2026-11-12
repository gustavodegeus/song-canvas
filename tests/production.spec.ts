import { test, expect } from '@playwright/test';

test('built app encodes under a GitHub Pages-style subpath without cross-origin isolation', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
  await page.goto('./');
  await expect(page.locator('#download')).toBeEnabled();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  await page.locator('#audio-file').setInputFiles('tests/fixtures/tone.mp3');
  await page.getByLabel('Yes, this is the correct song title.').check();
  await page.getByRole('button', { name: 'Create my video' }).click();
  await expect(page.getByRole('heading', { name: 'One last listen.' })).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('video')).toHaveJSProperty('videoWidth', 1920);
  await expect(page.getByText('YouTube publishing needs a Google client ID', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish to YouTube' })).toBeDisabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download MP4' }).click();
  expect((await download).suggestedFilename()).toBe('tone-YouTube.mp4');
  expect(failures).toEqual([]);
});
