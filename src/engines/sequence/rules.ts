import type { Dependency, SequenceConstraint } from './types.ts';

/** Moves the item at `from` to position `to`, shifting the others. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Dependencies respected by an order: the `before` step comes earlier than the `after` step. */
export function respected(order: string[], deps: Dependency[]): boolean[] {
  return deps.map(d => order.indexOf(d.before) < order.indexOf(d.after));
}

/**
 * Runs the building site in this order: each step can be done only if all of its prerequisites are done.
 * Returns how many steps were completed and, if the site stopped, the step that couldn't start and why.
 */
export function simulate(order: string[], deps: Dependency[]): { done: number; blockedBy: Dependency | null } {
  const finished = new Set<string>();
  for (let i = 0; i < order.length; i++) {
    const missing = deps.find(d => d.after === order[i] && !finished.has(d.before));
    if (missing) return { done: i, blockedBy: missing };
    finished.add(order[i]);
  }
  return { done: order.length, blockedBy: null };
}

/** True when the dependencies allow at least one order (no cycle). */
export function hasValidOrder(steps: string[], deps: Dependency[]): boolean {
  const remaining = new Set(steps);
  while (remaining.size) {
    const ready = [...remaining].find(s => deps.every(d => d.after !== s || !remaining.has(d.before)));
    if (!ready) return false;
    remaining.delete(ready);
  }
  return true;
}

/** Number of valid orders (linear extensions), counted over subsets of finished steps: fine for a dozen steps. */
export function countValidOrders(steps: string[], deps: Dependency[]): number {
  const index = new Map(steps.map((s, i) => [s, i]));
  const prereq = steps.map(s => deps.filter(d => d.after === s).reduce((mask, d) => mask | (1 << index.get(d.before)!), 0));
  const ways = new Float64Array(1 << steps.length);
  ways[0] = 1;
  for (let mask = 0; mask < ways.length; mask++) {
    if (!ways[mask]) continue;
    steps.forEach((_, i) => {
      if (!(mask & (1 << i)) && (prereq[i] & mask) === prereq[i]) ways[mask | (1 << i)] += ways[mask];
    });
  }
  return ways[ways.length - 1];
}

export function evaluateSequence(constraints: SequenceConstraint[], order: string[], deps: Dependency[]) {
  const results = constraints.map(() => respected(order, deps).every(Boolean));
  return { constraints: results, solved: results.every(Boolean) };
}
