import { test, expect } from '@playwright/test';

test('renderer preserves the background, wraps accented titles, and exports PNG', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#download')).toBeEnabled();
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser-only Vite source import.
    const { renderArtwork, loadMaster, safePage, pngBlob } = await import('/src/artwork/renderer.ts');
    // @ts-expect-error Browser-only Vite source import.
    const { inside } = await import('/src/artwork/perspective.ts');
    const master = await loadMaster();
    const base = document.createElement('canvas');
    base.width = 1920; base.height = 1080;
    const ctx = base.getContext('2d')!;
    ctx.drawImage(master, 0, 0);
    const original = ctx.getImageData(0, 0, 1920, 1080).data;
    const report = [];
    for (const title of ['Gira Mundo', 'Vamos de Swing', 'Equilíbrio', 'Uma Canção Para Encontrar o Meu Caminho', 'Meu Amigo Querido']) {
      const rendered = await renderArtwork(title, 'drums');
      const data = rendered.canvas.getContext('2d').getImageData(0, 0, 1920, 1080).data;
      let outsideChanges = 0, changed = 0;
      for (let y = 0; y < 1080; y++) {
        for (let x = 0; x < 1920; x++) {
          const i = (y * 1920 + x) * 4;
          if ([0, 1, 2, 3].some(c => data[i + c] !== original[i + c])) {
            changed++;
            if (!inside([x + 0.5, y + 0.5], safePage)) outsideChanges++;
          }
        }
      }
      const blob = await pngBlob(rendered.canvas);
      const decoded = await createImageBitmap(blob);
      report.push({ title, outsideChanges, changed, lines: rendered.layout.lines.length,
        width: decoded.width, height: decoded.height, type: blob.type });
      decoded.close();
    }
    const a = await renderArtwork('Equilíbrio', 'heart');
    const b = await renderArtwork('Equilíbrio', 'heart');
    const deterministic = a.canvas.toDataURL() === b.canvas.toDataURL();
    return { report, deterministic };
  });
  for (const entry of result.report) {
    expect(entry.outsideChanges).toBe(0);
    expect(entry.changed).toBeGreaterThan(5000);
    expect(entry.width).toBe(1920);
    expect(entry.height).toBe(1080);
    expect(entry.type).toBe('image/png');
  }
  expect(result.report[3].lines).toBe(2);
  expect(result.report[4].lines).toBe(2);
  expect(result.deterministic).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/artwork-desktop.png', fullPage: true });
});

test('mobile preview fits and invalid titles do not download stale artwork', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#download')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#title').fill('W'.repeat(160));
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('#status')).toContainText('too long');
  await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#title').fill('Vamos de Swing');
  await page.getByLabel('Rhythm & swing').check();
  await expect(page.locator('#download')).toBeEnabled();
  await page.screenshot({ path: 'test-results/artwork-mobile.png', fullPage: true });
});
