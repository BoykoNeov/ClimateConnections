// Acceptance checks from docs/PLAN.md section 7 (version 1) and M8 (second driver), run against the
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

// ---------------------------------------------------------------- M8: second driver (Indian Ocean Dipole)
function runIod(phaseId: string): Timeline {
  return propagate(graph, { driverId: 'iod', phaseId, startMonth: 6, horizonMonths: HORIZON });
}

const POSITIVE_IOD: Array<[string, Value, string]> = [
  ['southeast_australia_rainfall', -1, 'southeast Australia dry'],
  ['indonesia_rainfall', -1, 'Indonesia dry'],
  ['east_africa_short_rains', 1, 'East Africa short rains wet'],
  ['south_india_northeast_monsoon', 1, 'south India northeast monsoon wet'],
];

describe('acceptance: positive IOD, June start', () => {
  const tl = runIod('positive');
  for (const [id, sign, label] of POSITIVE_IOD) {
    it(`${label} within twelve months`, () => {
      expect(monthsWith(tl, id, sign).length, `${id} never reaches ${sign}`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, (-sign) as Value), `${id} also shows the opposite sign`).toHaveLength(0);
    });
  }
  it('the short rains are pending, not applied, before October', () => {
    for (const m of tl.months.slice(0, 4)) {
      expect(m.nodes.east_africa_short_rains.viaLinkIds, `applied at month ${m.index}`).toHaveLength(0);
    }
    expect(tl.months[4].calendarMonth).toBe(10);
    expect(tl.months[4].nodes.east_africa_short_rains.value).toBe(1);
  });
  it('ENSO-only regions stay hollow: the map does not fake an IOD effect', () => {
    for (const id of ['peru_coast_rainfall', 'atlantic_hurricanes', 'us_gulf_coast_winter']) {
      for (const m of tl.months) {
        expect(m.nodes[id].viaLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
        expect(m.nodes[id].pendingLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
      }
    }
  });
});

describe('acceptance: negative IOD, June start', () => {
  const tl = runIod('negative');
  it('reverses the positive phase wherever a negative link exists, and never copies its sign', () => {
    const targets = new Set(graph.links.filter((l) => l.from === 'iod' && l.when === 'negative').map((l) => l.to));
    expect(targets.size).toBeGreaterThan(0);
    for (const [id, sign] of POSITIVE_IOD) {
      if (!targets.has(id)) continue;
      expect(monthsWith(tl, id, (-sign) as Value).length, `${id} should reverse the positive phase`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, sign), `${id} copies the positive sign`).toHaveLength(0);
    }
  });
  it('regions with no negative link stay untouched (no faked symmetry)', () => {
    const targets = new Set(graph.links.filter((l) => l.from === 'iod' && l.when === 'negative').map((l) => l.to));
    for (const node of graph.nodes) {
      if (node.kind !== 'outcome' || targets.has(node.id)) continue;
      for (const m of tl.months) {
        expect(m.nodes[node.id].value, `${node.id} at month ${m.index}`).toBe(0);
        expect(m.nodes[node.id].viaLinkIds).toHaveLength(0);
      }
    }
  });
});

describe('acceptance: drivers', () => {
  it('ships ENSO and the IOD as drivers, each with a neutral phase and an onset hint', () => {
    const drivers = graph.nodes.filter((n) => n.kind === 'driver');
    expect(drivers.map((d) => d.id).sort()).toEqual(['enso', 'iod']);
    for (const d of drivers) {
      if (d.kind !== 'driver') continue;
      expect(d.phases.some((p) => p.id === 'neutral')).toBe(true);
      expect(d.onset_hint.length).toBeGreaterThan(20);
    }
  });
  it('a neutral phase applies nothing', () => {
    for (const driverId of ['enso', 'iod']) {
      const tl = propagate(graph, { driverId, phaseId: 'neutral', startMonth: 6, horizonMonths: HORIZON });
      for (const m of tl.months) for (const st of Object.values(m.nodes)) expect(st.viaLinkIds).toHaveLength(0);
    }
  });
});
