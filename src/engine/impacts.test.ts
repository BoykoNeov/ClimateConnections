// Impacts on people (M37, docs/PLAN.md §4 rule 12): a third node kind,
// reached only from an outcome through an impact link, one extra hop after
// the driver hops, one tier down and never above the outcome's own tier,
// only while the outcome holds the state the link follows from, and only
// when the scenario asks for it. Nothing flows back.

import { describe, expect, it } from 'vitest';
import { impactLinksOf, propagate, stateName } from './propagate';
import { linksInPlay } from './season';
import { scenarioForYear } from './years';
import type { Graph, Link, MonthState, Scenario, Story, Timeline } from '../types';
import { SECTORS } from '../types';
import graphJson from '../../public/data/graph.json';

/** An exact link state with any `settled` (M30, reporting only): the
 *  arrival window is checked in window.test.ts. */
const ls = (o: object) => ({ settled: expect.any(Boolean), ...o });

/** A driver, a second driver it pushes, four outcomes and five impacts. */
function graphWithImpacts(links: Partial<Link>[]): Graph {
  const outcome = (id: string) => ({ id, name: id.toUpperCase(), kind: 'outcome' as const, axis: 'wet_dry' as const, labels: { plus: 'wet', zero: 'normal', minus: 'dry' }, global: false, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [] });
  const impact = (id: string) => ({ id, name: id.toUpperCase(), kind: 'impact' as const, axis: 'more_less' as const, sector: 'agriculture' as const, labels: { plus: 'more', zero: 'normal', minus: 'less' }, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [] });
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
      outcome('a'), outcome('b'), outcome('c'), outcome('e'),
      impact('x'), impact('y'), impact('z'), impact('w'), impact('v'),
    ],
    links: links.map((l, i) => ({
      id: `l${i}`, from: 'drv', when: 'warm', to: 'a', effect: 1, lag_months: [0, 0], season: [],
      confidence: 'established', mechanism: '', caveat: '', sources: ['s'], ...l,
    })),
    sources: [{ key: 's', citation: 'x' }],
    stories: [],
  };
}

/** The standard set. Driver links: A dry in June–September, B wet from a
 *  month in (probable), the second driver pushed up, E wet (contested);
 *  the pushed driver: C wet. Impact links: X from A dry (+) and B wet (−),
 *  Y from C wet (established), Z from A dry after two months and from A
 *  wet (never), W from B wet in December–January, V from E wet. */
const LINKS: Partial<Link>[] = [
  { id: 'pa', to: 'a', effect: -1, season: [6, 7, 8, 9] },
  { id: 'pb', to: 'b', effect: 1, lag_months: [1, 1], confidence: 'probable' },
  { id: 'pd', to: 'd2', effect: 1 },
  { id: 'pe', to: 'e', effect: 1, confidence: 'contested' },
  { id: 'on', from: 'd2', when: 'up', to: 'c', effect: 1 },
  { id: 'ia', from: 'a', when: 'minus', to: 'x', effect: 1 },
  { id: 'ib', from: 'b', when: 'plus', to: 'x', effect: -1 },
  { id: 'ic', from: 'c', when: 'plus', to: 'y', effect: 1 },
  { id: 'ilag', from: 'a', when: 'minus', to: 'z', effect: -1, lag_months: [2, 2] },
  { id: 'iplus', from: 'a', when: 'plus', to: 'z', effect: 1 },
  { id: 'iseason', from: 'b', when: 'plus', to: 'w', effect: 1, season: [12, 1] },
  { id: 'ie', from: 'e', when: 'plus', to: 'v', effect: 1 },
];
const g = graphWithImpacts(LINKS);
const base: Scenario = { driverId: 'drv', phaseId: 'warm', startMonth: 6, horizonMonths: 12, maxDepth: 3 };
const on: Scenario = { ...base, impacts: true };
const IMPACTS = ['x', 'y', 'z', 'w', 'v'];
const IMPACT_LINKS = ['ia', 'ib', 'ic', 'ilag', 'iplus', 'iseason', 'ie'];

/** Everything in a month except the impact nodes and the impact links. */
function withoutImpacts(m: MonthState): MonthState {
  const nodes = Object.fromEntries(Object.entries(m.nodes).filter(([id]) => !IMPACTS.includes(id)));
  const links = Object.fromEntries(Object.entries(m.links).filter(([id]) => !IMPACT_LINKS.includes(id)));
  return { ...m, nodes, links };
}

describe('the impact hop (M37, rule 12): the helpers', () => {
  it('stateName and impactLinksOf', () => {
    expect(stateName(1)).toBe('plus');
    expect(stateName(-1)).toBe('minus');
    expect(stateName(0)).toBeNull();
    expect(impactLinksOf(g, 'a', 'minus').map((l) => l.id)).toEqual(['ia', 'ilag']);
    expect(impactLinksOf(g, 'a', 'plus').map((l) => l.id)).toEqual(['iplus']);
    expect(impactLinksOf(g, 'x', 'plus')).toEqual([]);
  });
});

describe('the impact hop (M37, rule 12): off by default', () => {
  const tl = propagate(g, base);
  it('reports no impact link and leaves every impact node empty', () => {
    for (const m of tl.months) {
      for (const id of IMPACT_LINKS) expect(m.links[id], `${id} month ${m.index}`).toBeUndefined();
      for (const id of IMPACTS) expect(m.nodes[id]).toEqual({ value: 0, confidence: null, viaLinkIds: [], pendingLinkIds: [], fadedLinkIds: [], inSeason: false, conflicting: false });
    }
  });
  it('gives the same drivers, outcomes and links as the hop switched on', () => {
    const onTl = propagate(g, on);
    for (let i = 0; i < tl.months.length; i++) expect(withoutImpacts(onTl.months[i])).toEqual(withoutImpacts(tl.months[i]));
  });
  it('is the same as a graph without the impacts at all', () => {
    const bare: Graph = { ...g, nodes: g.nodes.filter((n) => n.kind !== 'impact'), links: g.links.filter((l) => !IMPACT_LINKS.includes(l.id)) };
    const bareTl = propagate(bare, base);
    for (let i = 0; i < tl.months.length; i++) expect(withoutImpacts(tl.months[i])).toEqual(bareTl.months[i]);
  });
});

describe('the impact hop (M37, rule 12): switched on, warm from June', () => {
  const tl = propagate(g, on);
  const m = (i: number) => tl.months[i];
  it('June: X reached from A dry, one tier down (probable), depth 2, the same month A holds its state', () => {
    expect(m(0).nodes.a.value).toBe(-1);
    expect(m(0).links.ia).toEqual(ls({ status: 'applied', confidence: 'probable', depth: 2 }));
    expect(m(0).nodes.x).toMatchObject({ value: 1, confidence: 'probable', viaLinkIds: ['ia'], pendingLinkIds: [], fadedLinkIds: [], inSeason: true, conflicting: false });
  });
  it('a link for the other state never fires: A is never wet, so iplus is never reported', () => {
    for (const mo of tl.months) expect(mo.links.iplus, `month ${mo.index}`).toBeUndefined();
  });
  it('July: B wet (probable) pushes X the other way, so X conflicts and cancels to 0, hatched, both links listed', () => {
    expect(m(1).nodes.b.value).toBe(1);
    expect(m(1).links.ib).toEqual(ls({ status: 'applied', confidence: 'probable', depth: 2 }));
    expect(m(1).nodes.x).toMatchObject({ value: 0, conflicting: true, confidence: 'probable' });
    expect([...m(1).nodes.x.viaLinkIds].sort()).toEqual(['ia', 'ib']);
  });
  it('the lag counts from the outcome’s first month in the state: Z from August (month 2), and again at once in June (month 12)', () => {
    expect(m(0).links.ilag).toBeUndefined();
    expect(m(1).links.ilag).toBeUndefined();
    expect(m(2).links.ilag).toEqual(ls({ status: 'applied', confidence: 'probable', depth: 2 }));
    expect(m(2).nodes.z.value).toBe(-1);
    expect(m(3).nodes.z.value).toBe(-1);
    expect(m(12).nodes.a.value).toBe(-1);
    expect(m(12).links.ilag?.status).toBe('applied');
  });
  it('an outcome that drops out of its state reports nothing: October, A at 0, ia and ilag gone (not faded), X on B alone', () => {
    expect(m(4).nodes.a.value).toBe(0);
    expect(m(4).nodes.a.viaLinkIds).toEqual([]);
    expect(m(4).links.ia).toBeUndefined();
    expect(m(4).links.ilag).toBeUndefined();
    expect(m(4).nodes.z).toMatchObject({ value: 0, viaLinkIds: [], pendingLinkIds: [], fadedLinkIds: [] });
    expect(m(4).nodes.x).toMatchObject({ value: -1, conflicting: false, viaLinkIds: ['ib'] });
  });
  it('the season gate: W pending in July, applied in December and January, pending again in February', () => {
    expect(m(1).links.iseason).toEqual(ls({ status: 'pending', confidence: 'probable', depth: 2 }));
    expect(m(1).nodes.w).toMatchObject({ value: 0, pendingLinkIds: ['iseason'], viaLinkIds: [] });
    expect(m(6).links.iseason?.status).toBe('applied');
    expect(m(6).nodes.w.value).toBe(1);
    expect(m(7).links.iseason?.status).toBe('applied');
    expect(m(8).links.iseason?.status).toBe('pending');
  });
  it('from a second-hop outcome: C wet through the pushed driver, Y at depth 3, two tiers down (contested)', () => {
    expect(m(0).nodes.d2.value).toBe(1);
    expect(m(0).links.on).toMatchObject({ depth: 2, confidence: 'probable' });
    expect(m(0).links.ic).toEqual(ls({ status: 'applied', confidence: 'contested', depth: 3 }));
    expect(m(0).nodes.y).toMatchObject({ value: 1, confidence: 'contested' });
  });
  it('never above the outcome’s own tier: E is contested, so V is contested although its link is established', () => {
    expect(m(0).nodes.e.confidence).toBe('contested');
    expect(m(0).links.ie).toEqual(ls({ status: 'applied', confidence: 'contested', depth: 2 }));
  });
  it('maxDepth does not bound the hop: direct links only still reaches X, and Y is gone because C is', () => {
    const direct = propagate(g, { ...on, maxDepth: 1 });
    expect(direct.months[0].links.ia?.status).toBe('applied');
    expect(direct.months[0].nodes.c.value).toBe(0);
    expect(direct.months[0].links.ic).toBeUndefined();
    expect(direct.months[0].nodes.y.value).toBe(0);
  });
  it('the confidence filter ghosts an impact link at its effective tier', () => {
    const filtered = propagate(g, { ...on, minConfidence: 'probable' });
    expect(filtered.months[0].links.ia?.status).toBe('applied');
    expect(filtered.months[0].links.ic).toEqual(ls({ status: 'ghost', confidence: 'contested', depth: 3 }));
    expect(filtered.months[0].nodes.y.value).toBe(0);
    const strict = propagate(g, { ...on, minConfidence: 'established' });
    expect(strict.months[0].links.ia).toEqual(ls({ status: 'ghost', confidence: 'probable', depth: 2 }));
    expect(strict.months[0].nodes.x.value).toBe(0);
  });
  it('a hold on the driver (rule 9): from the fade no outcome holds a state, so no impact link is reported, not faded either, while the driver’s own links are', () => {
    const held = propagate(g, { ...on, holdMonths: 3 });
    expect(held.months[2].links.ia?.status).toBe('applied');
    expect(held.months[2].links.ib?.status).toBe('applied');
    expect(held.months[3].links.pa?.status).toBe('faded');
    expect(held.months[3].links.pb?.status).toBe('faded');
    expect(held.months[3].nodes.a.value).toBe(0);
    expect(held.months[3].nodes.b.value).toBe(0);
    for (const id of IMPACT_LINKS) expect(held.months[3].links[id], id).toBeUndefined();
    expect(held.months[3].nodes.x).toMatchObject({ value: 0, viaLinkIds: [], pendingLinkIds: [], fadedLinkIds: [] });
  });
  it('a neutral scenario reaches nothing', () => {
    const mid = propagate(g, { ...on, phaseId: 'mid' });
    for (const mo of mid.months) for (const id of IMPACT_LINKS) expect(mo.links[id]).toBeUndefined();
  });
  it('the links in play (the season dial) include the impact links that were applied or pending', () => {
    expect(linksInPlay(g, tl).map((l) => l.id)).toEqual(['pa', 'pb', 'pd', 'pe', 'on', 'ia', 'ib', 'ic', 'ilag', 'iseason', 'ie']);
    expect(linksInPlay(g, propagate(g, base)).map((l) => l.id)).toEqual(['pa', 'pb', 'pd', 'pe', 'on']);
  });
});

// ---------------------------------------------------------------- shipped data
const graph = graphJson as unknown as Graph;
const HORIZON = 12;

function run(phaseId: string, extra: Partial<Scenario> = {}): Timeline {
  return propagate(graph, { driverId: 'enso', phaseId, startMonth: 6, horizonMonths: HORIZON, maxDepth: 3, impacts: true, ...extra });
}

/** Month indices in which the node is applied with the given sign. */
function monthsWith(tl: Timeline, nodeId: string, sign: 1 | -1): number[] {
  return tl.months.filter((m) => m.nodes[nodeId].value === sign && m.nodes[nodeId].viaLinkIds.length > 0).map((m) => m.index);
}

/** The scenario a story sets, as the app builds it. */
function storyScenario(story: Story, impacts: boolean): Scenario {
  const s: Scenario = { driverId: story.driver, phaseId: story.phase, startMonth: story.start_month, horizonMonths: HORIZON, maxDepth: 3 };
  if (story.hold_months !== undefined) s.holdMonths = story.hold_months;
  if (story.drivers && story.drivers.length > 0) {
    s.others = story.drivers.map((d) => {
      const o: NonNullable<Scenario['others']>[number] = { driverId: d.driver, phaseId: d.phase, startMonth: d.start_month ?? story.start_month, startsBefore: !!d.starts_before };
      if (d.hold_months !== undefined) o.holdMonths = d.hold_months;
      return o;
    });
  }
  if (impacts) s.impacts = true;
  return s;
}

const impactIds = graph.nodes.filter((n) => n.kind === 'impact').map((n) => n.id);
const impactLinkIds = graph.links.filter((l) => graph.nodes.find((n) => n.id === l.from)?.kind === 'outcome').map((l) => l.id);
function stripImpacts(m: MonthState): MonthState {
  const nodes = Object.fromEntries(Object.entries(m.nodes).filter(([id]) => !impactIds.includes(id)));
  const links = Object.fromEntries(Object.entries(m.links).filter(([id]) => !impactLinkIds.includes(id)));
  return { ...m, nodes, links };
}

describe('acceptance: impacts on people (M37), the data', () => {
  it('ships ten impacts, each with a sector from the list, labels, a source and no area, and thirteen impact links from outcomes only', () => {
    const impacts = graph.nodes.filter((n) => n.kind === 'impact');
    expect(impacts.map((n) => n.id)).toEqual([
      'india_foodgrain_output', 'indonesia_peat_fires', 'east_africa_rift_valley_fever', 'peru_coast_malaria_dengue', 'zimbabwe_maize_yield',
      'pampas_grain_yields', 'australia_wheat_yield', 'peru_fishmeal_output', 'california_streamflow', 'niger_river_flow',
    ]);
    for (const n of impacts) {
      if (n.kind !== 'impact') continue;
      expect(SECTORS, n.id).toContain(n.sector);
      expect(n.axis).toBe('more_less');
      expect(n.area).toBeUndefined();
      expect(n.sources.length, n.id).toBeGreaterThan(0);
      expect(graph.links.filter((l) => l.to === n.id).length, `${n.id} has no link into it`).toBeGreaterThan(0);
      expect(graph.links.filter((l) => l.from === n.id)).toHaveLength(0);
    }
    expect(impacts.map((n) => n.kind === 'impact' && n.sector)).toEqual(['agriculture', 'fire', 'health', 'health', 'agriculture', 'agriculture', 'agriculture', 'fisheries', 'water', 'water']);
    const into = graph.links.filter((l) => impactIds.includes(l.to));
    expect(into).toHaveLength(13);
    expect(into.map((l) => l.id)).toEqual(impactLinkIds);
    for (const l of into) {
      const from = graph.nodes.find((n) => n.id === l.from)!;
      expect(from.kind, l.id).toBe('outcome');
      expect(['plus', 'minus'], l.id).toContain(l.when);
      expect(l.weakened_by, l.id).toBeUndefined();
      expect(l.except, l.id).toBeUndefined();
      expect(l.evidence_note, l.id).toBeDefined();
      expect(l.caveat.trim().length, l.id).toBeGreaterThan(20);
      for (const k of l.sources) expect(graph.sources.some((s) => s.key === k), `${l.id} cites ${k}`).toBe(true);
    }
    // The curatorial rule: established only on a multi-decade study of the impact itself.
    expect(into.filter((l) => l.confidence === 'established').map((l) => l.id).sort()).toEqual(['dry_california_streamflow', 'dry_indonesia_peat_fires', 'fishery_collapse_fishmeal', 'weak_monsoon_india_foodgrain', 'wet_california_streamflow']);
    // The counts elsewhere are unchanged.
    expect(graph.nodes.filter((n) => n.kind === 'outcome')).toHaveLength(62);
    expect(graph.nodes.filter((n) => n.kind === 'driver')).toHaveLength(14);
  });
  it('every impact link is drawn in at least one single-driver scenario from the driver’s usual start month', () => {
    const drawn = new Set<string>();
    for (const d of graph.nodes) {
      if (d.kind !== 'driver') continue;
      for (const p of d.phases) {
        if (p.value === 0) continue;
        const tl = propagate(graph, { driverId: d.id, phaseId: p.id, startMonth: d.default_start_month, horizonMonths: HORIZON, maxDepth: 3, impacts: true });
        for (const m of tl.months) for (const [id, ls] of Object.entries(m.links)) if (ls.status === 'applied' && impactLinkIds.includes(id)) drawn.add(id);
      }
    }
    expect([...drawn].sort()).toEqual([...impactLinkIds].sort());
  });
  it('the 1997–98 impacts story turns the layer on, points at seven of the ten squares and at the monsoon tie, and cites resolvable sources', () => {
    const s = graph.stories.find((x) => x.id === 'el_nino_1997_98_impacts')!;
    expect(s.impacts).toBe(true);
    expect(s.start_year).toBe(1997);
    expect(s.steps.map((st) => st.focus)).toEqual(['enso', 'indonesia_peat_fires', 'indian_summer_monsoon', 'east_africa_rift_valley_fever', 'peru_fishmeal_output', 'pampas_grain_yields', 'peru_coast_malaria_dengue', 'zimbabwe_maize_yield', 'california_streamflow']);
    // The monsoon step: a tie on the map (El Niño against the dipole it sets off), so no harvest square.
    const tl = propagate(graph, storyScenario(s, true));
    expect(tl.months[4].nodes.indian_summer_monsoon).toMatchObject({ value: 0, conflicting: true });
    expect(tl.months[4].nodes.india_foodgrain_output.viaLinkIds).toEqual([]);
    for (const st of s.steps) for (const k of st.sources) expect(graph.sources.some((x) => x.key === k), k).toBe(true);
    expect(graph.stories.filter((x) => x.impacts).map((x) => x.id)).toEqual(['el_nino_1997_98_impacts']);
  });
});

describe('acceptance: El Niño from June with the impacts on, chain on', () => {
  const tl = run('el_nino');
  const m = (i: number) => tl.months[i];
  it('India’s harvest: with the chain on the monsoon is a tie (El Niño dries it, the dipole El Niño sets off wets it), so no square; with direct links only, smaller June–September (months 0–3) at probable, one tier below the established link, and untouched from October', () => {
    for (const mo of tl.months.slice(0, 4)) {
      expect(mo.nodes.indian_summer_monsoon, `month ${mo.index}`).toMatchObject({ value: 0, conflicting: true });
      expect(mo.links.weak_monsoon_india_foodgrain).toBeUndefined();
    }
    expect(monthsWith(tl, 'india_foodgrain_output', -1)).toEqual([]);
    const direct = run('el_nino', { maxDepth: 1 });
    expect(monthsWith(direct, 'india_foodgrain_output', -1)).toEqual([0, 1, 2, 3, 12]); // month 12 is June again
    expect(direct.months[0].links.weak_monsoon_india_foodgrain).toEqual(ls({ status: 'applied', confidence: 'probable', depth: 2 }));
    expect(direct.months[4].links.weak_monsoon_india_foodgrain).toBeUndefined();
    expect(direct.months[4].nodes.india_foodgrain_output.value).toBe(0);
  });
  it('Indonesia’s fires worse from July (a month after the drying begins) to November, pending in December when their season ends while the drying goes on', () => {
    expect(monthsWith(tl, 'indonesia_peat_fires', 1)).toEqual([1, 2, 3, 4, 5]);
    expect(m(0).links.dry_indonesia_peat_fires).toBeUndefined();
    expect(m(6).nodes.indonesia_rainfall.value).toBe(-1);
    expect(m(6).links.dry_indonesia_peat_fires?.status).toBe('pending');
  });
  it('Rift Valley fever risk up in November and December (months 5–6), a month after the wet short rains begin, at contested (a probable link, one tier down)', () => {
    expect(monthsWith(tl, 'east_africa_rift_valley_fever', 1)).toEqual([5, 6]);
    expect(m(5).links.wet_short_rains_rift_valley_fever).toEqual(ls({ status: 'applied', confidence: 'contested', depth: 2 }));
    expect(m(7).links.wet_short_rains_rift_valley_fever).toBeUndefined();
  });
  it('malaria and dengue up on the coast of Peru January–April (months 7–10), the month after the rains begin', () => {
    expect(monthsWith(tl, 'peru_coast_malaria_dengue', 1)).toEqual([7, 8, 9, 10]);
  });
  it('Zimbabwe’s maize smaller December–March (months 6–9), the Pampas harvests larger October–January (months 4–7)', () => {
    expect(monthsWith(tl, 'zimbabwe_maize_yield', -1)).toEqual([6, 7, 8, 9]);
    expect(monthsWith(tl, 'pampas_grain_yields', 1)).toEqual([4, 5, 6, 7]);
    expect(monthsWith(tl, 'pampas_grain_yields', -1)).toEqual([]);
  });
  it('Australia’s wheat smaller from June through the east, and through the south-east as well once the dipole the chain pushes dries it, at contested (depth 3)', () => {
    const months = monthsWith(tl, 'australia_wheat_yield', -1);
    expect(months[0]).toBe(0);
    const both = tl.months.find((mo) => mo.nodes.australia_wheat_yield.viaLinkIds.length === 2);
    expect(both, 'no month with both wheat links').toBeDefined();
    expect([...both!.nodes.australia_wheat_yield.viaLinkIds].sort()).toEqual(['dry_east_australia_wheat', 'dry_southeast_australia_wheat']);
    expect(both!.links.dry_east_australia_wheat).toMatchObject({ depth: 2, confidence: 'contested' });
    expect(both!.links.dry_southeast_australia_wheat).toMatchObject({ depth: 3, confidence: 'contested' });
    expect(both!.nodes.australia_wheat_yield.confidence).toBe('contested');
    expect(both!.nodes.australia_wheat_yield.conflicting).toBe(false);
  });
  it('fishmeal output collapsing from September (month 3) to the end, at probable', () => {
    expect(monthsWith(tl, 'peru_fishmeal_output', -1)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(m(3).links.fishery_collapse_fishmeal?.confidence).toBe('probable');
  });
  it('California’s runoff up December–March at contested, capped by the contested link to California', () => {
    expect(monthsWith(tl, 'california_streamflow', 1)).toEqual([6, 7, 8, 9]);
    expect(m(6).links.wet_california_streamflow).toEqual(ls({ status: 'applied', confidence: 'contested', depth: 2 }));
  });
  it('the Niger’s flow down in August and September (months 2–3), a month after the Sahel dries, at contested', () => {
    expect(monthsWith(tl, 'niger_river_flow', -1)).toEqual([2, 3]);
    expect(m(2).links.dry_sahel_niger_flow?.confidence).toBe('contested');
  });
  it('with the layer off, the same June El Niño gives the same drivers, outcomes and links, and no square', () => {
    const off = run('el_nino', { impacts: false });
    for (let i = 0; i <= HORIZON; i++) {
      expect(stripImpacts(tl.months[i])).toEqual(stripImpacts(off.months[i]));
      for (const id of impactIds) expect(off.months[i].nodes[id].viaLinkIds, `${id} month ${i}`).toEqual([]);
      for (const id of impactLinkIds) expect(off.months[i].links[id], `${id} month ${i}`).toBeUndefined();
    }
  });
});

describe('acceptance: La Niña from June with the impacts on', () => {
  const tl = run('la_nina');
  it('the Pampas harvests smaller October–January and California’s runoff down December–March; no fishmeal, harvest or fire square (no link for those states)', () => {
    expect(monthsWith(tl, 'pampas_grain_yields', -1)).toEqual([4, 5, 6, 7]);
    expect(monthsWith(tl, 'california_streamflow', -1)).toEqual([6, 7, 8, 9]);
    for (const id of ['peru_fishmeal_output', 'india_foodgrain_output', 'indonesia_peat_fires', 'zimbabwe_maize_yield']) {
      for (const m of tl.months) expect(m.nodes[id].viaLinkIds, `${id} month ${m.index}`).toEqual([]);
    }
  });
});

describe('acceptance: the impact hop changes nothing else (M37 regression)', () => {
  for (const story of graph.stories) {
    it(`${story.title}: the same drivers, outcomes and links with the layer on and off`, () => {
      const a = propagate(graph, storyScenario(story, true));
      const b = propagate(graph, storyScenario(story, false));
      for (let i = 0; i < a.months.length; i++) expect(stripImpacts(a.months[i])).toEqual(stripImpacts(b.months[i]));
    });
  }
  it('every real year: the same drivers, outcomes and links with the layer on and off', () => {
    for (const row of graph.years ?? []) {
      const sc = scenarioForYear(graph, row, HORIZON).scenario;
      const a = propagate(graph, { ...sc, impacts: true });
      const b = propagate(graph, sc);
      for (let i = 0; i < a.months.length; i++) expect(stripImpacts(a.months[i]), `${row.year} month ${i}`).toEqual(stripImpacts(b.months[i]));
    }
  });
});
