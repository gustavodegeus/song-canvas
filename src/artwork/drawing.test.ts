import { describe, expect, it } from 'vitest';
import { fitDrawing, safePage } from './renderer';
import { homography, inside, project, type Point } from './perspective';

const forward = homography([[0, 0], [1800, 0], [1800, 1080], [0, 1080]],
  [[1030, 550], [1570, 565], [1430, 910], [870, 900]].map(([x, y]) => [x * 1920 / 1672, y * 1080 / 941] as Point));

describe('centered notebook drawings', () => {
  const outline: Point[] = [[0, 0], [600, 0], [0, 360], [600, 360]];
  it('uses the title’s center axis, not a leftward offset', () => {
    for (const top of [450, 550, 700]) {
      const layout = fitDrawing(600, 360, outline, top);
      expect(layout.x + layout.width / 2).toBeCloseTo(900);
    }
  });
  it('shrinks while staying centered rather than clipping at the pen', () => {
    const layout = fitDrawing(600, 360, outline, 550);
    for (const [u, v] of outline) {
      const mapped = project(forward, [layout.x + u / 600 * layout.width, layout.y + v / 360 * layout.height]);
      expect(inside(mapped, safePage)).toBe(true);
    }
  });
});
