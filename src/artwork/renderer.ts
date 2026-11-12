import { homography, inside, project, type Point } from './perspective';
import { motifs, type Motif } from './motifs';

export const WIDTH = 1920;
export const HEIGHT = 1080;
const PAGE_WIDTH = 1800;
const PAGE_HEIGHT = 1080;
const scale = ([x, y]: Point): Point => [x * WIDTH / 1672, y * HEIGHT / 941];
const corners = ([[1030, 550], [1570, 565], [1430, 910], [870, 900]] as Point[]).map(scale);
// Conservative edit boundary: keeps all ink away from the physical pen and binding.
export const safePage = ([[1020, 535], [1590, 550], [1510, 680], [1220, 900], [880, 890]] as Point[]).map(scale);
const flat: Point[] = [[0, 0], [PAGE_WIDTH, 0], [PAGE_WIDTH, PAGE_HEIGHT], [0, PAGE_HEIGHT]];
const inverse = homography(corners, flat);
const flatSafePage = safePage.map(point => project(inverse, point));

export interface DrawingLayout { x: number; y: number; width: number; height: number }

/** Keep visible ink centered on the same notebook axis as the title.
 * Fit the actual ink outline, not an off-center rectangle or clipped overlay.
 */
export function fitDrawing(sourceWidth: number, sourceHeight: number, outline: readonly Point[], drawingTop: number): DrawingLayout {
  const availableHeight = 1025 - drawingTop;
  if (availableHeight < 200) throw new Error('This title leaves too little space for the drawing. Please shorten it.');
  const maximum = Math.min(950 / sourceWidth, availableHeight / sourceHeight);
  for (let step = 0; step < 150; step++) {
    const factor = maximum * 0.98 ** step;
    const width = sourceWidth * factor, height = sourceHeight * factor;
    const x = PAGE_WIDTH / 2 - width / 2;
    const y = drawingTop + (availableHeight - height) * 0.25;
    // Test each row's ink extremes with a small clearance. Because the safe
    // polygon is convex, the intervening pixels are inside it too.
    const fits = outline.every(([u, v]) => {
      const px = x + u * factor, py = y + v * factor;
      return inside([px - 8, py], flatSafePage) && inside([px + 8, py], flatSafePage)
        && inside([px, py - 8], flatSafePage) && inside([px, py + 8], flatSafePage);
    });
    if (fits) return { x, y, width, height };
  }
  throw new Error('The drawing could not fit safely on this page. Please shorten the title.');
}

export function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Your browser could not create the artwork canvas.');
  return ctx;
}

function canvas(width: number, height: number) {
  return Object.assign(document.createElement('canvas'), { width, height });
}

export async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  try { await image.decode(); }
  catch { throw new Error('Could not load an artwork asset. Please reload and try again.'); }
  return image;
}

let masterPromise: Promise<HTMLImageElement> | undefined;
export function loadMaster() {
  return masterPromise ??= loadImage(`${import.meta.env.BASE_URL}artwork/master-1920.png`).catch(error => {
    masterPromise = undefined;
    throw error;
  });
}

export interface TitleLayout { lines: string[]; size: number }
export function layoutTitle(ctx: CanvasRenderingContext2D, raw: string): TitleLayout {
  const title = raw.trim().normalize('NFC');
  if (!title) throw new Error('Please enter a song title.');
  if (title.length > 160) throw new Error('Please keep the title under 160 characters.');
  const words = title.split(/\s+/u);
  for (let size = 360; size >= 150; size -= 5) {
    ctx.font = `${size}px Allura`;
    const fits = (line: string) => {
      const m = ctx.measureText(line);
      // Include the heavier ink stroke when reserving horizontal margins.
      return Math.max(m.width, m.actualBoundingBoxRight) + Math.max(0, m.actualBoundingBoxLeft) + 10 <= 1590;
    };
    if (fits(title)) return { lines: [title], size };
    const candidates: { lines: string[]; balance: number }[] = [];
    for (let split = 1; split < words.length; split++) {
      const lines = [words.slice(0, split).join(' '), words.slice(split).join(' ')];
      if (lines.every(fits)) candidates.push({ lines, balance: Math.abs(ctx.measureText(lines[0]).width - ctx.measureText(lines[1]).width) });
    }
    candidates.sort((a, b) => a.balance - b.balance);
    if (candidates.length && size <= 220) return { lines: candidates[0].lines, size };
  }
  throw new Error('This title is too long to fit naturally on the notebook. Please shorten it.');
}

async function createInk(title: string, motif: Motif) {
  await document.fonts.load('220px Allura', title);
  if (!document.fonts.check('220px Allura', title)) throw new Error('The handwriting font could not be loaded.');
  const ink = canvas(PAGE_WIDTH, PAGE_HEIGHT);
  const ctx = context(ink);
  const layout = layoutTitle(ctx, title);
  ctx.font = `${layout.size}px Allura`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#372016';
  ctx.strokeStyle = '#372016';
  // Allura has no bold face. An ink-colored outline adds weight without
  // switching typefaces or losing the reference's handwritten character.
  ctx.lineWidth = 9;
  ctx.lineJoin = 'round';
  const metrics = layout.lines.map(line => ctx.measureText(line));
  const ascent = Math.max(...metrics.map(metric => metric.actualBoundingBoxAscent));
  const descent = Math.max(...metrics.map(metric => metric.actualBoundingBoxDescent));
  const lineHeight = ascent + descent + 18;
  const firstBaseline = 30 + ascent;
  layout.lines.forEach((line, i) => {
    const baseline = firstBaseline + i * lineHeight;
    ctx.strokeText(line, 900, baseline);
    ctx.fillText(line, 900, baseline);
  });
  // Reserve space for the actual swashes/descenders: the red line must not
  // cross the lettering, including large calligraphic initial letters.
  const titleBottom = firstBaseline + (layout.lines.length - 1) * lineHeight + descent;
  const underline = titleBottom + 38;
  ctx.strokeStyle = '#ac3020';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(230, underline + 13);
  ctx.bezierCurveTo(650, underline - 38, 1130, underline - 40, 1560, underline);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(245, underline + 20);
  ctx.bezierCurveTo(700, underline - 28, 1170, underline - 28, 1550, underline + 5);
  ctx.stroke();
  const svg = URL.createObjectURL(new Blob([motifs[motif].svg], { type: 'image/svg+xml' }));
  try {
    const image = await loadImage(svg);
    // Fit visible ink, not the SVG's transparent padding. This gives every
    // motif a larger, consistent presence, even when the title wraps.
    const drawing = canvas(600, 360);
    const drawingCtx = context(drawing);
    drawingCtx.drawImage(image, 0, 0, 600, 360);
    const data = drawingCtx.getImageData(0, 0, 600, 360).data;
    let left = 600, top = 360, right = -1, bottom = -1;
    const outline: Point[] = [];
    for (let y = 0; y < 360; y++) {
      let rowLeft = 600, rowRight = -1;
      for (let x = 0; x < 600; x++) {
        if (data[(y * 600 + x) * 4 + 3] === 0) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
        rowLeft = Math.min(rowLeft, x); rowRight = Math.max(rowRight, x);
      }
      if (rowRight >= rowLeft) outline.push([rowLeft, y], [rowRight + 1, y + 1]);
    }
    if (right < left) throw new Error('This drawing has no visible ink.');
    const sourceWidth = right - left + 1, sourceHeight = bottom - top + 1;
    const { x, y, width, height } = fitDrawing(sourceWidth, sourceHeight,
      outline.map(([u, v]) => [u - left, v - top] as Point), underline + 36);
    ctx.drawImage(drawing, left, top, sourceWidth, sourceHeight, x, y, width, height);
  } finally { URL.revokeObjectURL(svg); }
  return { ink, layout };
}

/** CPU inverse warp avoids seams from affine triangles and preserves untouched pixels exactly.
 * Interpolate premultiplied-alpha ink, never a paper-colored rectangle.
 */
export async function renderArtwork(title: string, motif: Motif) {
  const [master, { ink, layout }] = await Promise.all([loadMaster(), createInk(title, motif)]);
  const output = canvas(WIDTH, HEIGHT);
  const ctx = context(output);
  ctx.drawImage(master, 0, 0);
  const pixels = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const source = context(ink).getImageData(0, 0, PAGE_WIDTH, PAGE_HEIGHT).data;
  const minX = Math.floor(Math.min(...safePage.map(p => p[0])));
  const maxX = Math.ceil(Math.max(...safePage.map(p => p[0])));
  const minY = Math.floor(Math.min(...safePage.map(p => p[1])));
  const maxY = Math.ceil(Math.max(...safePage.map(p => p[1])));
  let changedPixels = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!inside([x + 0.5, y + 0.5], safePage)) continue;
      const [u, v] = project(inverse, [x + 0.5, y + 0.5]);
      const sx = Math.floor(u), sy = Math.floor(v);
      if (sx < 0 || sy < 0 || sx >= PAGE_WIDTH - 1 || sy >= PAGE_HEIGHT - 1) continue;
      const fx = u - sx, fy = v - sy;
      const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      const indices = [(sy * PAGE_WIDTH + sx) * 4, (sy * PAGE_WIDTH + sx + 1) * 4,
        ((sy + 1) * PAGE_WIDTH + sx) * 4, ((sy + 1) * PAGE_WIDTH + sx + 1) * 4];
      let alpha = 0;
      const rgb = [0, 0, 0];
      for (let n = 0; n < 4; n++) {
        const a = source[indices[n] + 3] / 255 * weights[n];
        alpha += a;
        for (let c = 0; c < 3; c++) rgb[c] += source[indices[n] + c] * a;
      }
      if (alpha === 0) continue;
      const index = (y * WIDTH + x) * 4;
      for (let c = 0; c < 3; c++) pixels.data[index + c] = rgb[c] + pixels.data[index + c] * (1 - alpha);
      changedPixels++;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return { canvas: output, layout, changedPixels };
}

export function pngBlob(output: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed.')), 'image/png'));
}
