// Propagation engine. Pure: no DOM, no Date, no randomness.
// Semantics are specified in docs/PLAN.md §4; do not improvise beyond them.

import type {
  Confidence, DriverNode, Graph, Link, LinkState, MonthState, NodeState, Scenario, Timeline, Value,
} from '../types';
import { CONFIDENCE_ORDER } from '../types';

export function calendarMonth(startMonth: number, index: number): number {
  return ((startMonth - 1 + index) % 12) + 1;
}

function lowest(a: Confidence | null, b: Confidence): Confidence {
  if (a === null) return b;
  return CONFIDENCE_ORDER[b] < CONFIDENCE_ORDER[a] ? b : a;
}

/** One confidence tier down per hop beyond the first, floored at contested. */
export function downgrade(c: Confidence, hops: number): Confidence {
  const level = Math.max(1, CONFIDENCE_ORDER[c] - hops);
  return (Object.keys(CONFIDENCE_ORDER) as Confidence[]).find((k) => CONFIDENCE_ORDER[k] === level)!;
}

function clamp(n: number): Value {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function emptyState(): NodeState {
  return { value: 0, confidence: null, viaLinkIds: [], pendingLinkIds: [], inSeason: false, conflicting: false };
}

/** Links that belong to the scenario's driver + phase (the first hop). */
export function activeLinks(graph: Graph, scenario: Scenario): Link[] {
  return graph.links.filter((l) => l.from === scenario.driverId && l.when === scenario.phaseId);
}

/** The phase a driver holds when pushed to `value`, or null if it has none. */
export function phaseForValue(driver: DriverNode, value: Value) {
  return driver.phases.find((p) => p.value === value) ?? null;
}

interface Hop { driverId: string; phaseId: string; confidence: Confidence | null }

export function propagate(graph: Graph, scenario: Scenario): Timeline {
  const maxDepth = scenario.maxDepth ?? 1;
  const minLevel = CONFIDENCE_ORDER[scenario.minConfidence ?? 'contested'];
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const linksFrom = new Map<string, Link[]>();
  for (const l of graph.links) {
    const key = `${l.from}|${l.when}`;
    linksFrom.set(key, [...(linksFrom.get(key) ?? []), l]);
  }
  const scenarioDriver = nodeById.get(scenario.driverId);
  const scenarioPhase = scenarioDriver?.kind === 'driver' ? scenarioDriver.phases.find((p) => p.id === scenario.phaseId) : undefined;

  // First month index at which a driver entered a phase. The scenario driver
  // enters its phase at month 0; a driver set off by a link enters its phase
  // the first month that link is applied, and keeps that onset for the rest of
  // the scenario (each link fires once: its lag is counted from that onset).
  const onset = new Map<string, number>([[`${scenario.driverId}|${scenario.phaseId}`, 0]]);
  const months: MonthState[] = [];

  for (let index = 0; index <= scenario.horizonMonths; index++) {
    const cal = calendarMonth(scenario.startMonth, index);
    const nodes: Record<string, NodeState> = {};
    for (const n of graph.nodes) nodes[n.id] = emptyState();
    const links: Record<string, LinkState> = {};
    if (nodes[scenario.driverId] && scenarioPhase) nodes[scenario.driverId].value = scenarioPhase.value;

    // Drivers whose phase is already fixed this month. A link into one of them
    // is skipped: the scenario driver is never pushed by its own effects, and a
    // driver set off at a shallower hop is not pushed again (loop guard).
    const settled = new Set<string>([scenario.driverId]);
    let frontier: Hop[] = [{ driverId: scenario.driverId, phaseId: scenario.phaseId, confidence: null }];

    // Sum of effects and sign bookkeeping per target for the conflict flag,
    // accumulated across hops: a first-hop push and a second-hop push on the
    // same node add up (and may conflict).
    const sums = new Map<string, { sum: number; pos: boolean; neg: boolean }>();

    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
      const touched = new Set<string>();

      for (const hop of frontier) {
        const start = onset.get(`${hop.driverId}|${hop.phaseId}`) ?? 0;
        for (const link of linksFrom.get(`${hop.driverId}|${hop.phaseId}`) ?? []) {
          if (index < start + link.lag_months[0]) continue; // not yet available
          if (settled.has(link.to)) continue; // loop guard
          const target = nodes[link.to];
          if (!target) continue;
          // One tier down per hop, and never above the confidence of the
          // driver state the link starts from.
          let confidence = downgrade(link.confidence, depth - 1);
          if (hop.confidence) confidence = lowest(confidence, hop.confidence);
          if (CONFIDENCE_ORDER[confidence] < minLevel) {
            links[link.id] = { status: 'ghost', confidence, depth };
            continue;
          }
          const inSeason = link.season.length === 0 || link.season.includes(cal);
          if (!inSeason) {
            target.pendingLinkIds.push(link.id);
            links[link.id] = { status: 'pending', confidence, depth };
            continue;
          }
          target.inSeason = true;
          target.viaLinkIds.push(link.id);
          target.confidence = lowest(target.confidence, confidence);
          links[link.id] = { status: 'applied', confidence, depth };
          const acc = sums.get(link.to) ?? { sum: 0, pos: false, neg: false };
          acc.sum += link.effect;
          if (link.effect > 0) acc.pos = true; else acc.neg = true;
          sums.set(link.to, acc);
          touched.add(link.to);
        }
      }

      const next: Hop[] = [];
      for (const id of touched) {
        const acc = sums.get(id)!;
        const st = nodes[id];
        st.value = clamp(acc.sum);
        st.conflicting = acc.pos && acc.neg;
        const node = nodeById.get(id);
        if (!node || node.kind !== 'driver') continue;
        settled.add(id);
        if (st.value === 0) continue; // conflicting pushes cancel: no phase, no onward links
        const phase = phaseForValue(node, st.value);
        if (!phase) continue;
        const key = `${id}|${phase.id}`;
        if (!onset.has(key)) onset.set(key, index);
        next.push({ driverId: id, phaseId: phase.id, confidence: st.confidence });
      }
      frontier = next;
    }

    months.push({ index, calendarMonth: cal, nodes, links });
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
