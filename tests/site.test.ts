import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { buildableZone, canPlace, closestPoints, contextRects, coverage, dimensionLines, distanceToSide, evaluate, gap, initialLayout } from '../src/engines/floorplan/rules.ts';
import type { FloorplanActivity, PlacedRoom } from '../src/engines/floorplan/types.ts';

const lot = { width: 26, depth: 20 };
const house = (x: number, y: number, width: number, depth: number): PlacedRoom => ({ id: 'house', x, y, width, depth });

test('distanceToSide measures the gap to each lot line', () => {
  const r = house(3, 6, 10, 8);
  assert.equal(distanceToSide(r, lot, 'north'), 6);
  assert.equal(distanceToSide(r, lot, 'south'), 6);
  assert.equal(distanceToSide(r, lot, 'west'), 3);
  assert.equal(distanceToSide(r, lot, 'east'), 13);
});

test('gap: side by side, diagonal, touching and overlapping', () => {
  const a = house(0, 0, 4, 4);
  assert.equal(gap(a, { x: 7, y: 1, width: 2, depth: 2 }), 3);
  assert.equal(gap(a, { x: 7, y: 8, width: 1, depth: 1 }), 5); // 3-4-5 triangle
  assert.equal(gap(a, { x: 4, y: 0, width: 1, depth: 1 }), 0);
  assert.equal(gap(a, { x: 2, y: 2, width: 4, depth: 4 }), 0);
  assert.deepEqual(closestPoints(a, { x: 7, y: 1, width: 2, depth: 2 }), [[4, 2], [7, 2]]);
});

test('coverage is the built share of the lot', () => {
  assert.equal(coverage([house(0, 0, 13, 8)], lot), 104 / 520);
});

test('canPlace refuses to build on an obstacle', () => {
  const tree = { x: 4, y: 18, width: 1, depth: 1 };
  assert.equal(canPlace([house(0, 0, 4, 4)], 'house', house(3, 15, 4, 4), lot, [tree]), false);
  assert.equal(canPlace([house(0, 0, 4, 4)], 'house', house(5, 15, 4, 4), lot, [tree]), true);
});

const game = YAML.parse(readFileSync(new URL('../activities/attention-aux-voisins.yaml', import.meta.url), 'utf8')) as FloorplanActivity;
const { plan, rooms, context: contextSpecs } = game.parameters;
const context = contextRects(contextSpecs);
const failing = (layout: PlacedRoom[]) => {
  const result = evaluate(game.constraints, layout, plan, { context: contextSpecs });
  return game.constraints.filter((_, i) => !result.constraints[i]).map(c => c.label.en.split(':')[0].split(' (')[0]);
};
const solved = (layout: PlacedRoom[]) => evaluate(game.constraints, layout, plan, { context: contextSpecs }).solved;

test('Attention aux voisins : the starting house is on the lot but breaks the rules', () => {
  const result = evaluate(game.constraints, initialLayout(rooms), plan, { context: contextSpecs });
  assert.equal(result.inside && result.noOverlap, true);
  assert.equal(result.solved, false);
  assert.equal(failing(initialLayout(rooms)).length, 4);
});

test('Attention aux voisins : several houses are accepted', () => {
  assert.equal(solved([house(3, 6, 14, 7)]), true); // wide and shallow, 98 m²
  assert.equal(solved([house(6, 6, 13, 7)]), true); // shifted east, 91 m²
  assert.equal(solved([house(9, 6, 10, 9)]), true); // deep, on the right of the oak (diagonal: exactly 5 m), 90 m²
  assert.equal(solved([house(3, 6, 15, 6)]), true); // long and narrow, 90 m²
});

test('Attention aux voisins : each rule can fail on its own', () => {
  assert.deepEqual(failing([house(3, 5, 14, 7)]), ['Front setback']);
  assert.deepEqual(failing([house(2, 6, 14, 7)]), ['Side setbacks']);
  assert.deepEqual(failing([house(10, 7, 9, 10)]), ['Rear setback']);
  assert.deepEqual(failing([house(6, 6, 13, 8)]), ['At least 5 m between the house and the oak\'s trunk, to protect its roots.']);
  assert.deepEqual(failing([house(7, 6, 13, 7)]), ['At least 8 m from the neighbours\' house, to preserve their light and privacy.']);
  assert.deepEqual(failing([house(3, 6, 12, 7)]), ['The house is at least 90 m²']);
  assert.deepEqual(failing([house(3, 6, 16, 7)]), ['Site coverage']);
});

test('dimension lines follow every distance rule and flag the bad ones', () => {
  const lines = dimensionLines(game.constraints, [house(3, 5, 14, 7)], plan, context);
  assert.equal(lines.length, 6); // north, west, east, south, oak, neighbour
  assert.deepEqual(lines[0], { kind: 'setback', from: [10, 5], to: [10, 0], value: 5, ok: false });
  assert.equal(lines.filter(l => !l.ok).length, 1);
});

test('the revealed zone matches the setbacks and avoids the oak and the neighbours', () => {
  const { zone, halos } = buildableZone(game.constraints, 'house', plan, context);
  assert.deepEqual(zone, { x: 3, y: 6, width: 20, depth: 9 });
  assert.deepEqual(halos.map(h => h.radius), [5, 8]);
});
