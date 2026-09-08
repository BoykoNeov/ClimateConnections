// Phase variants (M36, docs/PLAN.md §4 rule 11): a phase that is a kind of
// another phase of the same driver. A driver holding it fires its own links
// plus the parent's links that do not except it; a push into the driver
// lands on the parent; everything else is unchanged.

import { describe, expect, it } from 'vitest';
import { activeLinks, arrivalMonth, linkFiresFor, linksOfPhase, parentPhaseId, phaseForValue, phaseMatches, propagate } from './propagate';
import { linksInPlay } from './season';
import { influencesOn } from './inverse';
import type { DriverNode, Graph, Link, Scenario } from '../types';

/** A driver with a warm phase and a "warm, kind X" variant of it; a second
 *  driver; three places. */
function graphWithKinds(links: Partial<Link>[]): Graph {
  return {
    nodes: [
      {
        id: 'drv', name: 'Driver', kind: 'driver', onset_hint: 'Events usually begin around mid-year.', default_start_month: 6, typical_duration_months: [4, 8], lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [],
        phases: [
          { id: 'warm', label: 'Warm', color: '#000000', summary: '', value: 1 },
          { id: 'warmx', label: 'Warm, kind X', color: '#111111', summary: '', value: 1, variant_of: 'warm' },
          { id: 'mid', label: 'Mid', color: '#000000', summary: '', value: 0 },
          { id: 'cool', label: 'Cool', color: '#000000', summary: '', value: -1 },
        ],
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

/** The standard set: an inherited link to A, a link to B the kind excepts
 *  and the kind's own replacement, a link to C only the kind has, and an
 *  inherited push into the second driver. */
const LINKS: Partial<Link>[] = [
  { id: 'pa', to: 'a', effect: 1, lag_months: [1, 2], season: [8, 9, 10] },
  { id: 'pb', to: 'b', effect: 1, except: ['warmx'], evidence_note: 'not for kind X' },
  { id: 'vb', when: 'warmx', to: 'b', effect: -1, confidence: 'probable' },
  { id: 'vc', when: 'warmx', to: 'c', effect: 1, confidence: 'contested', lag_months: [2, 2] },
  { id: 'pd', to: 'd2', effect: 1 },
  { id: 'on', from: 'd2', when: 'up', to: 'c', effect: -1 },
];
const warm: Scenario = { driverId: 'drv', phaseId: 'warm', startMonth: 6, horizonMonths: 12 };
const kind: Scenario = { ...warm, phaseId: 'warmx' };
const drv = (g: Graph) => g.nodes[0] as DriverNode;

describe('phase variants (M36, rule 11): the helpers', () => {
  const g = graphWithKinds(LINKS);
  it('parentPhaseId, phaseMatches', () => {
    expect(parentPhaseId(drv(g), 'warmx')).toBe('warm');
    expect(parentPhaseId(drv(g), 'warm')).toBeNull();
    expect(parentPhaseId(drv(g), 'nope')).toBeNull();
    expect(phaseMatches(drv(g), 'warmx', 'warm')).toBe(true);
    expect(phaseMatches(drv(g), 'warmx', 'warmx')).toBe(true);
    expect(phaseMatches(drv(g), 'warm', 'warmx')).toBe(false);
    expect(phaseMatches(drv(g), 'warm', 'warm')).toBe(true);
    expect(phaseMatches(drv(g), 'cool', 'warm')).toBe(false);
  });
  it('linkFiresFor and linksOfPhase: the kind fires its own links and the parent’s that do not except it; the parent fires only its own', () => {
    const by = (id: string) => g.links.find((l) => l.id === id)!;
    expect(linkFiresFor(by('pa'), drv(g), 'warmx')).toBe(true);
    expect(linkFiresFor(by('pb'), drv(g), 'warmx')).toBe(false);
    expect(linkFiresFor(by('vb'), drv(g), 'warmx')).toBe(true);
    expect(linkFiresFor(by('vb'), drv(g), 'warm')).toBe(false);
    expect(linkFiresFor(by('pb'), drv(g), 'warm')).toBe(true);
    expect(linkFiresFor(by('on'), drv(g), 'warm')).toBe(false);
    expect(linksOfPhase(g, 'drv', 'warmx').map((l) => l.id)).toEqual(['pa', 'vb', 'vc', 'pd']);
    expect(linksOfPhase(g, 'drv', 'warm').map((l) => l.id)).toEqual(['pa', 'pb', 'pd']);
    expect(linksOfPhase(g, 'drv', 'cool')).toEqual([]);
    expect(linksOfPhase(g, 'a', 'warm')).toEqual([]);
    expect(activeLinks(g, kind).map((l) => l.id)).toEqual(['pa', 'vb', 'vc', 'pd']);
    expect(activeLinks(g, { ...kind, others: [{ driverId: 'd2', phaseId: 'up' }] }).map((l) => l.id)).toEqual(['pa', 'vb', 'vc', 'pd', 'on']);
  });
  it('phaseForValue never returns a variant', () => {
    expect(phaseForValue(drv(g), 1)?.id).toBe('warm');
    expect(phaseForValue(drv(g), -1)?.id).toBe('cool');
    const onlyKind: DriverNode = { ...drv(g), phases: drv(g).phases.filter((p) => p.id !== 'warm') };
    expect(phaseForValue(onlyKind, 1)).toBeNull();
  });
});

describe('phase variants (M36, rule 11): propagate', () => {
  it('a chosen driver in the kind fires the inherited link exactly as the parent would (same lag, season, tier, depth 1), not the excepted one, and its own links', () => {
    const g = graphWithKinds(LINKS);
    const t = propagate(g, kind);
    const p = propagate(g, warm);
    for (const m of t.months) {
      expect(m.links.pa, `month ${m.index}`).toEqual(p.months[m.index].links.pa);
      expect(m.nodes.a.value).toBe(p.months[m.index].nodes.a.value);
      expect(m.links.pb).toBeUndefined();
      expect(m.links.vb).toEqual({ status: 'applied', confidence: 'probable', depth: 1 });
      expect(m.nodes.b.value).toBe(-1);
      expect(m.nodes.b.viaLinkIds).toEqual(['vb']);
      expect(m.nodes.b.confidence).toBe('probable');
      expect(p.months[m.index].nodes.b.value).toBe(1);
      expect(p.months[m.index].links.vb).toBeUndefined();
      expect(p.months[m.index].links.vc).toBeUndefined();
    }
    expect(arrivalMonth(t, 'pa', 'a')).toBe(2); // June start, lag 1, in season from August
    expect(arrivalMonth(t, 'vc', 'c')).toBe(2);
    expect(t.months[1].links.vc).toBeUndefined();
    expect(t.months[2].links.vc).toEqual({ status: 'applied', confidence: 'contested', depth: 1 });
    expect(t.months[0].nodes.drv.value).toBe(1);
    expect(linksInPlay(g, t).map((l) => l.id)).toEqual(['pa', 'vb', 'vc', 'pd']);
  });

  it('a push into the driver lands on the parent, never on the kind: the parent’s links fire at the second hop, the kind’s do not', () => {
    const g = graphWithKinds([...LINKS, { id: 'push', from: 'd2', when: 'up', to: 'drv', effect: 1, lag_months: [1, 1] }]);
    const t = propagate(g, { driverId: 'd2', phaseId: 'up', startMonth: 6, horizonMonths: 12, maxDepth: 3 });
    expect(t.months[0].nodes.drv.value).toBe(0);
    expect(t.months[1].nodes.drv.value).toBe(1);
    expect(phaseForValue(drv(g), t.months[1].nodes.drv.value)?.id).toBe('warm');
    expect(t.months[1].links.pb).toEqual({ status: 'applied', confidence: 'probable', depth: 2 });
    expect(t.months[1].nodes.b.value).toBe(1);
    for (const m of t.months) {
      expect(m.links.vb, `month ${m.index}`).toBeUndefined();
      expect(m.links.vc).toBeUndefined();
    }
  });

  it('a weakened_by entry naming the parent is in force when the kind is chosen (rule 10 through rule 11); except never touches modulation', () => {
    const W = { driver: 'drv', phase: 'warm', sources: ['s'] };
    const g = graphWithKinds([{ id: 'w', from: 'd2', when: 'up', to: 'c', effect: 1, weakened_by: [W] }]);
    const scenario: Scenario = { driverId: 'd2', phaseId: 'up', startMonth: 6, horizonMonths: 12 };
    expect(propagate(g, scenario).months[0].links.w).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
    expect(propagate(g, { ...scenario, others: [{ driverId: 'drv', phaseId: 'warm' }] }).months[0].links.w).toEqual({ status: 'applied', confidence: 'probable', depth: 1, weakenedBy: [W] });
    expect(propagate(g, { ...scenario, others: [{ driverId: 'drv', phaseId: 'warmx' }] }).months[0].links.w).toEqual({ status: 'applied', confidence: 'probable', depth: 1, weakenedBy: [W] });
    expect(propagate(g, { ...scenario, others: [{ driverId: 'drv', phaseId: 'cool' }] }).months[0].links.w).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
    // The entry names the kind: only the kind counts.
    const gx = graphWithKinds([{ id: 'w', from: 'd2', when: 'up', to: 'c', effect: 1, weakened_by: [{ ...W, phase: 'warmx' }] }]);
    expect(propagate(gx, { ...scenario, others: [{ driverId: 'drv', phaseId: 'warm' }] }).months[0].links.w).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
    expect(propagate(gx, { ...scenario, others: [{ driverId: 'drv', phaseId: 'warmx' }] }).months[0].links.w.weakenedBy).toEqual([{ ...W, phase: 'warmx' }]);
  });

  it('a hold (rule 9) fades the inherited and the kind’s own links, and never reports the excepted one', () => {
    const g = graphWithKinds(LINKS);
    const t = propagate(g, { ...kind, holdMonths: 3 });
    expect(t.months[2].links.vb).toEqual({ status: 'applied', confidence: 'probable', depth: 1 });
    expect(t.months[3].links.vb).toEqual({ status: 'faded', confidence: 'probable', depth: 1 });
    expect(t.months[3].links.pa).toEqual({ status: 'faded', confidence: 'established', depth: 1 });
    expect(t.months[3].links.vc).toEqual({ status: 'faded', confidence: 'contested', depth: 1 });
    expect(t.months[3].links.pb).toBeUndefined();
    expect(t.months[3].nodes.b.fadedLinkIds).toEqual(['vb']);
    expect(t.months[3].nodes.drv.value).toBe(0);
  });

  it('the kind as another chosen driver, with its own start month and read backwards (rules 8, 12, 15)', () => {
    const g = graphWithKinds(LINKS);
    const t = propagate(g, { driverId: 'd2', phaseId: 'down', startMonth: 6, horizonMonths: 12, others: [{ driverId: 'drv', phaseId: 'warmx', startMonth: 9 }] });
    expect(t.months[2].nodes.b.value).toBe(0);
    expect(t.months[3].nodes.b.value).toBe(-1);
    expect(t.months[3].links.vb).toEqual({ status: 'applied', confidence: 'probable', depth: 1 });
    expect(t.months[3].links.pb).toBeUndefined();
    expect(arrivalMonth(t, 'vc', 'c')).toBe(5);
    const early = propagate(g, { driverId: 'd2', phaseId: 'down', startMonth: 6, horizonMonths: 12, others: [{ driverId: 'drv', phaseId: 'warmx', startMonth: 3, startsBefore: true }] });
    expect(early.months[0].links.vc).toEqual({ status: 'applied', confidence: 'contested', depth: 1 });
  });

  it('the confidence filter ghosts the kind’s own link at its own tier', () => {
    const g = graphWithKinds(LINKS);
    const t = propagate(g, { ...kind, minConfidence: 'established' });
    expect(t.months[0].links.vb).toEqual({ status: 'ghost', confidence: 'probable', depth: 1 });
    expect(t.months[0].nodes.b.value).toBe(0);
    expect(t.months[2].links.vc).toEqual({ status: 'ghost', confidence: 'contested', depth: 1 });
    expect(t.months[2].links.pa).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
  });

  it('regression: with the kind and its links removed from the graph, a scenario in the parent phase gives the same timeline, month for month', () => {
    const g = graphWithKinds(LINKS);
    const plain: Graph = {
      ...g,
      nodes: g.nodes.map((n) => (n.kind === 'driver' ? { ...n, phases: n.phases.filter((p) => !p.variant_of) } : n)),
      links: g.links.filter((l) => l.when !== 'warmx').map(({ except: _x, ...l }) => l),
    };
    for (const s of [warm, { ...warm, maxDepth: 3 }, { ...warm, holdMonths: 4, others: [{ driverId: 'd2', phaseId: 'up', startMonth: 9 }] }]) {
      expect(propagate(g, s).months).toEqual(propagate(plain, s).months);
    }
  });

  it('the same kind cannot be chosen alongside its parent: that is the same driver twice', () => {
    const g = graphWithKinds(LINKS);
    expect(() => propagate(g, { ...warm, others: [{ driverId: 'drv', phaseId: 'warmx' }] })).toThrow(/"drv" twice/);
  });
});

describe('phase variants (M36, rule 11): region mode', () => {
  it('lists the kind’s own links under the kind and the parent’s excepted links as except; a kind with neither is left out; the inherited link is listed once, under the parent', () => {
    const g = graphWithKinds(LINKS);
    const b = influencesOn(g, 'b')[0];
    expect(b.phases.map((p) => p.phase.id)).toEqual(['warm', 'warmx']);
    expect(b.phases[0].links.map((l) => l.link.id)).toEqual(['pb']);
    expect(b.phases[0].except).toEqual([]);
    expect(b.phases[1].links.map((l) => l.link.id)).toEqual(['vb']);
    expect(b.phases[1].except.map((l) => l.id)).toEqual(['pb']);
    const a = influencesOn(g, 'a')[0];
    expect(a.phases.map((p) => p.phase.id)).toEqual(['warm']);
    expect(a.phases[0].links.map((l) => l.link.id)).toEqual(['pa']);
    const c = influencesOn(g, 'c').find((x) => x.driver.id === 'drv')!;
    expect(c.phases.map((p) => p.phase.id)).toEqual(['warmx']);
    expect(c.phases[0].except).toEqual([]);
  });
});
