import type { Bounds, FloorplanConstraint, PlacedRoom, Plan, Rect, RoomSpec, Side, WallSegment } from './types.ts';

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

/** A room can take this rectangle if it stays inside the plan and overlaps no other room. */
export function canPlace(layout: PlacedRoom[], id: string, r: Rect, plan: Plan): boolean {
  return isInside(r, plan) && layout.every(other => other.id === id || !overlaps(r, other));
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

export function checkConstraint(c: FloorplanConstraint, layout: PlacedRoom[], plan: Plan, doors: string[] = []): boolean {
  const find = (id: string) => layout.find(r => r.id === id);
  const placedDoors = () => doorLinks(layout, plan, doors);
  switch (c.type) {
    case 'min_area':
    case 'max_area': {
      const room = find(c.room);
      if (!room) return false;
      return c.type === 'min_area' ? area(room) >= c.value : area(room) <= c.value;
    }
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
  }
}

export type Evaluation = { inside: boolean; noOverlap: boolean; constraints: boolean[]; solved: boolean };

export function evaluate(constraints: FloorplanConstraint[], layout: PlacedRoom[], plan: Plan, doors: string[] = []): Evaluation {
  const inside = allInside(layout, plan);
  const separate = noOverlap(layout);
  const results = constraints.map(c => checkConstraint(c, layout, plan, doors));
  return { inside, noOverlap: separate, constraints: results, solved: inside && separate && results.every(Boolean) };
}
