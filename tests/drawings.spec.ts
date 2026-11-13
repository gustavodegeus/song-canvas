import { test, expect } from '@playwright/test';

test('search, categories, and collapsed browsing preserve the selected illustration', async ({ page }) => {
  await page.goto('/');
  const picker = page.getByRole('group', { name: 'Choose a drawing' });
  const search = page.getByRole('searchbox', { name: 'Search drawings' });
  await expect(picker.getByRole('radio')).toHaveCount(6);
  await search.fill('futebol');
  await expect(picker.getByRole('radio')).toHaveCount(1);
  await picker.getByLabel('Soccer & passion').check();
  await expect(page.getByRole('img', { name: /Notebook artwork.*Soccer/ })).toBeVisible();
  await expect(page.locator('#download')).toBeEnabled();
  await search.fill('no-such-illustration');
  await expect(picker.getByText('No drawings found.', { exact: true })).toBeVisible();
  await expect(picker.locator('.drawing-selection')).toContainText('Soccer & passion');
  await expect(page.getByRole('img', { name: /Notebook artwork.*Soccer/ })).toBeVisible();
  await picker.getByRole('button', { name: 'Clear filters' }).click();
  await expect(picker.getByRole('radio')).toHaveCount(6);
  await picker.getByRole('button', { name: 'Explore all 24 drawings' }).click();
  await expect(picker.getByRole('radio')).toHaveCount(24);
  await expect(picker.getByLabel('Soccer & passion')).toBeChecked();
  await picker.getByRole('button', { name: 'Show fewer drawings' }).click();
  await expect(picker.getByRole('radio')).toHaveCount(6);
  await expect(picker.locator('.drawing-selection')).toContainText('Soccer & passion');
  await page.getByLabel('Drawing category').selectOption('music');
  await expect(picker.getByRole('radio')).toHaveCount(4);
  await search.fill('VIOLÃO');
  await expect(picker.getByRole('radio')).toHaveCount(1);
  await picker.getByLabel('Guitar & serenades').check();
  await expect(page.getByRole('img', { name: /Notebook artwork.*Guitar/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/drawing-search-desktop.png', fullPage: true });
});

test('mobile library stays compact, scrollable, and keyboard accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore all 24 drawings' }).click();
  const grid = page.locator('.motifs');
  expect(await grid.evaluate(node => node.clientHeight)).toBeLessThanOrEqual(330);
  expect(await grid.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const search = page.getByRole('searchbox', { name: 'Search drawings' });
  await search.fill('futebol');
  const soccer = page.getByRole('radio', { name: 'Soccer & passion' });
  await soccer.focus();
  await page.keyboard.press('Space');
  await expect(soccer).toBeChecked();
  await expect(page.getByRole('img', { name: /Notebook artwork.*Soccer/ })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.screenshot({ path: 'test-results/drawing-library-mobile.png', fullPage: true });
});

test('all 24 SVGs render for short and wrapped titles without touching the background', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#download')).toBeEnabled();
  const reports = await page.evaluate(async () => {
    // @ts-expect-error Browser-only Vite source import.
    const { motifs } = await import('/src/artwork/motifs.ts');
    // @ts-expect-error Browser-only Vite source import.
    const { renderArtwork, loadMaster, safePage } = await import('/src/artwork/renderer.ts');
    // @ts-expect-error Browser-only Vite source import.
    const { inside } = await import('/src/artwork/perspective.ts');
    const base = document.createElement('canvas');
    base.width = 1920; base.height = 1080;
    const ctx = base.getContext('2d')!;
    ctx.drawImage(await loadMaster(), 0, 0);
    const original = ctx.getImageData(0, 0, 1920, 1080).data;
    const allowed = new Uint8Array(1920 * 1080);
    for (let y = 0; y < 1080; y++) for (let x = 0; x < 1920; x++) {
      allowed[y * 1920 + x] = Number(inside([x + 0.5, y + 0.5], safePage));
    }
    const reports = [];
    for (const id of Object.keys(motifs)) {
      // Also validate SVG syntax and require a truly transparent page/background.
      const svg = new DOMParser().parseFromString(motifs[id].svg, 'image/svg+xml');
      if (svg.querySelector('parsererror')) throw new Error(`Invalid SVG: ${id}`);
      for (const title of ['Our Song', 'Uma Canção Para Encontrar o Meu Caminho']) {
        const result = await renderArtwork(title, id);
        const data = result.canvas.getContext('2d').getImageData(0, 0, 1920, 1080).data;
        let outside = 0;
        for (let p = 0; p < allowed.length; p++) {
          if (allowed[p]) continue;
          const i = p * 4;
          if ([0, 1, 2, 3].some(c => data[i + c] !== original[i + c])) outside++;
        }
        reports.push({ id, outside, ink: result.changedPixels });
      }
    }
    return reports;
  });
  expect(reports).toHaveLength(48);
  for (const report of reports) {
    expect(report.outside, report.id).toBe(0);
    expect(report.ink, report.id).toBeGreaterThan(5000);
  }
});
