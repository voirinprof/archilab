import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { analyse, canAddBar, compressionCapacity, evaluateTruss } from '../src/engines/truss/rules.ts';
import type { Bar, TrussActivity } from '../src/engines/truss/types.ts';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const limits = { load: 10, tensionLimit: 100, compressionLimit: 100 };

test('a loaded triangle: both legs pushed, forces from statics', () => {
  const bars: Bar[] = [[[0, 0], [1, 1]], [[1, 1], [2, 0]]];
  const a = analyse({ bars, supports: [[0, 0], [2, 0]], loads: [[1, 1]], ...limits });
  assert.ok(a.stable);
  // each leg at 45° carries 10 / (2 sin 45°) = 7.07 kN in compression
  for (const r of a.bars) near(r.force, -10 / (2 * Math.SQRT1_2));
});

test('a hanging load pulls the bars (tension)', () => {
  const a = analyse({ bars: [[[0, 0], [1, -1]], [[1, -1], [2, 0]]], supports: [[0, 0], [2, 0]], loads: [[1, -1]], ...limits });
  assert.ok(a.stable && a.bars.every(r => r.force > 0));
});

test('a square frame is a mechanism, its diagonal makes it rigid', () => {
  const square: Bar[] = [[[0, 0], [0, 1]], [[0, 1], [1, 1]], [[1, 1], [1, 0]]];
  const a = analyse({ bars: square, supports: [[0, 0], [1, 0]], loads: [[0, 1]], ...limits });
  assert.equal(a.stable, false);
  assert.deepEqual(!a.stable && a.loose.map(p => p.join(',')).sort(), ['0,1', '1,1']);
  assert.equal(analyse({ bars: [...square, [[0, 0], [1, 1]]], supports: [[0, 0], [1, 0]], loads: [[0, 1]], ...limits }).stable, true);
});

test('long bars buckle sooner: compression strength falls with the square of the length', () => {
  assert.equal(compressionCapacity([[0, 0], [1, 0]], 80), 80);
  assert.equal(compressionCapacity([[0, 0], [2, 0]], 80), 20);
  assert.equal(canAddBar([[1, 0], [3, 1]], [], { x: [1, 7], y: [-2, 3] }, 2.3), true); // √5 ≈ 2.24
  assert.equal(canAddBar([[1, 0], [4, 0]], [], { x: [1, 7], y: [-2, 3] }, 2.3), false);
  assert.equal(canAddBar([[1, 0], [1, 4]], [], { x: [1, 7], y: [-2, 3] }, 9), false); // outside the grid
});

const game = YAML.parse(readFileSync(new URL('../activities/le-pont-impossible.yaml', import.meta.url), 'utf8')) as TrussActivity;
const P = game.parameters;
const run = (bars: Bar[]) => {
  const a = analyse({ bars: [...P.deck, ...bars], supports: P.supports, loads: P.loads, load: P.load, tensionLimit: P.tension_limit, compressionLimit: P.compression_limit });
  return { a, ...evaluateTruss(game.constraints, a, bars.length) };
};
const b = (x1: number, y1: number, x2: number, y2: number): Bar => [[x1, y1], [x2, y2]];
const verticals = (y: number) => [2, 3, 4, 5, 6].map(x => b(x, 0, x, y));
const chord = (y: number) => [1, 2, 3, 4, 5, 6].map(x => b(x, y, x + 1, y));

test('Le pont impossible : the road alone collapses', () => {
  assert.equal(run([]).a.stable, false);
});

test('Le pont impossible : several bridges hold the truck within the budget', () => {
  const winners: Record<string, Bar[]> = {
    'Pratt truss above': P.pattern!,
    'Warren truss above, with uprights': [b(1, 0, 2, 1), b(2, 1, 3, 0), b(3, 0, 4, 1), b(4, 1, 5, 0), b(5, 0, 6, 1), b(6, 1, 7, 0), ...verticals(1), b(2, 1, 3, 1), b(3, 1, 4, 1), b(4, 1, 5, 1), b(5, 1, 6, 1)],
    'truss under the road': [...chord(-1), ...verticals(-1), b(1, 0, 2, -1), b(2, 0, 3, -1), b(3, 0, 4, -1), b(4, -1, 5, 0), b(5, -1, 6, 0)],
  };
  for (const [name, bars] of Object.entries(winners)) {
    const r = run(bars);
    assert.equal(r.solved, true, `${name}: ${JSON.stringify(r.constraints)} max ${r.a.stable && r.a.maxRatio}`);
  }
});

test('Le pont impossible : a stable but skimpy bridge breaks, a big one is over budget', () => {
  const skimpy = [b(1, 0, 2, 1), b(2, 1, 3, 0), b(3, 0, 4, 1), b(4, 1, 5, 0), b(5, 0, 6, 1), b(6, 1, 7, 0), b(2, 0, 2, 1), b(4, 0, 4, 1), b(6, 0, 6, 1), b(2, 1, 4, 1), b(4, 1, 6, 1)];
  const r = run(skimpy);
  assert.deepEqual(r.constraints, [true, false, true]); // stable, but the 4 m top beams buckle
  const tooMany = [...P.pattern!, b(2, 0, 3, 1), b(3, 0, 4, 1)]; // two extra crossing diagonals: still stable, but 17 beams
  assert.deepEqual(run(tooMany).constraints, [true, true, false]);
});
