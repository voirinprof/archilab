import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { canPlaceFurniture, checkFurnish, doorSwing, evaluateFurnish, facing, footprint, initialFurniture, passage, rotated, usageZones } from '../src/engines/floorplan/furniture.ts';
import type { Scene } from '../src/engines/floorplan/furniture.ts';
import type { FurnishActivity, FurnitureSpec, PlacedFurniture } from '../src/engines/floorplan/types.ts';

const label = { fr: '', en: '' };
const wardrobe: FurnitureSpec = { id: 'w', label, color: 'coral', size: { width: 1, depth: 0.5 }, initial: { x: 0, y: 0, rotation: 0 }, usage: { front: 1 } };

test('facing: rotations turn clockwise', () => {
  assert.equal(facing('front', 0), 'south');
  assert.equal(facing('front', 90), 'west');
  assert.equal(facing('front', 180), 'north');
  assert.equal(facing('front', 270), 'east');
  assert.equal(facing('left', 180), 'east');
});

test('footprint and usage zones follow the rotation', () => {
  assert.deepEqual(footprint(wardrobe, { id: 'w', x: 1, y: 1, rotation: 90 }), { x: 1, y: 1, width: 0.5, depth: 1 });
  assert.deepEqual(usageZones(wardrobe, { id: 'w', x: 1, y: 1, rotation: 0 }), [{ x: 1, y: 1.5, width: 1, depth: 1 }]);
  assert.deepEqual(usageZones(wardrobe, { id: 'w', x: 1, y: 1, rotation: 90 }), [{ x: 0, y: 1, width: 1, depth: 1 }]);
});

test('rotated turns around the centre, on the grid, and four turns come back to the start', () => {
  const start: PlacedFurniture = { id: 'w', x: 1, y: 1, rotation: 0 };
  assert.deepEqual(rotated(wardrobe, start, 0.5), { id: 'w', x: 1, y: 0.5, rotation: 90 });
  let p = start;
  for (let i = 0; i < 4; i++) p = rotated(wardrobe, p, 0.5);
  assert.deepEqual(p, start);
});

test('door swing lies inside the room, against the wall', () => {
  const door = { id: 'd', kind: 'door' as const, label, side: 'east' as const, at: 1, width: 1, swing: 1 };
  assert.deepEqual(doorSwing(door, { width: 4, depth: 3 }), { x: 3, y: 1, width: 1, depth: 1 });
});

test('passage: 50 cm gaps are too narrow, 1 m gaps are fine', () => {
  // A 4 m × 3 m room cut by a wall-like block, leaving a gap at the bottom.
  const block = (depth: number): FurnitureSpec => ({ id: 'block', label, color: 'grey', size: { width: 0.5, depth }, initial: { x: 2, y: 0, rotation: 0 }, fixed: true });
  const target: FurnitureSpec = { id: 'target', label, color: 'blue', size: { width: 0.5, depth: 0.5 }, initial: { x: 3.5, y: 0, rotation: 0 } };
  const door = { id: 'door', kind: 'door' as const, label, side: 'west' as const, at: 0, width: 1, swing: 1 };
  const scene = (depth: number): Scene => ({ plan: { width: 4, depth: 3 }, step: 0.5, items: [block(depth), target], openings: [door], placed: initialFurniture([block(depth), target]) });
  assert.equal(passage(scene(2.5), 'door', ['target'], 0.8).reached.has('target'), false);
  assert.equal(passage(scene(2), 'door', ['target'], 0.8).reached.has('target'), true);
});

const game = YAML.parse(readFileSync(new URL('../activities/amenage-ton-studio.yaml', import.meta.url), 'utf8')) as FurnishActivity;
const { plan, step, items, openings } = game.parameters;
const fixedPlaced = initialFurniture(items.filter(i => i.fixed));
const sceneOf = (placed: PlacedFurniture[]): Scene => ({ plan, step, items, openings, placed: [...fixedPlaced, ...placed] });
const layout = (...spots: [string, number, number, 0 | 90 | 180 | 270][]) => spots.map(([id, x, y, rotation]) => ({ id, x, y, rotation }));
const solutions = [
  layout(['bed', 0, 3, 180], ['desk', 2, 4.5, 180], ['wardrobe', 4.5, 2.5, 90], ['sofa', 3, 4, 180], ['table', 2.5, 2, 0]),
  layout(['bed', 0.5, 3, 0], ['sofa', 2, 3, 270], ['desk', 4, 4.5, 180], ['wardrobe', 3, 1, 270], ['table', 2, 1, 0]),
  layout(['bed', 1.5, 3, 0], ['sofa', 0, 3, 270], ['desk', 3, 4.5, 180], ['wardrobe', 4, 3.5, 0], ['table', 2.5, 1, 0]),
];
const results = (placed: PlacedFurniture[]) => evaluateFurnish(game.constraints, sceneOf(placed)).constraints;
const replace = (base: PlacedFurniture[], change: PlacedFurniture) => base.map(p => (p.id === change.id ? change : p));

test('Aménage ton studio : the starting layout is valid but unusable', () => {
  const start = initialFurniture(items);
  assert.ok(start.filter(p => !items.find(i => i.id === p.id)!.fixed).every(p => canPlaceFurniture(sceneOf(start.filter(q => !fixedPlaced.some(f => f.id === q.id))), p)));
  assert.equal(evaluateFurnish(game.constraints, { plan, step, items, openings, placed: start }).solved, false);
});

test('Aménage ton studio : very different layouts all work', () => {
  for (const s of solutions) {
    const scene = sceneOf(s);
    assert.ok(s.every(p => canPlaceFurniture(scene, p)), JSON.stringify(s));
    assert.equal(evaluateFurnish(game.constraints, scene).solved, true, JSON.stringify(s));
  }
});

test('Aménage ton studio : each rule can be broken', () => {
  const [s] = solutions;
  const index = (type: string, n = 0) => game.constraints.map((c, i) => [c.type, i] as const).filter(([t]) => t === type)[n][1];
  assert.equal(results(replace(s, { id: 'table', x: 2, y: 0.5, rotation: 0 }))[index('usage_clear', 0)], false); // table in the door swing
  assert.equal(results(replace(s, { id: 'wardrobe', x: 4.5, y: 2.5, rotation: 270 }))[index('usage_clear', 1)], false); // wardrobe facing the wall
  assert.equal(results(replace(s, { id: 'desk', x: 0.5, y: 2, rotation: 0 }))[index('usage_clear', 2)], false); // desk in front of the bathroom
  assert.equal(results(replace(s, { id: 'desk', x: 2, y: 1, rotation: 0 }))[index('max_distance')], false); // desk far from the window
  const bedNearKitchen = replace(s, { id: 'bed', x: 3, y: 2.5, rotation: 0 });
  assert.equal(checkFurnish(game.constraints[index('min_distance')], sceneOf(bedNearKitchen)), false);
  // the sofa right behind the door swing shuts the entrance off from the rest of the studio
  const trapped = replace(s, { id: 'sofa', x: 2, y: 1, rotation: 0 });
  assert.ok(canPlaceFurniture(sceneOf(trapped), { id: 'sofa', x: 2, y: 1, rotation: 0 }));
  assert.equal(results(trapped)[index('usage_clear', 0)], true);
  assert.equal(results(trapped)[index('min_passage')], false);
});

test('Aménage ton studio : nobody squeezes between two pieces of furniture that only touch at a corner', () => {
  // the table under the door swing and the wardrobe beside it meet at one point: the entrance is shut in
  const cornered = layout(['bed', 0.5, 3, 0], ['sofa', 2, 3.5, 0], ['desk', 4, 4.5, 180], ['wardrobe', 3, 0, 90], ['table', 2, 1, 0]);
  const scene = sceneOf(cornered);
  assert.ok(cornered.every(p => canPlaceFurniture(scene, p)));
  const c = game.constraints.find(c => c.type === 'min_passage')!;
  assert.equal(checkFurnish(c, scene), false);
  assert.equal(passage(scene, 'entrance', ['bed'], 0.8).cells.length, 4);
});
