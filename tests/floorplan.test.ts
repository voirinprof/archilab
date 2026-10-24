import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { area, canPlace, checkConstraint, clampPosition, evaluate, initialLayout, overlaps, sharedWall, touchesSide } from '../src/engines/floorplan/rules.ts';
import type { FloorplanActivity, PlacedRoom } from '../src/engines/floorplan/types.ts';

const plan = { width: 10, depth: 7 };
const room = (id: string, x: number, y: number, width: number, depth: number): PlacedRoom => ({ id, x, y, width, depth });

test('area', () => {
  assert.equal(area(room('a', 0, 0, 4, 3)), 12);
});

test('overlaps: shared edge is not an overlap', () => {
  assert.equal(overlaps(room('a', 0, 0, 3, 3), room('b', 3, 0, 2, 2)), false);
  assert.equal(overlaps(room('a', 0, 0, 3, 3), room('b', 2, 2, 2, 2)), true);
  assert.equal(overlaps(room('a', 0, 0, 3, 3), room('b', 3, 3, 2, 2)), false);
});

test('sharedWall: side contact counts, corner contact does not', () => {
  assert.equal(sharedWall(room('a', 0, 0, 3, 3), room('b', 3, 1, 2, 4)), 2);
  assert.equal(sharedWall(room('a', 0, 0, 3, 3), room('b', 1, 3, 4, 2)), 2);
  assert.equal(sharedWall(room('a', 0, 0, 3, 3), room('b', 3, 3, 2, 2)), 0);
  assert.equal(sharedWall(room('a', 0, 0, 3, 3), room('b', 4, 0, 2, 2)), 0);
});

test('touchesSide: north is y = 0, south is the bottom edge', () => {
  assert.equal(touchesSide(room('a', 0, 4, 3, 3), plan, 'south'), true);
  assert.equal(touchesSide(room('a', 0, 4, 3, 2), plan, 'south'), false);
  assert.equal(touchesSide(room('a', 0, 0, 3, 2), plan, 'north'), true);
  assert.equal(touchesSide(room('a', 7, 0, 3, 2), plan, 'east'), true);
  assert.equal(touchesSide(room('a', 1, 0, 3, 2), plan, 'west'), false);
});

test('canPlace rejects overlaps and rooms outside the plan', () => {
  const layout = [room('a', 0, 0, 3, 3), room('b', 5, 0, 2, 2)];
  assert.equal(canPlace(layout, 'a', { x: 2, y: 0, width: 3, depth: 3 }, plan), true);
  assert.equal(canPlace(layout, 'a', { x: 3, y: 0, width: 3, depth: 3 }, plan), false);
  assert.equal(canPlace(layout, 'a', { x: 8, y: 0, width: 3, depth: 3 }, plan), false);
  assert.equal(canPlace(layout, 'a', { x: -1, y: 0, width: 3, depth: 3 }, plan), false);
  assert.equal(canPlace(layout, 'a', { x: 7, y: 4, width: 3, depth: 3 }, plan), true);
});

test('clampPosition keeps the room inside without resizing it', () => {
  assert.deepEqual(clampPosition({ x: 9, y: -2, width: 3, depth: 2 }, plan), { x: 7, y: 0, width: 3, depth: 2 });
});

test('adjacency constraints respect min_shared', () => {
  const layout = [room('a', 0, 0, 3, 3), room('b', 3, 2, 2, 2)];
  const label = { fr: '', en: '' };
  assert.equal(checkConstraint({ type: 'adjacent', rooms: ['a', 'b'], label }, layout, plan), true);
  assert.equal(checkConstraint({ type: 'adjacent', rooms: ['a', 'b'], min_shared: 2, label }, layout, plan), false);
  assert.equal(checkConstraint({ type: 'not_adjacent', rooms: ['a', 'b'], label }, layout, plan), false);
  assert.equal(checkConstraint({ type: 'max_area', room: 'b', value: 4, label }, layout, plan), true);
  assert.equal(checkConstraint({ type: 'min_area', room: 'missing', value: 1, label }, layout, plan), false);
});

const game = YAML.parse(readFileSync(new URL('../activities/tetris-architectural.yaml', import.meta.url), 'utf8')) as FloorplanActivity;
const { constraints, parameters } = game;

test('Tetris architectural: the initial layout is valid but unsolved', () => {
  const result = evaluate(constraints, initialLayout(parameters.rooms), parameters.plan);
  assert.equal(result.inside, true);
  assert.equal(result.noOverlap, true);
  assert.equal(result.solved, false);
});

test('Tetris architectural: several different layouts are accepted', () => {
  const solutions: PlacedRoom[][] = [
    [room('living', 0, 3, 6, 4), room('kitchen', 6, 4, 4, 3), room('bedroom', 0, 0, 4, 3), room('bathroom', 4, 0, 2, 3)],
    // mirrored
    [room('living', 4, 3, 6, 4), room('kitchen', 0, 4, 4, 3), room('bedroom', 6, 0, 4, 3), room('bathroom', 4, 0, 2, 3)],
    // kitchen above the living room, night zone on the right
    [room('living', 0, 3, 5, 4), room('kitchen', 0, 0, 4, 3), room('bedroom', 6, 4, 4, 3), room('bathroom', 7, 1, 3, 3)],
  ];
  for (const layout of solutions) assert.equal(evaluate(constraints, layout, parameters.plan).solved, true, JSON.stringify(layout));
});

test('Tetris architectural: a bedroom next to the kitchen fails', () => {
  const layout = [room('living', 0, 3, 6, 4), room('kitchen', 6, 4, 4, 3), room('bedroom', 6, 0, 4, 4), room('bathroom', 4, 0, 2, 3)];
  const result = evaluate(constraints, layout, parameters.plan);
  assert.equal(result.solved, false);
  const notAdjacent = constraints.findIndex(c => c.type === 'not_adjacent');
  assert.equal(result.constraints[notAdjacent], false);
});
