import type { Bounds, ContextSpec, DimensionLine, FloorplanConstraint, PlacedRoom, Plan, Rect, RoomSpec, Side, WallSegment } from './types.ts';

export const OUTSIDE = 'outside';
export const CIRCULATION = 'circulation';

export function area(r: Rect): number {
  return r.width * r.depth;
}

/** True when the two rectangles share a surface (touching edges do not count). */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.depth && b.y < a.y + a.depth;
}

export function isInside(r: Rect, plan: Plan): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.width <= plan.width && r.y + r.depth <= plan.depth;
}

/** Length of wall shared by two rooms that touch side by side (0 if they only meet at a corner or not at all). */
export function sharedWall(a: Rect, b: Rect): number {
  const span = (start1: number, end1: number, start2: number, end2: number) =>
    Math.max(0, Math.min(end1, end2) - Math.max(start1, start2));
  if (a.x + a.width === b.x || b.x + b.width === a.x) return span(a.y, a.y + a.depth, b.y, b.y + b.depth);
  if (a.y + a.depth === b.y || b.y + b.depth === a.y) return span(a.x, a.x + a.width, b.x, b.x + b.width);
  return 0;
}

export function touchesSide(r: Rect, plan: Plan, side: Side): boolean {
  switch (side) {
    case 'north': return r.y === 0;
    case 'south': return r.y + r.depth === plan.depth;
    case 'west': return r.x === 0;
    case 'east': return r.x + r.width === plan.width;
  }
}

export function clamp(value: number, bounds: Bounds): number {
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

export function sizeBounds(spec: RoomSpec, key: 'width' | 'depth'): Bounds {
  return spec[key] ?? { min: spec.initial[key], max: spec.initial[key] };
}

export function hasValidSize(r: Rect, spec: RoomSpec): boolean {
  const w = sizeBounds(spec, 'width'), d = sizeBounds(spec, 'depth');
  return r.width >= w.min && r.width <= w.max && r.depth >= d.min && r.depth <= d.max;
}

/** Keeps a room inside the plan by sliding it, without changing its size. */
export function clampPosition(r: Rect, plan: Plan): Rect {
  return {
    ...r,
    x: clamp(r.x, { min: 0, max: plan.width - r.width }),
    y: clamp(r.y, { min: 0, max: plan.depth - r.depth }),
  };
}

/** A room can take this rectangle if it stays inside the plan and overlaps no other room or fixed obstacle. */
export function canPlace(layout: PlacedRoom[], id: string, r: Rect, plan: Plan, obstacles: Rect[] = []): boolean {
  return isInside(r, plan) && layout.every(other => other.id === id || !overlaps(r, other)) && obstacles.every(o => !overlaps(r, o));
}

/** Distance from a room to one edge of the plan (negative if it sticks out). */
export function distanceToSide(r: Rect, plan: Plan, side: Side): number {
  switch (side) {
    case 'north': return r.y;
    case 'south': return plan.depth - (r.y + r.depth);
    case 'west': return r.x;
    case 'east': return plan.width - (r.x + r.width);
  }
}

/** For each axis: the two facing edges if the ranges are apart, otherwise the middle of their overlap. */
function facing(a0: number, a1: number, b0: number, b1: number): [number, number] {
  if (a1 <= b0) return [a1, b0];
  if (b1 <= a0) return [a0, b1];
  const mid = (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
  return [mid, mid];
}

/** The closest points between two rectangles: [point on a, point on b]. */
export function closestPoints(a: Rect, b: Rect): [[number, number], [number, number]] {
  const [ax, bx] = facing(a.x, a.x + a.width, b.x, b.x + b.width);
  const [ay, by] = facing(a.y, a.y + a.depth, b.y, b.y + b.depth);
  return [[ax, ay], [bx, by]];
}

/** Shortest distance between two rectangles (0 if they touch or overlap). */
export function gap(a: Rect, b: Rect): number {
  const [[ax, ay], [bx, by]] = closestPoints(a, b);
  return Math.hypot(bx - ax, by - ay);
}

/** Share of the plan covered by rooms, from 0 to 1. */
export function coverage(layout: PlacedRoom[], plan: Plan): number {
  return layout.reduce((sum, r) => sum + area(r), 0) / (plan.width * plan.depth);
}

export function contextRects(context: ContextSpec[] = []): PlacedRoom[] {
  return context.map(c => ({ id: c.id, ...c.rect }));
}

/** Context elements that rooms may not be built over. */
export function obstaclesOf(context: ContextSpec[] = []): PlacedRoom[] {
  return contextRects(context.filter(c => c.blocking !== false));
}

/** Trees whose trunk or root zone is touched by a room. */
export function lostTrees(layout: PlacedRoom[], context: ContextSpec[] = []): Set<string> {
  const lost = context.filter(c =>
    c.kind === 'tree' && layout.some(r => overlaps(r, c.rect) || gap(r, c.rect) < (c.root_radius ?? 0) - EPSILON));
  return new Set(lost.map(c => c.id));
}

export function keptTreeCount(layout: PlacedRoom[], context: ContextSpec[] = []): number {
  return context.filter(c => c.kind === 'tree').length - lostTrees(layout, context).size;
}

export function initialLayout(rooms: RoomSpec[]): PlacedRoom[] {
  return rooms.map(room => ({ id: room.id, ...room.initial }));
}

export function allInside(layout: PlacedRoom[], plan: Plan): boolean {
  return layout.every(r => isInside(r, plan));
}

export function noOverlap(layout: PlacedRoom[]): boolean {
  return layout.every((a, i) => layout.slice(i + 1).every(b => !overlaps(a, b)));
}

/** Which space covers the 1 m cell whose north-west corner is (cx, cy). */
export function spaceAt(layout: PlacedRoom[], plan: Plan, cx: number, cy: number): string {
  if (cx < 0 || cy < 0 || cx >= plan.width || cy >= plan.depth) return OUTSIDE;
  return layout.find(r => cx >= r.x && cx < r.x + r.width && cy >= r.y && cy < r.y + r.depth)?.id ?? CIRCULATION;
}

/** Every room, plus the circulation if some of the plan is left free. */
export function spacesOf(layout: PlacedRoom[], plan: Plan): string[] {
  const free = plan.width * plan.depth > layout.reduce((sum, r) => sum + area(r), 0);
  return [...layout.map(r => r.id), ...(free ? [CIRCULATION] : [])];
}

/**
 * Cuts every wall into 1 m segments. Vertical segment v:x:y separates cells (x-1, y) [a] and (x, y) [b];
 * horizontal segment h:x:y separates cells (x, y-1) [a] and (x, y) [b].
 */
export function wallSegments(layout: PlacedRoom[], plan: Plan): WallSegment[] {
  const segments: WallSegment[] = [];
  for (let x = 0; x <= plan.width; x++) {
    for (let y = 0; y < plan.depth; y++) {
      const a = spaceAt(layout, plan, x - 1, y), b = spaceAt(layout, plan, x, y);
      if (a !== b) segments.push({ key: `v:${x}:${y}`, x1: x, y1: y, x2: x, y2: y + 1, a, b, side: x === 0 ? 'west' : x === plan.width ? 'east' : undefined });
    }
  }
  for (let y = 0; y <= plan.depth; y++) {
    for (let x = 0; x < plan.width; x++) {
      const a = spaceAt(layout, plan, x, y - 1), b = spaceAt(layout, plan, x, y);
      if (a !== b) segments.push({ key: `h:${x}:${y}`, x1: x, y1: y, x2: x + 1, y2: y, a, b, side: y === 0 ? 'north' : y === plan.depth ? 'south' : undefined });
    }
  }
  return segments;
}

/** The wall segments that hold a door. */
export function doorLinks(layout: PlacedRoom[], plan: Plan, doors: string[]): WallSegment[] {
  return wallSegments(layout, plan).filter(s => doors.includes(s.key));
}

export function links(segment: WallSegment, p: string, q: string): boolean {
  return (segment.a === p && segment.b === q) || (segment.a === q && segment.b === p);
}

/** Spaces that can be reached from outside through doors, never entering `avoid`. */
export function reachableSpaces(doorSegments: WallSegment[], avoid?: string): Set<string> {
  const seen = new Set<string>([OUTSIDE]);
  const queue = [OUTSIDE];
  while (queue.length) {
    const current = queue.shift()!;
    for (const d of doorSegments) {
      const next = d.a === current ? d.b : d.b === current ? d.a : null;
      if (next && next !== avoid && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/**
 * Floor a person needing `width` metres can reach from `starts`, cut into grid cells of `step` metres:
 * a block of k×k free cells (k = width rounded up to the grid) moves cell by cell between the obstacles.
 * `reaches` tells whether that area touches a rectangle (a room, a usage zone…) along an edge;
 * with `corners`, touching at a single corner is enough (the furnish mode's original rule).
 */
export function walkableArea(plan: Plan, step: number, obstacles: Rect[], starts: Rect[], width: number, { corners = false } = {}) {
  const nx = Math.round(plan.width / step), ny = Math.round(plan.depth / step);
  const k = Math.max(1, Math.ceil(width / step - EPSILON));
  const cellRect = (i: number, j: number, size = 1): Rect => ({ x: i * step, y: j * step, width: size * step, depth: size * step });
  const free: boolean[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) free[j * nx + i] = obstacles.every(b => !overlaps(cellRect(i, j), b));
  const blockFree = (i: number, j: number) => {
    for (let dj = 0; dj < k; dj++) for (let di = 0; di < k; di++) if (!free[(j + dj) * nx + i + di]) return false;
    return true;
  };
  // touching means sharing a stretch of edge (or overlapping): a corner alone lets nobody through
  const touches = (i: number, j: number, rects: Rect[]) => rects.some(r => {
    const b = cellRect(i, j, k);
    if (corners) return gap(b, r) < EPSILON;
    const ox = Math.min(b.x + b.width, r.x + r.width) - Math.max(b.x, r.x);
    const oy = Math.min(b.y + b.depth, r.y + r.depth) - Math.max(b.y, r.y);
    return (ox > EPSILON && oy > -EPSILON) || (oy > EPSILON && ox > -EPSILON);
  });
  const seen = new Set<number>();
  const queue: [number, number][] = [];
  for (let j = 0; j + k <= ny; j++) for (let i = 0; i + k <= nx; i++) {
    if (blockFree(i, j) && touches(i, j, starts)) { seen.add(j * nx + i); queue.push([i, j]); }
  }
  while (queue.length) {
    const [i, j] = queue.shift()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a + k > nx || b + k > ny || seen.has(b * nx + a) || !blockFree(a, b)) continue;
      seen.add(b * nx + a);
      queue.push([a, b]);
    }
  }
  const blocks = [...seen].map(n => [n % nx, Math.floor(n / nx)] as [number, number]);
  const cells = new Set<number>();
  for (const [i, j] of blocks) for (let dj = 0; dj < k; dj++) for (let di = 0; di < k; di++) cells.add((j + dj) * nx + i + di);
  return {
    cells: [...cells].map(n => cellRect(n % nx, Math.floor(n / nx))),
    reaches: (rects: Rect[]) => blocks.some(([i, j]) => touches(i, j, rects)),
  };
}

/** For an accessible_width rule: the floor a wheelchair can use, and the rooms it doesn't reach. Rooms are the obstacles. */
export function accessibility(c: Extract<FloorplanConstraint, { type: 'accessible_width' }>, layout: PlacedRoom[], plan: Plan, context: ContextSpec[] = []) {
  const start = contextRects(context).find(r => r.id === c.from);
  const area = walkableArea(plan, 1, layout, start ? [start] : [], c.width);
  const targets = c.rooms ? layout.filter(r => c.rooms!.includes(r.id)) : layout;
  return { cells: area.cells, unreached: targets.filter(r => !area.reaches([r])).map(r => r.id) };
}

/** What a constraint may look at besides the rooms: placed doors and fixed context elements. */
export type Extras = { doors?: string[]; context?: ContextSpec[] };

const EPSILON = 1e-9;

export function checkConstraint(c: FloorplanConstraint, layout: PlacedRoom[], plan: Plan, { doors = [], context = [] }: Extras = {}): boolean {
  const find = (id: string) => layout.find(r => r.id === id);
  const findAny = (id: string) => find(id) ?? contextRects(context).find(r => r.id === id);
  const placedDoors = () => doorLinks(layout, plan, doors);
  switch (c.type) {
    case 'min_area':
    case 'max_area': {
      const rooms = [...(c.room ? [c.room] : []), ...(c.rooms ?? [])].map(find);
      return rooms.length > 0 && rooms.every(room => !!room && (c.type === 'min_area' ? area(room) >= c.value : area(room) <= c.value));
    }
    case 'touches_any_side':
      return c.rooms.every(id => { const room = find(id); return !!room && c.sides.some(side => touchesSide(room, plan, side)); });
    case 'max_distance': {
      const a = findAny(c.from);
      return !!a && c.to.every(id => { const b = findAny(id); return !!b && gap(a, b) <= c.value + EPSILON; });
    }
    case 'accessible_width':
      return accessibility(c, layout, plan, context).unreached.length === 0;
    case 'adjacent':
    case 'not_adjacent': {
      const [a, b] = c.rooms.map(find);
      if (!a || !b) return false;
      const neighbours = sharedWall(a, b) >= (c.min_shared ?? 1);
      return c.type === 'adjacent' ? neighbours : !neighbours;
    }
    case 'touches_side': {
      const room = find(c.room);
      return !!room && touchesSide(room, plan, c.side);
    }
    case 'entrance':
      return placedDoors().some(d => {
        const inside = d.a === OUTSIDE ? d.b : d.b === OUTSIDE ? d.a : null;
        return !!inside && (!c.side || d.side === c.side) && (!c.spaces || c.spaces.includes(inside));
      });
    case 'all_reachable': {
      const reached = reachableSpaces(placedDoors());
      return spacesOf(layout, plan).every(s => reached.has(s));
    }
    case 'door_between':
    case 'no_door_between': {
      const exists = placedDoors().some(d => links(d, c.rooms[0], c.rooms[1]));
      return c.type === 'door_between' ? exists : !exists;
    }
    case 'reachable_avoiding':
      return reachableSpaces(placedDoors(), c.avoid).has(c.room);
    case 'max_doors':
      return placedDoors().length <= c.value;
    case 'min_setback': {
      const room = find(c.room);
      return !!room && c.sides.every(side => distanceToSide(room, plan, side) >= c.value - EPSILON);
    }
    case 'min_distance': {
      const [a, b] = c.rooms.map(findAny);
      return !!a && !!b && gap(a, b) >= c.value - EPSILON;
    }
    case 'max_coverage':
      return coverage(layout, plan) * 100 <= c.value + EPSILON;
    case 'keep_trees': {
      const lost = lostTrees(layout, context);
      return c.trees.every(id => !lost.has(id));
    }
    case 'min_trees_kept':
      return keptTreeCount(layout, context) >= c.value;
  }
}

/** Dimension lines for every distance constraint, so the player can read the measures on the plan. */
export function dimensionLines(constraints: FloorplanConstraint[], layout: PlacedRoom[], plan: Plan, context: PlacedRoom[] = []): DimensionLine[] {
  const lines: DimensionLine[] = [];
  const findAny = (id: string) => layout.find(r => r.id === id) ?? context.find(r => r.id === id);
  for (const c of constraints) {
    if (c.type === 'min_setback') {
      const r = layout.find(room => room.id === c.room);
      if (!r) continue;
      const mx = r.x + r.width / 2, my = r.y + r.depth / 2;
      for (const side of c.sides) {
        const value = distanceToSide(r, plan, side);
        const ends: Record<Side, [[number, number], [number, number]]> = {
          north: [[mx, r.y], [mx, 0]],
          south: [[mx, r.y + r.depth], [mx, plan.depth]],
          west: [[r.x, my], [0, my]],
          east: [[r.x + r.width, my], [plan.width, my]],
        };
        lines.push({ kind: 'setback', from: ends[side][0], to: ends[side][1], value, ok: value >= c.value - EPSILON });
      }
    } else if (c.type === 'min_distance') {
      const [a, b] = c.rooms.map(findAny);
      if (!a || !b) continue;
      const [from, to] = closestPoints(a, b);
      const value = gap(a, b);
      lines.push({ kind: 'distance', from, to, value, ok: value >= c.value - EPSILON });
    } else if (c.type === 'max_distance' && c.value > 0) {
      const a = findAny(c.from);
      for (const id of c.to) {
        const b = findAny(id);
        if (!a || !b) continue;
        const [from, to] = closestPoints(a, b);
        const value = gap(a, b);
        lines.push({ kind: 'distance', from, to, value, ok: value <= c.value + EPSILON });
      }
    }
  }
  return lines;
}

/** Where a room may stand according to its setbacks, plus the keep-away distance around each fixed element. */
export function buildableZone(constraints: FloorplanConstraint[], roomId: string, plan: Plan, context: PlacedRoom[] = []) {
  let x0 = 0, y0 = 0, x1 = plan.width, y1 = plan.depth;
  const halos: { rect: Rect; radius: number }[] = [];
  for (const c of constraints) {
    if (c.type === 'min_setback' && c.room === roomId) {
      for (const side of c.sides) {
        if (side === 'north') y0 = Math.max(y0, c.value);
        if (side === 'south') y1 = Math.min(y1, plan.depth - c.value);
        if (side === 'west') x0 = Math.max(x0, c.value);
        if (side === 'east') x1 = Math.min(x1, plan.width - c.value);
      }
    } else if (c.type === 'min_distance' && c.rooms.includes(roomId)) {
      const other = context.find(r => r.id === c.rooms.find(id => id !== roomId));
      if (other) halos.push({ rect: other, radius: c.value });
    }
  }
  return { zone: { x: x0, y: y0, width: Math.max(0, x1 - x0), depth: Math.max(0, y1 - y0) }, halos };
}

export type Evaluation = { inside: boolean; noOverlap: boolean; constraints: boolean[]; solved: boolean };

export function evaluate(constraints: FloorplanConstraint[], layout: PlacedRoom[], plan: Plan, extras: Extras = {}): Evaluation {
  const inside = allInside(layout, plan);
  const separate = noOverlap(layout);
  const results = constraints.map(c => checkConstraint(c, layout, plan, extras));
  return { inside, noOverlap: separate, constraints: results, solved: inside && separate && results.every(Boolean) };
}
