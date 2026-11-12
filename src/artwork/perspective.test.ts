import { describe, expect, it } from 'vitest';
import { homography, inside, project, type Point } from './perspective';

describe('notebook perspective', () => {
  const flat: Point[] = [[0, 0], [1800, 0], [1800, 1080], [0, 1080]];
  const page: Point[] = [[1030, 550], [1570, 565], [1430, 910], [870, 900]];
  it('maps all four corners precisely', () => {
    const matrix = homography(flat, page);
    flat.forEach((p, i) => {
      const mapped = project(matrix, p);
      expect(mapped[0]).toBeCloseTo(page[i][0], 8);
      expect(mapped[1]).toBeCloseTo(page[i][1], 8);
    });
  });
  it('round-trips points inside the notebook', () => {
    const forward = homography(flat, page), inverse = homography(page, flat);
    const mapped = project(inverse, project(forward, [643, 721]));
    expect(mapped[0]).toBeCloseTo(643, 8);
    expect(mapped[1]).toBeCloseTo(721, 8);
  });
  it('rejects degenerate geometry', () => {
    expect(() => homography(flat, [[0, 0], [0, 0], [0, 0], [0, 0]])).toThrow();
  });
  it('distinguishes page from background in either winding', () => {
    expect(inside([1200, 700], page)).toBe(true);
    expect(inside([1200, 700], [...page].reverse())).toBe(true);
    expect(inside([300, 300], page)).toBe(false);
  });
});
