import type { Bounds, FloorplanConstraint, PlacedRoom, Plan, Rect, RoomSpec, Side } from './types.ts';

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

export function hasValidSize(r: Rect, spec: RoomSpec): boolean {
  return r.width >= spec.width.min && r.width <= spec.width.max && r.depth >= spec.depth.min && r.depth <= spec.depth.max;
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

export function checkConstraint(c: FloorplanConstraint, layout: PlacedRoom[], plan: Plan): boolean {
  const find = (id: string) => layout.find(r => r.id === id);
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
  }
}

export type Evaluation = { inside: boolean; noOverlap: boolean; constraints: boolean[]; solved: boolean };

export function evaluate(constraints: FloorplanConstraint[], layout: PlacedRoom[], plan: Plan): Evaluation {
  const inside = allInside(layout, plan);
  const separate = noOverlap(layout);
  const results = constraints.map(c => checkConstraint(c, layout, plan));
  return { inside, noOverlap: separate, constraints: results, solved: inside && separate && results.every(Boolean) };
}
