// Version-1 acceptance checks from docs/PLAN.md section 7, run against the
// shipped data with the real engine. Each expected effect must be applied
// with the right sign at some month of a June-start scenario; effects are
// season-gated, so "by month 12" means "at some point in the year", and the
// month-12 map (June again) shows winter effects as pending, not applied.

import { describe, expect, it } from 'vitest';
import { propagate } from './propagate';
import type { Graph, Scenario, Timeline, Value } from '../types';
import graphJson from '../../public/data/graph.json';

const graph = graphJson as unknown as Graph;
const HORIZON = 12;

function run(phaseId: string): Timeline {
  const scenario: Scenario = { driverId: 'enso', phaseId, startMonth: 6, horizonMonths: HORIZON };
  return propagate(graph, scenario);
}

/** Months (indices) in which the node is applied with the given sign. */
function monthsWith(tl: Timeline, nodeId: string, sign: Value): number[] {
  return tl.months.filter((m) => m.nodes[nodeId].value === sign && m.nodes[nodeId].viaLinkIds.length > 0).map((m) => m.index);
}

const EL_NINO: Array<[string, Value, string]> = [
  ['indonesia_rainfall', -1, 'Indonesia dry'],
  ['east_australia_rainfall', -1, 'eastern Australia dry'],
  ['peru_coast_rainfall', 1, 'Peru coast wet'],
  ['us_gulf_coast_winter', 1, 'Gulf Coast wet'],
  ['atlantic_hurricanes', -1, 'Atlantic hurricanes quiet'],
  ['indian_summer_monsoon', -1, 'Indian monsoon weakened'],
  ['east_africa_short_rains', 1, 'East Africa short rains wet'],
  ['southern_africa_summer', -1, 'southern Africa dry'],
];

describe('acceptance: El Niño, June start', () => {
  const tl = run('el_nino');
  for (const [id, sign, label] of EL_NINO) {
    it(`${label} within twelve months`, () => {
      expect(monthsWith(tl, id, sign).length, `${id} never reaches ${sign}`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, (-sign) as Value), `${id} also shows the opposite sign`).toHaveLength(0);
    });
  }
  it('month 12 is June again and drying effects are still applied', () => {
    const m12 = tl.months[HORIZON];
    expect(m12.calendarMonth).toBe(6);
    for (const id of ['indonesia_rainfall', 'east_australia_rainfall', 'indian_summer_monsoon']) expect(m12.nodes[id].value).toBe(-1);
  });
  it('winter effects are pending, not applied, at month 12 (June)', () => {
    const m12 = tl.months[HORIZON];
    for (const id of ['peru_coast_rainfall', 'us_gulf_coast_winter', 'southern_africa_summer']) {
      expect(m12.nodes[id].viaLinkIds, `${id} applied out of season`).toHaveLength(0);
      expect(m12.nodes[id].pendingLinkIds.length, `${id} should be pending`).toBeGreaterThan(0);
    }
  });
});

describe('acceptance: La Niña, June start', () => {
  const tl = run('la_nina');
  it('reverses El Niño wherever a La Niña link exists, and never copies its sign', () => {
    const laNinaTargets = new Set(graph.links.filter((l) => l.when === 'la_nina').map((l) => l.to));
    for (const [id, sign] of EL_NINO) {
      if (!laNinaTargets.has(id)) continue;
      expect(monthsWith(tl, id, (-sign) as Value).length, `${id} should reverse El Niño`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, sign), `${id} copies the El Niño sign`).toHaveLength(0);
    }
  });
  it('nodes with no La Niña link stay untouched all year (no faked symmetry)', () => {
    const laNinaTargets = new Set(graph.links.filter((l) => l.when === 'la_nina').map((l) => l.to));
    for (const node of graph.nodes) {
      if (node.kind !== 'outcome' || laNinaTargets.has(node.id)) continue;
      for (const m of tl.months) {
        expect(m.nodes[node.id].value, `${node.id} at month ${m.index}`).toBe(0);
        expect(m.nodes[node.id].viaLinkIds).toHaveLength(0);
        expect(m.nodes[node.id].pendingLinkIds).toHaveLength(0);
      }
    }
  });
});

describe('acceptance: every link is sourced and caveated', () => {
  const keys = new Set(graph.sources.map((s) => s.key));
  for (const link of graph.links) {
    it(link.id, () => {
      expect(link.sources.length).toBeGreaterThan(0);
      for (const k of link.sources) expect(keys.has(k), `unknown source ${k}`).toBe(true);
      expect(link.caveat.trim().length).toBeGreaterThan(0);
    });
  }
});
