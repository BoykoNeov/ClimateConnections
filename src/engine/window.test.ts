// The arrival window (M30, docs/PLAN.md §4 rule 3): every reported link
// carries `settled`, true once the month index is at or past the onset plus
// the later end of its lag range, counted from the same onset as the lag.
// Reporting only: the link is applied from the earlier end as before, and
// nothing else in the timeline changes.

import { describe, expect, it } from 'vitest';
import { propagate } from './propagate';
import { scenarioForYear, yearRows } from './years';
import type { Graph, Link, Scenario, Story, Timeline } from '../types';
import graphJson from '../../public/data/graph.json';

/** A driver, a second driver, three outcomes and one impact. */
function graphWith(links: Partial<Link>[]): Graph {
  const outcome = (id: string) => ({ id, name: id.toUpperCase(), kind: 'outcome' as const, axis: 'wet_dry' as const, labels: { plus: 'wet', zero: 'normal', minus: 'dry' }, global: false, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [] });
  return {
    nodes: [
      {
        id: 'drv', name: 'Driver', kind: 'driver', onset_hint: 'Events usually begin around mid-year.', default_start_month: 6, typical_duration_months: [4, 8], lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [],
        phases: [{ id: 'warm', label: 'Warm', color: '#000000', summary: '', value: 1 }, { id: 'mid', label: 'Mid', color: '#000000', summary: '', value: 0 }, { id: 'cool', label: 'Cool', color: '#000000', summary: '', value: -1 }],
      },
      {
        id: 'd2', name: 'Second driver', kind: 'driver', onset_hint: 'Events usually begin around mid-year.', default_start_month: 6, typical_duration_months: [4, 8], lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [],
        phases: [{ id: 'up', label: 'Up', color: '#000000', summary: '', value: 1 }, { id: 'mid', label: 'Mid', color: '#000000', summary: '', value: 0 }, { id: 'down', label: 'Down', color: '#000000', summary: '', value: -1 }],
      },
      outcome('a'), outcome('b'), outcome('c'),
      { id: 'x', name: 'X', kind: 'impact', axis: 'more_less', sector: 'agriculture', labels: { plus: 'more', zero: 'normal', minus: 'less' }, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [] },
    ],
    links: links.map((l, i) => ({
      id: `l${i}`, from: 'drv', when: 'warm', to: 'a', effect: 1, lag_months: [0, 0], season: [],
      confidence: 'established', mechanism: '', caveat: '', sources: ['s'], ...l,
    })),
    sources: [{ key: 's', citation: 'x' }],
    stories: [],
  };
}

const base: Scenario = { driverId: 'drv', phaseId: 'warm', startMonth: 6, horizonMonths: 12 };

/** [status, settled] of one link month by month, '-' where it is not reported. */
function trace(tl: Timeline, id: string): string[] {
  return tl.months.map((m) => {
    const ls = m.links[id];
    return ls ? `${ls.status[0]}${ls.settled ? '+' : '-'}` : '-';
  });
}

describe('the arrival window (M30): settled', () => {
  it('is false from the earliest lag and true from the latest', () => {
    const tl = propagate(graphWith([{ lag_months: [2, 5] }]), base);
    expect(trace(tl, 'l0')).toEqual(['-', '-', 'a-', 'a-', 'a-', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+']);
    // The link is applied from the earliest lag as before: the state does not wait.
    expect(tl.months[2].nodes.a.value).toBe(1);
    expect(tl.months[2].nodes.a.viaLinkIds).toEqual(['l0']);
  });

  it('is always true when the two ends of the range are equal', () => {
    const tl = propagate(graphWith([{ lag_months: [3, 3] }]), base);
    expect(trace(tl, 'l0')).toEqual(['-', '-', '-', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+']);
  });

  it('closes at the latest lag for a link available from month 0', () => {
    const tl = propagate(graphWith([{ lag_months: [0, 4] }]), base);
    expect(tl.months.map((m) => m.links.l0.settled)).toEqual([false, false, false, false, true, true, true, true, true, true, true, true, true]);
  });

  it('is counted from a chosen driver\'s own start month (M12)', () => {
    const g = graphWith([{ from: 'd2', when: 'up', to: 'b', lag_months: [1, 3] }]);
    const tl = propagate(g, { ...base, others: [{ driverId: 'd2', phaseId: 'up', startMonth: 9 }] });
    // onset 3 (September from June): available at 4, settled at 6
    expect(trace(tl, 'l0')).toEqual(['-', '-', '-', '-', 'a-', 'a-', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+']);
  });

  it('is counted from a negative onset for a driver that began before the first (M15)', () => {
    const g = graphWith([{ from: 'd2', when: 'up', to: 'b', lag_months: [1, 6] }]);
    const tl = propagate(g, { ...base, others: [{ driverId: 'd2', phaseId: 'up', startMonth: 3, startsBefore: true }] });
    // onset -3 (March before June): available from month 0, settled at month 3
    expect(trace(tl, 'l0').slice(0, 5)).toEqual(['a-', 'a-', 'a-', 'a+', 'a+']);
  });

  it('is counted from the month a pushed driver was pushed (M10)', () => {
    const g = graphWith([{ to: 'd2', lag_months: [2, 2] }, { from: 'd2', when: 'up', to: 'b', lag_months: [1, 4] }]);
    const tl = propagate(g, { ...base, maxDepth: 2 });
    expect(tl.months[2].nodes.d2.value).toBe(1);
    // d2's onset is 2: its link is available at 3 and settled at 6
    expect(trace(tl, 'l1')).toEqual(['-', '-', '-', 'a-', 'a-', 'a-', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+']);
    expect(tl.months[3].links.l1.depth).toBe(2);
  });

  it('is reported on a pending link too', () => {
    // June start: month 6 is December. In season only in December (calendar 12).
    const tl = propagate(graphWith([{ lag_months: [1, 4], season: [12] }]), base);
    expect(trace(tl, 'l0')).toEqual(['-', 'p-', 'p-', 'p-', 'p+', 'p+', 'a+', 'p+', 'p+', 'p+', 'p+', 'p+', 'p+']);
  });

  it('is reported on a ghost the confidence filter leaves out', () => {
    const tl = propagate(graphWith([{ lag_months: [1, 3], confidence: 'contested' }]), { ...base, minConfidence: 'established' });
    expect(trace(tl, 'l0')).toEqual(['-', 'g-', 'g-', 'g+', 'g+', 'g+', 'g+', 'g+', 'g+', 'g+', 'g+', 'g+', 'g+']);
  });

  it('is reported on a faded link from the chosen onset (M32), whether or not it had arrived', () => {
    const g = graphWith([{ lag_months: [0, 5] }, { to: 'b', lag_months: [4, 7] }]);
    const tl = propagate(g, { ...base, holdMonths: 3 });
    expect(trace(tl, 'l0')).toEqual(['a-', 'a-', 'a-', 'f-', 'f-', 'f+', 'f+', 'f+', 'f+', 'f+', 'f+', 'f+', 'f+']);
    // never arrives (lag at or beyond the hold): still reported, its window closing at 7
    expect(trace(tl, 'l1')).toEqual(['-', '-', '-', 'f-', 'f-', 'f-', 'f-', 'f+', 'f+', 'f+', 'f+', 'f+', 'f+']);
  });

  it('is not delayed by the season: a link in season only after its window has closed is settled at once', () => {
    const tl = propagate(graphWith([{ lag_months: [1, 2], season: [12] }]), base);
    expect(tl.months[6].links.l0).toEqual({ status: 'applied', confidence: 'established', depth: 1, settled: true });
  });

  it('is counted from the outcome\'s first month in the state on an impact link (M37)', () => {
    const g = graphWith([{ lag_months: [2, 2] }, { from: 'a', when: 'plus', to: 'x', lag_months: [1, 3] }]);
    const tl = propagate(g, { ...base, impacts: true });
    // a holds "wet" from month 2: the impact link is available at 3 and settled at 5
    expect(trace(tl, 'l1')).toEqual(['-', '-', '-', 'a-', 'a-', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+', 'a+']);
    expect(tl.months[3].links.l1.depth).toBe(2);
  });

  it('is carried through the modulation (M35) and the variant (M36) paths unchanged', () => {
    const g = graphWith([{ lag_months: [1, 3], weakened_by: [{ driver: 'd2', phase: 'up', sources: ['s'] }] }]);
    const tl = propagate(g, { ...base, others: [{ driverId: 'd2', phaseId: 'up' }] });
    expect(tl.months[1].links.l0).toEqual({ status: 'applied', confidence: 'probable', depth: 1, weakenedBy: [{ driver: 'd2', phase: 'up', sources: ['s'] }], settled: false });
    expect(tl.months[3].links.l0.settled).toBe(true);
  });
});

// ---- the shipped data
const graph = graphJson as unknown as Graph;

/** A timeline with `settled` stripped from every link state. */
function withoutSettled(tl: Timeline): unknown {
  return tl.months.map((m) => ({
    ...m,
    links: Object.fromEntries(Object.entries(m.links).map(([id, ls]) => {
      const { settled: _s, ...rest } = ls;
      return [id, rest];
    })),
  }));
}

function storyScenario(story: Story): Scenario {
  const s: Scenario = { driverId: story.driver, phaseId: story.phase, startMonth: story.start_month, horizonMonths: 12, maxDepth: 3 };
  if (story.hold_months !== undefined) s.holdMonths = story.hold_months;
  if (story.impacts) s.impacts = true;
  if (story.drivers && story.drivers.length > 0) {
    s.others = story.drivers.map((d) => {
      const o: NonNullable<Scenario['others']>[number] = { driverId: d.driver, phaseId: d.phase };
      if (d.start_month !== undefined) o.startMonth = d.start_month;
      if (d.starts_before) o.startsBefore = true;
      if (d.hold_months !== undefined) o.holdMonths = d.hold_months;
      return o;
    });
  }
  return s;
}

/** Every shipped story and every real year, as the app runs them. */
function shippedScenarios(): Scenario[] {
  return [
    ...graph.stories.map(storyScenario),
    ...yearRows(graph).map((row) => ({ ...scenarioForYear(graph, row, 12).scenario, maxDepth: 3, impacts: true })),
  ];
}

describe('the arrival window (M30) on the shipped data', () => {
  it('El Niño from June: the monsoon link (lag 0–3) is faint until September and settled from then', () => {
    const tl = propagate(graph, { driverId: 'enso', phaseId: 'el_nino', startMonth: 6, horizonMonths: 12 });
    expect(trace(tl, 'el_nino_indian_monsoon').slice(0, 5)).toEqual(['a-', 'a-', 'a-', 'a+', 'p+']);
  });

  it('El Niño from June: the coast of Peru (lag 4–8, in season from December) is faint in December and settled from February', () => {
    const tl = propagate(graph, { driverId: 'enso', phaseId: 'el_nino', startMonth: 6, horizonMonths: 12 });
    expect(trace(tl, 'el_nino_peru_coast').slice(4, 11)).toEqual(['p-', 'p-', 'a-', 'a-', 'a+', 'a+', 'a+']);
  });

  it('every reported link in every shipped story and real year carries a boolean settled', () => {
    for (const scenario of shippedScenarios()) {
      const tl = propagate(graph, scenario);
      for (const m of tl.months) for (const ls of Object.values(m.links)) expect(typeof ls.settled).toBe('boolean');
    }
  });

  it('a link whose two ends are equal is settled in every month it is reported', () => {
    const equal = new Set(graph.links.filter((l) => l.lag_months[0] === l.lag_months[1]).map((l) => l.id));
    expect(equal.size).toBeGreaterThan(0);
    let seen = 0;
    for (const scenario of shippedScenarios()) {
      const tl = propagate(graph, scenario);
      for (const m of tl.months) for (const [id, ls] of Object.entries(m.links)) if (equal.has(id)) { seen++; expect(ls.settled).toBe(true); }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('a wider window changes nothing but settled: every story and year gives the same timeline with every later lag pushed out', () => {
    const wider: Graph = { ...graph, links: graph.links.map((l) => ({ ...l, lag_months: [l.lag_months[0], l.lag_months[1] + 3] as [number, number] })) };
    for (const scenario of shippedScenarios()) {
      expect(withoutSettled(propagate(wider, scenario))).toEqual(withoutSettled(propagate(graph, scenario)));
    }
  });
});
