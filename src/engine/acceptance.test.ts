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

// Version-1 blocks run at the default depth of 1 (direct links only); the
// M10 block at the end follows links through pushed drivers.
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

// ---------------------------------------------------------------- M9: third driver (North Atlantic Oscillation)
// The NAO is a winter pattern, so its scenarios start in December.
function runNao(phaseId: string): Timeline {
  return propagate(graph, { driverId: 'nao', phaseId, startMonth: 12, horizonMonths: HORIZON });
}

const POSITIVE_NAO: Array<[string, Value, string]> = [
  ['northern_europe_winter', 1, 'northern Europe mild'],
  ['scandinavia_winter_rainfall', 1, 'Norway and Scotland wet'],
  ['mediterranean_winter_rainfall', -1, 'Iberia and the Mediterranean dry'],
  ['eastern_north_america_winter', 1, 'eastern North America mild'],
  ['greenland_winter', -1, 'Greenland cold'],
];

describe('acceptance: positive NAO, December start', () => {
  const tl = runNao('positive');
  for (const [id, sign, label] of POSITIVE_NAO) {
    it(`${label} within twelve months`, () => {
      expect(monthsWith(tl, id, sign).length, `${id} never reaches ${sign}`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, (-sign) as Value), `${id} also shows the opposite sign`).toHaveLength(0);
    });
  }
  it('the Greenland–Europe seesaw is applied from month 0 (December) with no lag', () => {
    expect(tl.months[0].calendarMonth).toBe(12);
    expect(tl.months[0].nodes.northern_europe_winter.value).toBe(1);
    expect(tl.months[0].nodes.greenland_winter.value).toBe(-1);
  });
  it('is a winter pattern: nothing is applied from April to October', () => {
    for (const m of tl.months) {
      if (m.calendarMonth < 4 || m.calendarMonth > 10) continue;
      for (const st of Object.values(m.nodes)) expect(st.viaLinkIds, `month ${m.index} (calendar ${m.calendarMonth})`).toHaveLength(0);
    }
    // ...but the winter links are pending, not gone, in the summer months.
    const july = tl.months.find((m) => m.calendarMonth === 7)!;
    expect(july.nodes.northern_europe_winter.pendingLinkIds.length).toBeGreaterThan(0);
  });
  it('ENSO and IOD regions stay hollow: the map does not fake an NAO effect', () => {
    for (const id of ['peru_coast_rainfall', 'indonesia_rainfall', 'southeast_australia_rainfall', 'east_africa_short_rains']) {
      for (const m of tl.months) {
        expect(m.nodes[id].viaLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
        expect(m.nodes[id].pendingLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
      }
    }
  });
});

describe('acceptance: negative NAO, December start', () => {
  const tl = runNao('negative');
  it('reverses the positive phase wherever a negative link exists, and never copies its sign', () => {
    const targets = new Set(graph.links.filter((l) => l.from === 'nao' && l.when === 'negative').map((l) => l.to));
    expect(targets.size).toBeGreaterThan(0);
    for (const [id, sign] of POSITIVE_NAO) {
      if (!targets.has(id)) continue;
      expect(monthsWith(tl, id, (-sign) as Value).length, `${id} should reverse the positive phase`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, sign), `${id} copies the positive sign`).toHaveLength(0);
    }
  });
  it('regions with no negative link stay untouched (no faked symmetry)', () => {
    const targets = new Set(graph.links.filter((l) => l.from === 'nao' && l.when === 'negative').map((l) => l.to));
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
  const DRIVERS = ['enso', 'iod', 'nao'];
  it('ships ENSO, the IOD and the NAO as drivers, each with a neutral phase, an onset hint and a default start month', () => {
    const drivers = graph.nodes.filter((n) => n.kind === 'driver');
    expect(drivers.map((d) => d.id).sort()).toEqual(DRIVERS);
    for (const d of drivers) {
      if (d.kind !== 'driver') continue;
      expect(d.phases.some((p) => p.id === 'neutral')).toBe(true);
      expect(d.onset_hint.length).toBeGreaterThan(20);
      expect(d.default_start_month).toBeGreaterThanOrEqual(1);
      expect(d.default_start_month).toBeLessThanOrEqual(12);
    }
  });
  it('the NAO defaults to a winter start; ENSO and the IOD to June', () => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const start = (id: string) => { const d = byId.get(id)!; return d.kind === 'driver' ? d.default_start_month : NaN; };
    expect(start('enso')).toBe(6);
    expect(start('iod')).toBe(6);
    expect(start('nao')).toBe(12);
  });
  it('a neutral phase applies nothing', () => {
    for (const driverId of DRIVERS) {
      const tl = propagate(graph, { driverId, phaseId: 'neutral', startMonth: 6, horizonMonths: HORIZON });
      for (const m of tl.months) for (const st of Object.values(m.nodes)) expect(st.viaLinkIds).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------- M10: driver-to-driver links
// The app follows links through pushed drivers up to three hops.
function runDeep(driverId: string, phaseId: string, startMonth: number, maxDepth = 3): Timeline {
  return propagate(graph, { driverId, phaseId, startMonth, horizonMonths: HORIZON, maxDepth });
}

describe('acceptance: El Niño pushes the dipole and the NAO (June start, chain on)', () => {
  const tl = runDeep('enso', 'el_nino', 6);
  const direct = runDeep('enso', 'el_nino', 6, 1);

  it('the dipole turns positive from month 0 (June) and drops out in December', () => {
    expect(tl.months[0].nodes.iod.value).toBe(1);
    expect(tl.months[0].nodes.iod.viaLinkIds).toEqual(['el_nino_positive_iod']);
    expect(tl.months[0].nodes.iod.confidence).toBe('probable');
    expect(tl.months[6].calendarMonth).toBe(12);
    expect(tl.months[6].nodes.iod.value).toBe(0);
    expect(tl.months[6].nodes.iod.pendingLinkIds).toEqual(['el_nino_positive_iod']);
  });

  it('southeast Australia, which has no ENSO link, turns dry through the dipole one tier lower', () => {
    const m = tl.months[2];
    expect(m.nodes.southeast_australia_rainfall.value).toBe(-1);
    expect(m.nodes.southeast_australia_rainfall.viaLinkIds).toEqual(['positive_iod_southeast_australia']);
    expect(m.links.positive_iod_southeast_australia).toEqual({ status: 'applied', confidence: 'probable', depth: 2 });
    for (const dm of direct.months) {
      expect(dm.nodes.southeast_australia_rainfall.value).toBe(0);
      expect(dm.nodes.southeast_australia_rainfall.viaLinkIds).toHaveLength(0);
    }
  });

  it('East Africa\'s short rains get both pushes, same sign, and stay at +1 without conflict', () => {
    const m = tl.months[4];
    expect(m.calendarMonth).toBe(10);
    expect(m.nodes.east_africa_short_rains.viaLinkIds.sort()).toEqual(['el_nino_east_africa_short_rains', 'positive_iod_east_africa_short_rains']);
    expect(m.nodes.east_africa_short_rains.value).toBe(1);
    expect(m.nodes.east_africa_short_rains.conflicting).toBe(false);
  });

  it('the Indian monsoon shows the contested tug-of-war: both links, conflicting, netting to 0', () => {
    const m = tl.months[1];
    expect(m.nodes.indian_summer_monsoon.viaLinkIds.sort()).toEqual(['el_nino_indian_monsoon', 'positive_iod_indian_monsoon']);
    expect(m.nodes.indian_summer_monsoon.conflicting).toBe(true);
    expect(m.nodes.indian_summer_monsoon.value).toBe(0);
    expect(m.links.positive_iod_indian_monsoon.confidence).toBe('contested');
    expect(direct.months[1].nodes.indian_summer_monsoon.value).toBe(-1);
  });

  it('the NAO leans negative in January to March, pending in December, out of play by April', () => {
    expect(tl.months[6].nodes.nao.value).toBe(0);
    expect(tl.months[6].nodes.nao.pendingLinkIds).toEqual(['el_nino_negative_nao']);
    for (const i of [7, 8, 9]) expect(tl.months[i].nodes.nao.value, `month ${i}`).toBe(-1);
    expect(tl.months[10].calendarMonth).toBe(4);
    expect(tl.months[10].nodes.nao.value).toBe(0);
  });

  it('northern Europe turns cold through the NAO at two hops, rated probable, hollow under direct links', () => {
    const m = tl.months[8];
    expect(m.nodes.northern_europe_winter.value).toBe(-1);
    expect(m.nodes.northern_europe_winter.viaLinkIds).toEqual(['negative_nao_northern_europe']);
    expect(m.links.negative_nao_northern_europe).toEqual({ status: 'applied', confidence: 'probable', depth: 2 });
    for (const dm of direct.months) expect(dm.nodes.northern_europe_winter.viaLinkIds).toHaveLength(0);
  });

  it('the dipole\'s feedback onto ENSO is never applied: the chosen driver holds its phase', () => {
    for (const m of tl.months) {
      expect(m.links.positive_iod_la_nina_next_year).toBeUndefined();
      expect(m.nodes.enso.value).toBe(1);
      expect(m.nodes.enso.viaLinkIds).toHaveLength(0);
    }
  });

  it('under "established only" the second-hop links are ghosts and push nothing', () => {
    const est = propagate(graph, { driverId: 'enso', phaseId: 'el_nino', startMonth: 6, horizonMonths: HORIZON, maxDepth: 3, minConfidence: 'established' });
    expect(est.months[0].links.el_nino_positive_iod.status).toBe('ghost');
    expect(est.months[0].nodes.iod.value).toBe(0);
    expect(est.months[2].nodes.southeast_australia_rainfall.value).toBe(0);
    expect(est.months[2].links.positive_iod_southeast_australia).toBeUndefined();
  });
});

describe('acceptance: La Niña pushes the dipole negative and the NAO positive (contested)', () => {
  const tl = runDeep('enso', 'la_nina', 6);
  it('the dipole turns negative from June and southeast Australia turns wet through it', () => {
    expect(tl.months[0].nodes.iod.value).toBe(-1);
    expect(tl.months[0].nodes.iod.viaLinkIds).toEqual(['la_nina_negative_iod']);
    expect(tl.months[2].nodes.southeast_australia_rainfall.value).toBe(1);
    expect(tl.months[2].links.negative_iod_southeast_australia).toMatchObject({ depth: 2, confidence: 'probable' });
  });
  it('the NAO leans positive in late winter, and everything downstream of it is contested', () => {
    expect(tl.months[7].nodes.nao.value).toBe(1);
    expect(tl.months[7].nodes.nao.confidence).toBe('contested');
    expect(tl.months[8].nodes.northern_europe_winter.value).toBe(1);
    expect(tl.months[8].links.positive_nao_northern_europe).toEqual({ status: 'applied', confidence: 'contested', depth: 2 });
  });
});

describe('acceptance: a positive dipole tips the Pacific toward La Niña a year on (contested)', () => {
  const tl = runDeep('iod', 'positive', 6);
  it('ENSO is untouched for ten months, then pushed to La Niña at month 11', () => {
    for (const m of tl.months.slice(0, 11)) expect(m.nodes.enso.value, `month ${m.index}`).toBe(0);
    expect(tl.months[11].nodes.enso.value).toBe(-1);
    expect(tl.months[11].links.positive_iod_la_nina_next_year).toEqual({ status: 'applied', confidence: 'contested', depth: 1 });
  });
  it('La Niña\'s all-year links then fire at two hops, contested, from month 11', () => {
    expect(tl.months[10].nodes.central_pacific_islands.value).toBe(0);
    expect(tl.months[11].nodes.central_pacific_islands.value).toBe(-1);
    expect(tl.months[11].links.la_nina_central_pacific_islands).toEqual({ status: 'applied', confidence: 'contested', depth: 2 });
  });
  it('La Niña\'s push back onto the dipole is skipped: the chosen driver holds its phase', () => {
    for (const m of tl.months) {
      expect(m.links.la_nina_negative_iod).toBeUndefined();
      expect(m.nodes.iod.value).toBe(1);
    }
  });
  it('with direct links only, ENSO is still pushed but nothing fires from it', () => {
    const d = runDeep('iod', 'positive', 6, 1);
    expect(d.months[11].nodes.enso.value).toBe(-1);
    expect(d.months[11].nodes.central_pacific_islands.value).toBe(0);
  });
});

describe('acceptance: driver-to-driver data', () => {
  const drivers = graph.nodes.filter((n) => n.kind === 'driver');
  const driverIds = new Set(drivers.map((d) => d.id));
  const d2d = graph.links.filter((l) => driverIds.has(l.to));
  it('every driver has phases valued +1, 0 and -1', () => {
    for (const d of drivers) {
      if (d.kind !== 'driver') continue;
      expect(d.phases.map((p) => p.value).sort()).toEqual([-1, 0, 1]);
    }
  });
  it('ships six driver-to-driver links, each with an evidence note and no self-loop', () => {
    expect(d2d.map((l) => l.id).sort()).toEqual([
      'el_nino_negative_nao', 'el_nino_positive_iod', 'la_nina_negative_iod', 'la_nina_positive_nao',
      'negative_iod_el_nino_next_year', 'positive_iod_la_nina_next_year',
    ]);
    for (const l of d2d) {
      expect(l.from).not.toBe(l.to);
      expect(l.evidence_note, `${l.id} needs an evidence note`).toBeTruthy();
    }
  });
  it('a neutral phase applies nothing at full depth either', () => {
    for (const d of drivers) {
      const tl = runDeep(d.id, 'neutral', 6);
      for (const m of tl.months) {
        for (const st of Object.values(m.nodes)) expect(st.viaLinkIds).toHaveLength(0);
        expect(Object.keys(m.links)).toHaveLength(0);
      }
    }
  });
});

// ---------------------------------------------------------------- M11: two chosen drivers
// A second driver chosen by hand enters its phase at month 0 with the first,
// fires at the first hop at full confidence, is never pushed, and its effects
// add up with the first driver's: same sign reinforces, opposite signs conflict.
function runTwo(a: [string, string], b: [string, string], startMonth: number, secondStartMonth?: number): Timeline {
  return propagate(graph, {
    driverId: a[0], phaseId: a[1], startMonth, horizonMonths: HORIZON, maxDepth: 3,
    secondary: secondStartMonth === undefined ? { driverId: b[0], phaseId: b[1] } : { driverId: b[0], phaseId: b[1], startMonth: secondStartMonth },
  });
}

describe('acceptance: El Niño with a negative dipole chosen by hand (June start)', () => {
  const tl = runTwo(['enso', 'el_nino'], ['iod', 'negative'], 6);
  it('both drivers hold their phase all year; the dipole is chosen, not pushed, and El Niño\'s push into it is skipped', () => {
    for (const m of tl.months) {
      expect(m.nodes.enso.value).toBe(1);
      expect(m.nodes.iod.value).toBe(-1);
      expect(m.nodes.iod.viaLinkIds).toHaveLength(0);
      expect(m.links.el_nino_positive_iod).toBeUndefined();
    }
  });
  it('Indonesia gets El Niño\'s drying and the dipole\'s wetting in July: conflicting, netting to 0, rated at the weaker link', () => {
    const st = tl.months[1].nodes.indonesia_rainfall;
    expect([...st.viaLinkIds].sort()).toEqual(['el_nino_indonesia', 'negative_iod_indonesia']);
    expect(st.conflicting).toBe(true);
    expect(st.value).toBe(0);
    expect(st.confidence).toBe('probable');
    expect(tl.months[1].links.negative_iod_indonesia).toEqual({ status: 'applied', confidence: 'probable', depth: 1 });
  });
  it('East Africa\'s short rains conflict in November: El Niño wet, the dipole dry', () => {
    const st = tl.months[5].nodes.east_africa_short_rains;
    expect([...st.viaLinkIds].sort()).toEqual(['el_nino_east_africa_short_rains', 'negative_iod_east_africa_short_rains']);
    expect(st.conflicting).toBe(true);
    expect(st.value).toBe(0);
  });
  it('southeast Australia turns wet through the dipole alone, at full confidence, with no conflict', () => {
    const st = tl.months[3].nodes.southeast_australia_rainfall;
    expect(st.viaLinkIds).toEqual(['negative_iod_southeast_australia']);
    expect(st.value).toBe(1);
    expect(st.confidence).toBe('established');
    expect(st.conflicting).toBe(false);
  });
  it('a driver that is not chosen can still be pushed: the NAO leans negative in January', () => {
    const st = tl.months[7].nodes.nao;
    expect(st.value).toBe(-1);
    expect(st.viaLinkIds).toEqual(['el_nino_negative_nao']);
    expect(tl.months[7].nodes.northern_europe_winter.value).toBe(-1);
  });
  it('the dipole\'s feedback onto ENSO at month 11 is skipped: chosen drivers are never pushed', () => {
    expect(tl.months[11].links.negative_iod_el_nino_next_year).toBeUndefined();
    expect(tl.months[11].nodes.enso.viaLinkIds).toHaveLength(0);
    expect(tl.months[11].nodes.enso.value).toBe(1);
  });
});

describe('acceptance: La Niña with a negative dipole (the 2010–11 story, June start)', () => {
  const tl = runTwo(['enso', 'la_nina'], ['iod', 'negative'], 6);
  it('East Africa\'s short rains get both pushes, same sign: drier, no conflict, rated probable', () => {
    const st = tl.months[5].nodes.east_africa_short_rains;
    expect([...st.viaLinkIds].sort()).toEqual(['la_nina_east_africa_short_rains', 'negative_iod_east_africa_short_rains']);
    expect(st.value).toBe(-1);
    expect(st.conflicting).toBe(false);
    expect(st.confidence).toBe('probable');
  });
  it('southeast Australia is wet through the dipole in spring; eastern Australia wet through La Niña alone in January', () => {
    expect(tl.months[3].nodes.southeast_australia_rainfall.value).toBe(1);
    expect(tl.months[3].nodes.southeast_australia_rainfall.viaLinkIds).toEqual(['negative_iod_southeast_australia']);
    const jan = tl.months[7].nodes.east_australia_rainfall;
    expect(jan.value).toBe(1);
    expect(jan.viaLinkIds).toEqual(['la_nina_east_australia']);
    expect(tl.months[7].nodes.southeast_australia_rainfall.pendingLinkIds).toEqual(['negative_iod_southeast_australia']);
  });
  it('the chosen dipole holds its phase in February, where the chain would have dropped it', () => {
    expect(tl.months[8].nodes.iod.value).toBe(-1);
    expect(runDeep('enso', 'la_nina', 6).months[8].nodes.iod.value).toBe(0);
  });
  it('matches La Niña alone wherever the dipole has no link of its own', () => {
    const solo = runDeep('enso', 'la_nina', 6);
    const iodTargets = new Set(graph.links.filter((l) => l.from === 'iod').map((l) => l.to));
    for (const n of graph.nodes) {
      if (n.kind !== 'outcome' || iodTargets.has(n.id)) continue;
      for (const m of tl.months) expect(m.nodes[n.id], `${n.id} at month ${m.index}`).toEqual(solo.months[m.index].nodes[n.id]);
    }
  });
});

describe('acceptance: two chosen drivers, in general', () => {
  it('a neutral second driver applies nothing but pins that driver: El Niño can no longer push the dipole, so its chain is cut', () => {
    const solo = runDeep('enso', 'el_nino', 6);
    const tl = runTwo(['enso', 'el_nino'], ['iod', 'neutral'], 6);
    const iodTargets = new Set(graph.links.filter((l) => l.from === 'iod').map((l) => l.to));
    for (const m of tl.months) {
      expect(m.nodes.iod.value).toBe(0);
      expect(m.nodes.iod.viaLinkIds).toHaveLength(0);
      expect(m.links.el_nino_positive_iod).toBeUndefined();
      expect(Object.keys(m.links).some((id) => graph.links.find((l) => l.id === id)!.from === 'iod')).toBe(false);
      for (const n of graph.nodes) {
        if (n.id === 'iod' || iodTargets.has(n.id)) continue;
        expect(m.nodes[n.id], `${n.id} at month ${m.index}`).toEqual(solo.months[m.index].nodes[n.id]);
      }
    }
    // Southeast Australia is lit only through the dipole: hollow once the dipole is held neutral.
    expect(solo.months[3].nodes.southeast_australia_rainfall.value).toBe(-1);
    expect(tl.months[3].nodes.southeast_australia_rainfall.value).toBe(0);
    expect(tl.months[3].nodes.southeast_australia_rainfall.viaLinkIds).toHaveLength(0);
  });
  it('the same driver cannot be chosen twice', () => {
    expect(() => runTwo(['enso', 'el_nino'], ['enso', 'la_nina'], 6)).toThrow(/twice/);
  });
  it('El Niño with a positive NAO chosen by hand: the push toward negative is skipped and the NAO\'s own winter links fire at full confidence', () => {
    const tl = runTwo(['enso', 'el_nino'], ['nao', 'positive'], 6);
    const jan = tl.months[7];
    expect(jan.nodes.nao.value).toBe(1);
    expect(jan.links.el_nino_negative_nao).toBeUndefined();
    expect(jan.links.positive_nao_northern_europe).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
    expect(jan.nodes.northern_europe_winter.value).toBe(1);
    expect(jan.nodes.northern_europe_winter.confidence).toBe('established');
  });
  it('the shipped two-driver story chooses La Niña and a negative dipole', () => {
    const story = graph.stories.find((s) => s.id === 'la_nina_negative_iod_2010_11');
    expect(story).toBeDefined();
    expect(story!.driver).toBe('enso');
    expect(story!.phase).toBe('la_nina');
    expect(story!.second_driver).toBe('iod');
    expect(story!.second_phase).toBe('negative');
  });
});

// ---------------------------------------------------------------- M12: the second driver's own start month
// The second driver may enter its phase in a calendar month of its own, read
// within the twelve months shown. Before it, the driver is held out of play
// (grey, no links, still never pushed); from it, its links count their lag
// from that month.
describe('acceptance: El Niño from June with a negative dipole from September', () => {
  const tl = runTwo(['enso', 'el_nino'], ['iod', 'negative'], 6, 9);
  const same = runTwo(['enso', 'el_nino'], ['iod', 'negative'], 6);
  it('the dipole is out of play until September (month 3), then negative to the end, never pushed', () => {
    for (const m of tl.months) {
      expect(m.nodes.iod.value, `month ${m.index}`).toBe(m.index < 3 ? 0 : -1);
      expect(m.nodes.iod.viaLinkIds).toHaveLength(0);
      expect(m.nodes.iod.pendingLinkIds).toHaveLength(0);
      expect(m.links.el_nino_positive_iod, `month ${m.index}`).toBeUndefined();
    }
  });
  it('Indonesia is simply dry in July, conflicting from September, and dry again in December when the dipole link is out of season', () => {
    const jul = tl.months[1].nodes.indonesia_rainfall;
    expect(jul.viaLinkIds).toEqual(['el_nino_indonesia']);
    expect(jul.value).toBe(-1);
    expect(jul.conflicting).toBe(false);
    expect(tl.months[1].links.negative_iod_indonesia).toBeUndefined();
    const sep = tl.months[3].nodes.indonesia_rainfall;
    expect([...sep.viaLinkIds].sort()).toEqual(['el_nino_indonesia', 'negative_iod_indonesia']);
    expect(sep.conflicting).toBe(true);
    expect(sep.value).toBe(0);
    expect(sep.confidence).toBe('probable');
    const dec = tl.months[6].nodes.indonesia_rainfall;
    expect(dec.viaLinkIds).toEqual(['el_nino_indonesia']);
    expect(dec.pendingLinkIds).toEqual(['negative_iod_indonesia']);
    expect(dec.value).toBe(-1);
  });
  it("East Africa's short rains: El Niño's wetting alone in November, the dipole's drying joins in December because its lag counts from September", () => {
    const nov = tl.months[5].nodes.east_africa_short_rains;
    expect(nov.viaLinkIds).toEqual(['el_nino_east_africa_short_rains']);
    expect(nov.value).toBe(1);
    expect(nov.conflicting).toBe(false);
    expect(tl.months[5].links.negative_iod_east_africa_short_rains).toBeUndefined();
    const dec = tl.months[6].nodes.east_africa_short_rains;
    expect([...dec.viaLinkIds].sort()).toEqual(['el_nino_east_africa_short_rains', 'negative_iod_east_africa_short_rains']);
    expect(dec.conflicting).toBe(true);
    expect(dec.value).toBe(0);
    // With a shared June start the conflict was already there in November.
    expect(same.months[5].nodes.east_africa_short_rains.conflicting).toBe(true);
  });
  it('southeast Australia is hollow before September (the pinned dipole cannot be pushed positive either), wet from September', () => {
    for (let i = 0; i < 3; i++) {
      const st = tl.months[i].nodes.southeast_australia_rainfall;
      expect(st.value, `month ${i}`).toBe(0);
      expect(st.viaLinkIds).toHaveLength(0);
      expect(st.pendingLinkIds).toHaveLength(0);
    }
    expect(runDeep('enso', 'el_nino', 6).months[2].nodes.southeast_australia_rainfall.value).toBe(-1);
    const sep = tl.months[3].nodes.southeast_australia_rainfall;
    expect(sep.viaLinkIds).toEqual(['negative_iod_southeast_australia']);
    expect(sep.value).toBe(1);
    expect(sep.confidence).toBe('established');
  });
  it('matches the shared-start scenario from September on wherever nothing depends on the lag', () => {
    expect(tl.months[7].nodes.nao).toEqual(same.months[7].nodes.nao);
    expect(tl.months[7].nodes.northern_europe_winter).toEqual(same.months[7].nodes.northern_europe_winter);
    expect(tl.months[3].nodes.indonesia_rainfall).toEqual(same.months[3].nodes.indonesia_rainfall);
  });
});

describe('acceptance: El Niño from June with a positive NAO from December', () => {
  const tl = runTwo(['enso', 'el_nino'], ['nao', 'positive'], 6, 12);
  it('the NAO is out of play through November (month 5), positive from December (month 6), and its links are not even pending before that', () => {
    for (const m of tl.months) {
      expect(m.nodes.nao.value, `month ${m.index}`).toBe(m.index < 6 ? 0 : 1);
      const naoLinks = Object.keys(m.links).filter((id) => graph.links.find((l) => l.id === id)!.from === 'nao');
      if (m.index < 6) expect(naoLinks, `month ${m.index}`).toEqual([]);
      else expect(naoLinks.length).toBeGreaterThan(0);
    }
  });
  it("El Niño's push toward a negative NAO in January is skipped: the NAO is chosen, and stays positive", () => {
    const jan = tl.months[7];
    expect(jan.links.el_nino_negative_nao).toBeUndefined();
    expect(jan.nodes.nao.value).toBe(1);
    expect(jan.nodes.nao.viaLinkIds).toHaveLength(0);
    expect(runDeep('enso', 'el_nino', 6).months[7].nodes.nao.value).toBe(-1);
  });
  it('northern Europe is mild from December to March at full confidence, pending from April', () => {
    for (let i = 6; i <= 9; i++) {
      expect(tl.months[i].nodes.northern_europe_winter.value, `month ${i}`).toBe(1);
      expect(tl.months[i].links.positive_nao_northern_europe).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
    }
    expect(tl.months[5].nodes.northern_europe_winter.value).toBe(0);
    expect(tl.months[5].links.positive_nao_northern_europe).toBeUndefined();
    expect(tl.months[10].links.positive_nao_northern_europe?.status).toBe('pending');
  });
});

describe('acceptance: second start month, in general', () => {
  it('a start month earlier in the calendar than the first driver\'s falls in the following year', () => {
    const tl = runTwo(['enso', 'el_nino'], ['iod', 'negative'], 6, 3); // March: month 9
    for (const m of tl.months) expect(m.nodes.iod.value, `month ${m.index}`).toBe(m.index < 9 ? 0 : -1);
    // The dipole's Indonesia link is out of season in March–May and applies again in June (month 12), conflicting with El Niño's.
    expect(tl.months[9].links.negative_iod_indonesia?.status).toBe('pending');
    expect(tl.months[12].nodes.indonesia_rainfall.conflicting).toBe(true);
  });
  it('the same start month as the first driver gives the M11 result exactly', () => {
    const a = runTwo(['enso', 'la_nina'], ['iod', 'negative'], 6, 6);
    const b = runTwo(['enso', 'la_nina'], ['iod', 'negative'], 6);
    expect(a.months).toEqual(b.months);
  });
  it('a neutral second driver with a later start is pinned from month 0: the chain into it is cut before its start too', () => {
    const tl = runTwo(['enso', 'el_nino'], ['iod', 'neutral'], 6, 9);
    for (const m of tl.months) {
      expect(m.nodes.iod.value).toBe(0);
      expect(m.links.el_nino_positive_iod).toBeUndefined();
    }
  });
  it('every shipped story with a second start month keeps it in 1–12 and has a second driver', () => {
    for (const s of graph.stories) {
      if (s.second_start_month === undefined) continue;
      expect(s.second_driver).toBeDefined();
      expect(s.second_start_month).toBeGreaterThanOrEqual(1);
      expect(s.second_start_month).toBeLessThanOrEqual(12);
    }
  });
});
