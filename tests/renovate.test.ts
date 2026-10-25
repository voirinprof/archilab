import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import {
  canEditDoor, canEditWall, evaluateRenovate, hasDoor, makeBuilding, noWorks, runSegments, spaceUse, spaces, toggleDoor, toggleWall, wallKind, worksCost,
} from '../src/engines/floorplan/renovate.ts';
import type { Usage } from '../src/engines/floorplan/renovate.ts';
import type { RenovateActivity, Works } from '../src/engines/floorplan/types.ts';

const game = YAML.parse(readFileSync(new URL('../activities/le-batiment-transformable.yaml', import.meta.url), 'utf8')) as RenovateActivity;
const b = makeBuilding(game.parameters);
const { costs } = game.parameters;

test('runSegments cuts a run into 1 m pieces', () => {
  assert.deepEqual(runSegments([[3, 0], [3, 3]]), ['v:3:0', 'v:3:1', 'v:3:2']);
  assert.deepEqual(runSegments([[2, 4], [0, 4]]), ['h:0:4', 'h:1:4']);
});

test('fixed walls cannot be touched, partitions can', () => {
  assert.equal(wallKind(b, noWorks(), 'h:0:3'), 'bearing');
  assert.equal(wallKind(b, noWorks(), 'v:8:5'), 'water');
  assert.equal(canEditWall(b, 'h:0:3'), false);
  assert.equal(canEditWall(b, 'v:0:5'), false); // outer wall
  assert.equal(canEditWall(b, 'v:3:1'), true);
  assert.equal(canEditWall(b, 'v:2:1'), true); // empty line: a new wall can go there
  assert.equal(canEditDoor(b, noWorks(), 'h:1:3'), false); // door in the load-bearing wall stays as it is
});

test('a demolished wall takes its door with it, and works are priced', () => {
  let w = toggleDoor(b, noWorks(), 'h:5:4');
  assert.equal(hasDoor(b, w, 'h:5:4'), true);
  w = toggleWall(b, w, 'h:5:4');
  assert.deepEqual(w, { removed: ['h:5:4'], added: [], doorFlips: [] });
  w = toggleWall(b, w, 'v:2:1');
  assert.equal(worksCost(w, costs), 1 + 2);
  assert.deepEqual(toggleWall(b, toggleWall(b, w, 'v:2:1'), 'h:5:4'), noWorks());
});

test('the existing building has 7 rooms', () => {
  const areas = spaces(b, noWorks()).map(s => s.area).sort((x, y) => x - y);
  assert.deepEqual(areas, [6, 6, 9, 9, 10, 12, 18]);
});

/** Gives each room the use listed for one of its cells. */
function usageFor(works: Works, uses: Record<string, string>): Usage {
  const usage: Usage = {};
  for (const s of spaces(b, works)) {
    const use = Object.entries(uses).find(([cell]) => s.cells.some(([x, y]) => `${x},${y}` === cell))?.[1];
    if (use) for (const [x, y] of s.cells) usage[`${x},${y}`] = use;
  }
  return usage;
}
const home = { '1,1': 'bedroom', '4,1': 'bedroom', '8,1': 'bedroom', '0,3': 'hall', '8,3': 'hall', '3,5': 'living', '7,5': 'bathroom', '9,5': 'kitchen' };
const evaluate = (works: Works, uses: Record<string, string>) => evaluateRenovate(game.constraints, { building: b, works, usage: usageFor(works, uses), costs });
const failing = (works: Works, uses: Record<string, string>) => game.constraints.filter((_, i) => !evaluate(works, uses).constraints[i]).map(c => c.type);

const solutions: [string, Works, Record<string, string>][] = [
  ['a piece of corridor joins the living room', { removed: ['h:5:4'], added: ['v:5:3', 'v:7:3'], doorFlips: ['v:7:3'] }, home],
  ['the toilets partition moves 1 m east', { removed: ['v:6:4', 'v:6:5', 'v:6:6'], added: ['v:7:4', 'v:7:5', 'v:7:6'], doorFlips: [] }, home],
  ['two cells of the old toilets join the living room', { removed: ['v:6:4', 'v:6:5'], added: ['v:7:4', 'v:7:5', 'h:6:6'], doorFlips: [] }, home],
  ['living room upstairs, two bedrooms in the open-plan office', { removed: ['v:6:0', 'v:6:1', 'v:6:2'], added: ['v:3:4', 'v:3:5', 'v:3:6'], doorFlips: ['h:4:4'] },
    { '1,1': 'bedroom', '4,1': 'living', '0,3': 'hall', '1,5': 'bedroom', '4,5': 'bedroom', '7,5': 'bathroom', '9,5': 'kitchen' }],
];

test('Le bâtiment transformable : nothing works without building work', () => {
  assert.deepEqual(failing(noWorks(), home), ['use_min_area']); // the old open-plan office is 18 m², not 20
});

test('Le bâtiment transformable : several strategies win', () => {
  for (const [name, works, uses] of solutions) assert.equal(evaluate(works, uses).solved, true, name);
  const cheapest = Math.min(...solutions.map(([, w]) => worksCost(w, costs)));
  assert.equal(cheapest, game.parameters.good_cost, 'good_cost must be reachable');
});

test('Le bâtiment transformable : each rule can fail', () => {
  // opening the old open-plan office onto the corridor: the bedrooms now open onto the living room
  assert.deepEqual(failing({ removed: ['h:2:4'], added: [], doorFlips: [] }, { ...home, '0,3': 'living' }), ['no_door_between_uses']);
  // a 1 m² "bathroom" squeezed against the pipes
  const tiny: Works = { removed: ['v:6:6'], added: ['v:7:4', 'h:7:5'], doorFlips: [] };
  assert.deepEqual(failing(tiny, { ...home, '7,4': 'bathroom', '3,5': 'living' }), ['use_min_area']);
  const [, corridor] = solutions[0];
  assert.deepEqual(failing(corridor, { ...home, '9,5': 'storage' }), ['use_min_area', 'use_touches_water']); // no kitchen any more: neither its size nor its pipes can be checked
  assert.deepEqual(failing(corridor, { ...home, '8,3': 'bedroom' }).includes('reachable_avoiding_use'), true); // the way to the bathroom crosses a "bedroom"
  const { '8,3': _east, ...unnamed } = home;
  assert.deepEqual(failing(corridor, unnamed), ['all_assigned']);
  assert.deepEqual(failing({ ...corridor, doorFlips: [] }, home), ['reachable_avoiding_use', 'all_reachable']); // no door through the new wall
  const expensive: Works = { ...corridor, added: [...corridor.added, 'v:1:5', 'v:1:6', 'h:0:5', 'h:1:6'] }; // useless extra walls: 6 + 4 × 2 = 14
  assert.ok(failing(expensive, home).includes('max_cost'));
  assert.equal(spaceUse(spaces(b, noWorks())[0], usageFor(noWorks(), home)), 'bedroom');
});
