// Hiding the places nothing has reached (M42, docs/PLAN.md §5.2).
// `reachedThisMonth` is a reader over what the engine already reported: the
// places a connection has arrived at this month. The rule it must keep is
// the one the map's labels already use — a place is "reached" exactly while
// an applied link ends there — so the layer hides what "Label every region"
// leaves unnamed, and nothing else.

import { describe, expect, it } from 'vitest';
import { reachedThisMonth } from './reached';
import { propagate } from './propagate';
import { scenarioForYear } from './years';
import type { Graph, LinkStatus, MonthState, Scenario, Story, Timeline } from '../types';
import graphJson from '../../public/data/graph.json';

const graph = graphJson as unknown as Graph;

/** A month that reports exactly the given links, with the given statuses. */
function monthWith(statuses: Record<string, LinkStatus>): MonthState {
  const links: MonthState['links'] = {};
  for (const [id, status] of Object.entries(statuses)) links[id] = { status, confidence: 'probable', depth: 1, settled: true };
  return { index: 0, calendarMonth: 1, nodes: {}, links };
}

/** The scenario a story sets, as the app builds it (chain on, holds, other drivers). */
function storyScenario(story: Story): Scenario {
  const s: Scenario = { driverId: story.driver, phaseId: story.phase, startMonth: story.start_month, horizonMonths: 12, maxDepth: 3 };
  if (story.hold_months !== undefined) s.holdMonths = story.hold_months;
  if (story.impacts) s.impacts = true;
  if (story.drivers && story.drivers.length > 0) {
    s.others = story.drivers.map((d) => {
      const o: NonNullable<Scenario['others']>[number] = { driverId: d.driver, phaseId: d.phase, startMonth: d.start_month ?? story.start_month, startsBefore: !!d.starts_before };
      if (d.hold_months !== undefined) o.holdMonths = d.hold_months;
      return o;
    });
  }
  return s;
}

const elNinoJune: Scenario = { driverId: 'enso', phaseId: 'el_nino', startMonth: 6, horizonMonths: 12, maxDepth: 3 };

describe('reachedThisMonth', () => {
  const first = graph.links[0];

  it('an arrow that has arrived reaches its place', () => {
    expect(reachedThisMonth(graph, monthWith({ [first.id]: 'applied' }))).toEqual(new Set([first.to]));
  });

  it('an arrow on its way, one whose event has ended, and one the filter left out do not', () => {
    for (const status of ['pending', 'faded', 'ghost'] as LinkStatus[]) {
      expect(reachedThisMonth(graph, monthWith({ [first.id]: status })), status).toEqual(new Set());
    }
  });

  it('one applied arrow is enough, however many others end there', () => {
    const sameTarget = graph.links.filter((l) => l.to === first.to).slice(0, 3);
    expect(sameTarget.length).toBeGreaterThan(1);
    const statuses = Object.fromEntries(sameTarget.map((l, i) => [l.id, (i === 0 ? 'applied' : 'pending') as LinkStatus]));
    expect(reachedThisMonth(graph, monthWith(statuses))).toEqual(new Set([first.to]));
  });

  it('a month that reports nothing reaches nothing', () => {
    expect(reachedThisMonth(graph, monthWith({}))).toEqual(new Set());
  });

  it('a link id the graph does not hold is skipped', () => {
    expect(reachedThisMonth(graph, monthWith({ no_such_link: 'applied' }))).toEqual(new Set());
  });
});

describe('the shipped data, El Niño from June with the chain on', () => {
  const timeline = propagate(graph, elNinoJune);

  it('hides about half the places in a busy month and everything in an empty one', () => {
    const places = graph.nodes.filter((n) => n.kind === 'outcome').length;
    const busy = reachedThisMonth(graph, timeline.months[6]);
    expect(busy.size).toBeGreaterThan(0);
    expect(busy.size).toBeLessThan(places / 2 + graph.nodes.filter((n) => n.kind === 'driver').length);
  });

  it('the set follows the month: a place appears when its arrow arrives', () => {
    const sets = timeline.months.map((m) => reachedThisMonth(graph, m));
    expect(new Set(sets.map((s) => [...s].sort().join(','))).size).toBeGreaterThan(1);
    expect(sets[0].size).toBeLessThan(sets[6].size);
  });

  it('the chosen driver need not be reached: drivers are drawn whatever happens', () => {
    // Nothing pushes ENSO itself, so it is outside the set; the map draws
    // every driver regardless (docs/PLAN.md §5.2).
    expect(reachedThisMonth(graph, timeline.months[6]).has('enso')).toBe(false);
  });

  it('a place out of season is left out while its arrow waits, and comes back with it', () => {
    // The monsoon's arrow is pending outside June–September and applied in it.
    const monthOf = (id: string, status: LinkStatus): number[] =>
      timeline.months.filter((m) => m.links[id]?.status === status).map((m) => m.index);
    const link = graph.links.find((l) => l.from === 'enso' && l.to === 'indian_summer_monsoon')!;
    const waiting = monthOf(link.id, 'pending');
    const arrived = monthOf(link.id, 'applied');
    expect(waiting.length).toBeGreaterThan(0);
    expect(arrived.length).toBeGreaterThan(0);
    for (const i of waiting) expect(reachedThisMonth(graph, timeline.months[i]).has('indian_summer_monsoon'), `month ${i}`).toBe(false);
    for (const i of arrived) expect(reachedThisMonth(graph, timeline.months[i]).has('indian_summer_monsoon'), `month ${i}`).toBe(true);
  });

  it('a connection the confidence filter leaves out no longer holds its place', () => {
    const strict = propagate(graph, { ...elNinoJune, minConfidence: 'established' });
    const ghosts = Object.entries(strict.months[8].links).filter(([, ls]) => ls.status === 'ghost');
    expect(ghosts.length).toBeGreaterThan(0);
    expect(reachedThisMonth(graph, strict.months[8]).size).toBeLessThan(reachedThisMonth(graph, timeline.months[8]).size);
  });

  it('reading changes nothing', () => {
    const before = JSON.stringify(timeline);
    for (const month of timeline.months) reachedThisMonth(graph, month);
    expect(JSON.stringify(timeline)).toBe(before);
  });
});

describe('the set is exactly the places the map calls reached', () => {
  /** The map names a marker while the scenario reaches it — `viaLinkIds` is
   *  not empty (§5.2, the labels rule). The layer must hide exactly the
   *  markers that rule leaves unnamed, so the two must agree everywhere. */
  function check(timeline: Timeline, what: string): void {
    for (const month of timeline.months) {
      const reached = reachedThisMonth(graph, month);
      const named = new Set(Object.entries(month.nodes).filter(([, st]) => st.viaLinkIds.length > 0).map(([id]) => id));
      expect([...reached].sort(), `${what} month ${month.index}`).toEqual([...named].sort());
    }
  }

  it('holds for every shipped story', () => {
    for (const story of graph.stories) check(propagate(graph, storyScenario(story)), story.id);
  });

  it('holds for every recorded year', () => {
    for (const row of graph.years ?? []) check(propagate(graph, scenarioForYear(graph, row).scenario), String(row.year));
  });

  it('holds with the impacts hop on and with a hold, a filter and no chain', () => {
    check(propagate(graph, { ...elNinoJune, impacts: true }), 'impacts');
    check(propagate(graph, { ...elNinoJune, holdMonths: 4 }), 'hold');
    check(propagate(graph, { ...elNinoJune, minConfidence: 'established' }), 'filter');
    check(propagate(graph, { ...elNinoJune, maxDepth: 1 }), 'no chain');
  });

  it('a faded connection does not hold its place: with a hold, the places go as the event ends', () => {
    const held = propagate(graph, { ...elNinoJune, holdMonths: 3 });
    const faded = held.months[11];
    expect(Object.values(faded.links).some((ls) => ls.status === 'faded')).toBe(true);
    for (const [id, st] of Object.entries(faded.nodes)) {
      if (st.fadedLinkIds.length > 0 && st.viaLinkIds.length === 0) expect(reachedThisMonth(graph, faded).has(id), id).toBe(false);
    }
  });
});
