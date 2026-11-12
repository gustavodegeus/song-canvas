export type Point = readonly [number, number];
export type Matrix = readonly number[];

/** Four point projective mapping, solved with partial-pivot Gaussian elimination. */
export function homography(source: readonly Point[], target: readonly Point[]): Matrix {
  if (source.length !== 4 || target.length !== 4) throw new Error('Four corners required.');
  const rows: number[][] = [];
  source.forEach(([x, y], i) => {
    const [u, v] = target[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  for (let c = 0; c < 8; c++) {
    let pivot = c;
    for (let r = c + 1; r < 8; r++) {
      if (Math.abs(rows[r][c]) > Math.abs(rows[pivot][c])) pivot = r;
    }
    [rows[c], rows[pivot]] = [rows[pivot], rows[c]];
    const divisor = rows[c][c];
    if (Math.abs(divisor) < 1e-10) throw new Error('Degenerate notebook geometry.');
    for (let j = c; j <= 8; j++) rows[c][j] /= divisor;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const factor = rows[r][c];
      for (let j = c; j <= 8; j++) rows[r][j] -= factor * rows[c][j];
    }
  }
  return [...rows.map(row => row[8]), 1];
}

export function project(matrix: Matrix, [x, y]: Point): Point {
  const d = matrix[6] * x + matrix[7] * y + matrix[8];
  return [(matrix[0] * x + matrix[1] * y + matrix[2]) / d,
    (matrix[3] * x + matrix[4] * y + matrix[5]) / d];
}

/** Convex polygon membership. Pixel centers on an edge are allowed. */
export function inside(point: Point, polygon: readonly Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    if (Math.abs(cross) < 1e-8) continue;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
}
