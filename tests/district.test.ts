import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { canPlace, evaluateDistrict, greenShare, homeAccess, impermeableShare, initialPlots, isNoisy, place, population, walkDistances } from '../src/engines/district/rules.ts';
import type { Plots } from '../src/engines/district/rules.ts';
import type { DistrictActivity } from '../src/engines/district/types.ts';

const game = YAML.parse(readFileSync(new URL('../activities/construis-ton-quartier.yaml', import.meta.url), 'utf8')) as DistrictActivity;
const p = game.parameters;
const codes: Record<string, string | null> = { '.': null, A: 'apartments', H: 'house', S: 'school', C: 'shops', B: 'bus', P: 'park', T: 'trees', '-': 'path', M: 'motorway', '=': 'street' };
const plan = (rows: string[]): Plots => rows.map(r => [...r].map(ch => codes[ch]));
const failing = (rows: string[]) => {
  const r = evaluateDistrict(game.constraints, p, plan(rows));
  return game.constraints.filter((_, i) => !r.constraints[i]).map(c => c.type);
};

test('walking: you go along walkable plots, never through a building', () => {
  const plots = plan(['MMMMMMMMMM', '..........', '..........', 'A.........', 'S=========', '..........', '..........', '..........']);
  const d = walkDistances(p, plots, 'school');
  assert.equal(d[3][0], 1, 'next to the school');
  assert.equal(d[4][9], 9, 'along the street');
  assert.equal(d[3][1], 2, 'empty land next to the street is reached…');
  assert.equal(d[2][1], Infinity, '…but not crossed');
  assert.equal(d[2][0], Infinity, 'behind a building: unreachable');
});

test('noise: a row of trees screens the homes behind it', () => {
  const open = plan(['MMMMMMMMMM', '..........', 'A.........', '..........', '==========', '..........', '..........', '..........']);
  assert.equal(isNoisy(p, open, [0, 2]), true);
  const screened = place(p, open, [0, 1], 'trees');
  assert.equal(isNoisy(p, screened, [0, 2]), false);
  assert.equal(isNoisy(p, open, [0, 3]), false, 'three plots away is quiet');
});

test('placement: a bus stop must touch the street, fixed plots cannot change', () => {
  const plots = initialPlots(p);
  assert.equal(canPlace(p, plots, [3, 3], 'bus'), true);
  assert.equal(canPlace(p, plots, [3, 2], 'bus'), false);
  assert.equal(canPlace(p, plots, [3, 4], 'park'), false);
  assert.equal(canPlace(p, plots, [3, 0], null), false);
});

test('indicators: residents, green share of the free land, sealed share of the whole site', () => {
  const plots = initialPlots(p);
  assert.equal(population(p, plots), 0);
  assert.equal(greenShare(p, plots), 0);
  assert.equal(impermeableShare(p, plots), 20 / 80); // the street and the motorway
});

const winners: Record<string, string[]> = {
  'apartments on footpaths, services in the middle, parks in the corners': [
    'MMMMMMMMMM', 'TTTTTTTTTT', 'PA-AAPA-AP', 'AA-ASCB-AA', '==========', 'AA-AAPA-AA', 'PA-AAPA-AP', 'TTTTTTTTTT'],
  'scattered services (found by a search)': [
    'MMMMMMMMMM', '.S.PCTTCTP', 'T-P-PPCPA-', 'ABAAAASTAA', '==========', 'TAAA-APAPB', 'PPH.TAPAP-', 'PAC-APATAA'],
  'two schools and a green corridor (found by a search)': [
    'MMMMMMMMMM', 'T.-T-TPP--', 'AP-A-APP..', 'PASPPAAAHA', '==========', 'APPACBA-AS', 'SHTAA--TPP', 'TA-HCAAAAA'],
};

test('Construis ton quartier : very different neighbourhoods win', () => {
  for (const [name, rows] of Object.entries(winners)) assert.deepEqual(failing(rows), [], name);
});

test('Construis ton quartier : each rule can fail', () => {
  const [best] = Object.values(winners);
  assert.deepEqual(failing([best[0], best[1], 'PH-HHPH-HP', 'HH-HSCB-HH', best[4], 'HH-HHPH-HH', 'PH-HHPH-HP', best[7]]), ['min_population']); // houses only
  assert.deepEqual(failing([best[0], best[1], 'HA-AAPA-AP', ...best.slice(3)]), ['services_within']); // a home in the far corner
  assert.deepEqual(failing([...best.slice(0, 7), '----------']), ['max_impermeable_share']); // paving the back walk instead of trees
  assert.deepEqual(failing([best[0], 'PPPPPPPPPP', ...best.slice(2)]), ['no_noisy_homes']); // parks instead of trees: just as green, but no screen against the noise
  const empty = evaluateDistrict(game.constraints, p, initialPlots(p));
  assert.equal(empty.solved, false);
  assert.equal(homeAccess(p, initialPlots(p), ['school']).length, 0);
});
