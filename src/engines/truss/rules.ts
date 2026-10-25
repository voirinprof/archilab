import type { Bar, Point, TrussConstraint } from './types.ts';

/** Same stiffness for every bar: only the ratios matter in this simplified model. */
const EA = 1000;
const EPSILON = 1e-9;

export const pointKey = ([x, y]: Point) => `${x},${y}`;
export const barKey = ([a, b]: Bar) => [pointKey(a), pointKey(b)].sort().join('|');
export const sameBar = (p: Bar, q: Bar) => barKey(p) === barKey(q);
export const length = ([[x1, y1], [x2, y2]]: Bar) => Math.hypot(x2 - x1, y2 - y1);

/** Compression strength of a bar: long bars buckle more easily (Euler: strength falls with the square of the length). */
export function compressionCapacity(bar: Bar, unitLimit: number): number {
  return unitLimit / length(bar) ** 2;
}

export type BarResult = {
  bar: Bar;
  /** Axial force, positive in tension, negative in compression (kN). */
  force: number;
  /** Force divided by the bar's strength: above 1, the bar breaks. */
  ratio: number;
};

export type Analysis =
  | { stable: false; loose: Point[] }
  | { stable: true; bars: BarResult[]; displacements: Map<string, Point>; maxRatio: number };

export type TrussModel = {
  bars: Bar[];
  supports: Point[];
  loads: Point[];
  load: number;
  tensionLimit: number;
  compressionLimit: number;
};

/**
 * Linear analysis of a pin-jointed plane truss (direct stiffness method).
 * Returns stable: false with the joints that can move freely when the structure is a mechanism.
 */
export function analyse(m: TrussModel): Analysis {
  const keys = new Map<string, number>();
  const points: Point[] = [];
  const add = (p: Point) => { if (!keys.has(pointKey(p))) { keys.set(pointKey(p), points.length); points.push(p); } };
  m.bars.forEach(([a, b]) => { add(a); add(b); });
  m.loads.forEach(add);
  m.supports.forEach(add);
  const n = points.length * 2;
  const K = Array.from({ length: n }, () => new Float64Array(n));
  const F = new Float64Array(n);
  for (const bar of m.bars) {
    const [a, b] = bar;
    const i = keys.get(pointKey(a))!, j = keys.get(pointKey(b))!;
    const L = length(bar), c = (b[0] - a[0]) / L, s = (b[1] - a[1]) / L, k = EA / L;
    const blk = [[c * c, c * s], [c * s, s * s]];
    for (let r = 0; r < 2; r++) for (let q = 0; q < 2; q++) {
      const v = k * blk[r][q];
      K[2 * i + r][2 * i + q] += v; K[2 * j + r][2 * j + q] += v;
      K[2 * i + r][2 * j + q] -= v; K[2 * j + r][2 * i + q] -= v;
    }
  }
  for (const p of m.loads) F[2 * keys.get(pointKey(p))! + 1] -= m.load;
  const fixed = new Set(m.supports.flatMap(p => { const i = keys.get(pointKey(p))!; return [2 * i, 2 * i + 1]; }));
  const free = [...Array(n).keys()].filter(d => !fixed.has(d));

  // Gaussian elimination with partial pivoting on the free degrees of freedom
  const A = free.map(r => free.map(c => K[r][c]));
  const rhs = free.map(r => F[r]);
  const size = free.length;
  const tolerance = EPSILON * Math.max(1, ...A.map((row, i) => Math.abs(row[i])));
  const pivotCols: number[] = [], zeroCols: number[] = [];
  let row = 0;
  for (let col = 0; col < size; col++) {
    let best = row;
    for (let r = row + 1; r < size; r++) if (Math.abs(A[r][col]) > Math.abs(A[best][col])) best = r;
    if (row >= size || Math.abs(A[best][col]) < tolerance) { zeroCols.push(col); continue; }
    [A[row], A[best]] = [A[best], A[row]];
    [rhs[row], rhs[best]] = [rhs[best], rhs[row]];
    for (let r = row + 1; r < size; r++) {
      const f = A[r][col] / A[row][col];
      if (f === 0) continue;
      for (let c = col; c < size; c++) A[r][c] -= f * A[row][c];
      rhs[r] -= f * rhs[row];
    }
    pivotCols.push(col);
    row++;
  }
  /** Back-substitution through the pivot rows, the other unknowns being given. */
  const solve = (x: Float64Array, b: number[]) => {
    for (let r = pivotCols.length - 1; r >= 0; r--) {
      const c = pivotCols[r];
      let sum = b[r];
      for (let k = c + 1; k < size; k++) sum -= A[r][k] * x[k];
      x[c] = sum / A[r][c];
    }
    return x;
  };
  if (zeroCols.length) {
    // the structure is a mechanism: each free motion (null vector) shows which joints can move
    const moving = new Set<number>();
    for (const zc of zeroCols) {
      const x = new Float64Array(size);
      x[zc] = 1;
      solve(x, new Array(size).fill(0));
      const peak = Math.max(...x.map(Math.abs));
      x.forEach((v, idx) => { if (Math.abs(v) > 1e-6 * peak) moving.add(Math.floor(free[idx] / 2)); });
    }
    return { stable: false, loose: [...moving].map(i => points[i]) };
  }
  const u = solve(new Float64Array(size), rhs);
  const disp = new Float64Array(n);
  free.forEach((d, idx) => { disp[d] = u[idx]; });
  const displacements = new Map<string, Point>(points.map((p, i) => [pointKey(p), [disp[2 * i], disp[2 * i + 1]]]));
  const bars = m.bars.map(bar => {
    const [a, b] = bar;
    const i = keys.get(pointKey(a))!, j = keys.get(pointKey(b))!;
    const L = length(bar), c = (b[0] - a[0]) / L, s = (b[1] - a[1]) / L;
    const force = (EA / L) * ((disp[2 * j] - disp[2 * i]) * c + (disp[2 * j + 1] - disp[2 * i + 1]) * s);
    const ratio = force >= 0 ? force / m.tensionLimit : -force / compressionCapacity(bar, m.compressionLimit);
    return { bar, force, ratio };
  });
  return { stable: true, bars, displacements, maxRatio: Math.max(0, ...bars.map(b => b.ratio)) };
}

export function checkTruss(c: TrussConstraint, analysis: Analysis, playerBars: number): boolean {
  switch (c.type) {
    case 'stable': return analysis.stable;
    case 'strong': return analysis.stable && analysis.maxRatio <= 1 + EPSILON;
    case 'max_bars': return playerBars <= c.value;
  }
}

export function evaluateTruss(constraints: TrussConstraint[], analysis: Analysis, playerBars: number) {
  const results = constraints.map(c => checkTruss(c, analysis, playerBars));
  return { constraints: results, solved: results.every(Boolean) };
}

/** A bar may join two different grid points no further apart than the maximum length. */
export function canAddBar(bar: Bar, existing: Bar[], grid: { x: [number, number]; y: [number, number] }, maxLength: number): boolean {
  const inGrid = ([x, y]: Point) => x >= grid.x[0] && x <= grid.x[1] && y >= grid.y[0] && y <= grid.y[1];
  const L = length(bar);
  return L > 0 && L <= maxLength + EPSILON && bar.every(inGrid) && !existing.some(e => sameBar(e, bar));
}
