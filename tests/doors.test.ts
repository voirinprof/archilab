import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { CIRCULATION, OUTSIDE, doorLinks, evaluate, initialLayout, reachableSpaces, spaceAt, spacesOf, wallSegments } from '../src/engines/floorplan/rules.ts';
import type { FloorplanActivity, PlacedRoom } from '../src/engines/floorplan/types.ts';

const game = YAML.parse(readFileSync(new URL('../activities/ou-mettre-la-porte.yaml', import.meta.url), 'utf8')) as FloorplanActivity;
const { plan, rooms } = game.parameters;
const layout = initialLayout(rooms);
const solved = (doors: string[]) => evaluate(game.constraints, layout, plan, { doors }).solved;
const failing = (doors: string[]) => {
  const result = evaluate(game.constraints, layout, plan, { doors });
  return game.constraints.filter((_, i) => !result.constraints[i]).map(c => c.type);
};

test('spaceAt: rooms, circulation and outside', () => {
  assert.equal(spaceAt(layout, plan, 0, 0), 'bedroom');
  assert.equal(spaceAt(layout, plan, 4, 1), CIRCULATION);
  assert.equal(spaceAt(layout, plan, -1, 1), OUTSIDE);
  assert.equal(spaceAt(layout, plan, 10, 1), OUTSIDE);
  assert.deepEqual(spacesOf(layout, plan).sort(), ['bathroom', 'bedroom', CIRCULATION, 'kitchen', 'living']);
});

test('wallSegments: only between different spaces, 1 m long, with façade side', () => {
  const segments = wallSegments(layout, plan);
  const byKey = new Map(segments.map(s => [s.key, s]));
  assert.deepEqual(byKey.get('v:4:0'), { key: 'v:4:0', x1: 4, y1: 0, x2: 4, y2: 1, a: 'bedroom', b: CIRCULATION, side: undefined });
  assert.equal(byKey.get('h:4:0')?.side, 'north');
  assert.equal(byKey.get('h:4:0')?.a, OUTSIDE);
  assert.equal(byKey.has('h:4:1'), false, 'no wall inside the hallway');
  assert.equal(byKey.has('v:1:5'), false, 'no wall inside the living room');
  // perimeter (2 × (10 + 7)) + interior walls (4 + 2 + 2 + 4 + 4 + 2 + 4 + 0 = 18 between spaces)
  const exterior = segments.filter(s => s.side).length;
  assert.equal(exterior, 34);
  assert.equal(segments.length - exterior, 4 + 2 + 2 + 4 + 2 + 4 + 4);
});

test('reachableSpaces follows doors and can avoid a room', () => {
  const pieces: PlacedRoom[] = [{ id: 'a', x: 0, y: 0, width: 2, depth: 2 }, { id: 'b', x: 2, y: 0, width: 2, depth: 2 }];
  const small = { width: 4, depth: 2 };
  const doors = doorLinks(pieces, small, ['v:0:0', 'v:2:1']);
  assert.deepEqual([...reachableSpaces(doors)].sort(), ['a', 'b', OUTSIDE]);
  assert.deepEqual([...reachableSpaces(doors, 'a')], [OUTSIDE]);
});

test('Où mettre la porte : no doors means nothing is solved', () => {
  assert.equal(solved([]), false);
  assert.deepEqual(failing([]), ['entrance', 'all_reachable', 'reachable_avoiding', 'reachable_avoiding', 'door_between']);
});

test('Où mettre la porte : several door plans are accepted', () => {
  // living room from the hallway, kitchen through the living room
  assert.equal(solved(['h:4:0', 'v:4:1', 'v:6:0', 'h:4:4', 'h:8:4']), true);
  // other pieces of wall
  assert.equal(solved(['h:5:0', 'v:4:2', 'v:6:1', 'h:5:4', 'h:7:4']), true);
  // garden door on the south façade of the living room
  assert.equal(solved(['h:4:0', 'v:4:0', 'v:6:1', 'h:6:4', 'h:3:7']), true);
});

test('Où mettre la porte : each rule can fail on its own', () => {
  const base = ['h:4:0', 'v:4:1', 'v:6:0', 'h:4:4', 'h:8:4'];
  // entering through the bedroom: everything is reachable, but only by crossing the bedroom
  assert.deepEqual(failing(['h:0:0', ...base.slice(1)]), ['entrance', 'reachable_avoiding']);
  // living room reached only through the kitchen
  assert.deepEqual(failing(['h:4:0', 'v:4:1', 'v:6:0', 'v:6:3', 'h:8:4']), ['reachable_avoiding']);
  assert.deepEqual(failing(['h:4:0', 'h:1:4', 'v:6:0', 'h:4:4', 'h:8:4']), ['no_door_between']);
  assert.deepEqual(failing(['h:4:0', 'v:4:1', 'h:7:2', 'h:4:4', 'h:8:4']), ['no_door_between']);
  assert.deepEqual(failing(['h:4:0', 'v:4:1', 'v:6:0', 'h:4:4', 'v:6:3']), ['door_between']);
  assert.deepEqual(failing([...base, 'h:5:0']), ['max_doors']);
  assert.deepEqual(failing(['h:4:0', 'v:4:1', 'v:6:0', 'h:8:4']), ['all_reachable', 'reachable_avoiding']);
});
