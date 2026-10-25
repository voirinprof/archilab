import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { canPlace, check, evaluateCity, expectedPlan, footprint, place, relocate, remove, roadDirs, rotateDirs, solutionOf, elementOf } from '../src/engines/isocity/rules.ts';
import { behind, drawOrder, fromScreen, toScreen, TILE_H, TILE_W } from '../src/engines/isocity/iso.ts';
import type { IsoCityActivity, Placed } from '../src/engines/isocity/types.ts';

const game = YAML.parse(readFileSync(new URL('../activities/quartier-des-tilleuls.yaml', import.meta.url), 'utf8')) as IsoCityActivity;
const sc = game.parameters;
const constraint = (id: string) => game.constraints.find(c => c.id === id)!;
let uid = 1000;
const at = (element: string, x: number, y: number, rotation: Placed['rotation'] = 0): Placed => ({ uid: uid++, element, x, y, rotation });

test('isometric projection: grid → screen follows the formula and goes back exactly', () => {
  assert.deepEqual(toScreen(1, 0), [TILE_W / 2, TILE_H / 2]);
  assert.deepEqual(toScreen(0, 1), [-TILE_W / 2, TILE_H / 2]);
  assert.deepEqual(toScreen(3, 5), [(3 - 5) * TILE_W / 2, (3 + 5) * TILE_H / 2]);
  for (const [x, y] of [[0, 0], [2.5, 7.25], [11, 3]]) {
    const [gx, gy] = fromScreen(...toScreen(x, y));
    assert.ok(Math.abs(gx - x) < 1e-9 && Math.abs(gy - y) < 1e-9);
  }
  // the centre of a cell on screen is picked back as that same cell
  const [sx, sy] = toScreen(4.5, 6.5);
  assert.deepEqual(fromScreen(sx, sy).map(Math.floor), [4, 6]);
});

test('rotation turns road connections clockwise and swaps width and depth', () => {
  assert.deepEqual(rotateDirs(['n', 'e'], 90), ['e', 's']);
  assert.deepEqual(rotateDirs(['e', 's', 'w'], 90), ['n', 's', 'w']);
  assert.deepEqual(rotateDirs(['n', 's'], 270), ['e', 'w']);
  const school = elementOf(sc, 'school');
  assert.deepEqual(footprint(school, { x: 1, y: 2, rotation: 0 }), { x: 1, y: 2, w: 3, d: 2 });
  assert.deepEqual(footprint(school, { x: 1, y: 2, rotation: 90 }), { x: 1, y: 2, w: 2, d: 3 });
});

test('drawing order: whatever stands behind is always drawn first, whatever the sizes', () => {
  const boxes = [
    { x: 1, y: 8, w: 3, d: 2 }, { x: 3, y: 7, w: 1, d: 1 }, { x: 4, y: 6, w: 1, d: 1 }, { x: 6, y: 3, w: 1, d: 2 },
    { x: 5, y: 5, w: 1, d: 1 }, { x: 0, y: 10, w: 1, d: 1 }, { x: 4, y: 9, w: 1, d: 1 }, { x: 2, y: 4, w: 2, d: 3 },
  ];
  const order = drawOrder(boxes);
  for (const a of boxes) for (const b of boxes) if (a !== b && behind(a, b)) assert.ok(order.indexOf(a) < order.indexOf(b), `${JSON.stringify(a)} before ${JSON.stringify(b)}`);
  // a long block on the west side is behind a small house further east even though x + y says otherwise
  const long = { x: 0, y: 0, w: 1, d: 6 }, house = { x: 1, y: 0, w: 1, d: 1 };
  assert.deepEqual(drawOrder([house, long]), [long, house]);
});

test('placement: no buildings or trees on roads, lights only on junctions, nothing outside', () => {
  const road = [at('road-straight', 4, 4), at('road-cross', 4, 6)];
  assert.deepEqual(canPlace(sc, road, at('house', 4, 4)), { ok: false, reason: 'onRoad' });
  assert.deepEqual(canPlace(sc, road, at('tree', 4, 4)), { ok: false, reason: 'onRoad' });
  assert.deepEqual(canPlace(sc, road, at('traffic-light', 4, 4)), { ok: false, reason: 'needsIntersection' });
  assert.equal(canPlace(sc, road, at('traffic-light', 4, 6)).ok, true);
  assert.deepEqual(canPlace(sc, [], at('school', 10, 0)), { ok: false, reason: 'outside' });
  assert.equal(canPlace(sc, [], at('school', 10, 0, 90)).ok, true);
  // the school overlapping the road, even by one cell
  assert.deepEqual(canPlace(sc, road, at('school', 2, 4)), { ok: false, reason: 'onRoad' });
  // nothing is built on a tree, but a tree can stand on a green space
  const tree = [at('tree', 1, 1)];
  assert.deepEqual(canPlace(sc, tree, at('house', 1, 1)), { ok: false, reason: 'occupied' });
  assert.equal(canPlace(sc, tree, at('green', 1, 1)).ok, true);
  assert.deepEqual(canPlace(sc, [at('house', 2, 2)], at('tree', 2, 2)), { ok: false, reason: 'onBuilding' });
});

test('placement: a road piece replaces another one, and a light it can no longer carry goes away', () => {
  const cross = at('road-cross', 4, 6), light = at('traffic-light', 4, 6), straight = at('road-straight', 4, 5);
  let city = [cross, light, straight];
  city = place(sc, city, at('crosswalk', 4, 5))!;
  assert.equal(city.filter(p => p.x === 4 && p.y === 5).map(p => p.element).join(), 'crosswalk');
  city = place(sc, city, at('road-straight', 4, 6))!;
  assert.equal(city.some(p => p.element === 'traffic-light'), false);
  // removing a junction also removes its traffic light
  const withLight = [cross, light];
  assert.deepEqual(remove(sc, withLight, cross.uid), []);
});

test('moving and rotating: refused when it no longer fits', () => {
  const block = at('apartment', 6, 3, 90), house = at('house', 7, 3);
  const city = [block, house];
  assert.equal(relocate(sc, city, block.uid, { rotation: 0 }), null); // turning it would cover the house
  const moved = relocate(sc, city, block.uid, { x: 8, y: 3 })!;
  assert.deepEqual(moved.find(p => p.uid === block.uid), { ...block, x: 8 });
  assert.equal(relocate(sc, city, block.uid, { x: 11, y: 11 }), null);
});

test('reading the plan: road shapes are worked out from the neighbouring streets', () => {
  const plan = expectedPlan(sc);
  assert.deepEqual(plan[2][4].dirs, ['n', 'e', 's']); // E3: T junction
  assert.deepEqual(plan[6][4].dirs, ['n', 'e', 's', 'w']); // E7: crossroads
  assert.deepEqual(plan[2][10].dirs, ['n', 'w']); // K3: bend
  assert.deepEqual(plan[6][0].dirs, ['e', 'w']); // A7: the street leaves the map
  assert.deepEqual(plan[11][9].dirs, ['n', 's']); // J12
  assert.equal(plan[0][0].road, false);
});

test('Tilleuls: the plan has what the brief asks for, and its solution meets every rule', () => {
  const solution = solutionOf(sc);
  const count = (id: string) => solution.filter(p => p.element === id).length;
  assert.deepEqual([count('house'), count('apartment'), count('school'), count('shop'), count('park'), count('tree'), count('crosswalk'), count('traffic-light')], [6, 2, 1, 2, 1, 6, 3, 2]);
  const junctions = solution.filter(p => elementOf(sc, p.element).kind === 'road' && roadDirs(sc, p).length >= 3);
  assert.ok(junctions.length >= 2);
  assert.equal(evaluateCity(sc, solution, game.constraints).solved, true);
  assert.equal(evaluateCity(sc, [], game.constraints).solved, false);
});

test('Tilleuls: each step is solved by building it, and not before', () => {
  const solution = solutionOf(sc);
  const steps = sc.steps.filter(s => !s.final);
  const plan = expectedPlan(sc);
  // before the safety step, crossings are plain straight roads
  const plain = (p: Placed): Placed => (p.element === 'crosswalk' ? { ...p, element: 'road-straight', rotation: plan[p.y][p.x].dirs.includes('n') ? 0 : 90 } : p);
  steps.forEach((step, k) => {
    const built = new Set(steps.slice(0, k + 1).flatMap(s => s.elements));
    const before = new Set(steps.slice(0, k).flatMap(s => s.elements));
    const upTo = (set: Set<string>) => solution.filter(p => set.has(p.element) || (p.element === 'crosswalk' && set.has('road-straight'))).map(p => (set.has('crosswalk') ? p : plain(p)));
    const checks = step.constraints.map(id => constraint(id));
    assert.equal(evaluateCity(sc, upTo(built), checks).solved, true, `step ${step.id} solved once built`);
    assert.equal(evaluateCity(sc, upTo(before), checks).solved, false, `step ${step.id} not solved before`);
  });
});

test('checks point at the right cells', () => {
  const solution = solutionOf(sc);
  // a T junction turned the wrong way
  const t = solution.find(p => p.element === 'road-t' && p.x === 4 && p.y === 2)!;
  const wrong = solution.map(p => (p === t ? { ...p, rotation: 180 as const } : p));
  assert.deepEqual(check(sc, wrong, constraint('roads-match')).issues, [{ x: 4, y: 2, kind: 'wrong' }]);
  assert.ok(check(sc, wrong, constraint('roads-connected')).issues.length > 0);
  // a missing house and a shop on a house plot
  const house = solution.find(p => p.element === 'house' && p.x === 3 && p.y === 0)!;
  const swapped = solution.map(p => (p === house ? { ...p, element: 'shop' } : p));
  assert.deepEqual(check(sc, swapped, constraint('buildings-match')).issues, [{ x: 3, y: 0, kind: 'wrong' }]);
  const missing = solution.filter(p => p !== house);
  assert.deepEqual(check(sc, missing, constraint('buildings-match')).issues, [{ x: 3, y: 0, kind: 'missing' }]);
  // roads count: every road cell of the plan
  assert.equal(check(sc, [], constraint('roads-match')).total, 36);
  // a lone lawn in the middle of nowhere can't be reached, a lawn next to a reached one can
  const lawns = [at('road-straight', 0, 0), at('green', 1, 0), at('green', 2, 0), at('green', 5, 5)];
  assert.deepEqual(check(sc, lawns, constraint('green-access')).issues, [{ x: 5, y: 5, kind: 'wrong' }]);
  // a single piece of road has open ends, except where it leaves the map
  assert.equal(check(sc, [at('road-straight', 0, 5, 90)], constraint('roads-connected')).ok, false);
  assert.equal(check(sc, [at('road-straight', 4, 0)], constraint('roads-connected')).ok, false);
});
