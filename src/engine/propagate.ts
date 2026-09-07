// Propagation engine. Pure: no DOM, no Date, no randomness.
// Semantics are specified in docs/PLAN.md §4; do not improvise beyond them.

import type {
  Confidence, Graph, Link, MonthState, NodeState, Scenario, Timeline, Value,
} from '../types';
import { CONFIDENCE_ORDER } from '../types';

export function calendarMonth(startMonth: number, index: number): number {
  return ((startMonth - 1 + index) % 12) + 1;
}

function lowest(a: Confidence | null, b: Confidence): Confidence {
  if (a === null) return b;
  return CONFIDENCE_ORDER[b] < CONFIDENCE_ORDER[a] ? b : a;
}

function clamp(n: number): Value {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function emptyState(): NodeState {
  return { value: 0, confidence: null, viaLinkIds: [], pendingLinkIds: [], inSeason: false, conflicting: false };
}

/** Links that belong to the scenario's driver + phase. */
export function activeLinks(graph: Graph, scenario: Scenario): Link[] {
  return graph.links.filter((l) => l.from === scenario.driverId && l.when === scenario.phaseId);
}

export function propagate(graph: Graph, scenario: Scenario): Timeline {
  const links = activeLinks(graph, scenario);
  const months: MonthState[] = [];

  for (let index = 0; index <= scenario.horizonMonths; index++) {
    const cal = calendarMonth(scenario.startMonth, index);
    const nodes: Record<string, NodeState> = {};
    for (const n of graph.nodes) nodes[n.id] = emptyState();

    // Sum of effects and sign bookkeeping per target for the conflict flag.
    const sums = new Map<string, { sum: number; pos: boolean; neg: boolean }>();

    for (const link of links) {
      if (index < link.lag_months[0]) continue; // not yet available
      const target = nodes[link.to];
      if (!target) continue;
      const inSeason = link.season.length === 0 || link.season.includes(cal);
      if (!inSeason) {
        target.pendingLinkIds.push(link.id);
        continue;
      }
      target.inSeason = true;
      target.viaLinkIds.push(link.id);
      target.confidence = lowest(target.confidence, link.confidence);
      const acc = sums.get(link.to) ?? { sum: 0, pos: false, neg: false };
      acc.sum += link.effect;
      if (link.effect > 0) acc.pos = true; else acc.neg = true;
      sums.set(link.to, acc);
    }

    for (const [id, acc] of sums) {
      nodes[id].value = clamp(acc.sum);
      nodes[id].conflicting = acc.pos && acc.neg;
    }

    months.push({ index, calendarMonth: cal, nodes });
  }

  return { scenario, months };
}

/** First month index at which a link is applied in the timeline, or null. */
export function arrivalMonth(timeline: Timeline, linkId: string, targetId: string): number | null {
  for (const m of timeline.months) {
    if (m.nodes[targetId]?.viaLinkIds.includes(linkId)) return m.index;
  }
  return null;
}
