import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { accessibility, dimensionLines, evaluate, initialLayout, walkableArea } from '../src/engines/floorplan/rules.ts';
import type { FloorplanActivity, PlacedRoom } from '../src/engines/floorplan/types.ts';

test('walkableArea: a 2 m wide wheelchair gets through a 2 m gap but not a 1 m one', () => {
  const plan = { width: 6, depth: 4 };
  const start = [{ x: 0, y: -1, width: 2, depth: 1 }];
  const wall = (gapWidth: number) => [{ x: 0, y: 2, width: 6 - gapWidth, depth: 1 }];
  const target = [{ x: 0, y: 4, width: 6, depth: 1 }];
  assert.equal(walkableArea(plan, 1, wall(1), start, 2).reaches(target), false);
  assert.equal(walkableArea(plan, 1, wall(2), start, 2).reaches(target), true);
  assert.equal(walkableArea(plan, 1, wall(1), start, 1).reaches(target), true, 'on foot, 1 m is enough');
});

const game = YAML.parse(readFileSync(new URL('../activities/une-ecole-pour-tous.yaml', import.meta.url), 'utf8')) as FloorplanActivity;
const P = game.parameters;
const R = (id: string, x: number, y: number, width: number, depth: number): PlacedRoom => ({ id, x, y, width, depth });
const run = (layout: PlacedRoom[]) => evaluate(game.constraints, layout, P.plan, { context: P.context });
const failing = (layout: PlacedRoom[]) => game.constraints.filter((_, i) => !run(layout).constraints[i]).map(c => c.type);
const tCorridor = [R('salle-polyvalente', 0, 0, 8, 6), R('accueil', 10, 0, 3, 3), R('toilettes', 10, 3, 3, 3), R('bibliotheque', 13, 0, 5, 6), R('classe-1', 0, 8, 8, 6), R('classe-2', 10, 8, 8, 6)];
const iCorridor = [R('bibliotheque', 0, 0, 5, 5), R('accueil', 5, 0, 3, 3), R('salle-polyvalente', 0, 7, 8, 7), R('toilettes', 10, 4, 2, 3), R('classe-1', 12, 0, 6, 8), R('classe-2', 10, 8, 8, 6)];
const swap = (layout: PlacedRoom[], room: PlacedRoom) => layout.map(r => (r.id === room.id ? room : r));

test('Une école pour tous : the starting plan blocks the entrance, nothing is reachable', () => {
  const start = initialLayout(P.rooms);
  assert.equal(run(start).inside && run(start).noOverlap, true);
  const rule = game.constraints.find(c => c.type === 'accessible_width')!;
  assert.equal(rule.type === 'accessible_width' && accessibility(rule, start, P.plan, P.context).unreached.length, 6);
});

test('Une école pour tous : a T-shaped and an I-shaped corridor both work', () => {
  for (const layout of [tCorridor, iCorridor]) {
    const r = run(layout);
    assert.equal(r.inside && r.noOverlap && r.solved, true, JSON.stringify(r.constraints));
  }
});

test('Une école pour tous : each rule can fail on its own', () => {
  assert.deepEqual(failing(swap(tCorridor, R('classe-1', 0, 8, 7, 6))), ['min_area']); // 42 m²
  assert.deepEqual(failing(swap(tCorridor, R('classe-1', 0, 7, 8, 6))), ['touches_any_side']); // no south or east façade
  assert.deepEqual(failing(swap(iCorridor, R('bibliotheque', 0, 2, 5, 5))), ['not_adjacent']); // the library against the hall
  assert.deepEqual(failing(swap(swap(tCorridor, R('accueil', 10, 3, 3, 3)), R('toilettes', 10, 0, 3, 3))), ['max_distance']); // reception away from the door
  assert.deepEqual(failing(swap(tCorridor, R('toilettes', 15, 6, 3, 1))), ['max_distance']); // toilets far from classroom 1
  // a 1 m corridor in front of the classrooms: a wheelchair can't get there
  assert.deepEqual(failing(swap(swap(tCorridor, R('classe-1', 0, 7, 8, 7)), R('classe-2', 10, 7, 8, 7))), ['accessible_width']);
});

test('Une école pour tous : dimension lines show how far the toilets are from each classroom', () => {
  const ctx = P.context!.map(c => ({ id: c.id, ...c.rect }));
  const lines = dimensionLines(game.constraints, tCorridor, P.plan, ctx);
  assert.equal(lines.length, 2);
  assert.ok(lines.every(l => l.ok && l.value <= 6));
});
