// Compare mode (M14): pure helpers that put the same month of two scenarios
// side by side. No climate facts here and no new states: the engine's own
// month states are compared as they are.

import type { MonthState, NodeState } from '../types';

/** How a node fares in scenario A against scenario B in the same month.
 *  - none: neither scenario acts on it (nothing applied or pending, value 0)
 *  - same: the same value and the same conflict flag in both
 *  - opposite: pushed both ways, nonzero and of opposite sign
 *  - only_a / only_b: one scenario acts on it, the other does not
 *  - differ: both act on it, but not the same way (applied in one and still
 *    pending in the other, conflicting and cancelled out in one, a driver in
 *    a phase against one with none, ...) */
export type Verdict = 'none' | 'same' | 'opposite' | 'only_a' | 'only_b' | 'differ';

/** Whether a scenario acts on the node this month: it holds a state, or a
 *  link is applied or waiting for its season. */
export function acts(st: NodeState): boolean {
  return st.value !== 0 || st.viaLinkIds.length > 0 || st.pendingLinkIds.length > 0;
}

export function compareNode(a: NodeState, b: NodeState): Verdict {
  const inA = acts(a);
  const inB = acts(b);
  if (!inA && !inB) return 'none';
  if (inA && !inB) return 'only_a';
  if (!inA && inB) return 'only_b';
  if (a.value === b.value && a.conflicting === b.conflicting) return 'same';
  if (a.value !== 0 && b.value !== 0 && Math.sign(a.value) !== Math.sign(b.value)) return 'opposite';
  return 'differ';
}

/** A verdict for every node of either month, in the order of A's nodes then
 *  any B has on top. A node missing from one side counts as not acted on. */
export function compareMonth(a: MonthState, b: MonthState): Record<string, Verdict> {
  const out: Record<string, Verdict> = {};
  const ids = [...Object.keys(a.nodes), ...Object.keys(b.nodes).filter((id) => !(id in a.nodes))];
  for (const id of ids) out[id] = compareNode(a.nodes[id] ?? EMPTY, b.nodes[id] ?? EMPTY);
  return out;
}

/** Ids of the nodes the two scenarios treat differently this month. */
export function differing(a: MonthState, b: MonthState): string[] {
  return Object.entries(compareMonth(a, b)).filter(([, v]) => v !== 'none' && v !== 'same').map(([id]) => id);
}

const EMPTY: NodeState = { value: 0, confidence: null, viaLinkIds: [], pendingLinkIds: [], fadedLinkIds: [], inSeason: true, conflicting: false };
