import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { evaluateCarbon, footprint, initialDesign } from '../src/engines/carbon/rules.ts';
import type { CarbonActivity, Design } from '../src/engines/carbon/types.ts';

const game = YAML.parse(readFileSync(new URL('../activities/mission-carbone.yaml', import.meta.url), 'utf8')) as CarbonActivity;
const p = game.parameters;
const good: Design = { shape: 'compact', structure: 'wood', insulation: 'biobased', thickness: 30, glazing: 20, windows: 'triple', heating: 'heat-pump' };
const fp = (d: Partial<Design>) => footprint(p, { ...good, ...d });

test('physics: more insulation, a compact shape and better windows lower the heating need', () => {
  assert.ok(fp({ thickness: 40 }).heatingNeed < fp({ thickness: 20 }).heatingNeed);
  assert.ok(fp({ shape: 'compact' }).heatingNeed < fp({ shape: 'long' }).heatingNeed);
  assert.ok(fp({ windows: 'triple' }).heatingNeed < fp({ windows: 'double' }).heatingNeed);
});

test('carbon: a heat pump divides the heating emissions of electric heaters by its efficiency; timber emits less than concrete', () => {
  const electric = fp({ heating: 'electric' }).operational, pump = fp({ heating: 'heat-pump' }).operational;
  assert.ok(Math.abs(electric / pump - 3) < 1e-9);
  assert.ok(fp({ structure: 'wood' }).embodied.structure < fp({ structure: 'concrete' }).embodied.structure);
  // more glass lets in sun, but the free gains are capped
  const f = fp({ glazing: 40, thickness: 5, windows: 'double' });
  assert.ok(f.heatingNeed > 0);
});

test('Mission carbone : the starting house is far over the target, the hinted design meets it', () => {
  const start = evaluateCarbon(game.constraints, p, initialDesign(p));
  assert.ok(start.footprint.total / 1000 > 350 && start.footprint.total / 1000 < 400, `start ${start.footprint.total}`);
  assert.deepEqual(start.constraints, [false, false, false, true]);
  assert.equal(evaluateCarbon(game.constraints, p, good).solved, true);
});

test('Mission carbone : many different designs win, but none with concrete, steel or gas', () => {
  const range = (s: { min: number; max: number; step: number }) => Array.from({ length: Math.round((s.max - s.min) / s.step) + 1 }, (_, i) => s.min + i * s.step);
  const winners: Design[] = [];
  for (const shape of p.shapes) for (const structure of p.structures) for (const insulation of p.insulations) for (const thickness of range(p.thickness))
    for (const glazing of range(p.glazing)) for (const windows of p.windows) for (const heating of p.heatings) {
      const d = { shape: shape.id, structure: structure.id, insulation: insulation.id, thickness, glazing, windows: windows.id, heating: heating.id };
      if (evaluateCarbon(game.constraints, p, d).solved) winners.push(d);
    }
  assert.ok(winners.length > 100, `${winners.length} winners`);
  const used = (k: keyof Design) => new Set(winners.map(w => String(w[k])));
  assert.equal(used('shape').size, 3);
  assert.equal(used('heating').size, 3);
  for (const never of ['concrete', 'steel']) assert.ok(!used('structure').has(never));
  assert.ok(!used('heating').has('gas'));
});

test('Mission carbone : each rule can fail on its own', () => {
  const fails = (d: Partial<Design>) => evaluateCarbon(game.constraints, p, { ...good, ...d }).constraints.map(ok => !ok);
  assert.deepEqual(fails({ glazing: 10 }), [false, false, false, true]); // too dark
  assert.deepEqual(fails({ structure: 'concrete' }), [false, true, false, false]); // the materials alone are over 25 t
  assert.deepEqual(fails({ thickness: 15 }), [false, false, true, false]); // still low-carbon, but too much heating
  assert.deepEqual(fails({ heating: 'gas', thickness: 40 }), [true, false, false, false]); // a frugal house heated with gas
});
