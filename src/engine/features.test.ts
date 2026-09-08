// Seasonal features (M41, docs/PLAN.md §4 rule 13): fixtures of the year's
// weather the links work through, drawn and never computed. The helpers
// read what the engine reported; the engine itself never reads a feature
// or a link's `via`, and the regression at the end proves it on every
// shipped story and real year.

import { describe, expect, it } from 'vitest';
import { featureDrawn, featureNodes, featurePresent, featuresThisMonth, linksThrough } from './features';
import { propagate } from './propagate';
import { scenarioForYear } from './years';
import type { FeatureNode, Graph, Scenario, Story, Timeline } from '../types';
import { FEATURE_SYMBOLS } from '../types';
import graphJson from '../../public/data/graph.json';

const graph = graphJson as unknown as Graph;

const feature = (over: Partial<FeatureNode> = {}): FeatureNode => ({
  id: 'f', name: 'F', label: 'F', kind: 'feature', symbol: 'low', months: [], lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [], ...over,
});

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

describe('featurePresent', () => {
  it('empty months means all year', () => {
    for (let m = 1; m <= 12; m++) expect(featurePresent(feature({ months: [] }), m)).toBe(true);
  });
  it('a winter feature is present in its months only, across the year end', () => {
    const f = feature({ months: [10, 11, 12, 1, 2, 3] });
    expect(featurePresent(f, 10)).toBe(true);
    expect(featurePresent(f, 1)).toBe(true);
    expect(featurePresent(f, 3)).toBe(true);
    expect(featurePresent(f, 4)).toBe(false);
    expect(featurePresent(f, 7)).toBe(false);
  });
});

describe('the shipped features (M41)', () => {
  const features = featureNodes(graph);
  it('five features, each drawn as a chart symbol, in their months', () => {
    expect(features.map((f) => f.id)).toEqual(['aleutian_low', 'icelandic_low', 'azores_high', 'siberian_high', 'polar_vortex']);
    for (const f of features) {
      expect(FEATURE_SYMBOLS).toContain(f.symbol);
      expect(f.label, f.id).toBeDefined();
      expect(new Set(f.months).size).toBe(f.months.length);
      for (const m of f.months) expect(m).toBeGreaterThanOrEqual(1);
      for (const m of f.months) expect(m).toBeLessThanOrEqual(12);
    }
    expect(features.find((f) => f.id === 'azores_high')!.months).toEqual([]);
    expect(features.find((f) => f.id === 'siberian_high')!.months).toEqual([11, 12, 1, 2, 3]);
  });
  it('every feature has links through it, and every such link names it in its own text', () => {
    for (const f of features) {
      const through = linksThrough(graph, f.id);
      expect(through.length, f.id).toBeGreaterThan(0);
      for (const l of through) {
        const text = [l.mechanism, l.caveat, l.evidence_note ?? ''].join(' ').toLowerCase();
        expect(text.includes(f.label!.toLowerCase()), `${l.id} does not name ${f.label}`).toBe(true);
        // A link through a feature is drawable in some month the feature is there.
        if (l.season.length > 0 && f.months.length > 0) expect(l.season.some((m) => f.months.includes(m)), `${l.id} / ${f.id}`).toBe(true);
      }
    }
  });
  it('no link starts or ends at a feature, and no impact link has via', () => {
    const ids = new Set(features.map((f) => f.id));
    const kind = new Map(graph.nodes.map((n) => [n.id, n.kind]));
    for (const l of graph.links) {
      expect(ids.has(l.from), l.id).toBe(false);
      expect(ids.has(l.to), l.id).toBe(false);
      if (kind.get(l.from) === 'outcome') expect(l.via, l.id).toBeUndefined();
      for (const v of l.via ?? []) expect(ids.has(v), `${l.id} via ${v}`).toBe(true);
    }
  });
  it('the Aleutian Low: the PDO\'s eight winter links and ENSO\'s two pushes on the PDO', () => {
    expect(linksThrough(graph, 'aleutian_low').map((l) => l.id).sort()).toEqual([
      'el_nino_positive_pdo', 'la_nina_negative_pdo',
      'negative_pdo_alaska', 'negative_pdo_canadian_prairies', 'negative_pdo_pacific_northwest', 'negative_pdo_us_southwest',
      'positive_pdo_alaska', 'positive_pdo_canadian_prairies', 'positive_pdo_pacific_northwest', 'positive_pdo_us_southwest',
    ]);
  });
  it('the polar vortex: the stratospheric routes to the NAO and northern Europe, never the SAM\'s southern vortex', () => {
    const ids = linksThrough(graph, 'polar_vortex').map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(['easterly_qbo_negative_nao', 'westerly_qbo_positive_nao', 'eruption_positive_nao', 'low_ice_negative_nao', 'high_snow_negative_nao']));
    expect(ids).not.toContain('negative_sam_east_australia_summer');
    expect(ids).toHaveLength(8);
  });
  it('fifty entries on thirty-five links', () => {
    const withVia = graph.links.filter((l) => l.via && l.via.length > 0);
    expect(withVia).toHaveLength(35);
    expect(withVia.reduce((n, l) => n + l.via!.length, 0)).toBe(50);
  });
});

describe('featuresThisMonth under El Niño from June with the chain on', () => {
  const tl = propagate(graph, { driverId: 'enso', phaseId: 'el_nino', startMonth: 6, horizonMonths: 12, maxDepth: 3 });
  const at = (i: number) => new Map(featuresThisMonth(graph, tl.months[i]).map((f) => [f.feature.id, f]));
  it('every feature is reported every month, in graph order', () => {
    expect(featuresThisMonth(graph, tl.months[0]).map((f) => f.feature.id)).toEqual(['aleutian_low', 'icelandic_low', 'azores_high', 'siberian_high', 'polar_vortex']);
  });
  it('July (month 1): the winter fixtures absent and idle, so not drawn; the Azores High present all year and idle', () => {
    const m = at(1);
    for (const id of ['aleutian_low', 'icelandic_low', 'siberian_high', 'polar_vortex']) {
      const f = m.get(id)!;
      expect(f.present, id).toBe(false);
      expect(f.applied, id).toEqual([]);
      expect(featureDrawn(f), id).toBe(false);
    }
    const azores = m.get('azores_high')!;
    expect(azores.present).toBe(true);
    expect(azores.applied).toEqual([]);
    expect(featureDrawn(azores)).toBe(true);
  });
  it('September (month 3): the push on the PDO is applied before the low is back, so the low is drawn filled outside its months', () => {
    const f = at(3).get('aleutian_low')!;
    expect(f.present).toBe(false);
    expect(f.applied).toEqual(['el_nino_positive_pdo']);
    expect(featureDrawn(f)).toBe(true);
  });
  it('October (month 4): the Aleutian Low present and filled through the push on the PDO', () => {
    const f = at(4).get('aleutian_low')!;
    expect(f.present).toBe(true);
    expect(f.applied).toContain('el_nino_positive_pdo');
    expect(f.applied).toContain('positive_pdo_alaska');
  });
  it('December (month 6): the PDO\'s winter arrows all work through the Aleutian Low', () => {
    const f = at(6).get('aleutian_low')!;
    expect(f.applied).toEqual(expect.arrayContaining(['el_nino_positive_pdo', 'positive_pdo_alaska', 'positive_pdo_pacific_northwest', 'positive_pdo_canadian_prairies', 'positive_pdo_us_southwest']));
    expect(f.pending).toEqual([]);
  });
  it('February (month 8): the Atlantic pair filled through the push on the NAO, the Siberian High through the pushed NAO\'s arrow to western Russia, the polar vortex present and idle', () => {
    const m = at(8);
    expect(m.get('icelandic_low')!.applied).toContain('el_nino_negative_nao');
    expect(m.get('azores_high')!.applied).toContain('el_nino_negative_nao');
    expect(m.get('icelandic_low')!.applied).toContain('negative_nao_northern_europe');
    expect(m.get('siberian_high')!.applied).toEqual(['negative_nao_western_russia']);
    const vortex = m.get('polar_vortex')!;
    expect(vortex.present).toBe(true);
    expect(vortex.applied).toEqual([]);
    expect(vortex.pending).toEqual([]);
    expect(featureDrawn(vortex)).toBe(true);
  });
  it('a pending link counts as pending, never as applied: the push on the NAO in December', () => {
    const f = at(6).get('icelandic_low')!;
    expect(f.pending).toContain('el_nino_negative_nao');
    expect(f.applied).not.toContain('el_nino_negative_nao');
  });
  it('a ghost link never counts: established only leaves the Atlantic pair idle in February', () => {
    const ghosted = propagate(graph, { driverId: 'enso', phaseId: 'el_nino', startMonth: 6, horizonMonths: 12, maxDepth: 3, minConfidence: 'established' });
    const f = featuresThisMonth(graph, ghosted.months[8]).find((x) => x.feature.id === 'icelandic_low')!;
    expect(ghosted.months[8].links.el_nino_negative_nao?.status).toBe('ghost');
    expect(f.applied).toEqual([]);
    expect(f.pending).toEqual([]);
  });
});

describe('rule 13: the engine never reads a feature or a via', () => {
  const featureIds = new Set(featureNodes(graph).map((f) => f.id));
  const stripped: Graph = {
    ...graph,
    nodes: graph.nodes.filter((n) => n.kind !== 'feature'),
    links: graph.links.map((l) => { const { via: _via, ...rest } = l; return rest; }),
  };
  const withoutFeatures = (tl: Timeline) => tl.months.map((m) => ({ ...m, nodes: Object.fromEntries(Object.entries(m.nodes).filter(([id]) => !featureIds.has(id))) }));
  it('a feature holds the empty state in every month of every story', () => {
    for (const story of graph.stories) {
      const tl = propagate(graph, storyScenario(story));
      for (const m of tl.months) for (const id of featureIds) {
        expect(m.nodes[id], `${story.id} month ${m.index} ${id}`).toEqual({ value: 0, confidence: null, viaLinkIds: [], pendingLinkIds: [], fadedLinkIds: [], inSeason: false, conflicting: false });
      }
    }
  });
  for (const story of graph.stories) {
    it(`${story.title}: the same timeline with the features and every via stripped`, () => {
      expect(withoutFeatures(propagate(graph, storyScenario(story)))).toEqual(withoutFeatures(propagate(stripped, storyScenario(story))));
    });
  }
  it('every real year: the same timeline with the features and every via stripped', () => {
    for (const row of graph.years ?? []) {
      const s = scenarioForYear(graph, row, 12).scenario;
      expect(withoutFeatures(propagate(graph, s)), String(row.year)).toEqual(withoutFeatures(propagate(stripped, s)));
    }
  });
  it('the winter-machinery story turns the layer on and points at two features while an arrow works through them', () => {
    const story = graph.stories.find((s) => s.id === 'el_nino_winter_machinery')!;
    expect(story.features).toBe(true);
    const tl = propagate(graph, storyScenario(story));
    for (const step of story.steps) {
      const node = graph.nodes.find((n) => n.id === step.focus)!;
      if (node.kind !== 'feature') continue;
      const f = featuresThisMonth(graph, tl.months[step.month]).find((x) => x.feature.id === step.focus)!;
      expect(f.applied.length, `${step.focus} at month ${step.month}`).toBeGreaterThan(0);
      expect(f.present).toBe(true);
    }
    expect(story.steps.filter((s) => graph.nodes.find((n) => n.id === s.focus)?.kind === 'feature').map((s) => s.focus)).toEqual(['aleutian_low', 'icelandic_low']);
    expect(graph.stories.filter((s) => s.features).map((s) => s.id)).toEqual(['el_nino_winter_machinery']);
  });
});
