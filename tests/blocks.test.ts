import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { blockCount, compareProfile, compareTop, eastView, evaluateBlocks, rotateHeights, southView, topView, viewMatches } from '../src/engines/blocks/rules.ts';
import type { BlocksActivity, Heights } from '../src/engines/blocks/types.ts';

const house: Heights = [
  [1, 0, 0],
  [2, 1, 0],
];

test('views of a small building', () => {
  assert.deepEqual(topView(house), [[true, false, false], [true, true, false]]);
  assert.deepEqual(southView(house), [2, 1, 0]);
  assert.deepEqual(eastView(house), [1, 2]);
  assert.equal(blockCount(house), 4);
});

test('comparisons mark matching, missing and extra cells', () => {
  assert.deepEqual(compareProfile([2, 0], [1, 1], 2), [['match', 'extra'], ['missing', 'empty']]);
  assert.deepEqual(compareTop([[1, 0]], [[0, 1]]), [['extra', 'missing']]);
});

test('rotateHeights turns clockwise and four turns change nothing', () => {
  assert.deepEqual(rotateHeights(house, 1), [[2, 1], [1, 0], [0, 0]]);
  assert.deepEqual(rotateHeights(house, 4), house);
});

const game = YAML.parse(readFileSync(new URL('../activities/architecte-en-blocs.yaml', import.meta.url), 'utf8')) as BlocksActivity;

/** The tallest building that has the same three views: every occupied cell rises as high as both façades allow. */
const tallest = (h: Heights): Heights => h.map((row, y) => row.map((n, x) => (n > 0 ? Math.min(southView(h)[x], eastView(h)[y]) : 0)));

test('Architecte en blocs : every target matches its own views, and an empty grid does not', () => {
  for (const m of game.parameters.models) {
    assert.equal(evaluateBlocks(game.constraints, m.heights, m.heights).solved, true, m.id);
    const empty = m.heights.map(row => row.map(() => 0));
    assert.equal(evaluateBlocks(game.constraints, empty, m.heights).solved, false, m.id);
  }
});

test('Architecte en blocs : each building accepts another solution than the target', () => {
  for (const m of game.parameters.models) {
    // candidates: the tallest building with the same views, or the target with one block taken off a stack
    const lowered = m.heights.flatMap((row, y) => row.map((n, x) => (n > 1 ? m.heights.map((r, yy) => r.map((v, xx) => (xx === x && yy === y ? v - 1 : v))) : null)));
    const others = [tallest(m.heights), ...lowered].filter((h): h is Heights => !!h && JSON.stringify(h) !== JSON.stringify(m.heights));
    assert.ok(others.some(h => evaluateBlocks(game.constraints, h, m.heights).solved), `${m.id} has a single solution`);
  }
});

test('Architecte en blocs : each view can fail on its own', () => {
  const target = game.parameters.models[0].heights; // the L-shaped house
  const edit = (x: number, y: number, n: number) => target.map((row, yy) => row.map((v, xx) => (xx === x && yy === y ? n : v)));
  const views = (h: Heights) => (['top', 'south', 'east'] as const).map(v => viewMatches(v, h, target));
  assert.deepEqual(views(edit(2, 1, 1)), [false, true, true]); // a block on an empty cell, below both façades: only the plan changes
  assert.deepEqual(views(edit(2, 2, 2)), [true, false, true]); // its row already reaches 2 storeys: only the south façade changes
  assert.deepEqual(views(edit(0, 0, 2)), [true, true, false]); // its column already reaches 2 storeys: only the east façade changes
});
