import { describe, expect, it } from 'vitest';
import { arrivalMonth, calendarMonth, chosenDrivers, chosenFade, chosenOnset, downgrade, propagate } from './propagate';
import type { Graph, Link, Scenario } from '../types';

function graphWith(links: Partial<Link>[]): Graph {
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

// ---------------------------------------------------------------- M12: the second driver's own start month
// The second driver may enter its phase in a calendar month of its own, read
// within the twelve months shown (June start, September second driver: month
// 3; March: month 9, the following year). Before that it is held out of play:
// value 0, no links, and still never pushed.
const late: Scenario = { ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 9 } };

describe('propagate: second driver with its own start month', () => {
  it('reads the onset within the twelve months shown, wrapping into the next year', () => {
    expect(chosenOnset(base, 'drv')).toBe(0);
    expect(chosenOnset(two, 'd2')).toBe(0);
    expect(chosenOnset(late, 'drv')).toBe(0);
    expect(chosenOnset(late, 'd2')).toBe(3);
    expect(chosenOnset({ ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 6 } }, 'd2')).toBe(0);
    expect(chosenOnset({ ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 3 } }, 'd2')).toBe(9);
    expect(chosenOnset({ ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 5 } }, 'd2')).toBe(11);
    expect(chosenDrivers(late)).toEqual([{ driverId: 'drv', phaseId: 'warm' }, { driverId: 'd2', phaseId: 'up', startMonth: 9 }]);
  });

  it('holds the second driver out of play before its start month, then in its phase to the end', () => {
    const t = propagate(graphWith([]), late);
    for (const m of t.months) {
      expect(m.nodes.drv.value).toBe(1);
      expect(m.nodes.d2.value, `month ${m.index}`).toBe(m.index < 3 ? 0 : 1);
      expect(m.nodes.d2.viaLinkIds).toEqual([]);
      expect(m.nodes.d2.pendingLinkIds).toEqual([]);
    }
    const wrap = propagate(graphWith([]), { ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 3 } });
    for (const m of wrap.months) expect(m.nodes.d2.value, `month ${m.index}`).toBe(m.index < 9 ? 0 : 1);
  });

  it("counts the second driver's lags from its own onset and reports nothing before it", () => {
    const t = propagate(graphWith([
      { id: 'second', from: 'd2', when: 'up', to: 'c', effect: -1, lag_months: [2, 2] },
    ]), late);
    for (let i = 0; i < 5; i++) {
      expect(t.months[i].nodes.c.value, `month ${i}`).toBe(0);
      expect(t.months[i].links.second, `month ${i}`).toBeUndefined();
    }
    expect(t.months[5].nodes.c.value).toBe(-1);
    expect(t.months[5].links.second).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
    // In season but before the onset: not pending, simply absent.
    const seasonal = propagate(graphWith([
      { id: 'second', from: 'd2', when: 'up', to: 'c', effect: -1, season: [7, 8, 9, 10] },
    ]), late);
    expect(seasonal.months[1].links.second).toBeUndefined(); // July, before the onset
    expect(seasonal.months[3].links.second?.status).toBe('applied'); // September
    expect(seasonal.months[5].links.second?.status).toBe('pending'); // November, out of season
  });

  it('a shared target conflicts only once the second driver is in phase', () => {
    const t = propagate(graphWith([
      { id: 'x', to: 'a', effect: 1 }, { id: 'y', from: 'd2', when: 'up', to: 'a', effect: -1 },
    ]), late);
    for (const m of t.months) {
      if (m.index < 3) {
        expect(m.nodes.a.value).toBe(1);
        expect(m.nodes.a.conflicting).toBe(false);
        expect(m.nodes.a.viaLinkIds).toEqual(['x']);
      } else {
        expect(m.nodes.a.value).toBe(0);
        expect(m.nodes.a.conflicting).toBe(true);
        expect(m.nodes.a.viaLinkIds).toEqual(['x', 'y']);
      }
    }
  });

  it('never pushes the second driver, not even before its start month', () => {
    const t = propagate(graphWith([
      { id: 'push', to: 'd2', effect: -1 },
      { id: 'second', from: 'd2', when: 'up', to: 'c', effect: -1 },
      { id: 'back', from: 'd2', when: 'up', to: 'drv', effect: -1 },
    ]), { ...late, maxDepth: 3 });
    for (const m of t.months) {
      expect(m.links.push, `month ${m.index}`).toBeUndefined();
      expect(m.links.back, `month ${m.index}`).toBeUndefined();
      expect(m.nodes.d2.viaLinkIds).toEqual([]);
      expect(m.nodes.d2.value).toBe(m.index < 3 ? 0 : 1);
      expect(m.nodes.c.value).toBe(m.index < 3 ? 0 : -1);
      expect(m.nodes.drv.value).toBe(1);
    }
    // Without the second driver chosen, the same link pushes it down from month 0.
    const solo = propagate(graphWith([{ id: 'push', to: 'd2', effect: -1 }]), deep);
    expect(solo.months[0].nodes.d2.value).toBe(-1);
  });

  it("a start month equal to the first driver's is the same as none", () => {
    const g = graphWith([{ id: 'x', to: 'a', effect: 1 }, { id: 'y', from: 'd2', when: 'up', to: 'a', effect: -1, lag_months: [1, 1] }]);
    const same = propagate(g, { ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 6 } });
    const none = propagate(g, two);
    expect(same.months).toEqual(none.months);
  });
});

// M15: the second driver began before the first. `startsBefore` reads the
// start month backwards from the scenario's June start: March is month -3,
// September month -9, June itself a year earlier (-12). The driver is in its
// phase from month 0 and its links count their lag from that earlier onset.
const early: Scenario = { ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 3, startsBefore: true } };

describe('propagate: second driver that begins before the first', () => {
  it('reads the onset backwards from the start month: an index from -12 to -1', () => {
    expect(chosenOnset(early, 'd2')).toBe(-3);
    expect(chosenOnset(early, 'drv')).toBe(0);
    expect(chosenOnset({ ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 9, startsBefore: true } }, 'd2')).toBe(-9);
    expect(chosenOnset({ ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 5, startsBefore: true } }, 'd2')).toBe(-1);
    expect(chosenOnset({ ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 6, startsBefore: true } }, 'd2')).toBe(-12);
    expect(chosenOnset({ ...base, secondary: { driverId: 'd2', phaseId: 'up', startsBefore: true } }, 'd2')).toBe(-12);
    expect(chosenOnset({ ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 3, startsBefore: false } }, 'd2')).toBe(9);
    expect(chosenDrivers(early)).toEqual([{ driverId: 'drv', phaseId: 'warm' }, { driverId: 'd2', phaseId: 'up', startMonth: 3, startsBefore: true }]);
    expect(chosenDrivers({ ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 3, startsBefore: false } }))
      .toEqual([{ driverId: 'drv', phaseId: 'warm' }, { driverId: 'd2', phaseId: 'up', startMonth: 3 }]);
  });

  it('holds the second driver in its phase from month 0 to the end', () => {
    const t = propagate(graphWith([]), early);
    for (const m of t.months) {
      expect(m.nodes.drv.value).toBe(1);
      expect(m.nodes.d2.value, `month ${m.index}`).toBe(1);
      expect(m.nodes.d2.viaLinkIds).toEqual([]);
    }
  });

  it("counts the second driver's lags from its earlier onset: a lag that has already run is felt at month 0, a longer one later", () => {
    const t = propagate(graphWith([
      { id: 'ran', from: 'd2', when: 'up', to: 'c', effect: -1, lag_months: [2, 2] }, // available from month -1
      { id: 'later', from: 'd2', when: 'up', to: 'b', effect: 1, lag_months: [5, 5] }, // available from month 2
    ]), early);
    expect(t.months[0].nodes.c.value).toBe(-1);
    expect(t.months[0].links.ran).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
    expect(t.months[0].nodes.b.value).toBe(0);
    expect(t.months[0].links.later).toBeUndefined();
    expect(t.months[1].links.later).toBeUndefined();
    expect(t.months[2].nodes.b.value).toBe(1);
    expect(t.months[2].links.later?.status).toBe('applied');
    // Past its lag but out of season at month 0: pending from the first frame.
    const seasonal = propagate(graphWith([
      { id: 'winter', from: 'd2', when: 'up', to: 'c', effect: -1, season: [12, 1, 2] },
    ]), early);
    expect(seasonal.months[0].links.winter?.status).toBe('pending');
    expect(seasonal.months[0].nodes.c.pendingLinkIds).toEqual(['winter']);
    expect(seasonal.months[6].links.winter?.status).toBe('applied'); // December
  });

  it('a shared target conflicts from month 0', () => {
    const t = propagate(graphWith([
      { id: 'x', to: 'a', effect: 1 }, { id: 'y', from: 'd2', when: 'up', to: 'a', effect: -1 },
    ]), early);
    for (const m of t.months) {
      expect(m.nodes.a.value).toBe(0);
      expect(m.nodes.a.conflicting).toBe(true);
      expect(m.nodes.a.viaLinkIds).toEqual(['x', 'y']);
    }
  });

  it('never pushes it, and its link back into the first driver, whose lag has long run, is still skipped', () => {
    const t = propagate(graphWith([
      { id: 'push', to: 'd2', effect: -1 },
      { id: 'back', from: 'd2', when: 'up', to: 'drv', effect: -1, lag_months: [1, 1] },
      { id: 'second', from: 'd2', when: 'up', to: 'c', effect: -1 },
    ]), { ...early, maxDepth: 3 });
    for (const m of t.months) {
      expect(m.links.push, `month ${m.index}`).toBeUndefined();
      expect(m.links.back, `month ${m.index}`).toBeUndefined();
      expect(m.nodes.d2.viaLinkIds).toEqual([]);
      expect(m.nodes.d2.value).toBe(1);
      expect(m.nodes.drv.value).toBe(1);
      expect(m.nodes.c.value).toBe(-1);
    }
  });

  it('startsBefore false is the M12 result exactly; a year before is felt from month 0 unless the lag is longer than the head start', () => {
    const g = graphWith([{ id: 'x', to: 'a', effect: 1 }, { id: 'y', from: 'd2', when: 'up', to: 'b', effect: -1, lag_months: [1, 1] }]);
    const off = propagate(g, { ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 3, startsBefore: false } });
    const after = propagate(g, { ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 3 } });
    expect(off.months).toEqual(after.months);
    const yearBefore = propagate(g, { ...base, secondary: { driverId: 'd2', phaseId: 'up', startsBefore: true } });
    expect(yearBefore.months[0].nodes.b.value).toBe(-1);
    const long = propagate(graphWith([{ id: 'y', from: 'd2', when: 'up', to: 'b', effect: -1, lag_months: [13, 13] }]), { ...base, secondary: { driverId: 'd2', phaseId: 'up', startsBefore: true } });
    expect(long.months[0].links.y).toBeUndefined();
    expect(long.months[0].nodes.b.value).toBe(0);
    expect(long.months[1].nodes.b.value).toBe(-1);
  });
});

// ---------------------------------------------------------------- M32: phase duration
// A chosen driver may hold its phase for `holdMonths` (1–12) from its
// onset. From `onset + holdMonths` it holds no phase and every link of that
// phase is reported faded: one that had been applied stops, one whose lag
// had not run never arrives. Nothing else changes; no hold is today's
// behaviour exactly.
describe('propagate: phase duration', () => {
  const held: Scenario = { ...base, holdMonths: 6 };

  it('no hold: the driver holds its phase through the last month and nothing is ever faded', () => {
    const t = propagate(graphWith([{ lag_months: [0, 0] }, { id: 'late', to: 'b', lag_months: [11, 11] }]), base);
    expect(chosenFade(base, 'drv')).toBeNull();
    for (const m of t.months) {
      expect(m.nodes.drv.value, `month ${m.index}`).toBe(1);
      expect(m.nodes.a.value, `month ${m.index}`).toBe(1);
      expect(m.nodes.a.fadedLinkIds).toEqual([]);
      for (const ls of Object.values(m.links)) expect(ls.status).not.toBe('faded');
    }
    expect(t.months[12].nodes.b.value).toBe(1);
  });

  it('holds the phase for holdMonths from month 0, then no phase, and an applied link is reported faded', () => {
    const t = propagate(graphWith([{ lag_months: [0, 0] }]), held);
    expect(chosenFade(held, 'drv')).toBe(6);
    for (const m of t.months.slice(0, 6)) {
      expect(m.nodes.drv.value, `month ${m.index}`).toBe(1);
      expect(m.nodes.a.value, `month ${m.index}`).toBe(1);
      expect(m.links.l0).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
    }
    for (const m of t.months.slice(6)) {
      expect(m.nodes.drv.value, `month ${m.index}`).toBe(0);
      expect(m.nodes.a.value, `month ${m.index}`).toBe(0);
      expect(m.nodes.a.viaLinkIds).toEqual([]);
      expect(m.nodes.a.pendingLinkIds).toEqual([]);
      expect(m.nodes.a.fadedLinkIds).toEqual(['l0']);
      expect(m.nodes.a.confidence).toBeNull();
      expect(m.links.l0).toEqual({ status: 'faded', confidence: 'established', depth: 1 });
    }
    expect(chosenDrivers(held)).toEqual([{ driverId: 'drv', phaseId: 'warm', holdMonths: 6 }]);
  });

  it('a link whose lag has not run by the fade never arrives: not reported before, faded from the fade on', () => {
    const t = propagate(graphWith([{ lag_months: [8, 10] }]), held);
    for (const m of t.months.slice(0, 6)) expect(m.links.l0, `month ${m.index}`).toBeUndefined();
    for (const m of t.months.slice(6)) {
      expect(m.links.l0?.status, `month ${m.index}`).toBe('faded');
      expect(m.nodes.a.value).toBe(0);
    }
    expect(arrivalMonth(t, 'l0', 'a')).toBeNull();
  });

  it('a link that was pending through the hold is faded after it, not pending', () => {
    // June start, season January only: pending from month 0, the hold ends at month 3 (September).
    const t = propagate(graphWith([{ season: [1] }]), { ...base, holdMonths: 3 });
    for (const m of t.months.slice(0, 3)) expect(m.nodes.a.pendingLinkIds, `month ${m.index}`).toEqual(['l0']);
    for (const m of t.months.slice(3)) {
      expect(m.nodes.a.pendingLinkIds, `month ${m.index}`).toEqual([]);
      expect(m.nodes.a.fadedLinkIds).toEqual(['l0']);
    }
    // January (month 7) is in season, but the event is over: still faded.
    expect(t.months[7].links.l0?.status).toBe('faded');
    expect(t.months[7].nodes.a.value).toBe(0);
  });

  it('a hold of 12 fades the driver in the last month shown, the same calendar month a year on', () => {
    const t = propagate(graphWith([{ lag_months: [0, 0] }]), { ...base, holdMonths: 12 });
    expect(t.months[11].nodes.drv.value).toBe(1);
    expect(t.months[11].nodes.a.value).toBe(1);
    expect(t.months[12].nodes.drv.value).toBe(0);
    expect(t.months[12].links.l0?.status).toBe('faded');
  });

  it('cuts the chain at the fade: the pushed driver loses its phase and its links are not reported at all', () => {
    const t = propagate(graphWith(chain), { ...deep, holdMonths: 5 });
    // Pushed at month 2, its own link a month later.
    expect(t.months[2].nodes.d2.value).toBe(1);
    expect(t.months[3].nodes.c.value).toBe(-1);
    expect(t.months[4].nodes.c.value).toBe(-1);
    for (const m of t.months.slice(5)) {
      expect(m.nodes.d2.value, `month ${m.index}`).toBe(0);
      expect(m.nodes.d2.viaLinkIds).toEqual([]);
      expect(m.nodes.d2.fadedLinkIds).toEqual(['push']);
      expect(m.links.push?.status).toBe('faded');
      expect(m.links.second, `month ${m.index}`).toBeUndefined();
      expect(m.nodes.c.value).toBe(0);
      expect(m.nodes.c.fadedLinkIds).toEqual([]);
    }
  });

  it('a chosen driver is still never pushed after its phase has ended, and the link is still not reported', () => {
    const t = propagate(graphWith([
      { id: 'back', from: 'd2', when: 'up', to: 'drv', effect: -1, lag_months: [0, 0] },
    ]), { ...base, holdMonths: 2, secondary: { driverId: 'd2', phaseId: 'up' } });
    for (const m of t.months) {
      expect(m.nodes.drv.value, `month ${m.index}`).toBe(m.index < 2 ? 1 : 0);
      expect(m.nodes.drv.viaLinkIds).toEqual([]);
      expect(m.nodes.drv.fadedLinkIds).toEqual([]);
      expect(m.links.back).toBeUndefined();
    }
  });

  it('a link the confidence filter leaves out stays a ghost after the fade', () => {
    const t = propagate(graphWith([{ confidence: 'contested' }]), { ...base, holdMonths: 2, minConfidence: 'probable' });
    expect(t.months[0].links.l0?.status).toBe('ghost');
    expect(t.months[5].links.l0?.status).toBe('ghost');
    expect(t.months[5].nodes.a.fadedLinkIds).toEqual([]);
  });

  it("counts the second driver's hold from its own onset", () => {
    // September start month from a June scenario: onset 3, hold 2: in phase at months 3 and 4 only.
    const s: Scenario = { ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 9, holdMonths: 2 } };
    const t = propagate(graphWith([{ id: 'second', from: 'd2', when: 'up', to: 'b', effect: 1, lag_months: [0, 0] }]), s);
    expect(chosenFade(s, 'd2')).toBe(5);
    expect(chosenFade(s, 'drv')).toBeNull();
    for (const m of t.months) {
      const on = m.index === 3 || m.index === 4;
      expect(m.nodes.d2.value, `month ${m.index}`).toBe(on ? 1 : 0);
      expect(m.nodes.b.value, `month ${m.index}`).toBe(on ? 1 : 0);
      expect(m.links.second?.status, `month ${m.index}`).toBe(m.index < 3 ? undefined : on ? 'applied' : 'faded');
      expect(m.nodes.drv.value).toBe(1);
    }
    expect(chosenDrivers(s)[1]).toEqual({ driverId: 'd2', phaseId: 'up', startMonth: 9, holdMonths: 2 });
  });

  it('a second driver that began before the first fades hold months after its earlier onset, possibly before the year shown', () => {
    // Onset -3 (March before a June start), hold 5: in phase at months 0 and 1, faded from month 2.
    const s: Scenario = { ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 3, startsBefore: true, holdMonths: 5 } };
    const t = propagate(graphWith([{ id: 'second', from: 'd2', when: 'up', to: 'b', effect: 1, lag_months: [0, 0] }]), s);
    expect(chosenFade(s, 'd2')).toBe(2);
    expect(t.months[0].nodes.d2.value).toBe(1);
    expect(t.months[1].nodes.b.value).toBe(1);
    expect(t.months[2].nodes.d2.value).toBe(0);
    expect(t.months[2].links.second?.status).toBe('faded');
    // Hold 3 from onset -3: over by month 0, never in phase in the year shown, every link faded from month 0.
    const over: Scenario = { ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 3, startsBefore: true, holdMonths: 3 } };
    const t2 = propagate(graphWith([{ id: 'second', from: 'd2', when: 'up', to: 'b', effect: 1, lag_months: [0, 0] }]), over);
    expect(chosenFade(over, 'd2')).toBe(0);
    for (const m of t2.months) {
      expect(m.nodes.d2.value, `month ${m.index}`).toBe(0);
      expect(m.links.second?.status).toBe('faded');
    }
  });

  it('refuses a hold outside 1–12', () => {
    for (const bad of [0, 13, 2.5, -1]) {
      expect(() => propagate(graphWith([]), { ...base, holdMonths: bad })).toThrow(/holdMonths/);
      expect(() => propagate(graphWith([]), { ...base, secondary: { driverId: 'd2', phaseId: 'up', holdMonths: bad } })).toThrow(/holdMonths/);
    }
  });
});

// ---------------------------------------------------------------- M33: any number of chosen drivers
// Rule 8 in the plural: `others` lists every chosen driver but the first.
// Each has its own onset (M12/M15) and hold (M32), fires at the first hop
// at full confidence, is never pushed, and adds up with the rest under the
// same sum-and-clamp rule. No driver twice. `secondary` is read as a
// one-element `others` for one milestone.
function graphWithMany(links: Partial<Link>[]): Graph {
  const g = graphWith(links);
  for (const [id, name] of [['d3', 'Third driver'], ['d4', 'Fourth driver']] as const) {
    g.nodes.push({
      id, name, kind: 'driver', onset_hint: 'Events usually begin around mid-year.', default_start_month: 6, typical_duration_months: [4, 8], lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [],
      phases: [{ id: 'up', label: 'Up', color: '#000000', summary: '', value: 1 }, { id: 'mid', label: 'Mid', color: '#000000', summary: '', value: 0 }, { id: 'down', label: 'Down', color: '#000000', summary: '', value: -1 }],
    });
  }
  return g;
}

describe('propagate: any number of chosen drivers (M33)', () => {
  it('reads `secondary` as a one-element `others`: the same timeline, the same chosen list', () => {
    const g = graphWithMany([
      { id: 'x', to: 'a', effect: 1, lag_months: [2, 2] },
      { id: 'y', from: 'd2', when: 'up', to: 'a', effect: -1, lag_months: [1, 1], season: [1, 2, 3] },
      { id: 'push', to: 'd2', effect: -1 },
    ]);
    for (const d of [
      { driverId: 'd2', phaseId: 'up' },
      { driverId: 'd2', phaseId: 'up', startMonth: 9 },
      { driverId: 'd2', phaseId: 'up', startMonth: 3, startsBefore: true },
      { driverId: 'd2', phaseId: 'up', startMonth: 3, startsBefore: true, holdMonths: 5 },
      { driverId: 'd2', phaseId: 'mid' },
    ]) {
      const old: Scenario = { ...base, maxDepth: 3, secondary: d };
      const now: Scenario = { ...base, maxDepth: 3, others: [d] };
      expect(propagate(g, now).months).toEqual(propagate(g, old).months);
      expect(chosenDrivers(now)).toEqual(chosenDrivers(old));
      expect(chosenOnset(now, 'd2')).toBe(chosenOnset(old, 'd2'));
      expect(chosenFade(now, 'd2')).toBe(chosenFade(old, 'd2'));
    }
    // Both spellings at once: `secondary` first, then `others`.
    expect(chosenDrivers({ ...base, secondary: { driverId: 'd2', phaseId: 'up' }, others: [{ driverId: 'd3', phaseId: 'down' }] }).map((c) => c.driverId)).toEqual(['drv', 'd2', 'd3']);
    // An empty list is the single-driver scenario.
    expect(propagate(g, { ...base, others: [] }).months).toEqual(propagate(g, base).months);
    expect(chosenDrivers({ ...base, others: [] })).toEqual([{ driverId: 'drv', phaseId: 'warm' }]);
  });

  it('three drivers on one place: two against one still clamps to ±1 and is flagged conflicting, with all three links listed', () => {
    const g = graphWithMany([
      { id: 'x', to: 'a', effect: 1, confidence: 'established' },
      { id: 'y', from: 'd2', when: 'up', to: 'a', effect: 1, confidence: 'probable' },
      { id: 'z', from: 'd3', when: 'down', to: 'a', effect: -1, confidence: 'contested' },
    ]);
    const t = propagate(g, { ...base, others: [{ driverId: 'd2', phaseId: 'up' }, { driverId: 'd3', phaseId: 'down' }] });
    for (const m of t.months) {
      expect(m.nodes.a.value, `month ${m.index}`).toBe(1);
      expect(m.nodes.a.conflicting).toBe(true);
      expect(m.nodes.a.confidence).toBe('contested');
      expect([...m.nodes.a.viaLinkIds].sort()).toEqual(['x', 'y', 'z']);
      for (const id of ['x', 'y', 'z']) expect(m.links[id]).toEqual({ status: 'applied', confidence: g.links.find((l) => l.id === id)!.confidence, depth: 1 });
      expect(m.nodes.drv.value).toBe(1);
      expect(m.nodes.d2.value).toBe(1);
      expect(m.nodes.d3.value).toBe(-1);
    }
    // Two against two cancel: no state, conflicting.
    const four = propagate(graphWithMany([
      { id: 'x', to: 'a', effect: 1 }, { id: 'y', from: 'd2', when: 'up', to: 'a', effect: 1 },
      { id: 'z', from: 'd3', when: 'down', to: 'a', effect: -1 }, { id: 'w', from: 'd4', when: 'down', to: 'a', effect: -1 },
    ]), { ...base, others: [{ driverId: 'd2', phaseId: 'up' }, { driverId: 'd3', phaseId: 'down' }, { driverId: 'd4', phaseId: 'down' }] });
    expect(four.months[0].nodes.a.value).toBe(0);
    expect(four.months[0].nodes.a.conflicting).toBe(true);
    expect(four.months[0].nodes.a.viaLinkIds).toHaveLength(4);
  });

  it('four drivers with three onsets of their own, one negative: each counts its lag from its own onset and holds no phase before it', () => {
    // June start. d2 from September (onset 3), d3 since March (onset -3), d4 at month 0.
    const g = graphWithMany([
      { id: 'y', from: 'd2', when: 'up', to: 'a', effect: 1, lag_months: [2, 2] },
      { id: 'z', from: 'd3', when: 'down', to: 'b', effect: -1, lag_months: [5, 5] },
      { id: 'w', from: 'd4', when: 'up', to: 'c', effect: 1, lag_months: [1, 1] },
    ]);
    const s: Scenario = { ...base, others: [
      { driverId: 'd2', phaseId: 'up', startMonth: 9 },
      { driverId: 'd3', phaseId: 'down', startMonth: 3, startsBefore: true },
      { driverId: 'd4', phaseId: 'up' },
    ] };
    expect(chosenOnset(s, 'drv')).toBe(0);
    expect(chosenOnset(s, 'd2')).toBe(3);
    expect(chosenOnset(s, 'd3')).toBe(-3);
    expect(chosenOnset(s, 'd4')).toBe(0);
    const t = propagate(g, s);
    for (const m of t.months) {
      expect(m.nodes.d2.value, `d2 month ${m.index}`).toBe(m.index >= 3 ? 1 : 0);
      expect(m.nodes.d3.value, `d3 month ${m.index}`).toBe(-1);
      expect(m.nodes.d4.value, `d4 month ${m.index}`).toBe(1);
      expect(m.nodes.a.value, `a month ${m.index}`).toBe(m.index >= 5 ? 1 : 0);       // 3 + 2
      expect(m.nodes.b.value, `b month ${m.index}`).toBe(m.index >= 2 ? -1 : 0);      // -3 + 5
      expect(m.nodes.c.value, `c month ${m.index}`).toBe(m.index >= 1 ? 1 : 0);       // 0 + 1
      if (m.index < 3) expect(m.links.y).toBeUndefined();
    }
  });

  it('each chosen driver has its own hold, counted from its own onset, and fades on its own', () => {
    const g = graphWithMany([
      { id: 'x', to: 'a', effect: 1 },
      { id: 'y', from: 'd2', when: 'up', to: 'b', effect: 1 },
      { id: 'z', from: 'd3', when: 'down', to: 'c', effect: -1 },
    ]);
    const s: Scenario = { ...base, holdMonths: 4, others: [
      { driverId: 'd2', phaseId: 'up', startMonth: 9, holdMonths: 2 },
      { driverId: 'd3', phaseId: 'down' },
    ] };
    expect(chosenFade(s, 'drv')).toBe(4);
    expect(chosenFade(s, 'd2')).toBe(5);
    expect(chosenFade(s, 'd3')).toBeNull();
    const t = propagate(g, s);
    for (const m of t.months) {
      expect(m.nodes.a.value, `a month ${m.index}`).toBe(m.index < 4 ? 1 : 0);
      expect(m.links.x?.status, `x month ${m.index}`).toBe(m.index < 4 ? 'applied' : 'faded');
      const on = m.index === 3 || m.index === 4;
      expect(m.nodes.b.value, `b month ${m.index}`).toBe(on ? 1 : 0);
      expect(m.links.y?.status, `y month ${m.index}`).toBe(m.index < 3 ? undefined : on ? 'applied' : 'faded');
      expect(m.nodes.c.value, `c month ${m.index}`).toBe(-1);
      expect(m.nodes.d3.value).toBe(-1);
    }
  });

  it('never pushes any chosen driver, from any other chosen driver or from a pushed one, and never reports those links', () => {
    const g = graphWithMany([
      { id: 'p2', to: 'd2', effect: -1 },
      { id: 'p3', from: 'd2', when: 'up', to: 'd3', effect: 1 },
      { id: 'p1', from: 'd3', when: 'down', to: 'drv', effect: -1 },
      { id: 'p4', to: 'd4', effect: 1 },                       // d4 is not chosen: pushed, and its links followed
      { id: 'p4b', from: 'd4', when: 'up', to: 'd3', effect: 1 }, // ... but not into a chosen driver
      { id: 'own', from: 'd4', when: 'up', to: 'c', effect: 1 },
    ]);
    const t = propagate(g, { ...base, maxDepth: 3, others: [{ driverId: 'd2', phaseId: 'up' }, { driverId: 'd3', phaseId: 'down' }] });
    for (const m of t.months) {
      expect(m.nodes.drv.value).toBe(1);
      expect(m.nodes.d2.value).toBe(1);
      expect(m.nodes.d3.value).toBe(-1);
      for (const id of ['drv', 'd2', 'd3']) expect(m.nodes[id].viaLinkIds, `${id} month ${m.index}`).toEqual([]);
      for (const id of ['p1', 'p2', 'p3', 'p4b']) expect(m.links[id], `${id} month ${m.index}`).toBeUndefined();
      expect(m.nodes.d4.value).toBe(1);
      expect(m.links.p4?.status).toBe('applied');
      expect(m.links.own).toEqual({ status: 'applied', confidence: 'probable', depth: 2 });
      expect(m.nodes.c.value).toBe(1);
    }
  });

  it('a neutral phase among many pins that driver and applies nothing; the rest are unchanged', () => {
    const g = graphWithMany([
      { id: 'x', to: 'a', effect: 1 }, { id: 'push', to: 'd3', effect: 1 },
      { id: 'y', from: 'd2', when: 'up', to: 'b', effect: 1 }, { id: 'z', from: 'd3', when: 'up', to: 'c', effect: 1 },
    ]);
    const t = propagate(g, { ...base, maxDepth: 3, others: [{ driverId: 'd2', phaseId: 'up' }, { driverId: 'd3', phaseId: 'mid' }] });
    const two = propagate(g, { ...base, maxDepth: 3, others: [{ driverId: 'd2', phaseId: 'up' }] });
    for (const m of t.months) {
      expect(m.nodes.a.value).toBe(1);
      expect(m.nodes.b.value).toBe(1);
      expect(m.nodes.d3.value).toBe(0);
      expect(m.nodes.c.value).toBe(0);
      expect(m.links.push).toBeUndefined();
      expect(m.links.z).toBeUndefined();
    }
    expect(two.months[1].nodes.d3.value).toBe(1);
    expect(two.months[1].nodes.c.value).toBe(1);
  });

  it('refuses the same driver twice, whichever way it is spelled', () => {
    const g = graphWithMany([]);
    expect(() => propagate(g, { ...base, others: [{ driverId: 'd2', phaseId: 'up' }, { driverId: 'd2', phaseId: 'down' }] })).toThrow(/"d2" twice/);
    expect(() => propagate(g, { ...base, others: [{ driverId: 'd3', phaseId: 'up' }, { driverId: 'drv', phaseId: 'cool' }] })).toThrow(/"drv" twice/);
    expect(() => propagate(g, { ...base, secondary: { driverId: 'd2', phaseId: 'up' }, others: [{ driverId: 'd2', phaseId: 'up' }] })).toThrow(/"d2" twice/);
    expect(() => chosenDrivers({ ...base, others: [{ driverId: 'd2', phaseId: 'up' }, { driverId: 'd3', phaseId: 'up' }, { driverId: 'd2', phaseId: 'up' }] })).toThrow(/twice/);
  });

  it('refuses a bad hold on any of them', () => {
    for (const bad of [0, 13, 2.5]) {
      expect(() => propagate(graphWithMany([]), { ...base, others: [{ driverId: 'd2', phaseId: 'up' }, { driverId: 'd3', phaseId: 'up', holdMonths: bad }] })).toThrow(/holdMonths for "d3"/);
    }
  });
});

describe('propagate: links that weaken other links (M35, rule 10)', () => {
  const S = { driver: 'd2', phase: 'down', sources: ['s'] };
  const S3 = { driver: 'd3', phase: 'up', sources: ['s'] };
  const weakened = (over: Partial<Link> = {}): Partial<Link> => ({ id: 'w', to: 'a', effect: 1, confidence: 'established', weakened_by: [S], ...over });
  const D2_DOWN = { driverId: 'd2', phaseId: 'down' };

  it('one tier lower with the modulator chosen in the listed phase; still applied with the same effect in the same months, pending in the same months, reported with the entry in force', () => {
    const g = graphWithMany([weakened({ lag_months: [2, 4], season: [8, 9, 10] })]);
    const t = propagate(g, { ...base, others: [D2_DOWN] });
    const plain = propagate(g, base);
    for (const m of t.months) {
      const p = plain.months[m.index];
      expect(m.nodes.a.value, `month ${m.index}`).toBe(p.nodes.a.value);
      expect(m.nodes.a.viaLinkIds).toEqual(p.nodes.a.viaLinkIds);
      expect(m.nodes.a.pendingLinkIds).toEqual(p.nodes.a.pendingLinkIds);
      if (p.links.w) expect(m.links.w).toEqual({ ...p.links.w, confidence: 'probable', weakenedBy: [S] });
      else expect(m.links.w).toBeUndefined();
    }
    expect(plain.months[2].links.w).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
    expect(t.months[2].links.w).toEqual({ status: 'applied', confidence: 'probable', depth: 1, weakenedBy: [S] });
    expect(t.months[5].links.w).toEqual({ status: 'pending', confidence: 'probable', depth: 1, weakenedBy: [S] });
    expect(t.months[1].links.w).toBeUndefined();
  });

  it('unchanged with the modulator absent, neutral, in another phase, or another driver in the listed phase', () => {
    const g = graphWithMany([weakened()]);
    for (const others of [[], [{ driverId: 'd2', phaseId: 'mid' }], [{ driverId: 'd2', phaseId: 'up' }], [{ driverId: 'd3', phaseId: 'down' }]]) {
      const t = propagate(g, { ...base, others });
      expect(t.months[0].links.w, JSON.stringify(others)).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
      expect(t.months[0].nodes.a.confidence).toBe('established');
    }
  });

  it('unchanged with the modulator pushed into the listed phase rather than chosen', () => {
    const g = graphWithMany([weakened(), { id: 'push', to: 'd2', effect: -1 }]);
    const t = propagate(g, { ...base, maxDepth: 3 });
    for (const m of t.months) {
      expect(m.nodes.d2.value, `month ${m.index}`).toBe(-1);
      expect(m.links.w).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
    }
  });

  it('unchanged before the modulator’s own start month (M12) and from its fade (M32); in force from month 0 when it began before the first (M15)', () => {
    const g = graphWithMany([weakened()]);
    const t = propagate(g, { ...base, others: [{ ...D2_DOWN, startMonth: 9, holdMonths: 4 }] }); // onset 3, fade 7
    for (const m of t.months) {
      const inForce = m.index >= 3 && m.index < 7;
      expect(m.links.w, `month ${m.index}`).toEqual(inForce ? { status: 'applied', confidence: 'probable', depth: 1, weakenedBy: [S] } : { status: 'applied', confidence: 'established', depth: 1 });
      expect(m.nodes.a.confidence).toBe(inForce ? 'probable' : 'established');
    }
    const early = propagate(g, { ...base, others: [{ ...D2_DOWN, startMonth: 3, startsBefore: true, holdMonths: 5 }] }); // onset -3, fade 2
    expect(early.months[0].links.w).toEqual({ status: 'applied', confidence: 'probable', depth: 1, weakenedBy: [S] });
    expect(early.months[1].links.w).toEqual({ status: 'applied', confidence: 'probable', depth: 1, weakenedBy: [S] });
    expect(early.months[2].links.w).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
  });

  it('floored at contested, and still reported in force there', () => {
    const g = graphWithMany([weakened({ confidence: 'contested' })]);
    const t = propagate(g, { ...base, others: [D2_DOWN] });
    expect(t.months[0].links.w).toEqual({ status: 'applied', confidence: 'contested', depth: 1, weakenedBy: [S] });
    expect(t.months[0].nodes.a.value).toBe(1);
  });

  it('ghosted under the confidence filter at the weakened tier: applies nothing, pushes nothing', () => {
    const g = graphWithMany([weakened(), { id: 'wd', to: 'd3', effect: 1, confidence: 'established', weakened_by: [S] }, { id: 'on', from: 'd3', when: 'up', to: 'c', effect: 1 }]);
    const t = propagate(g, { ...base, maxDepth: 3, minConfidence: 'established', others: [D2_DOWN] });
    expect(t.months[0].links.w).toEqual({ status: 'ghost', confidence: 'probable', depth: 1, weakenedBy: [S] });
    expect(t.months[0].links.wd).toEqual({ status: 'ghost', confidence: 'probable', depth: 1, weakenedBy: [S] });
    expect(t.months[0].nodes.a.value).toBe(0);
    expect(t.months[0].nodes.d3.value).toBe(0);
    expect(t.months[0].links.on).toBeUndefined();
    const plain = propagate(g, { ...base, maxDepth: 3, minConfidence: 'established' });
    expect(plain.months[0].nodes.a.value).toBe(1);
    expect(plain.months[0].nodes.d3.value).toBe(1);
    // (its onward link is a second hop, probable, and so a ghost under this filter anyway: M10)
    expect(plain.months[0].links.on).toEqual({ status: 'ghost', confidence: 'probable', depth: 2 });
  });

  it('rule 5 at the node: the weakened tier is the lowest among the applied links; sums and conflicts unchanged', () => {
    const g = graphWithMany([weakened(), { id: 'other', to: 'a', effect: 1, confidence: 'established' }, { id: 'against', from: 'd2', when: 'down', to: 'a', effect: -1, confidence: 'established' }]);
    const t = propagate(g, { ...base, others: [D2_DOWN] });
    expect(t.months[0].nodes.a.confidence).toBe('probable');
    expect(t.months[0].nodes.a.value).toBe(1);
    expect(t.months[0].nodes.a.conflicting).toBe(true);
    expect(t.months[0].nodes.a.viaLinkIds.sort()).toEqual(['against', 'other', 'w']);
    expect(t.months[0].links.other).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
    expect(t.months[0].links.against).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
  });

  it('stacks with the per-hop downgrade: a second-hop link loses one tier for the hop and one more for the modulator', () => {
    const g = graphWithMany([{ id: 'push', to: 'd3', effect: 1 }, { id: 'w', from: 'd3', when: 'up', to: 'b', effect: 1, confidence: 'established', weakened_by: [S] }]);
    const t = propagate(g, { ...base, maxDepth: 3, others: [D2_DOWN] });
    expect(t.months[0].nodes.d3.value).toBe(1);
    expect(t.months[0].links.w).toEqual({ status: 'applied', confidence: 'contested', depth: 2, weakenedBy: [S] });
    expect(t.months[0].nodes.b.confidence).toBe('contested');
    const plain = propagate(g, { ...base, maxDepth: 3 });
    expect(plain.months[0].links.w).toEqual({ status: 'applied', confidence: 'probable', depth: 2 });
  });

  it('one tier only, however many listed drivers hold their phase, all of them reported in the link’s order', () => {
    const g = graphWithMany([weakened({ weakened_by: [S, S3] })]);
    const both = propagate(g, { ...base, others: [{ driverId: 'd3', phaseId: 'up' }, D2_DOWN] });
    expect(both.months[0].links.w).toEqual({ status: 'applied', confidence: 'probable', depth: 1, weakenedBy: [S, S3] });
    const one = propagate(g, { ...base, others: [{ driverId: 'd3', phaseId: 'up' }] });
    expect(one.months[0].links.w).toEqual({ status: 'applied', confidence: 'probable', depth: 1, weakenedBy: [S3] });
  });

  it('a faded link (M32) is reported as rated, whoever is chosen', () => {
    const g = graphWithMany([weakened()]);
    const t = propagate(g, { ...base, holdMonths: 3, others: [D2_DOWN] });
    expect(t.months[2].links.w).toEqual({ status: 'applied', confidence: 'probable', depth: 1, weakenedBy: [S] });
    expect(t.months[3].links.w).toEqual({ status: 'faded', confidence: 'established', depth: 1 });
  });

  it('a modulated link still pushes a driver, whose state and onward links carry the lower tier; onsets unchanged', () => {
    const g = graphWithMany([{ id: 'w', to: 'd3', effect: 1, confidence: 'established', weakened_by: [S], lag_months: [2, 2] }, { id: 'on', from: 'd3', when: 'up', to: 'c', effect: 1, confidence: 'established', lag_months: [1, 1] }]);
    const t = propagate(g, { ...base, maxDepth: 3, others: [D2_DOWN] });
    const plain = propagate(g, { ...base, maxDepth: 3 });
    expect(t.months[1].nodes.d3.value).toBe(0);
    expect(t.months[2].nodes.d3.value).toBe(1);
    expect(t.months[2].nodes.d3.confidence).toBe('probable');
    expect(plain.months[2].nodes.d3.confidence).toBe('established');
    expect(t.months[2].links.on).toBeUndefined();
    expect(t.months[3].links.on).toEqual({ status: 'applied', confidence: 'probable', depth: 2 });
    expect(plain.months[3].links.on).toEqual({ status: 'applied', confidence: 'probable', depth: 2 });
    expect(arrivalMonth(t, 'on', 'c')).toBe(arrivalMonth(plain, 'on', 'c'));
  });

  it('never reports a link the modulator is not allowed to touch: a link into the chosen modulator is skipped as before', () => {
    const g = graphWithMany([{ id: 'into', to: 'd2', effect: 1, confidence: 'established', weakened_by: [S] }]);
    const t = propagate(g, { ...base, maxDepth: 3, others: [D2_DOWN] });
    expect(t.months[0].links.into).toBeUndefined();
    expect(t.months[0].nodes.d2.value).toBe(-1);
  });
});
