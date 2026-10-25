import type { FurnishConstraint, FurnitureSpec, OpeningSpec, PlacedFurniture, Plan, Rect, Rotation, Side } from './types.ts';
import { gap, isInside, overlaps, walkableArea } from './rules.ts';

const EPSILON = 1e-9;
const CLOCKWISE: Side[] = ['north', 'east', 'south', 'west'];
const LOCAL: Record<'front' | 'back' | 'left' | 'right', Side> = { front: 'south', back: 'north', left: 'west', right: 'east' };

/** The side a local side (front, back…) faces once the item is rotated clockwise. */
export function facing(local: keyof typeof LOCAL, rotation: Rotation): Side {
  return CLOCKWISE[(CLOCKWISE.indexOf(LOCAL[local]) + rotation / 90) % 4];
}

export function footprint(spec: FurnitureSpec, placed: PlacedFurniture): Rect {
  const turned = placed.rotation === 90 || placed.rotation === 270;
  return { x: placed.x, y: placed.y, width: turned ? spec.size.depth : spec.size.width, depth: turned ? spec.size.width : spec.size.depth };
}

/** Strip of floor of the given depth along one side of a rectangle, outside it. */
export function strip(r: Rect, side: Side, depth: number): Rect {
  switch (side) {
    case 'north': return { x: r.x, y: r.y - depth, width: r.width, depth };
    case 'south': return { x: r.x, y: r.y + r.depth, width: r.width, depth };
    case 'west': return { x: r.x - depth, y: r.y, width: depth, depth: r.depth };
    case 'east': return { x: r.x + r.width, y: r.y, width: depth, depth: r.depth };
  }
}

export function usageZones(spec: FurnitureSpec, placed: PlacedFurniture): Rect[] {
  const base = footprint(spec, placed);
  return (Object.keys(LOCAL) as (keyof typeof LOCAL)[])
    .filter(k => (spec.usage?.[k] ?? 0) > 0)
    .map(k => strip(base, facing(k, placed.rotation), spec.usage![k]!));
}

/** The opening as a zero-thickness rectangle on its wall. */
export function openingRect(o: OpeningSpec, plan: Plan): Rect {
  switch (o.side) {
    case 'north': return { x: o.at, y: 0, width: o.width, depth: 0 };
    case 'south': return { x: o.at, y: plan.depth, width: o.width, depth: 0 };
    case 'west': return { x: 0, y: o.at, width: 0, depth: o.width };
    case 'east': return { x: plan.width, y: o.at, width: 0, depth: o.width };
  }
}

const INWARD: Record<Side, Side> = { north: 'south', south: 'north', west: 'east', east: 'west' };

/** Floor a door needs to swing open, inside the room. */
export function doorSwing(o: OpeningSpec, plan: Plan): Rect | null {
  return o.kind === 'door' && o.swing ? strip(openingRect(o, plan), INWARD[o.side], o.swing) : null;
}

export function initialFurniture(items: FurnitureSpec[]): PlacedFurniture[] {
  return items.map(i => ({ id: i.id, ...i.initial }));
}

/**
 * Rotates a quarter turn clockwise around the item's centre, snapped to the grid.
 * Rounding goes down when turning sideways and up when turning back, so four turns bring the item back where it was.
 */
export function rotated(spec: FurnitureSpec, placed: PlacedFurniture, step: number): PlacedFurniture {
  const before = footprint(spec, placed);
  const rotation = ((placed.rotation + 90) % 360) as Rotation;
  const after = footprint(spec, { ...placed, rotation });
  const round = rotation % 180 === 0 ? Math.ceil : Math.floor;
  const snap = (v: number) => round(v / step - (rotation % 180 === 0 ? EPSILON : -EPSILON)) * step;
  return { id: placed.id, rotation, x: snap(before.x + (before.width - after.width) / 2), y: snap(before.y + (before.depth - after.depth) / 2) };
}

export type Scene = { plan: Plan; step: number; items: FurnitureSpec[]; openings: OpeningSpec[]; placed: PlacedFurniture[] };

const specOf = (scene: Scene, id: string) => scene.items.find(i => i.id === id)!;
const placedOf = (scene: Scene, id: string) => scene.placed.find(p => p.id === id)!;

export function footprints(scene: Scene): { id: string; rect: Rect }[] {
  return scene.placed.map(p => ({ id: p.id, rect: footprint(specOf(scene, p.id), p) }));
}

/** A movable item can go there if it stays in the room and overlaps no other item. */
export function canPlaceFurniture(scene: Scene, candidate: PlacedFurniture): boolean {
  const rect = footprint(specOf(scene, candidate.id), candidate);
  return isInside(rect, scene.plan) && footprints(scene).every(f => f.id === candidate.id || !overlaps(rect, f.rect));
}

/** Zones an item or opening needs free: usage zones for furniture, the swing for a door. */
export function zonesOf(scene: Scene, id: string): Rect[] {
  const opening = scene.openings.find(o => o.id === id);
  if (opening) {
    const swing = doorSwing(opening, scene.plan);
    return swing ? [swing] : [];
  }
  return usageZones(specOf(scene, id), placedOf(scene, id));
}

/** A zone is clear when it lies in the room and no other item stands on it. */
export function zoneClear(scene: Scene, id: string, zone: Rect): boolean {
  return isInside(zone, scene.plan) && footprints(scene).every(f => f.id === id || !overlaps(zone, f.rect));
}

export function usageClear(scene: Scene, id: string): boolean {
  return zonesOf(scene, id).every(z => zoneClear(scene, id, z));
}

/** Where something to reach "is": its usage zones, or its footprint / opening if it has none. */
function targetRects(scene: Scene, id: string): Rect[] {
  const zones = zonesOf(scene, id);
  if (zones.length) return zones;
  const opening = scene.openings.find(o => o.id === id);
  return [opening ? openingRect(opening, scene.plan) : footprint(specOf(scene, id), placedOf(scene, id))];
}

/**
 * Walkable area for a person needing `width` metres, starting from `from`.
 * The floor is cut in grid cells; a k×k block of free cells (k = width rounded up to the grid) moves cell by cell.
 * Returns the reachable cells and the ids among `to` that the walkable area touches.
 */
export function passage(scene: Scene, from: string, to: string[], width: number) {
  const area = walkableArea(scene.plan, scene.step, footprints(scene).map(f => f.rect), targetRects(scene, from), width);
  return { cells: area.cells, reached: new Set(to.filter(id => area.reaches(targetRects(scene, id)))) };
}

function rectOfAny(scene: Scene, id: string): Rect {
  const opening = scene.openings.find(o => o.id === id);
  return opening ? openingRect(opening, scene.plan) : footprint(specOf(scene, id), placedOf(scene, id));
}

export function checkFurnish(c: FurnishConstraint, scene: Scene): boolean {
  switch (c.type) {
    case 'usage_clear':
      return c.items.every(id => usageClear(scene, id));
    case 'min_passage': {
      const { reached } = passage(scene, c.from, c.to, c.width);
      return c.to.every(id => reached.has(id));
    }
    case 'min_distance':
    case 'max_distance': {
      const d = gap(rectOfAny(scene, c.rooms[0]), rectOfAny(scene, c.rooms[1]));
      return c.type === 'min_distance' ? d >= c.value - EPSILON : d <= c.value + EPSILON;
    }
  }
}

export function evaluateFurnish(constraints: FurnishConstraint[], scene: Scene) {
  const results = constraints.map(c => checkFurnish(c, scene));
  return { constraints: results, solved: results.every(Boolean) };
}
