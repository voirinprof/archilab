import type { CityConstraint, CityElement, Dir, IsoCityActivity, Placed, Rotation } from './types.ts';

export type Scenario = IsoCityActivity['parameters'];
export type Rect = { x: number; y: number; w: number; d: number };
export type Cell = [number, number];

export const DIRS: Dir[] = ['n', 'e', 's', 'w'];
const OFFSET: Record<Dir, Cell> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const opposite = (d: Dir): Dir => DIRS[(DIRS.indexOf(d) + 2) % 4];
export const neighbour = (x: number, y: number, d: Dir): Cell => [x + OFFSET[d][0], y + OFFSET[d][1]];
const key = (x: number, y: number) => `${x},${y}`;

/** Directions turned clockwise by `rotation`, in n-e-s-w order so that two equal sets compare equal. */
export function rotateDirs(dirs: Dir[], rotation: Rotation): Dir[] {
  const turned = dirs.map(d => DIRS[(DIRS.indexOf(d) + rotation / 90) % 4]);
  return DIRS.filter(d => turned.includes(d));
}
export const sameDirs = (a: Dir[], b: Dir[]) => a.length === b.length && a.every(d => b.includes(d));

export const elementOf = (sc: Scenario, id: string): CityElement => sc.elements.find(e => e.id === id)!;
export const isOverlay = (el: CityElement) => el.kind === 'tree' || el.kind === 'signal';

/** Cells covered by an element, from its north-west cell; a quarter turn swaps width and depth. */
export function footprint(el: CityElement, p: { x: number; y: number; rotation: Rotation }): Rect {
  const [w, d] = el.size ?? [1, 1];
  return p.rotation % 180 ? { x: p.x, y: p.y, w: d, d: w } : { x: p.x, y: p.y, w, d };
}
export function cellsOf(r: Rect): Cell[] {
  const out: Cell[] = [];
  for (let y = r.y; y < r.y + r.d; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]);
  return out;
}
export const roadDirs = (sc: Scenario, p: Placed): Dir[] => rotateDirs(elementOf(sc, p.element).connections ?? [], p.rotation);

export type Occupancy = Map<string, { base?: Placed; overlay?: Placed }>;
/** What stands on each cell: one ground element (road, building, green) and possibly a tree or traffic light on it. */
export function occupancy(sc: Scenario, city: Placed[]): Occupancy {
  const map: Occupancy = new Map();
  for (const p of city) {
    const el = elementOf(sc, p.element);
    for (const [x, y] of cellsOf(footprint(el, p))) {
      const cell = map.get(key(x, y)) ?? {};
      if (isOverlay(el)) cell.overlay = p; else cell.base = p;
      map.set(key(x, y), cell);
    }
  }
  return map;
}
export const cellAt = (map: Occupancy, x: number, y: number) => map.get(key(x, y)) ?? {};

/** The element a click on this cell is about: the tree or traffic light first, then what is under it. */
export function itemAt(sc: Scenario, city: Placed[], x: number, y: number): Placed | undefined {
  const cell = cellAt(occupancy(sc, city), x, y);
  return cell.overlay ?? cell.base;
}

export type Refusal = 'outside' | 'occupied' | 'onRoad' | 'onBuilding' | 'needsIntersection';
export type Placement = { ok: true; replaces: number[] } | { ok: false; reason: Refusal };

/** Can an overlay (tree, traffic light) stand on this ground element? */
function supports(sc: Scenario, overlay: CityElement, base: Placed | undefined): boolean {
  const b = base && elementOf(sc, base.element);
  if (overlay.kind === 'tree') return !b || b.kind === 'green';
  return !!b && b.kind === 'road' && roadDirs(sc, base!).length >= 3;
}

/**
 * Whether an element can go there. A road piece may replace another 1-cell road piece (to turn it into a crosswalk or fix
 * its shape), and a tree or traffic light may replace one of the same kind; anything else needs free ground.
 */
export function canPlace(sc: Scenario, city: Placed[], cand: Omit<Placed, 'uid'>, ignore?: number): Placement {
  const el = elementOf(sc, cand.element);
  const r = footprint(el, cand);
  if (r.x < 0 || r.y < 0 || r.x + r.w > sc.grid.width || r.y + r.d > sc.grid.depth) return { ok: false, reason: 'outside' };
  const map = occupancy(sc, city.filter(p => p.uid !== ignore));
  const replaces = new Set<number>();
  for (const [x, y] of cellsOf(r)) {
    const { base, overlay } = cellAt(map, x, y);
    const baseEl = base && elementOf(sc, base.element);
    if (isOverlay(el)) {
      if (overlay) {
        if (elementOf(sc, overlay.element).kind !== el.kind) return { ok: false, reason: 'occupied' };
        replaces.add(overlay.uid);
      }
      if (!supports(sc, el, base)) {
        if (el.kind === 'signal') return { ok: false, reason: 'needsIntersection' };
        return { ok: false, reason: baseEl!.kind === 'road' ? 'onRoad' : 'onBuilding' };
      }
      continue;
    }
    if (base) {
      const swap = el.kind === 'road' && baseEl!.kind === 'road' && r.w * r.d === 1;
      if (!swap) return { ok: false, reason: baseEl!.kind === 'road' ? 'onRoad' : 'occupied' };
      replaces.add(base.uid);
    }
    const overlayEl = overlay && elementOf(sc, overlay.element);
    if (overlay && !supports(sc, overlayEl!, { ...cand, uid: -1 })) {
      // nothing is built on a tree; a new road piece drops a traffic light it can no longer carry
      if (el.kind !== 'road' || overlayEl!.kind === 'tree') return { ok: false, reason: 'occupied' };
      replaces.add(overlay.uid);
    }
  }
  return { ok: true, replaces: [...replaces] };
}

/** Removes trees and traffic lights left without a suitable ground element. */
function prune(sc: Scenario, city: Placed[]): Placed[] {
  const map = occupancy(sc, city.filter(p => !isOverlay(elementOf(sc, p.element))));
  return city.filter(p => {
    const el = elementOf(sc, p.element);
    return !isOverlay(el) || supports(sc, el, cellAt(map, p.x, p.y).base);
  });
}

export function place(sc: Scenario, city: Placed[], cand: Placed): Placed[] | null {
  const res = canPlace(sc, city, cand);
  if (!res.ok) return null;
  return prune(sc, [...city.filter(p => !res.replaces.includes(p.uid)), cand]);
}

export function remove(sc: Scenario, city: Placed[], uid: number): Placed[] {
  return prune(sc, city.filter(p => p.uid !== uid));
}

/** Moves (and possibly turns) a placed element; null when it doesn't fit there. */
export function relocate(sc: Scenario, city: Placed[], uid: number, change: Partial<Pick<Placed, 'x' | 'y' | 'rotation'>>): Placed[] | null {
  const p = city.find(q => q.uid === uid);
  if (!p) return null;
  const moved = { ...p, ...change };
  const res = canPlace(sc, city, moved, uid);
  if (!res.ok) return null;
  return prune(sc, [...city.filter(q => q.uid !== uid && !res.replaces.includes(q.uid)), moved]);
}

export const nextRotation = (r: Rotation): Rotation => ((r + 90) % 360) as Rotation;

/* ---------- the reference plan ---------- */

export type Expected = { road: boolean; dirs: Dir[]; element?: string; overlay?: string };

/**
 * Reads the plan: what each cell should hold. A road cell connects to the neighbouring road cells, and to the edge of
 * the map when the street runs on beyond it (the road cell on the other side continues the same line).
 */
export function expectedPlan(sc: Scenario): Expected[][] {
  const { width, depth } = sc.grid;
  const symbol = (x: number, y: number) => sc.symbols.find(s => s.symbol === sc.plan[y]?.[x]);
  const isRoad = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < depth && !!symbol(x, y)?.road;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < depth;
  return Array.from({ length: depth }, (_, y) => Array.from({ length: width }, (_, x) => {
    const s = symbol(x, y);
    if (!s) return { road: false, dirs: [] };
    const dirs = s.road ? DIRS.filter(d => {
      const [nx, ny] = neighbour(x, y, d);
      if (inside(nx, ny)) return isRoad(nx, ny);
      const [ox, oy] = neighbour(x, y, opposite(d));
      return isRoad(ox, oy);
    }) : [];
    return { road: !!s.road, dirs, element: s.element, overlay: s.overlay };
  }));
}

/** The road piece (element and rotation) drawing a given set of directions, if any. */
export function roadPieceFor(sc: Scenario, dirs: Dir[], candidates = sc.elements.filter(e => e.kind === 'road')): { element: string; rotation: Rotation } | null {
  for (const el of candidates) for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    if (sameDirs(rotateDirs(el.connections ?? [], rotation), dirs)) return { element: el.id, rotation };
  }
  return null;
}

/* ---------- checks ---------- */

export type Issue = { x: number; y: number; kind: 'missing' | 'wrong' };
export type CheckResult = { ok: boolean; issues: Issue[]; done?: number; total?: number };

function touchesRoad(sc: Scenario, map: Occupancy, cells: Cell[]): boolean {
  return cells.some(([x, y]) => DIRS.some(d => {
    const [nx, ny] = neighbour(x, y, d);
    const b = cellAt(map, nx, ny).base;
    return !!b && elementOf(sc, b.element).kind === 'road';
  }));
}

export function check(sc: Scenario, city: Placed[], c: CityConstraint, plan = expectedPlan(sc)): CheckResult {
  const map = occupancy(sc, city);
  const issues: Issue[] = [];
  const roadAt = (x: number, y: number) => {
    const b = cellAt(map, x, y).base;
    return b && elementOf(sc, b.element).kind === 'road' ? b : undefined;
  };
  switch (c.type) {
    case 'match_roads': {
      let done = 0, total = 0;
      plan.forEach((row, y) => row.forEach((exp, x) => {
        const road = roadAt(x, y);
        if (exp.road) {
          total++;
          if (!road) issues.push({ x, y, kind: 'missing' });
          else if (!sameDirs(roadDirs(sc, road), exp.dirs)) issues.push({ x, y, kind: 'wrong' });
          else done++;
        } else if (road) issues.push({ x, y, kind: 'wrong' });
      }));
      return { ok: !issues.length, issues, done, total };
    }
    case 'no_dead_ends': {
      for (const [k, cell] of map) {
        if (!cell.base || elementOf(sc, cell.base.element).kind !== 'road') continue;
        const [x, y] = k.split(',').map(Number);
        const dangling = roadDirs(sc, cell.base).some(d => {
          const [nx, ny] = neighbour(x, y, d);
          if (nx < 0 || ny < 0 || nx >= sc.grid.width || ny >= sc.grid.depth) return false;
          const next = roadAt(nx, ny);
          return !next || !roadDirs(sc, next).includes(opposite(d));
        });
        if (dangling) issues.push({ x, y, kind: 'wrong' });
      }
      return { ok: !issues.length, issues };
    }
    case 'match_elements': {
      let done = 0, total = 0;
      const wanted = new Set(c.elements);
      plan.forEach((row, y) => row.forEach((exp, x) => {
        const expected = [exp.element, exp.overlay].find(id => id && wanted.has(id));
        const { base, overlay } = cellAt(map, x, y);
        const found = [base, overlay].find(p => p && wanted.has(p.element));
        if (expected) total++;
        if (!expected && !found) return;
        if (!found) issues.push({ x, y, kind: 'missing' });
        else if (found.element !== expected) issues.push({ x, y, kind: 'wrong' });
        else if (elementOf(sc, found.element).kind === 'road' && !sameDirs(roadDirs(sc, found), exp.dirs)) issues.push({ x, y, kind: 'wrong' });
        else done++;
      }));
      return { ok: !issues.length, issues, done, total };
    }
    case 'touch_road': {
      const wanted = city.filter(p => c.elements.includes(p.element));
      const groups: Cell[][] = wanted.map(p => cellsOf(footprint(elementOf(sc, p.element), p)));
      if (c.grouped) {
        // merge touching groups: one access to the road serves the whole green area
        const all = new Set(groups.flat().map(([x, y]) => key(x, y)));
        const seen = new Set<string>();
        groups.length = 0;
        for (const start of all) {
          if (seen.has(start)) continue;
          const group: Cell[] = [], queue = [start];
          seen.add(start);
          while (queue.length) {
            const [x, y] = queue.shift()!.split(',').map(Number);
            group.push([x, y]);
            for (const d of DIRS) {
              const n = key(...neighbour(x, y, d));
              if (all.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
            }
          }
          groups.push(group);
        }
      }
      for (const g of groups) if (!touchesRoad(sc, map, g)) for (const [x, y] of g) issues.push({ x, y, kind: 'wrong' });
      return { ok: !issues.length, issues };
    }
  }
}

export function evaluateCity(sc: Scenario, city: Placed[], constraints: CityConstraint[]) {
  const plan = expectedPlan(sc);
  const results = constraints.map(c => check(sc, city, c, plan));
  return { results, solved: results.every(r => r.ok) };
}

/** A complete solution read from the plan (used by the tests and the build check). */
export function solutionOf(sc: Scenario): Placed[] {
  const plan = expectedPlan(sc);
  const city: Placed[] = [];
  const done = new Set<string>();
  let uid = 1;
  plan.forEach((row, y) => row.forEach((exp, x) => {
    if (exp.road) {
      const special = exp.element ? sc.elements.filter(e => e.id === exp.element) : sc.elements.filter(e => e.kind === 'road' && e.shape === 'road');
      const piece = roadPieceFor(sc, exp.dirs, special);
      if (piece) city.push({ uid: uid++, x, y, ...piece });
    } else if (exp.element && !done.has(key(x, y))) {
      const el = elementOf(sc, exp.element);
      for (const rotation of (el.rotatable ? [0, 90] : [0]) as Rotation[]) {
        const r = footprint(el, { x, y, rotation });
        if (cellsOf(r).every(([cx, cy]) => plan[cy]?.[cx]?.element === el.id && !done.has(key(cx, cy)))) {
          cellsOf(r).forEach(([cx, cy]) => done.add(key(cx, cy)));
          city.push({ uid: uid++, element: el.id, x, y, rotation });
          break;
        }
      }
    }
  }));
  plan.forEach((row, y) => row.forEach((exp, x) => {
    if (exp.overlay) city.push({ uid: uid++, element: exp.overlay, x, y, rotation: 0 });
  }));
  return city;
}
