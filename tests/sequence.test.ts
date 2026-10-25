import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { countValidOrders, evaluateSequence, hasValidOrder, moveItem, respected, simulate } from '../src/engines/sequence/rules.ts';
import type { Dependency, SequenceActivity } from '../src/engines/sequence/types.ts';

const game = YAML.parse(readFileSync(new URL('../activities/chantier-en-desordre.yaml', import.meta.url), 'utf8')) as SequenceActivity;
const { steps, dependencies, initial_order: initialOrder } = game.parameters;
const ids = steps.map(s => s.id);
const reason = { fr: 'r', en: 'r' };

test('moveItem moves one item and shifts the others, ignoring moves out of the list', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
  const list = ['a', 'b'];
  assert.equal(moveItem(list, 0, -1), list);
  assert.equal(moveItem(list, 1, 2), list);
});

test('simulate stops at the first step whose prerequisite is not finished, with that dependency', () => {
  const deps: Dependency[] = [{ before: 'a', after: 'b', reason }, { before: 'b', after: 'c', reason }];
  assert.deepEqual(simulate(['a', 'b', 'c'], deps), { done: 3, blockedBy: null });
  const stuck = simulate(['a', 'c', 'b'], deps);
  assert.equal(stuck.done, 1);
  assert.equal(stuck.blockedBy, deps[1]);
  assert.deepEqual(respected(['a', 'c', 'b'], deps), [true, false]);
});

test('a cycle leaves no valid order', () => {
  const deps: Dependency[] = [{ before: 'a', after: 'b', reason }, { before: 'b', after: 'a', reason }];
  assert.equal(hasValidOrder(['a', 'b'], deps), false);
  assert.equal(countValidOrders(['a', 'b'], deps), 0);
});

test('building site: several schedules are right (windows, plumbing and electrics in any order)', () => {
  assert.equal(hasValidOrder(ids, dependencies), true);
  assert.equal(countValidOrders(ids, dependencies), 6);
  const base = ['permis', 'terrassement', 'fondations', 'dalle', 'murs', 'toiture'];
  for (const middle of [['menuiseries', 'plomberie', 'electricite'], ['electricite', 'plomberie', 'menuiseries']]) {
    const order = [...base, ...middle, 'isolation', 'finitions'];
    assert.deepEqual(simulate(order, dependencies), { done: 11, blockedBy: null });
    assert.equal(evaluateSequence(game.constraints, order, dependencies).solved, true);
  }
});

test('building site: the scrambled start is wrong and stops at once, explaining why', () => {
  assert.equal(evaluateSequence(game.constraints, initialOrder, dependencies).solved, false);
  assert.equal(respected(initialOrder, dependencies).filter(Boolean).length, 6);
  const run = simulate(initialOrder, dependencies);
  assert.equal(run.done, 0);
  assert.equal(run.blockedBy?.after, 'finitions');
  assert.equal(run.blockedBy?.before, 'isolation');
});

test('building site: classic mistakes are caught with their reason', () => {
  const good = ['permis', 'terrassement', 'fondations', 'dalle', 'murs', 'toiture', 'menuiseries', 'plomberie', 'electricite', 'isolation', 'finitions'];
  // insulating before the cables are in
  const early = moveItem(good, good.indexOf('isolation'), good.indexOf('electricite'));
  assert.deepEqual([simulate(early, dependencies).blockedBy?.before, simulate(early, dependencies).blockedBy?.after], ['electricite', 'isolation']);
  // a roof with no walls
  const roofFirst = moveItem(good, good.indexOf('toiture'), good.indexOf('murs'));
  assert.equal(simulate(roofFirst, dependencies).blockedBy?.after, 'toiture');
  // digging before the permit
  assert.equal(simulate(moveItem(good, 0, 1), dependencies).blockedBy?.before, 'permis');
});
