/** Isometric projection of the city grid: x goes east (down-right on screen), y goes south (down-left), z goes up. */
export const TILE_W = 64;
export const TILE_H = 32;
/** Screen height of one cell of height. */
export const UNIT_Z = 30;

export type Point = [number, number];

/** Grid → screen: screenX = (x − y) × tileWidth / 2, screenY = (x + y) × tileHeight / 2 − z × unit. */
export function toScreen(x: number, y: number, z = 0): Point {
  return [(x - y) * TILE_W / 2, (x + y) * TILE_H / 2 - z * UNIT_Z];
}

/** Screen → grid, on the ground (z = 0). The cell is the floor of both values. */
export function fromScreen(sx: number, sy: number): Point {
  const a = (2 * sx) / TILE_W, b = (2 * sy) / TILE_H;
  return [(a + b) / 2, (b - a) / 2];
}

export const pathOf = (pts: Point[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('') + 'Z';

export type Box = { x: number; y: number; w: number; d: number };

/** A is entirely behind B when it lies north or west of B on a stretch where they could overlap on screen. */
export function behind(a: Box, b: Box): boolean {
  return (a.x + a.w <= b.x && b.y + b.d > a.y) || (a.y + a.d <= b.y && b.x + b.w > a.x);
}

/**
 * Painter's order for volumes on the grid: whatever is behind is drawn first. A plain sort on x + y fails for objects
 * of different sizes, so the order is a topological sort of the "behind" relation, ties going to the nearer corner.
 */
export function drawOrder<T extends Box>(items: T[], tie: (a: T, b: T) => number = () => 0): T[] {
  const left = new Set(items.map((_, i) => i));
  const out: T[] = [];
  const rank = (t: T) => t.x + t.w + t.y + t.d;
  while (left.size) {
    const free = [...left].filter(i => ![...left].some(j => j !== i && behind(items[j], items[i])));
    // a cycle can't happen with non-overlapping boxes; fall back on the whole set just in case
    const pool = free.length ? free : [...left];
    pool.sort((i, j) => rank(items[i]) - rank(items[j]) || tie(items[i], items[j]));
    left.delete(pool[0]);
    out.push(items[pool[0]]);
  }
  return out;
}

/** Darker (factor < 1) or lighter (factor > 1) version of a #rrggbb colour, for the faces of a volume. */
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(factor > 1 ? v + (255 - v) * (factor - 1) : v * factor))));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
