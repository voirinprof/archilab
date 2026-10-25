import type { Plan, RenovateConstraint, Run, WallKind, Works } from './types.ts';
import { OUTSIDE } from './rules.ts';

export const noWorks = (): Works => ({ removed: [], added: [], doorFlips: [] });

/** Segment keys of a straight run: v:x:y is the 1 m piece of vertical line x from y to y+1, h:x:y the horizontal one. */
export function runSegments([[x1, y1], [x2, y2]]: Run): string[] {
  const keys: string[] = [];
  if (x1 === x2) for (let y = Math.min(y1, y2); y < Math.max(y1, y2); y++) keys.push(`v:${x1}:${y}`);
  else if (y1 === y2) for (let x = Math.min(x1, x2); x < Math.max(x1, x2); x++) keys.push(`h:${x}:${y1}`);
  return keys;
}

export type SegmentGeometry = { key: string; x1: number; y1: number; x2: number; y2: number };

export function segmentGeometry(key: string): SegmentGeometry {
  const [dir, xs, ys] = key.split(':');
  const x = Number(xs), y = Number(ys);
  return dir === 'v' ? { key, x1: x, y1: y, x2: x, y2: y + 1 } : { key, x1: x, y1: y, x2: x + 1, y2: y };
}

export type Building = {
  plan: Plan;
  /** Walls of the existing building, before works. */
  base: Map<string, Exclude<WallKind, 'new'>>;
  doors: Set<string>;
  windows: Set<string>;
};

export function makeBuilding(p: { plan: Plan; load_bearing: Run[]; water: Run[]; partitions: Run[]; doors: Run[]; windows: Run[] }): Building {
  const base = new Map<string, Exclude<WallKind, 'new'>>();
  const { width, depth } = p.plan;
  for (const k of [...runSegments([[0, 0], [width, 0]]), ...runSegments([[0, depth], [width, depth]]), ...runSegments([[0, 0], [0, depth]]), ...runSegments([[width, 0], [width, depth]])]) base.set(k, 'exterior');
  for (const r of p.partitions) for (const k of runSegments(r)) base.set(k, 'partition');
  for (const r of p.load_bearing) for (const k of runSegments(r)) base.set(k, 'bearing');
  for (const r of p.water) for (const k of runSegments(r)) base.set(k, 'water');
  return { plan: p.plan, base, doors: new Set(p.doors.flatMap(runSegments)), windows: new Set(p.windows.flatMap(runSegments)) };
}

/** Every 1 m piece of grid line inside the building, where a wall may stand. */
export function interiorSegments(plan: Plan): string[] {
  const keys: string[] = [];
  for (let x = 1; x < plan.width; x++) for (let y = 0; y < plan.depth; y++) keys.push(`v:${x}:${y}`);
  for (let y = 1; y < plan.depth; y++) for (let x = 0; x < plan.width; x++) keys.push(`h:${x}:${y}`);
  return keys;
}

export function wallKind(b: Building, works: Works, key: string): WallKind | null {
  const base = b.base.get(key);
  if (base) return base === 'partition' && works.removed.includes(key) ? null : base;
  return works.added.includes(key) ? 'new' : null;
}

export function hasDoor(b: Building, works: Works, key: string): boolean {
  return wallKind(b, works, key) !== null && b.doors.has(key) !== works.doorFlips.includes(key);
}

/** Partitions can be demolished and empty interior lines built on; fixed walls can't be touched. */
export function canEditWall(b: Building, key: string): boolean {
  const base = b.base.get(key);
  return base ? base === 'partition' : interiorSegments(b.plan).includes(key);
}

/** Doors can be opened or closed in partitions, old or new. */
export function canEditDoor(b: Building, works: Works, key: string): boolean {
  const kind = wallKind(b, works, key);
  return kind === 'partition' || kind === 'new';
}

const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]);

export function toggleWall(b: Building, works: Works, key: string): Works {
  if (!canEditWall(b, key)) return works;
  const next = b.base.get(key) === 'partition' ? { ...works, removed: toggle(works.removed, key) } : { ...works, added: toggle(works.added, key) };
  // a door disappears with its wall: forget an opening or closing made in it
  return wallKind(b, next, key) === null ? { ...next, doorFlips: next.doorFlips.filter(k => k !== key) } : next;
}

export function toggleDoor(b: Building, works: Works, key: string): Works {
  return canEditDoor(b, works, key) ? { ...works, doorFlips: toggle(works.doorFlips, key) } : works;
}

export type Costs = { demolish: number; build: number; door: number };

export function worksCost(works: Works, costs: Costs): number {
  return works.removed.length * costs.demolish + works.added.length * costs.build + works.doorFlips.length * costs.door;
}

export type Space = { id: string; cells: [number, number][]; area: number };

const cellKey = (x: number, y: number) => `${x},${y}`;

/** Rooms are the groups of cells that no wall separates. */
export function spaces(b: Building, works: Works): Space[] {
  const { width, depth } = b.plan;
  const seen = new Set<string>();
  const out: Space[] = [];
  for (let y0 = 0; y0 < depth; y0++) for (let x0 = 0; x0 < width; x0++) {
    if (seen.has(cellKey(x0, y0))) continue;
    const cells: [number, number][] = [];
    const queue: [number, number][] = [[x0, y0]];
    seen.add(cellKey(x0, y0));
    while (queue.length) {
      const [x, y] = queue.shift()!;
      cells.push([x, y]);
      const steps: [number, number, string][] = [[x + 1, y, `v:${x + 1}:${y}`], [x - 1, y, `v:${x}:${y}`], [x, y + 1, `h:${x}:${y + 1}`], [x, y - 1, `h:${x}:${y}`]];
      for (const [nx, ny, wall] of steps) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= depth || seen.has(cellKey(nx, ny)) || wallKind(b, works, wall)) continue;
        seen.add(cellKey(nx, ny));
        queue.push([nx, ny]);
      }
    }
    out.push({ id: cellKey(x0, y0), cells, area: cells.length });
  }
  return out;
}

const edgesOf = ([x, y]: [number, number]) => [`h:${x}:${y}`, `h:${x}:${y + 1}`, `v:${x}:${y}`, `v:${x + 1}:${y}`];

/** Uses are stored per cell, so a room keeps its use when walls move; a room takes its most common cell use. */
export type Usage = Record<string, string>;

export function spaceUse(space: Space, usage: Usage): string | undefined {
  const counts = new Map<string, number>();
  for (const [x, y] of space.cells) {
    const u = usage[cellKey(x, y)];
    if (u) counts.set(u, (counts.get(u) ?? 0) + 1);
  }
  let best: string | undefined, bestCount = 0;
  for (const [u, n] of counts) if (n > bestCount) { best = u; bestCount = n; }
  return best;
}

export function assignUse(space: Space, use: string | undefined, usage: Usage): Usage {
  const next = { ...usage };
  for (const [x, y] of space.cells) {
    if (use) next[cellKey(x, y)] = use;
    else delete next[cellKey(x, y)];
  }
  return next;
}

export function hasWindow(b: Building, space: Space): boolean {
  return space.cells.some(c => edgesOf(c).some(k => b.windows.has(k)));
}

export function touchesWater(b: Building, space: Space): boolean {
  return space.cells.some(c => edgesOf(c).some(k => b.base.get(k) === 'water'));
}

/** Pairs of spaces (or OUTSIDE) joined by a door. */
export function doorLinks(b: Building, works: Works, all: Space[]): [string, string][] {
  const owner = new Map<string, string>();
  for (const s of all) for (const [x, y] of s.cells) owner.set(cellKey(x, y), s.id);
  const at = (x: number, y: number) => owner.get(cellKey(x, y)) ?? OUTSIDE;
  const links: [string, string][] = [];
  for (const key of [...b.base.keys(), ...works.added]) {
    if (!hasDoor(b, works, key)) continue;
    const { x1, y1 } = segmentGeometry(key);
    links.push(key.startsWith('v') ? [at(x1 - 1, y1), at(x1, y1)] : [at(x1, y1 - 1), at(x1, y1)]);
  }
  return links;
}

/** Spaces reachable from outside through doors, never entering a space in `avoid`. */
export function reachable(links: [string, string][], avoid: Set<string> = new Set()): Set<string> {
  const seen = new Set([OUTSIDE]);
  const queue = [OUTSIDE];
  while (queue.length) {
    const current = queue.shift()!;
    for (const [a, c] of links) {
      const next = a === current ? c : c === current ? a : null;
      if (next && !avoid.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
}

export type RenovateState = { building: Building; works: Works; usage: Usage; costs: Costs };

export function checkRenovate(c: RenovateConstraint, s: RenovateState): boolean {
  const all = spaces(s.building, s.works);
  const useOf = (sp: Space) => spaceUse(sp, s.usage);
  const withUse = (u: string) => all.filter(sp => useOf(sp) === u);
  switch (c.type) {
    case 'use_count':
      return withUse(c.use).filter(sp => sp.area >= (c.min_area ?? 0)).length >= c.min;
    case 'use_min_area':
      return Object.entries(c.areas).every(([u, min]) => withUse(u).length > 0 && withUse(u).every(sp => sp.area >= min));
    case 'use_has_window':
      return c.uses.every(u => withUse(u).every(sp => hasWindow(s.building, sp)));
    case 'use_touches_water':
      return c.uses.every(u => withUse(u).length > 0 && withUse(u).every(sp => touchesWater(s.building, sp)));
    case 'all_assigned':
      return all.every(sp => useOf(sp) !== undefined);
    case 'all_reachable': {
      const r = reachable(doorLinks(s.building, s.works, all));
      return all.every(sp => r.has(sp.id));
    }
    case 'reachable_avoiding_use': {
      const avoid = new Set(withUse(c.avoid).map(sp => sp.id));
      const links = doorLinks(s.building, s.works, all);
      return c.uses.every(u => withUse(u).every(sp => reachable(links, new Set([...avoid].filter(id => id !== sp.id))).has(sp.id)));
    }
    case 'no_door_between_uses': {
      const use = new Map(all.map(sp => [sp.id, useOf(sp)]));
      const [a, b] = c.uses;
      return doorLinks(s.building, s.works, all).every(([p, q]) => !((use.get(p) === a && use.get(q) === b) || (use.get(p) === b && use.get(q) === a)));
    }
    case 'max_cost':
      return worksCost(s.works, s.costs) <= c.value;
  }
}

export function evaluateRenovate(constraints: RenovateConstraint[], s: RenovateState) {
  const results = constraints.map(c => checkRenovate(c, s));
  return { constraints: results, solved: results.every(Boolean) };
}
