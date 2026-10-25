import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { angleBetween, evaluateSun, facadeAzimuth, rayEntry, shaded, sunHours, sunPosition, toSite } from '../src/engines/sun/rules.ts';
import type { Scene } from '../src/engines/sun/rules.ts';
import type { SunActivity } from '../src/engines/sun/types.ts';

const near = (a: number, b: number, eps = 0.05) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('sun at solar noon: due south, 90° − latitude + declination high', () => {
  const p = sunPosition(45, 'equinox', 12);
  near(p.altitude, 45);
  near(p.azimuth, 180);
  near(sunPosition(45, 'summer', 12).altitude, 68.44);
  near(sunPosition(45, 'winter', 12).altitude, 21.56);
});

test('sun rises in the east at the equinox, morning east of south, afternoon west of south', () => {
  const sunrise = sunPosition(45, 'equinox', 6);
  near(sunrise.altitude, 0);
  near(sunrise.azimuth, 90);
  assert.ok(sunPosition(45, 'summer', 9).azimuth < 180);
  assert.ok(sunPosition(45, 'summer', 15).azimuth > 180);
  assert.ok(sunPosition(45, 'summer', 19).azimuth > 270, 'in summer the sun sets in the north-west');
  assert.ok(sunPosition(45, 'winter', 7).altitude < 0, 'in winter the sun is not up at 7');
});

test('façades turn with the house', () => {
  assert.equal(facadeAzimuth('east', 0), 90);
  assert.equal(facadeAzimuth('east', 45), 135);
  assert.equal(facadeAzimuth('north', -30), 330);
  assert.equal(angleBetween(350, 10), 20);
  const [x, y] = toSite([0, -1], 90, { x: 0, y: 0 }); // the north wall faces east after a quarter turn
  near(x, 1);
  near(y, 0);
});

test('shadow: a tall building between the window and the sun hides it, a low or distant one does not', () => {
  const box = { x: 5, y: -2, width: 4, depth: 4 };
  assert.equal(rayEntry([0, 0], [1, 0], box), 5);
  assert.equal(rayEntry([0, 0], [-1, 0], box), null);
  const lowSunEast = { altitude: 20, azimuth: 90 };
  assert.equal(shaded([0, 0], lowSunEast, [{ id: 'b', label: { fr: '', en: '' }, box, height: 10 }]), true);
  assert.equal(shaded([0, 0], lowSunEast, [{ id: 'b', label: { fr: '', en: '' }, box, height: 2 }]), false);
  assert.equal(shaded([0, 0], { altitude: 70, azimuth: 90 }, [{ id: 'b', label: { fr: '', en: '' }, box, height: 10 }]), false);
});

const game = YAML.parse(readFileSync(new URL('../activities/chasse-au-soleil.yaml', import.meta.url), 'utf8')) as SunActivity;
const P = game.parameters;
const sceneAt = (rotation: number, obstacles = P.obstacles): Scene => ({ latitude: P.latitude, rotation, houseAt: P.house_at, house: P.house, obstacles });
const winners = (obstacles = P.obstacles) => {
  const ok: number[] = [];
  for (let r = 0; r < 360; r += P.rotation_step) if (evaluateSun(game.constraints, sceneAt(r, obstacles)).solved) ok.push(r);
  return ok;
};

test('Chasse au soleil : a few neighbouring orientations win, and the building matters', () => {
  assert.deepEqual(winners(), [15, 30, 45]);
  assert.ok(winners([]).includes(0), 'without the building, the house as drawn would already work');
  assert.equal(evaluateSun(game.constraints, sceneAt(P.initial_rotation)).solved, false);
});

test('Chasse au soleil : with the house as drawn, the building steals the bedroom morning sun', () => {
  const bedroom = P.house.rooms.find(r => r.id === 'bedroom')!;
  assert.equal(sunHours(sceneAt(0, []), bedroom, 'equinox', 6, 10) >= 1, true);
  assert.ok(sunHours(sceneAt(0), bedroom, 'equinox', 6, 10) < 1); // only 45 minutes are left
  const failing = game.constraints.filter((_, i) => !evaluateSun(game.constraints, sceneAt(0)).constraints[i]);
  assert.deepEqual(failing.map(c => `${c.type}:${c.rooms}`), ['min_sun_hours:bedroom']);
});

test('Chasse au soleil : each rule fails for some orientation', () => {
  const failsSomewhere = game.constraints.map((_, i) => {
    for (let r = 0; r < 360; r += P.rotation_step) if (!evaluateSun(game.constraints, sceneAt(r)).constraints[i]) return true;
    return false;
  });
  assert.deepEqual(failsSomewhere, game.constraints.map(() => true));
});
