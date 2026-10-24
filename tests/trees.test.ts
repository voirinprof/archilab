import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { evaluate, initialLayout, keptTreeCount, lostTrees, obstaclesOf } from '../src/engines/floorplan/rules.ts';
import type { ContextSpec, FloorplanActivity, PlacedRoom } from '../src/engines/floorplan/types.ts';

const tree = (id: string, x: number, y: number, root_radius: number): ContextSpec =>
  ({ id, kind: 'tree', label: { fr: id, en: id }, rect: { x, y, width: 1, depth: 1 }, root_radius, blocking: false });

test('lostTrees: building on the trunk or inside the root zone kills the tree', () => {
  const trees = [tree('a', 10, 10, 3), tree('b', 20, 10, 2)];
  assert.deepEqual([...lostTrees([{ id: 'h', x: 9, y: 9, width: 3, depth: 3 }], trees)], ['a']); // on the trunk
  assert.deepEqual([...lostTrees([{ id: 'h', x: 13, y: 9, width: 4, depth: 3 }], trees)], ['a']); // 2 m < 3 m from trunk
  assert.deepEqual([...lostTrees([{ id: 'h', x: 14, y: 9, width: 4, depth: 3 }], trees)], []); // exactly 3 m and 2 m: both kept
  assert.equal(keptTreeCount([{ id: 'h', x: 14, y: 9, width: 5, depth: 3 }], trees), 1);
});

test('obstaclesOf skips elements that may be built over', () => {
  const street: ContextSpec = { id: 'street', kind: 'street', label: { fr: '', en: '' }, rect: { x: 0, y: -4, width: 10, depth: 3 } };
  assert.deepEqual(obstaclesOf([street, tree('a', 1, 1, 2)]).map(o => o.id), ['street']);
});

const game = YAML.parse(readFileSync(new URL('../activities/preserve-les-arbres.yaml', import.meta.url), 'utf8')) as FloorplanActivity;
const { plan, rooms, context = [] } = game.parameters;
const house = (x: number, y: number, width: number, depth: number): PlacedRoom => ({ id: 'house', x, y, width, depth });
const driveway = (x: number, depth: number): PlacedRoom => ({ id: 'driveway', x, y: 0, width: 3, depth });
const result = (layout: PlacedRoom[]) => evaluate(game.constraints, layout, plan, { context });
const failing = (layout: PlacedRoom[]) => game.constraints.filter((_, i) => !result(layout).constraints[i]).map(c => c.type);

test('Préserve les arbres : the starting layout is unsolved', () => {
  assert.equal(result(initialLayout(rooms)).solved, false);
});

test('Préserve les arbres : best_possible is the true maximum', () => {
  // Every valid layout satisfies the setbacks and has its driveway against the street, so this search is exhaustive.
  let best = 0, atLeastTarget = 0;
  for (let w = 4; w <= 20; w++) for (let d = 4; d <= 14; d++) {
    if (w * d < 100) continue;
    for (let x = 3; x + w <= plan.width - 3; x++) for (let y = 6; y + d <= plan.depth - 5; y++) {
      for (let dx = 0; dx + 3 <= plan.width; dx++) for (let dd = 2; dd <= 14; dd++) {
        const layout = [house(x, y, w, d), driveway(dx, dd)];
        if (!result(layout).solved) continue;
        atLeastTarget++;
        best = Math.max(best, keptTreeCount(layout, context));
      }
    }
  }
  assert.equal(best, game.parameters.best_possible);
  assert.ok(atLeastTarget >= 20, `only ${atLeastTarget} winning layouts`);
});

test('Préserve les arbres : different layouts win', () => {
  const wins: PlacedRoom[][] = [
    [house(3, 6, 13, 8), driveway(16, 9)], // driveway along the east side of the house
    [house(4, 6, 13, 8), driveway(14, 6)], // driveway reaching the top of the house
  ];
  for (const layout of wins) {
    assert.equal(result(layout).solved, true, JSON.stringify(layout));
    assert.equal(keptTreeCount(layout, context), 9);
  }
});

test('Préserve les arbres : each rule can fail', () => {
  assert.deepEqual(failing([house(4, 6, 13, 8), driveway(14, 5)]), ['adjacent']); // driveway stops 1 m short
  assert.deepEqual(failing([house(3, 6, 12, 8), driveway(12, 6)]), ['min_area']);
  assert.ok(failing([house(3, 6, 13, 9), driveway(16, 9)]).includes('keep_trees')); // too deep: reaches the back oak
  assert.ok(failing([house(9, 6, 13, 8), driveway(10, 6)]).includes('min_trees_kept'));
});
