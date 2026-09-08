import { describe, expect, it } from 'vitest';
import { countInfluences, influencesOn, regionNodes, seasonStrip } from './inverse';
import type { Graph, Link } from '../types';
import graphJson from '../../public/data/graph.json';

function graphWith(links: Partial<Link>[]): Graph {
  return {
    nodes: [
      {
        id: 'drv', name: 'Driver', kind: 'driver', onset_hint: '', default_start_month: 6, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [],
        phases: [{ id: 'warm', label: 'Warm', color: '#000000', summary: '', value: 1 }, { id: 'mid', label: 'Mid', color: '#000000', summary: '', value: 0 }, { id: 'cool', label: 'Cool', color: '#000000', summary: '', value: -1 }],
      },
      {
        id: 'd2', name: 'Second driver', kind: 'driver', onset_hint: '', default_start_month: 6, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [],
        phases: [{ id: 'up', label: 'Up', color: '#000000', summary: '', value: 1 }, { id: 'mid', label: 'Mid', color: '#000000', summary: '', value: 0 }, { id: 'down', label: 'Down', color: '#000000', summary: '', value: -1 }],
      },
      { id: 'b', name: 'Beta place', kind: 'outcome', axis: 'wet_dry', labels: { plus: '', zero: '', minus: '' }, global: false, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [] },
      { id: 'a', name: 'Alpha place', kind: 'outcome', axis: 'wet_dry', labels: { plus: '', zero: '', minus: '' }, global: false, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [] },
    ],
    links: links.map((l, i) => ({
      id: `l${i}`, from: 'drv', when: 'warm', to: 'a', effect: 1, lag_months: [0, 0], season: [],
      confidence: 'established', mechanism: '', caveat: 'might not', sources: ['s'], ...l,
    })),
    sources: [{ key: 's', citation: 'x' }],
    stories: [],
  };
}

describe('seasonStrip', () => {
  it('is twelve months, January first; empty season means all year', () => {
    const [all, winter] = graphWith([{ season: [] }, { season: [12, 1, 2] }]).links;
    expect(seasonStrip(all)).toEqual(Array(12).fill(true));
    const w = seasonStrip(winter);
    expect(w).toHaveLength(12);
    expect(w.filter(Boolean)).toHaveLength(3);
    expect(w[0]).toBe(true);
    expect(w[1]).toBe(true);
    expect(w[11]).toBe(true);
    expect(w[5]).toBe(false);
  });
});

describe('influencesOn', () => {
  it('groups links into a node by driver and then by phase, in graph and phase order', () => {
    const g = graphWith([
      { id: 'cool_a', when: 'cool', effect: -1, confidence: 'probable', season: [6, 7] },
      { id: 'd2_a', from: 'd2', when: 'down', effect: 1, confidence: 'contested', lag_months: [2, 5] },
      { id: 'warm_a', when: 'warm', effect: 1 },
      { id: 'warm_b', when: 'warm', to: 'b' },
    ]);
    const groups = influencesOn(g, 'a');
    expect(groups.map((x) => x.driver.id)).toEqual(['drv', 'd2']);
    // The driver's own phase order (warm before cool), not the order the links were listed.
    expect(groups[0].phases.map((p) => p.phase.id)).toEqual(['warm', 'cool']);
    expect(groups[0].phases[0].links.map((l) => l.link.id)).toEqual(['warm_a']);
    expect(groups[0].phases[1].links.map((l) => l.link.id)).toEqual(['cool_a']);
    expect(groups[0].phases[1].links[0].confidence).toBe('probable');
    expect(groups[0].phases[1].links[0].months.filter(Boolean)).toHaveLength(2);
    expect(groups[1].phases.map((p) => p.phase.id)).toEqual(['down']);
    expect(groups[1].phases[0].links[0].link.lag_months).toEqual([2, 5]);
    expect(countInfluences(groups)).toBe(3);
    // The link into the other place is not here.
    expect(influencesOn(g, 'b').map((x) => x.driver.id)).toEqual(['drv']);
  });

  it('is empty for a node nothing reaches, and for an unknown id', () => {
    const g = graphWith([{ to: 'b' }]);
    expect(influencesOn(g, 'a')).toEqual([]);
    expect(influencesOn(g, 'nowhere')).toEqual([]);
    expect(countInfluences([])).toBe(0);
  });

  it('leaves out a phase that fires nothing into the node', () => {
    const g = graphWith([{ when: 'warm' }]);
    const [drv] = influencesOn(g, 'a');
    expect(drv.phases).toHaveLength(1);
    expect(drv.phases[0].phase.id).toBe('warm');
  });

  it('reports the link as the data rates it: its own tier, never downgraded', () => {
    const g = graphWith([{ from: 'd2', when: 'up', confidence: 'established' }]);
    expect(influencesOn(g, 'a')[0].phases[0].links[0].confidence).toBe('established');
  });
});

describe('regionNodes', () => {
  it('lists the outcome nodes alphabetically by name, no drivers', () => {
    const g = graphWith([]);
    expect(regionNodes(g).map((n) => n.id)).toEqual(['a', 'b']);
  });
});

describe('influencesOn on the shipped data', () => {
  const graph = graphJson as unknown as Graph;

  it('the Indian summer monsoon is reached by six drivers along eight links, ENSO both ways', () => {
    const groups = influencesOn(graph, 'indian_summer_monsoon');
    expect(groups).toHaveLength(6);
    expect(countInfluences(groups)).toBe(8);
    const enso = groups.find((g) => g.driver.id === 'enso')!;
    expect(enso.phases.map((p) => p.phase.id)).toEqual(['el_nino', 'la_nina']);
    expect(enso.phases[0].links[0].link.effect).toBe(-1);
    expect(enso.phases[1].links[0].link.effect).toBe(1);
  });

  it('the Sahel is reached by five drivers', () => {
    expect(influencesOn(graph, 'sahel_rainfall')).toHaveLength(5);
  });

  it('a place with one incoming link still carries its caveat and its season strip', () => {
    const groups = influencesOn(graph, 'east_asia_summer');
    expect(countInfluences(groups)).toBe(1);
    const only = groups[0].phases[0].links[0];
    expect(only.link.caveat.length).toBeGreaterThan(0);
    expect(only.months).toHaveLength(12);
    expect(only.months.some(Boolean)).toBe(true);
  });

  it('every outcome node is reached by at least one driver, and drivers are never listed as regions', () => {
    const regions = regionNodes(graph);
    expect(regions.length).toBe(graph.nodes.filter((n) => n.kind === 'outcome').length);
    for (const n of regions) expect(influencesOn(graph, n.id).length, n.id).toBeGreaterThan(0);
    const names = regions.map((n) => n.name);
    expect([...names].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(names);
  });

  it('every link into a region is listed exactly once across the groups', () => {
    for (const n of regionNodes(graph)) {
      const ids = influencesOn(graph, n.id).flatMap((g) => g.phases.flatMap((p) => p.links.map((l) => l.link.id))).sort();
      const expected = graph.links.filter((l) => l.to === n.id).map((l) => l.id).sort();
      expect(ids, n.id).toEqual(expected);
    }
  });
});
