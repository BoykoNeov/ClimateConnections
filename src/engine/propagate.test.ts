import { describe, expect, it } from 'vitest';
import { arrivalMonth, calendarMonth, chosenDrivers, downgrade, propagate } from './propagate';
import type { Graph, Link, Scenario } from '../types';

function graphWith(links: Partial<Link>[]): Graph {
  return {
    nodes: [
      {
        id: 'drv', name: 'Driver', kind: 'driver', onset_hint: 'Events usually begin around mid-year.', default_start_month: 6, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [],
        phases: [{ id: 'warm', label: 'Warm', color: '#000000', summary: '', value: 1 }, { id: 'mid', label: 'Mid', color: '#000000', summary: '', value: 0 }, { id: 'cool', label: 'Cool', color: '#000000', summary: '', value: -1 }],
      },
      {
        id: 'd2', name: 'Second driver', kind: 'driver', onset_hint: 'Events usually begin around mid-year.', default_start_month: 6, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [],
        phases: [{ id: 'up', label: 'Up', color: '#000000', summary: '', value: 1 }, { id: 'mid', label: 'Mid', color: '#000000', summary: '', value: 0 }, { id: 'down', label: 'Down', color: '#000000', summary: '', value: -1 }],
      },
      { id: 'a', name: 'A', kind: 'outcome', axis: 'wet_dry', labels: { plus: '', zero: '', minus: '' }, global: false, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [] },
      { id: 'b', name: 'B', kind: 'outcome', axis: 'wet_dry', labels: { plus: '', zero: '', minus: '' }, global: false, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [] },
      { id: 'c', name: 'C', kind: 'outcome', axis: 'wet_dry', labels: { plus: '', zero: '', minus: '' }, global: false, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [] },
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

describe('calendarMonth', () => {
  it('wraps the year', () => {
    expect(calendarMonth(6, 0)).toBe(6);
    expect(calendarMonth(6, 6)).toBe(12);
    expect(calendarMonth(6, 7)).toBe(1);
    expect(calendarMonth(12, 13)).toBe(1);
  });
});

describe('propagate', () => {
  it('produces horizon+1 months with every node present', () => {
    const t = propagate(graphWith([]), base);
    expect(t.months).toHaveLength(13);
    expect(Object.keys(t.months[0].nodes).sort()).toEqual(['a', 'b', 'c', 'd2', 'drv']);
    expect(t.months[0].nodes.drv.value).toBe(1);
    expect(t.months[0].links).toEqual({});
    expect(t.months[3].nodes.a.value).toBe(0);
    expect(t.months[3].nodes.a.confidence).toBeNull();
  });

  it('gates on minimum lag', () => {
    const t = propagate(graphWith([{ lag_months: [4, 8] }]), base);
    expect(t.months[3].nodes.a.value).toBe(0);
    expect(t.months[3].nodes.a.viaLinkIds).toEqual([]);
    expect(t.months[4].nodes.a.value).toBe(1);
    expect(t.months[12].nodes.a.value).toBe(1);
    expect(arrivalMonth(t, 'l0', 'a')).toBe(4);
  });

  it('gates on season, including the year wrap', () => {
    // October start, season Dec–Feb: months 2,3,4 in season; 0,1 and 5+ out.
    const t = propagate(graphWith([{ season: [12, 1, 2] }]), { ...base, startMonth: 10 });
    expect(t.months[0].nodes.a.value).toBe(0);
    expect(t.months[0].nodes.a.pendingLinkIds).toEqual(['l0']);
    expect(t.months[0].nodes.a.inSeason).toBe(false);
    expect(t.months[2].nodes.a.value).toBe(1);
    expect(t.months[2].nodes.a.inSeason).toBe(true);
    expect(t.months[4].nodes.a.value).toBe(1);
    expect(t.months[5].nodes.a.value).toBe(0);
    expect(t.months[5].nodes.a.pendingLinkIds).toEqual(['l0']);
  });

  it('ignores links for other phases', () => {
    const t = propagate(graphWith([{ when: 'cool' }]), base);
    expect(t.months[12].nodes.a.value).toBe(0);
    expect(t.months[12].nodes.a.pendingLinkIds).toEqual([]);
  });

  it('clamps the sum to [-1, 1]', () => {
    const t = propagate(graphWith([{ effect: 1 }, { effect: 1 }, { effect: 1 }]), base);
    expect(t.months[0].nodes.a.value).toBe(1);
    expect(t.months[0].nodes.a.viaLinkIds).toEqual(['l0', 'l1', 'l2']);
  });

  it('flags conflicting influences and nets them out', () => {
    const t = propagate(graphWith([{ effect: 1 }, { effect: -1 }]), base);
    expect(t.months[0].nodes.a.value).toBe(0);
    expect(t.months[0].nodes.a.conflicting).toBe(true);
    const t2 = propagate(graphWith([{ effect: 1 }, { effect: -1 }, { effect: -1 }]), base);
    expect(t2.months[0].nodes.a.value).toBe(-1);
    expect(t2.months[0].nodes.a.conflicting).toBe(true);
  });

  it('reports the lowest confidence among applied links', () => {
    const t = propagate(graphWith([
      { confidence: 'established' }, { confidence: 'contested' }, { confidence: 'probable' },
    ]), base);
    expect(t.months[0].nodes.a.confidence).toBe('contested');
    // An out-of-season contested link must not drag the confidence down.
    const t2 = propagate(graphWith([
      { confidence: 'established' }, { confidence: 'contested', season: [1] },
    ]), base);
    expect(t2.months[0].nodes.a.confidence).toBe('established');
  });
});

// ---------------------------------------------------------------- M10: driver-to-driver links
// A link into a driver pushes it into the phase with that value; with
// maxDepth > 1 the pushed driver's own links fire, with their lag counted
// from the month it was pushed, one confidence tier lower per hop.
const chain: Partial<Link>[] = [
  { id: 'push', to: 'd2', effect: 1, lag_months: [2, 4], confidence: 'established' },
  { id: 'second', from: 'd2', when: 'up', to: 'c', effect: -1, lag_months: [1, 1], confidence: 'established' },
];
const deep: Scenario = { ...base, maxDepth: 3 };

describe('propagate: driver-to-driver links', () => {
  it("sets the target driver into the phase with the link's value, with the link applied to it", () => {
    const t = propagate(graphWith(chain), base);
    expect(t.months[1].nodes.d2.value).toBe(0);
    expect(t.months[2].nodes.d2.value).toBe(1);
    expect(t.months[2].nodes.d2.viaLinkIds).toEqual(['push']);
    expect(t.months[2].nodes.d2.confidence).toBe('established');
    expect(t.months[2].links.push).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
  });

  it("does not follow the pushed driver's links at the default depth of 1", () => {
    const t = propagate(graphWith(chain), base);
    for (const m of t.months) {
      expect(m.nodes.c.value).toBe(0);
      expect(m.nodes.c.viaLinkIds).toEqual([]);
      expect(m.links.second).toBeUndefined();
    }
  });

  it('follows them at depth 2, counting their lag from the month the driver was pushed', () => {
    const t = propagate(graphWith(chain), deep);
    // d2 is pushed at month 2; its link has lag 1, so c reacts at month 3, not 1.
    expect(t.months[2].nodes.c.value).toBe(0);
    expect(t.months[2].links.second).toBeUndefined();
    expect(t.months[3].nodes.c.value).toBe(-1);
    expect(t.months[3].nodes.c.viaLinkIds).toEqual(['second']);
    expect(t.months[3].links.second).toMatchObject({ status: 'applied', depth: 2 });
    expect(arrivalMonth(t, 'second', 'c')).toBe(3);
  });

  it('downgrades confidence one tier per hop, floored at contested', () => {
    const t = propagate(graphWith(chain), deep);
    expect(t.months[3].links.second.confidence).toBe('probable');
    expect(t.months[3].nodes.c.confidence).toBe('probable');
    const t2 = propagate(graphWith([chain[0], { ...chain[1], confidence: 'contested' }]), deep);
    expect(t2.months[3].links.second.confidence).toBe('contested');
    expect(downgrade('established', 0)).toBe('established');
    expect(downgrade('established', 2)).toBe('contested');
    expect(downgrade('contested', 5)).toBe('contested');
  });

  it('never rates a second-hop link above the confidence of the driver state it starts from', () => {
    const t = propagate(graphWith([{ ...chain[0], confidence: 'contested' }, chain[1]]), deep);
    expect(t.months[3].links.second.confidence).toBe('contested');
  });

  it("keeps the pushed driver's onset when the pushing link goes out of season and returns", () => {
    // Pushed in Jun-Aug only (season), start June: d2 holds "up" months 0-2,
    // drops out months 3-11, returns at month 12; its link (lag 3) is then
    // already past its lag because the onset stays at month 0.
    const t = propagate(graphWith([
      { id: 'push', to: 'd2', effect: 1, lag_months: [0, 0], season: [6, 7, 8] },
      { id: 'second', from: 'd2', when: 'up', to: 'c', effect: 1, lag_months: [3, 3] },
    ]), deep);
    expect(t.months[2].nodes.d2.value).toBe(1);
    expect(t.months[2].nodes.c.value).toBe(0); // second not yet past its lag
    expect(t.months[3].nodes.d2.value).toBe(0);
    expect(t.months[3].nodes.d2.pendingLinkIds).toEqual(['push']);
    expect(t.months[3].nodes.c.value).toBe(0); // d2 not in phase: nothing fires
    expect(t.months[3].links.second).toBeUndefined();
    expect(t.months[12].nodes.d2.value).toBe(1);
    expect(t.months[12].nodes.c.value).toBe(1);
  });

  it('never pushes the scenario driver (feedback loops are told, not drawn)', () => {
    const t = propagate(graphWith([
      ...chain,
      { id: 'back', from: 'd2', when: 'up', to: 'drv', effect: -1, lag_months: [0, 0] },
    ]), deep);
    for (const m of t.months) {
      expect(m.nodes.drv.value).toBe(1);
      expect(m.nodes.drv.viaLinkIds).toEqual([]);
      expect(m.links.back).toBeUndefined();
    }
  });

  it('does not push a driver again once it holds a phase this month', () => {
    const t = propagate(graphWith([
      ...chain,
      { id: 'self', from: 'd2', when: 'up', to: 'd2', effect: -1, lag_months: [0, 0] },
    ]), deep);
    expect(t.months[3].nodes.d2.value).toBe(1);
    expect(t.months[3].links.self).toBeUndefined();
  });

  it('cancels the push when the pushes conflict, and then fires nothing onward', () => {
    const t = propagate(graphWith([
      ...chain,
      { id: 'push2', to: 'd2', effect: -1, lag_months: [2, 2] },
    ]), deep);
    expect(t.months[3].nodes.d2.value).toBe(0);
    expect(t.months[3].nodes.d2.conflicting).toBe(true);
    expect(t.months[3].nodes.c.value).toBe(0);
    expect(t.months[3].links.second).toBeUndefined();
  });

  it('reports links under the confidence floor as ghosts that apply nothing and push nothing', () => {
    const t = propagate(graphWith([
      { ...chain[0], confidence: 'contested' }, chain[1],
      { id: 'direct', to: 'a', effect: 1, confidence: 'established' },
    ]), { ...deep, minConfidence: 'probable' });
    expect(t.months[3].links.push).toEqual({ status: 'ghost', confidence: 'contested', depth: 1 });
    expect(t.months[3].nodes.d2.value).toBe(0);
    expect(t.months[3].nodes.d2.viaLinkIds).toEqual([]);
    expect(t.months[3].links.second).toBeUndefined();
    expect(t.months[3].links.direct.status).toBe('applied');
    // A ghost is reported from its lag on, in season or not.
    const t2 = propagate(graphWith([{ id: 'g', to: 'a', confidence: 'contested', season: [1] }]), { ...base, minConfidence: 'established' });
    expect(t2.months[0].links.g).toEqual({ status: 'ghost', confidence: 'contested', depth: 1 });
    expect(t2.months[0].nodes.a.pendingLinkIds).toEqual([]);
    // Ghosting goes by effective confidence: an established second-hop link
    // is probable after the downgrade and so is a ghost under "established only".
    const t3 = propagate(graphWith(chain), { ...deep, minConfidence: 'established' });
    expect(t3.months[3].links.second).toEqual({ status: 'ghost', confidence: 'probable', depth: 2 });
    expect(t3.months[3].nodes.c.value).toBe(0);
  });

  it('stops at maxDepth', () => {
    const t = propagate(graphWith(chain), { ...base, maxDepth: 2 });
    expect(t.months[3].nodes.c.value).toBe(-1);
    const t1 = propagate(graphWith(chain), { ...base, maxDepth: 1 });
    expect(t1.months[3].nodes.c.value).toBe(0);
  });
});

// ---------------------------------------------------------------- M11: two chosen drivers
// A second driver chosen by hand enters its phase at month 0 like the first,
// fires its own links at the first hop (no downgrade), is never pushed by a
// link, and its effects add up with the first driver's under the same
// sum-and-clamp rule, so opposite pushes are flagged as conflicting.
const two: Scenario = { ...base, secondary: { driverId: 'd2', phaseId: 'up' } };

describe('propagate: two chosen drivers', () => {
  it('holds both drivers in their phases for the whole horizon', () => {
    const t = propagate(graphWith([]), two);
    for (const m of t.months) {
      expect(m.nodes.drv.value).toBe(1);
      expect(m.nodes.d2.value).toBe(1);
      expect(m.nodes.d2.viaLinkIds).toEqual([]);
    }
    expect(chosenDrivers(two)).toEqual([{ driverId: 'drv', phaseId: 'warm' }, { driverId: 'd2', phaseId: 'up' }]);
    expect(chosenDrivers(base)).toEqual([{ driverId: 'drv', phaseId: 'warm' }]);
  });

  it("fires the second driver's links at the first hop, full confidence, lag from month 0, even at depth 1", () => {
    const t = propagate(graphWith([
      { id: 'second', from: 'd2', when: 'up', to: 'c', effect: -1, lag_months: [2, 2], confidence: 'established' },
    ]), two);
    expect(t.months[1].nodes.c.value).toBe(0);
    expect(t.months[1].links.second).toBeUndefined();
    expect(t.months[2].nodes.c.value).toBe(-1);
    expect(t.months[2].links.second).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
    expect(t.months[2].nodes.c.confidence).toBe('established');
  });

  it('ignores links for the other phases of the second driver', () => {
    const t = propagate(graphWith([{ id: 'down', from: 'd2', when: 'down', to: 'c', effect: -1 }]), two);
    for (const m of t.months) expect(m.nodes.c.value).toBe(0);
  });

  it('adds the two drivers up at a shared target: same sign stays put, opposite signs conflict', () => {
    const same = propagate(graphWith([
      { id: 'x', to: 'a', effect: 1 }, { id: 'y', from: 'd2', when: 'up', to: 'a', effect: 1 },
    ]), two);
    expect(same.months[0].nodes.a.value).toBe(1);
    expect(same.months[0].nodes.a.conflicting).toBe(false);
    expect(same.months[0].nodes.a.viaLinkIds).toEqual(['x', 'y']);
    const opp = propagate(graphWith([
      { id: 'x', to: 'a', effect: 1, confidence: 'established' }, { id: 'y', from: 'd2', when: 'up', to: 'a', effect: -1, confidence: 'contested' },
    ]), two);
    expect(opp.months[0].nodes.a.value).toBe(0);
    expect(opp.months[0].nodes.a.conflicting).toBe(true);
    expect(opp.months[0].nodes.a.confidence).toBe('contested');
    // Out of season, the second driver's link does not count and there is no conflict.
    const seasonal = propagate(graphWith([
      { id: 'x', to: 'a', effect: 1 }, { id: 'y', from: 'd2', when: 'up', to: 'a', effect: -1, season: [1] },
    ]), two);
    expect(seasonal.months[0].nodes.a.value).toBe(1);
    expect(seasonal.months[0].nodes.a.conflicting).toBe(false);
    expect(seasonal.months[0].nodes.a.pendingLinkIds).toEqual(['y']);
  });

  it('never pushes a chosen driver: links between the two chosen drivers are skipped and not reported', () => {
    const t = propagate(graphWith([
      { id: 'push', to: 'd2', effect: -1 },
      { id: 'back', from: 'd2', when: 'up', to: 'drv', effect: -1 },
    ]), { ...two, maxDepth: 3 });
    for (const m of t.months) {
      expect(m.nodes.d2.value).toBe(1);
      expect(m.nodes.d2.viaLinkIds).toEqual([]);
      expect(m.nodes.drv.value).toBe(1);
      expect(m.links.push).toBeUndefined();
      expect(m.links.back).toBeUndefined();
    }
  });

  it('a neutral second driver applies nothing, and pins the driver so the first driver cannot push it', () => {
    const g = graphWith([{ id: 'x', to: 'a', effect: 1 }, { id: 'y', from: 'd2', when: 'up', to: 'b', effect: 1 }]);
    const t = propagate(g, { ...base, secondary: { driverId: 'd2', phaseId: 'mid' } });
    const solo = propagate(g, base);
    for (let i = 0; i < t.months.length; i++) {
      expect(t.months[i].nodes.a).toEqual(solo.months[i].nodes.a);
      expect(t.months[i].nodes.b.value).toBe(0);
      expect(t.months[i].nodes.d2.value).toBe(0);
    }
    const pinned = propagate(graphWith(chain), { ...deep, secondary: { driverId: 'd2', phaseId: 'mid' } });
    expect(pinned.months[3].nodes.d2.value).toBe(0);
    expect(pinned.months[3].links.push).toBeUndefined();
    expect(pinned.months[3].nodes.c.value).toBe(0);
  });

  it('refuses the same driver chosen twice', () => {
    expect(() => propagate(graphWith([]), { ...base, secondary: { driverId: 'drv', phaseId: 'cool' } })).toThrow(/twice/);
  });
});
