// Seasonal features (M41, docs/PLAN.md §4 rule 13). Pure readers, no DOM.
// A feature is a fixture of the year's weather the links work through (the
// Aleutian Low, the Siberian High, the polar vortex); a link names the
// features it works through in `via`. The engine never reads either: a
// feature gets the empty state like any node and nothing follows from it.
// These helpers only say whether a feature is present in a calendar month
// and which of the month's reported links work through it, so the map and
// the card can draw what the engine reported. Nothing here computes a state.

import type { FeatureNode, Graph, Link, MonthState } from '../types';

/** The feature nodes, in graph order. */
export function featureNodes(graph: Graph): FeatureNode[] {
  return graph.nodes.filter((n): n is FeatureNode => n.kind === 'feature');
}

/** Whether a feature is present in a calendar month (1–12): its `months`
 *  name it, or are empty (all year). */
export function featurePresent(feature: FeatureNode, calendarMonth: number): boolean {
  return feature.months.length === 0 || feature.months.includes(calendarMonth);
}

/** Every link that lists the feature in `via`, in graph order. */
export function linksThrough(graph: Graph, featureId: string): Link[] {
  return graph.links.filter((l) => (l.via ?? []).includes(featureId));
}

/** One feature in one month: present or not, and the month's reported
 *  links that work through it, by status (ghost and faded links do not
 *  count: nothing is drawn through a feature that applies nothing). */
export interface FeatureMonth {
  feature: FeatureNode;
  present: boolean;
  /** ids of the applied links that list it in `via` */
  applied: string[];
  /** ids of the pending links that list it in `via` */
  pending: string[];
}

/** Every feature's standing in a month, in graph order. */
export function featuresThisMonth(graph: Graph, month: MonthState): FeatureMonth[] {
  const linkById = new Map(graph.links.map((l) => [l.id, l]));
  return featureNodes(graph).map((feature) => {
    const applied: string[] = [];
    const pending: string[] = [];
    for (const [id, ls] of Object.entries(month.links)) {
      const link = linkById.get(id);
      if (!link || !(link.via ?? []).includes(feature.id)) continue;
      if (ls.status === 'applied') applied.push(id);
      else if (ls.status === 'pending') pending.push(id);
    }
    return { feature, present: featurePresent(feature, month.calendarMonth), applied, pending };
  });
}

/** Whether the map draws the feature this month: in its months, or an
 *  applied link works through it (drawn then even outside its months). */
export function featureDrawn(f: FeatureMonth): boolean {
  return f.present || f.applied.length > 0;
}
