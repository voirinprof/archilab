import type { Area, Cell, DistrictActivity, DistrictConstraint, TileType } from './types.ts';

type Params = DistrictActivity['parameters'];
/** Plot types by cell, row by row: plots[y][x]; null is empty land. */
export type Plots = (string | null)[][];

export const EMPTY: TileType = { id: 'empty', label: { fr: 'Terrain vague', en: 'Empty plot' }, color: '#eef1e8', icon: '', walkable: false, permeable: 1, heat: 1 };

export function areaCells(a: Area): Cell[] {
  const cells: Cell[] = [];
  for (let y = Math.min(a.from[1], a.to[1]); y <= Math.max(a.from[1], a.to[1]); y++)
    for (let x = Math.min(a.from[0], a.to[0]); x <= Math.max(a.from[0], a.to[0]); x++) cells.push([x, y]);
  return cells;
}

export function initialPlots(p: Params): Plots {
  const plots: Plots = Array.from({ length: p.grid.height }, () => Array<string | null>(p.grid.width).fill(null));
  for (const a of p.fixed) for (const [x, y] of areaCells(a)) plots[y][x] = a.type;
  return plots;
}

export const isFixed = (p: Params, [x, y]: Cell) => p.fixed.some(a => areaCells(a).some(([cx, cy]) => cx === x && cy === y));
const typeOf = (p: Params, id: string | null): TileType => (id ? p.tiles.find(t => t.id === id) ?? EMPTY : EMPTY);
const neighbours = (p: Params, [x, y]: Cell): Cell[] =>
  ([[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Cell[]).filter(([a, b]) => a >= 0 && b >= 0 && a < p.grid.width && b < p.grid.height);

/** Can this type go on this plot? Fixed plots can't change, and some types must touch another (a bus stop on the street). */
export function canPlace(p: Params, plots: Plots, cell: Cell, type: string | null): boolean {
  if (isFixed(p, cell)) return false;
  const t = type ? typeOf(p, type) : EMPTY;
  return !t.next_to || neighbours(p, cell).some(([x, y]) => plots[y][x] === t.next_to);
}

export function place(p: Params, plots: Plots, cell: Cell, type: string | null): Plots {
  if (!canPlace(p, plots, cell, type)) return plots;
  return plots.map((row, y) => row.map((v, x) => (x === cell[0] && y === cell[1] ? type : v)));
}

export const homes = (p: Params, plots: Plots): Cell[] =>
  plots.flatMap((row, y) => row.map((v, x) => [x, y] as Cell)).filter(([x, y]) => (typeOf(p, plots[y][x]).residents ?? 0) > 0);

export function population(p: Params, plots: Plots): number {
  return plots.flat().reduce((sum, v) => sum + (typeOf(p, v).residents ?? 0), 0);
}

/**
 * Walking distance, in plots, from every plot to the nearest plot of a service type.
 * People walk through walkable plots; reaching a plot next to the service (or the service itself) is enough.
 */
export function walkDistances(p: Params, plots: Plots, service: string): number[][] {
  const dist = plots.map(row => row.map(() => Infinity));
  const queue: Cell[] = [];
  plots.forEach((row, y) => row.forEach((v, x) => {
    if (v === service) { dist[y][x] = 0; queue.push([x, y]); }
  }));
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [nx, ny] of neighbours(p, [x, y])) {
      if (dist[ny][nx] !== Infinity) continue;
      dist[ny][nx] = dist[y][x] + 1;
      // the walk goes on only through walkable plots; other plots are reached but not crossed
      if (typeOf(p, plots[ny][nx]).walkable) queue.push([nx, ny]);
    }
  }
  return dist;
}

/** For each home: its walking distance to each service, in plots. */
export function homeAccess(p: Params, plots: Plots, services: string[]) {
  const fields = Object.fromEntries(services.map(s => [s, walkDistances(p, plots, s)]));
  return homes(p, plots).map(cell => ({ cell, distances: Object.fromEntries(services.map(s => [s, fields[s][cell[1]][cell[0]]])) as Record<string, number> }));
}

/** A home is noisy when a noise source lies in the same row or column within reach, with no screen in between. */
export function isNoisy(p: Params, plots: Plots, [x, y]: Cell): boolean {
  const { source, reach } = p.noise;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let k = 1; k <= reach; k++) {
      const cx = x + dx * k, cy = y + dy * k;
      if (cx < 0 || cy < 0 || cx >= p.grid.width || cy >= p.grid.height) break;
      if (plots[cy][cx] === source) return true;
      if (typeOf(p, plots[cy][cx]).screen) break;
    }
  }
  return false;
}

export const noisyHomes = (p: Params, plots: Plots) => homes(p, plots).filter(c => isNoisy(p, plots, c));

/** Share of the editable land covered by green plots (parks, trees). */
export function greenShare(p: Params, plots: Plots): number {
  const cells = plots.flatMap((row, y) => row.map((v, x) => ({ v, cell: [x, y] as Cell }))).filter(c => !isFixed(p, c.cell));
  return cells.filter(c => typeOf(p, c.v).green).length / cells.length;
}

/** Share of the whole site where rain can't soak in. */
export function impermeableShare(p: Params, plots: Plots): number {
  const all = plots.flat();
  return all.reduce((sum, v) => sum + (1 - typeOf(p, v).permeable), 0) / all.length;
}

/** Simplified heat index of each plot: its own heat, minus some cooling for each green neighbour. */
export function heatMap(p: Params, plots: Plots): number[][] {
  return plots.map((row, y) => row.map((v, x) => {
    const green = neighbours(p, [x, y]).filter(([a, b]) => typeOf(p, plots[b][a]).green).length;
    return Math.max(0, typeOf(p, v).heat - green * p.cooling);
  }));
}

export function checkDistrict(c: DistrictConstraint, p: Params, plots: Plots): boolean {
  switch (c.type) {
    case 'min_population': return population(p, plots) >= c.value;
    case 'services_within': return homeAccess(p, plots, c.services).every(h => Object.values(h.distances).every(d => d <= c.value));
    case 'min_green_share': return greenShare(p, plots) * 100 >= c.value - 1e-9;
    case 'max_impermeable_share': return impermeableShare(p, plots) * 100 <= c.value + 1e-9;
    case 'no_noisy_homes': return noisyHomes(p, plots).length === 0;
  }
}

export function evaluateDistrict(constraints: DistrictConstraint[], p: Params, plots: Plots) {
  const results = constraints.map(c => checkDistrict(c, p, plots));
  return { constraints: results, solved: results.every(Boolean) };
}
