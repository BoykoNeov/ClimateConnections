// Which places a connection has reached this month (M42, docs/PLAN.md
// §5.2). A pure
// reader over what the engine already reported: it runs no scenario,
// invents no state and adds nothing up. Drawing only — nothing in the
// engine reads it, and a timeline is the same whether it is called or not.

import type { Graph, MonthState } from '../types';

/**
 * The ids of the nodes a connection has reached in `month`: every `to` of a
 * link the month reports as `applied`. That is the map's own sense of
 * "reached" — the same test the marker labels use (§5.2) — so a place is in
 * this set exactly while something has arrived there.
 *
 * The three other statuses are deliberately not counted: `pending` is past
 * its lag but out of season and so is not acting, `faded` (M32) is a
 * connection whose event has ended, and `ghost` is one the confidence filter
 * left out. A place whose only arrows are of those kinds is not affected
 * this month; while the layer hides it, its arrows are not drawn either, so
 * no arrowhead is ever left pointing at nothing.
 *
 * A link id the graph does not hold is skipped.
 */
export function reachedThisMonth(graph: Graph, month: MonthState): Set<string> {
  const out = new Set<string>();
  for (const link of graph.links) if (month.links[link.id]?.status === 'applied') out.add(link.to);
  return out;
}
