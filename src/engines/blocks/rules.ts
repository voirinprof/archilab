import type { BlocksConstraint, Heights, View } from './types.ts';

export function emptyHeights(width: number, depth: number): Heights {
  return Array.from({ length: depth }, () => Array<number>(width).fill(0));
}

export function blockCount(h: Heights): number {
  return h.flat().reduce((sum, n) => sum + n, 0);
}

/** Occupied cells seen from above: footprint[y][x]. */
export function topView(h: Heights): boolean[][] {
  return h.map(row => row.map(n => n > 0));
}

/** Silhouette seen from the south: tallest stack of each column, west to east. */
export function southView(h: Heights): number[] {
  return h[0].map((_, x) => Math.max(...h.map(row => row[x])));
}

/** Silhouette seen from the east: tallest stack of each row, north to south. */
export function eastView(h: Heights): number[] {
  return h.map(row => Math.max(...row));
}

export function viewMatches(view: View, built: Heights, target: Heights): boolean {
  switch (view) {
    case 'top': return topView(built).every((row, y) => row.every((v, x) => v === topView(target)[y][x]));
    case 'south': return southView(built).every((v, x) => v === southView(target)[x]);
    case 'east': return eastView(built).every((v, y) => v === eastView(target)[y]);
  }
}

export type CellStatus = 'match' | 'missing' | 'extra' | 'empty';

const status = (built: boolean, target: boolean): CellStatus =>
  built && target ? 'match' : target ? 'missing' : built ? 'extra' : 'empty';

/** Cell-by-cell comparison of the footprints: [y][x]. */
export function compareTop(built: Heights, target: Heights): CellStatus[][] {
  const b = topView(built), t = topView(target);
  return t.map((row, y) => row.map((v, x) => status(b[y][x], v)));
}

/** Comparison of two silhouettes as columns of cells: [column][level], level 0 at the ground. */
export function compareProfile(built: number[], target: number[], maxHeight: number): CellStatus[][] {
  return target.map((t, i) => Array.from({ length: maxHeight }, (_, level) => status(level < built[i], level < t)));
}

export function evaluateBlocks(constraints: BlocksConstraint[], built: Heights, target: Heights) {
  const results = constraints.map(c => viewMatches(c.view, built, target));
  return { constraints: results, solved: results.every(Boolean) };
}

/** Turns the grid a quarter turn clockwise `turns` times (as seen from above). */
export function rotateHeights(h: Heights, turns: number): Heights {
  let out = h;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) {
    const depth = out.length, width = out[0].length;
    out = Array.from({ length: width }, (_, y) => Array.from({ length: depth }, (_, x) => out[depth - 1 - x][y]));
  }
  return out;
}
