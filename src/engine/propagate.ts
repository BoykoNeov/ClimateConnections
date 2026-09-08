// Propagation engine. Pure: no DOM, no Date, no randomness.
// Semantics are specified in docs/PLAN.md §4; do not improvise beyond them.

import type {
  Confidence, DriverNode, Graph, Link, LinkState, MonthState, NodeState, Scenario, ScenarioDriver, Timeline, Value,
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
  return { value: 0, confidence: null, viaLinkIds: [], pendingLinkIds: [], fadedLinkIds: [], inSeason: false, conflicting: false };
}

function checkHold(hold: number | undefined, driverId: string): void {
  if (hold === undefined) return;
  if (!Number.isInteger(hold) || hold < 1 || hold > 12) throw new Error(`holdMonths for "${driverId}" must be an integer from 1 to 12, got ${hold}`);
}

/** The drivers chosen by hand besides the first (M33, rule 8): `others`,
 *  with the pre-M33 `secondary` read as its first entry for one milestone.
 *  Every entry is copied without undefined fields, so two spellings of the
 *  same choice compare equal. */
export function otherDrivers(scenario: Scenario): ScenarioDriver[] {
  const raw = [...(scenario.secondary ? [scenario.secondary] : []), ...(scenario.others ?? [])];
  return raw.map(({ driverId, phaseId, startMonth, startsBefore, holdMonths }) => {
    const d: ScenarioDriver = { driverId, phaseId };
    if (startMonth !== undefined) d.startMonth = startMonth;
    if (startsBefore) d.startsBefore = true;
    if (holdMonths !== undefined) d.holdMonths = holdMonths;
    return d;
  });
}

/** The drivers whose phases the scenario fixes by hand: the first driver
 *  and, since M11, any others (one until M33, any number since). The first
 *  driver enters its phase at month 0; each other one at month 0 too, or
 *  in its own start month (M12, M15). Any of them may hold its phase for a
 *  set number of months (M32). The same driver may not appear twice; the
 *  engine throws. */
export function chosenDrivers(scenario: Scenario): ScenarioDriver[] {
  checkHold(scenario.holdMonths, scenario.driverId);
  const main: ScenarioDriver = { driverId: scenario.driverId, phaseId: scenario.phaseId };
  if (scenario.holdMonths !== undefined) main.holdMonths = scenario.holdMonths;
  const out: ScenarioDriver[] = [main];
  const seen = new Set([scenario.driverId]);
  for (const d of otherDrivers(scenario)) {
    if (seen.has(d.driverId)) throw new Error(`scenario chooses driver "${d.driverId}" twice`);
    seen.add(d.driverId);
    checkHold(d.holdMonths, d.driverId);
    out.push(d);
  }
  return out;
}

/** Month index from which a chosen driver holds no phase any more (M32,
 *  rule 9): its onset plus its `holdMonths`; null when it holds its phase to
 *  the end of the horizon (no `holdMonths`). May be 0 or negative for a
 *  driver that began before the first (M15) and was over before the year
 *  shown begins: it then holds no phase in any month shown. */
export function chosenFade(scenario: Scenario, driverId: string): number | null {
  const hold = driverId === scenario.driverId ? scenario.holdMonths
    : otherDrivers(scenario).find((d) => d.driverId === driverId)?.holdMonths;
  if (hold === undefined) return null;
  checkHold(hold, driverId);
  return chosenOnset(scenario, driverId) + hold;
}

/** Month index at which a chosen driver enters its phase: 0 for the first
 *  driver and for any other chosen driver without a start month of its own;
 *  otherwise the first month index at or after 0 whose calendar month is
 *  that driver's start month (M12). A start month earlier in the calendar
 *  than the scenario's therefore falls in the following year. With
 *  `startsBefore` (M15) the month is read backwards instead: the last time
 *  it came up before month 0, an index from -12 to -1, so the driver is
 *  already in its phase when the year shown begins. */
export function chosenOnset(scenario: Scenario, driverId: string): number {
  const s = otherDrivers(scenario).find((d) => d.driverId === driverId);
  if (!s) return 0;
  const after = s.startMonth === undefined ? 0 : (s.startMonth - scenario.startMonth + 12) % 12;
  return s.startsBefore ? after - 12 : after;
}

/** Links that belong to a chosen driver + phase (the first hop). */
export function activeLinks(graph: Graph, scenario: Scenario): Link[] {
  const chosen = chosenDrivers(scenario);
  return graph.links.filter((l) => chosen.some((c) => l.from === c.driverId && l.when === c.phaseId));
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
  // The chosen drivers (one; two since M11; any number since M33) and the
  // value of their phases.
  const chosen = chosenDrivers(scenario);
  const chosenValue = new Map<string, Value>();
  for (const c of chosen) {
    const d = nodeById.get(c.driverId);
    const phase = d?.kind === 'driver' ? d.phases.find((p) => p.id === c.phaseId) : undefined;
    if (phase) chosenValue.set(c.driverId, phase.value);
  }

  // First month index at which a driver entered a phase. A chosen driver
  // enters its phase at month 0 (any but the first in its own start month,
  // M12, which may lie before month 0, M15: a negative onset, so links whose
  // lag has already run are available from month 0); a driver set off by a link
  // enters its phase the first month that link is applied, and keeps that
  // onset for the rest of the scenario (each link fires once: its lag is
  // counted from that onset).
  const onset = new Map<string, number>(chosen.map((c) => [`${c.driverId}|${c.phaseId}`, chosenOnset(scenario, c.driverId)]));
  const months: MonthState[] = [];

  for (let index = 0; index <= scenario.horizonMonths; index++) {
    const cal = calendarMonth(scenario.startMonth, index);
    const nodes: Record<string, NodeState> = {};
    for (const n of graph.nodes) nodes[n.id] = emptyState();
    const links: Record<string, LinkState> = {};
    // Chosen drivers already in their phase this month. A chosen driver with
    // a later start month holds no phase before it: value 0, no links. One
    // that began before the first (negative onset) is in phase throughout.
    // A driver whose hold has run out (M32) holds no phase from its fade
    // month on: value 0, and its links are reported faded below.
    const inPhase = chosen.filter((c) => {
      const fade = chosenFade(scenario, c.driverId);
      return index >= chosenOnset(scenario, c.driverId) && (fade === null || index < fade);
    });
    for (const c of inPhase) {
      const value = chosenValue.get(c.driverId);
      if (value !== undefined && nodes[c.driverId]) nodes[c.driverId].value = value;
    }

    // Drivers whose phase is already fixed this month. A link into one of them
    // is skipped: a chosen driver is never pushed (not by its own effects, not
    // by another chosen driver, not before its own start month and not
    // after its phase has ended), and a driver set off at a shallower hop is
    // not pushed again (loop guard).
    const settled = new Set<string>(chosen.map((c) => c.driverId));
    let frontier: Hop[] = inPhase.map((c) => ({ driverId: c.driverId, phaseId: c.phaseId, confidence: null }));

    // Rule 9 (M32): once a chosen driver's phase has ended, every link of
    // that phase is reported faded: one that had been applied stops being
    // applied, one whose lag had not run by then never arrives. Nothing is
    // applied, nothing is pushed, and the chain through this driver is cut
    // at the same month because the pushing link is no longer applied. A
    // link the confidence filter leaves out stays a ghost.
    for (const c of chosen) {
      const fade = chosenFade(scenario, c.driverId);
      if (fade === null || index < fade) continue;
      for (const link of linksFrom.get(`${c.driverId}|${c.phaseId}`) ?? []) {
        if (settled.has(link.to)) continue; // loop guard: never reported, as before the fade
        const target = nodes[link.to];
        if (!target) continue;
        if (CONFIDENCE_ORDER[link.confidence] < minLevel) {
          links[link.id] = { status: 'ghost', confidence: link.confidence, depth: 1 };
          continue;
        }
        target.fadedLinkIds.push(link.id);
        links[link.id] = { status: 'faded', confidence: link.confidence, depth: 1 };
      }
    }

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
