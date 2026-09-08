// Acceptance checks from docs/PLAN.md section 7 (version 1) and M8 (second driver), run against the
// shipped data with the real engine. Each expected effect must be applied
// with the right sign at some month of a June-start scenario; effects are
// season-gated, so "by month 12" means "at some point in the year", and the
// month-12 map (June again) shows winter effects as pending, not applied.

import { describe, expect, it } from 'vitest';
import { chosenFade, chosenOnset, propagate } from './propagate';
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
  it('is a winter pattern: nothing is applied from April to October (except the spring mode it pushes, M21)', () => {
    for (const m of tl.months) {
      if (m.calendarMonth < 4 || m.calendarMonth > 10) continue;
      for (const [id, st] of Object.entries(m.nodes)) {
        // Since M21 a positive NAO winter pushes the Atlantic meridional mode negative from February and holds it; that is a driver, not a region.
        if (id === 'atlantic_meridional_mode') continue;
        expect(st.viaLinkIds, `month ${m.index} (calendar ${m.calendarMonth})`).toHaveLength(0);
      }
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
  const DRIVERS = ['amo', 'atlantic_meridional_mode', 'atlantic_nino', 'barents_kara_ice', 'enso', 'eurasian_october_snow', 'indian_ocean_basin', 'iod', 'nao', 'pacific_meridional_mode', 'pdo', 'qbo', 'sam', 'tropical_eruption'];
  it('ships ENSO, the IOD, the NAO, the SAM, the PDO, the AMO, the Atlantic Niño, the Indian Ocean basin mode, the Atlantic and Pacific meridional modes, a tropical eruption, the QBO, the Barents–Kara sea ice and the October snow as drivers, each with a neutral phase, an onset hint and a default start month', () => {
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
    expect(start('sam')).toBe(6);
    expect(start('pdo')).toBe(11);
    expect(start('amo')).toBe(6);
    expect(start('atlantic_nino')).toBe(5);
    expect(start('indian_ocean_basin')).toBe(2);
    expect(start('atlantic_meridional_mode')).toBe(3);
    expect(start('pacific_meridional_mode')).toBe(3);
    expect(start('tropical_eruption')).toBe(6);
    expect(start('qbo')).toBe(11);
    expect(start('barents_kara_ice')).toBe(10);
    expect(start('eurasian_october_snow')).toBe(10);
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
  it('every driver has phases valued +1, 0 and -1, except the tropical eruption (M26), an event with no opposite phase: -1 and 0 only', () => {
    for (const d of drivers) {
      if (d.kind !== 'driver') continue;
      expect(d.phases.map((p) => p.value).sort(), d.id).toEqual(d.id === 'tropical_eruption' ? [-1, 0] : [-1, 0, 1]);
    }
  });
  it('ships twenty-nine driver-to-driver links, each with an evidence note and no self-loop', () => {
    expect(d2d.map((l) => l.id).sort()).toEqual([
      'atlantic_nina_el_nino', 'atlantic_nino_la_nina', 'easterly_qbo_negative_nao', 'el_nino_negative_nao', 'el_nino_negative_sam', 'el_nino_positive_amm', 'el_nino_positive_iod', 'el_nino_positive_pdo', 'el_nino_warm_basin', 'eruption_el_nino', 'eruption_positive_nao', 'high_snow_negative_nao', 'la_nina_cool_basin', 'la_nina_negative_amm', 'la_nina_negative_iod', 'la_nina_negative_pdo', 'la_nina_positive_nao', 'la_nina_positive_sam', 'low_ice_negative_nao',
      'negative_amo_positive_nao', 'negative_iod_el_nino_next_year', 'negative_nao_positive_amm', 'negative_pmm_la_nina', 'positive_amo_negative_nao', 'positive_iod_la_nina_next_year', 'positive_nao_negative_amm', 'positive_pmm_el_nino', 'warm_basin_la_nina', 'westerly_qbo_positive_nao',
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
function runTwo(a: [string, string], b: [string, string], startMonth: number, secondStartMonth?: number, startsBefore = false): Timeline {
  return propagate(graph, {
    driverId: a[0], phaseId: a[1], startMonth, horizonMonths: HORIZON, maxDepth: 3,
    others: [secondStartMonth === undefined ? { driverId: b[0], phaseId: b[1] }
      : startsBefore ? { driverId: b[0], phaseId: b[1], startMonth: secondStartMonth, startsBefore: true }
      : { driverId: b[0], phaseId: b[1], startMonth: secondStartMonth }],
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
  it('southeast Australia is wet through the dipole in spring; eastern Australia wet through La Niña in January, with the pushed SAM (M16) on top', () => {
    expect(tl.months[3].nodes.southeast_australia_rainfall.value).toBe(1);
    expect(tl.months[3].nodes.southeast_australia_rainfall.viaLinkIds).toEqual(['negative_iod_southeast_australia']);
    const jan = tl.months[7].nodes.east_australia_rainfall;
    expect(jan.value).toBe(1);
    expect([...jan.viaLinkIds].sort()).toEqual(['la_nina_east_australia', 'positive_sam_east_australia_summer']);
    expect(jan.conflicting).toBe(false);
    expect([...tl.months[7].nodes.southeast_australia_rainfall.pendingLinkIds].sort()).toEqual(['negative_iod_southeast_australia', 'positive_sam_southeast_australia']);
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
    expect(story!.drivers).toEqual([{ driver: 'iod', phase: 'negative' }]);
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
  it('every shipped story with a start month on a chosen driver keeps it in 1–12', () => {
    for (const s of graph.stories) {
      for (const d of s.drivers ?? []) {
        if (d.start_month === undefined) continue;
        expect(d.start_month).toBeGreaterThanOrEqual(1);
        expect(d.start_month).toBeLessThanOrEqual(12);
      }
    }
  });
});

// ---- M15: the second driver begins before the first.
describe('acceptance: La Niña from September with a negative dipole since May (the 2016 story)', () => {
  const tl = runTwo(['enso', 'la_nina'], ['iod', 'negative'], 9, 5, true);
  const later = runTwo(['enso', 'la_nina'], ['iod', 'negative'], 9, 5); // May after September: month 8
  const shared = runTwo(['enso', 'la_nina'], ['iod', 'negative'], 9);
  it('the dipole is negative from month 0, four months in, never pushed; with "after" it waits until May, month 8', () => {
    expect(chosenOnset(tl.scenario, 'iod')).toBe(-4);
    for (const m of tl.months) {
      expect(m.nodes.iod.value, `month ${m.index}`).toBe(-1);
      expect(m.nodes.iod.viaLinkIds).toHaveLength(0);
      expect(m.links.la_nina_negative_iod).toBeUndefined();
    }
    for (const m of later.months) expect(m.nodes.iod.value, `month ${m.index}`).toBe(m.index < 8 ? 0 : -1);
  });
  it('southeast Australia is wet at month 0 through the dipole alone, at full confidence', () => {
    const st = tl.months[0].nodes.southeast_australia_rainfall;
    expect(st.value).toBe(1);
    expect(st.viaLinkIds).toEqual(['negative_iod_southeast_australia']);
    expect(st.confidence).toBe('established');
    expect(later.months[0].nodes.southeast_australia_rainfall.viaLinkIds).toHaveLength(0);
  });
  it("East Africa's short rains: the dipole's arrow arrives in October (month 1) because its lag ran from May; La Niña's joins in December (month 3); same sign, no conflict", () => {
    for (const i of [1, 2]) {
      expect(tl.months[i].nodes.east_africa_short_rains.viaLinkIds, `month ${i}`).toEqual(['negative_iod_east_africa_short_rains']);
      expect(tl.months[i].nodes.east_africa_short_rains.value).toBe(-1);
    }
    const dec = tl.months[3].nodes.east_africa_short_rains;
    expect([...dec.viaLinkIds].sort()).toEqual(['la_nina_east_africa_short_rains', 'negative_iod_east_africa_short_rains']);
    expect(dec.value).toBe(-1);
    expect(dec.conflicting).toBe(false);
    expect(dec.confidence).toBe('probable');
    // With a shared September start the dipole's arrow would also wait until December.
    expect(shared.months[1].nodes.east_africa_short_rains.viaLinkIds).toHaveLength(0);
    expect(shared.months[3].nodes.east_africa_short_rains.viaLinkIds).toHaveLength(2);
  });
  it('Indonesia gets both wet pushes from month 0, same sign', () => {
    const st = tl.months[0].nodes.indonesia_rainfall;
    expect([...st.viaLinkIds].sort()).toEqual(['la_nina_indonesia', 'negative_iod_indonesia']);
    expect(st.value).toBe(1);
    expect(st.conflicting).toBe(false);
  });
  it("the dipole's contested push toward El Niño next year, due from month 7 on this clock, is skipped: La Niña is chosen", () => {
    for (const m of tl.months) {
      expect(m.links.negative_iod_el_nino_next_year, `month ${m.index}`).toBeUndefined();
      expect(m.nodes.enso.value).toBe(-1);
    }
  });
  it('matches the shared-start scenario from December on, once every lag has run on both clocks', () => {
    for (let i = 3; i <= HORIZON; i++) {
      for (const id of Object.keys(tl.months[i].nodes)) {
        expect(tl.months[i].nodes[id], `${id} month ${i}`).toEqual(shared.months[i].nodes[id]);
      }
    }
  });
  it('the shipped 2016 story starts the dipole in May, before La Niña in September', () => {
    const s = graph.stories.find((x) => x.id === 'negative_iod_then_la_nina_2016')!;
    expect(s.drivers).toEqual([{ driver: 'iod', phase: 'negative', start_month: 5, starts_before: true }]);
    expect(s.start_month).toBe(9);
    expect(s.start_year).toBe(2016);
  });
});

describe('acceptance: El Niño from June with a positive NAO since December, the winter before', () => {
  const tl = runTwo(['enso', 'el_nino'], ['nao', 'positive'], 6, 12, true);
  const later = runTwo(['enso', 'el_nino'], ['nao', 'positive'], 6, 12);
  it('the NAO is positive from month 0 (six months in) and its winter links are pending through the summer, where "after" has them absent', () => {
    expect(chosenOnset(tl.scenario, 'nao')).toBe(-6);
    for (const m of tl.months) expect(m.nodes.nao.value, `month ${m.index}`).toBe(1);
    expect(tl.months[0].links.positive_nao_northern_europe?.status).toBe('pending');
    expect(later.months[0].links.positive_nao_northern_europe).toBeUndefined();
    expect(later.months[0].nodes.nao.value).toBe(0);
  });
  it('northern Europe is mild from December to March at full confidence, and the winter maps match the "after" scenario', () => {
    for (const i of [6, 7, 8, 9]) {
      const st = tl.months[i].nodes.northern_europe_winter;
      expect(st.value, `month ${i}`).toBe(1);
      expect(st.confidence).toBe('established');
      expect(st).toEqual(later.months[i].nodes.northern_europe_winter);
    }
  });
  it("El Niño's push toward a negative NAO is skipped all year: the NAO is chosen", () => {
    for (const m of tl.months) expect(m.links.el_nino_negative_nao, `month ${m.index}`).toBeUndefined();
  });
});

describe('acceptance: a second driver that begins before the first, in general', () => {
  it('a year before (same month, before) changes what is pending early on but never a value, compared with a shared start', () => {
    const before = runTwo(['enso', 'el_nino'], ['iod', 'negative'], 6, 6, true);
    const shared = runTwo(['enso', 'el_nino'], ['iod', 'negative'], 6);
    expect(chosenOnset(before.scenario, 'iod')).toBe(-12);
    for (const m of before.months) {
      for (const id of Object.keys(m.nodes)) expect(m.nodes[id].value, `${id} month ${m.index}`).toBe(shared.months[m.index].nodes[id].value);
    }
    // The dipole's short-rains link (lag 3, Oct–Dec) is pending from June a year in, absent until September with a shared start.
    expect(before.months[0].links.negative_iod_east_africa_short_rains?.status).toBe('pending');
    expect(shared.months[0].links.negative_iod_east_africa_short_rains).toBeUndefined();
  });
  it('a neutral second driver that began before is still pinned: the chain into it is cut', () => {
    const tl = runTwo(['enso', 'el_nino'], ['iod', 'neutral'], 6, 3, true);
    for (const m of tl.months) {
      expect(m.nodes.iod.value).toBe(0);
      expect(m.links.el_nino_positive_iod).toBeUndefined();
    }
  });
  it('every shipped story that starts a chosen driver before the first names its start month', () => {
    for (const s of graph.stories) {
      for (const d of s.drivers ?? []) {
        if (d.starts_before === undefined) continue;
        expect(d.start_month).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------- M16: fourth driver (Southern Annular Mode)
// The SAM matters in every season; its scenarios start in June (winter rain
// first) and its summer links arrive from November.
function runSam(phaseId: string, startMonth = 6): Timeline {
  return propagate(graph, { driverId: 'sam', phaseId, startMonth, horizonMonths: HORIZON });
}

const POSITIVE_SAM: Array<[string, Value, string]> = [
  ['southwest_australia_winter_rainfall', -1, 'southwest Australia dry in winter'],
  ['southeast_australia_rainfall', -1, 'southern Victoria and Tasmania dry in winter'],
  ['east_australia_rainfall', 1, 'the southern east coast wet in summer'],
  ['new_zealand_summer', 1, 'New Zealand warm in summer'],
  ['patagonia_rainfall', -1, 'southern Chile and Patagonia dry'],
  ['antarctic_peninsula_summer', 1, 'the Antarctic Peninsula warm in summer'],
  ['western_cape_winter_rainfall', -1, 'the Western Cape dry in winter'],
  ['southeast_south_america', -1, 'southeast South America dry in spring'],
];

describe('acceptance: positive SAM, June start', () => {
  const tl = runSam('positive');
  for (const [id, sign, label] of POSITIVE_SAM) {
    it(`${label} within twelve months`, () => {
      expect(monthsWith(tl, id, sign).length, `${id} never reaches ${sign}`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, (-sign) as Value), `${id} also shows the opposite sign`).toHaveLength(0);
    });
  }
  it('the winter rain links are applied from month 0 (June) and Patagonia all year', () => {
    expect(tl.months[0].calendarMonth).toBe(6);
    expect(tl.months[0].nodes.southwest_australia_winter_rainfall.value).toBe(-1);
    expect(tl.months[0].nodes.southeast_australia_rainfall.value).toBe(-1);
    expect(tl.months[0].nodes.western_cape_winter_rainfall.value).toBe(-1);
    for (const m of tl.months) expect(m.nodes.patagonia_rainfall.value, `month ${m.index}`).toBe(-1);
  });
  it('the summer links wait for November: pending in winter, applied in January', () => {
    const july = tl.months.find((m) => m.calendarMonth === 7)!;
    expect(july.nodes.east_australia_rainfall.value).toBe(0);
    expect(july.nodes.east_australia_rainfall.pendingLinkIds).toEqual(['positive_sam_east_australia_summer']);
    expect(july.nodes.antarctic_peninsula_summer.value).toBe(0);
    const jan = tl.months.find((m) => m.calendarMonth === 1)!;
    expect(jan.nodes.east_australia_rainfall.value).toBe(1);
    expect(jan.nodes.new_zealand_summer.value).toBe(1);
    expect(jan.nodes.antarctic_peninsula_summer.value).toBe(1);
    // ...and the winter links are pending in January, not gone.
    expect(jan.nodes.southwest_australia_winter_rainfall.value).toBe(0);
    expect(jan.nodes.southwest_australia_winter_rainfall.pendingLinkIds).toEqual(['positive_sam_southwest_australia']);
  });
  it('the same region can lean both ways by season: southeast Australia dry in winter is not eastern Australia wet in summer', () => {
    const aug = tl.months.find((m) => m.calendarMonth === 8)!;
    expect(aug.nodes.southeast_australia_rainfall.value).toBe(-1);
    expect(aug.nodes.east_australia_rainfall.value).toBe(0);
    const feb = tl.months.find((m) => m.calendarMonth === 2)!;
    expect(feb.nodes.southeast_australia_rainfall.value).toBe(0);
    expect(feb.nodes.east_australia_rainfall.value).toBe(1);
  });
  it('the Cape and southeast South America links are rated below established, and say so', () => {
    const byId = new Map(graph.links.map((l) => [l.id, l]));
    expect(byId.get('positive_sam_western_cape')!.confidence).toBe('probable');
    expect(byId.get('positive_sam_western_cape')!.evidence_note).toMatch(/South Africa/);
    expect(byId.get('positive_sam_southeast_south_america')!.confidence).toBe('contested');
    expect(byId.get('positive_sam_southeast_south_america')!.caveat).toMatch(/changed/);
  });
  it('ENSO, IOD and NAO regions stay hollow: the map does not fake a SAM effect', () => {
    for (const id of ['peru_coast_rainfall', 'indonesia_rainfall', 'east_africa_short_rains', 'northern_europe_winter', 'central_chile_winter']) {
      for (const m of tl.months) {
        expect(m.nodes[id].viaLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
        expect(m.nodes[id].pendingLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
      }
    }
  });
});

describe('acceptance: negative SAM, June start', () => {
  const tl = runSam('negative');
  it('reverses the positive phase wherever a negative link exists, and never copies its sign', () => {
    const targets = new Set(graph.links.filter((l) => l.from === 'sam' && l.when === 'negative').map((l) => l.to));
    expect(targets.size).toBe(POSITIVE_SAM.length);
    for (const [id, sign] of POSITIVE_SAM) {
      expect(targets.has(id), `${id} has no negative link`).toBe(true);
      expect(monthsWith(tl, id, (-sign) as Value).length, `${id} should reverse the positive phase`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, sign), `${id} copies the positive sign`).toHaveLength(0);
    }
  });
  it('a negative spring is hot and dry in the east: eastern Australia dry from November', () => {
    const nov = tl.months.find((m) => m.calendarMonth === 11)!;
    expect(nov.nodes.east_australia_rainfall.value).toBe(-1);
    expect(nov.nodes.east_australia_rainfall.viaLinkIds).toEqual(['negative_sam_east_australia_summer']);
  });
});

describe('acceptance: ENSO pushes the SAM in summer (June start, chain on)', () => {
  const tl = runDeep('enso', 'el_nino', 6);
  it('El Niño pushes the SAM negative from November, and the SAM summer links follow one tier down', () => {
    for (const m of tl.months) {
      const pushed = m.calendarMonth >= 11 || m.calendarMonth <= 2;
      expect(m.nodes.sam.value, `month ${m.index} (calendar ${m.calendarMonth})`).toBe(pushed && m.index >= 4 ? -1 : 0);
    }
    const jan = tl.months.find((m) => m.calendarMonth === 1)!;
    expect(jan.links.el_nino_negative_sam?.status).toBe('applied');
    expect(jan.links.negative_sam_new_zealand?.status).toBe('applied');
    expect(jan.links.negative_sam_new_zealand?.depth).toBe(2);
    expect(jan.links.negative_sam_new_zealand?.confidence).toBe('contested');
    // New Zealand cool through El Niño directly and through the pushed SAM: same sign, no conflict.
    expect(jan.nodes.new_zealand_summer.value).toBe(-1);
    expect(jan.nodes.new_zealand_summer.conflicting).toBe(false);
    expect([...jan.nodes.new_zealand_summer.viaLinkIds].sort()).toEqual(['el_nino_new_zealand', 'negative_sam_new_zealand']);
  });
  it('the pushed SAM winter links never apply: pending while it holds its phase in summer, absent in winter', () => {
    for (const m of tl.months) {
      const st = m.links.negative_sam_southwest_australia;
      if (m.nodes.sam.value === -1) expect(st?.status, `month ${m.index}`).toBe('pending');
      else expect(st, `month ${m.index}`).toBeUndefined();
      expect(m.nodes.southwest_australia_winter_rainfall.value).toBe(0);
    }
  });
  it('La Niña pushes the SAM positive, and eastern Australia gets La Niña and the SAM together in January', () => {
    const ln = runDeep('enso', 'la_nina', 6);
    const jan = ln.months.find((m) => m.calendarMonth === 1)!;
    expect(jan.nodes.sam.value).toBe(1);
    expect(jan.nodes.east_australia_rainfall.value).toBe(1);
    expect([...jan.nodes.east_australia_rainfall.viaLinkIds].sort()).toEqual(['la_nina_east_australia', 'positive_sam_east_australia_summer']);
  });
});

describe('acceptance: the 2019 story, a negative SAM with a positive dipole since June', () => {
  const tl = runTwo(['sam', 'negative'], ['iod', 'positive'], 11, 6, true);
  it('the dipole is in phase from month 0 with an onset five months back', () => {
    expect(chosenOnset(tl.scenario, 'iod')).toBe(-5);
    expect(tl.months[0].nodes.iod.value).toBe(1);
    expect(tl.months[0].nodes.sam.value).toBe(-1);
  });
  it('eastern Australia is dry at month 0 through both drivers, without conflict', () => {
    const st = tl.months[0].nodes.east_australia_rainfall;
    expect(st.value).toBe(-1);
    expect(st.conflicting).toBe(false);
    expect(st.viaLinkIds).toContain('negative_sam_east_australia_summer');
  });
  it('southeast Australia is dry at month 0 through the dipole alone, and hollow in December when both seasons end', () => {
    expect(tl.months[0].nodes.southeast_australia_rainfall.viaLinkIds).toEqual(['positive_iod_southeast_australia']);
    expect(tl.months[1].calendarMonth).toBe(12);
    expect(tl.months[1].nodes.southeast_australia_rainfall.viaLinkIds).toHaveLength(0);
  });
  it('ENSO is untouched until May, when the dipole’s contested next-year link (lag 11 from June) pushes it toward La Niña', () => {
    for (const m of tl.months.slice(0, 6)) expect(m.nodes.enso.value, `month ${m.index}`).toBe(0);
    expect(tl.months[6].calendarMonth).toBe(5);
    expect(tl.months[6].nodes.enso.value).toBe(-1);
    expect(tl.months[6].links.positive_iod_la_nina_next_year?.status).toBe('applied');
    expect(tl.months[6].nodes.enso.confidence).toBe('contested');
  });
  it('the shipped story uses these settings', () => {
    const s = graph.stories.find((x) => x.id === 'negative_sam_2019_black_summer')!;
    expect(s).toBeDefined();
    expect([s.driver, s.phase, s.drivers, s.start_month, s.start_year])
      .toEqual(['sam', 'negative', [{ driver: 'iod', phase: 'positive', start_month: 6, starts_before: true }], 11, 2019]);
  });
});

// ---------------------------------------------------------------- M17: fifth driver (Pacific Decadal Oscillation)
// The PDO holds a phase for years; the year shown is one year inside such a
// phase, so its scenarios start in November and its winter links apply at once.
function runPdo(phaseId: string, startMonth = 11): Timeline {
  return propagate(graph, { driverId: 'pdo', phaseId, startMonth, horizonMonths: HORIZON });
}

const POSITIVE_PDO: Array<[string, Value, string]> = [
  ['alaska_winter', 1, 'Alaska mild'],
  ['pacific_northwest_winter', 1, 'the Pacific Northwest mild and dry'],
  ['canadian_prairies_winter', 1, 'the Prairies mild'],
  ['us_southwest_winter', 1, 'the Southwest wet'],
];

describe('acceptance: positive PDO, November start', () => {
  const tl = runPdo('positive');
  for (const [id, sign, label] of POSITIVE_PDO) {
    it(`${label} within twelve months`, () => {
      expect(monthsWith(tl, id, sign).length, `${id} never reaches ${sign}`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, (-sign) as Value), `${id} also shows the opposite sign`).toHaveLength(0);
    });
  }
  it('Alaska and the Southwest are applied from month 0 (November); the Northwest and the Prairies from December', () => {
    expect(tl.months[0].calendarMonth).toBe(11);
    expect(tl.months[0].nodes.alaska_winter.value).toBe(1);
    expect(tl.months[0].nodes.us_southwest_winter.value).toBe(1);
    expect(tl.months[0].nodes.pacific_northwest_winter.value).toBe(0);
    expect(tl.months[0].nodes.pacific_northwest_winter.pendingLinkIds).toEqual(['positive_pdo_pacific_northwest']);
    expect(tl.months[1].nodes.pacific_northwest_winter.value).toBe(1);
    expect(tl.months[1].nodes.canadian_prairies_winter.value).toBe(1);
  });
  it('is a winter pattern on this map: nothing applied from May to September, but pending', () => {
    for (const m of tl.months) {
      if (m.calendarMonth < 5 || m.calendarMonth > 9) continue;
      for (const st of Object.values(m.nodes)) expect(st.viaLinkIds, `month ${m.index} (calendar ${m.calendarMonth})`).toHaveLength(0);
    }
    const july = tl.months.find((m) => m.calendarMonth === 7)!;
    expect(july.nodes.alaska_winter.pendingLinkIds).toEqual(['positive_pdo_alaska']);
  });
  it('nothing is rated established: the PDO is a mix of processes, and the rain links are contested', () => {
    const own = graph.links.filter((l) => l.from === 'pdo');
    expect(own).toHaveLength(8);
    for (const l of own) expect(l.confidence, l.id).not.toBe('established');
    expect(own.filter((l) => l.to === 'us_southwest_winter').every((l) => l.confidence === 'contested')).toBe(true);
    const nov = tl.months[0];
    expect(nov.nodes.us_southwest_winter.confidence).toBe('contested');
    expect(nov.nodes.alaska_winter.confidence).toBe('probable');
  });
  it('regions of the other drivers stay hollow: the map does not fake a PDO effect', () => {
    for (const id of ['peru_coast_rainfall', 'indonesia_rainfall', 'east_australia_rainfall', 'northern_europe_winter', 'patagonia_rainfall', 'california_winter', 'us_gulf_coast_winter']) {
      for (const m of tl.months) {
        expect(m.nodes[id].viaLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
        expect(m.nodes[id].pendingLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
      }
    }
  });
});

describe('acceptance: negative PDO, November start', () => {
  const tl = runPdo('negative');
  it('reverses the positive phase at every target, and never copies its sign', () => {
    const targets = new Set(graph.links.filter((l) => l.from === 'pdo' && l.when === 'negative').map((l) => l.to));
    expect(targets.size).toBe(POSITIVE_PDO.length);
    for (const [id, sign] of POSITIVE_PDO) {
      expect(targets.has(id), `${id} has no negative link`).toBe(true);
      expect(monthsWith(tl, id, (-sign) as Value).length, `${id} should reverse the positive phase`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, sign), `${id} copies the positive sign`).toHaveLength(0);
    }
  });
});

describe('acceptance: ENSO pushes the PDO (June start, chain on)', () => {
  const tl = runDeep('enso', 'el_nino', 6);
  it('El Niño pushes the PDO positive from September (lag 3, all year) and holds it to the end', () => {
    for (const m of tl.months) expect(m.nodes.pdo.value, `month ${m.index}`).toBe(m.index >= 3 ? 1 : 0);
    expect(tl.months[3].links.el_nino_positive_pdo?.status).toBe('applied');
    expect(tl.months[3].nodes.pdo.confidence).toBe('probable');
  });
  it('the pushed PDO adds a second, weaker push to the Northwest and the Prairies in winter: same sign, no conflict, one tier down', () => {
    const jan = tl.months.find((m) => m.calendarMonth === 1)!;
    for (const id of ['pacific_northwest_winter', 'canadian_prairies_winter', 'us_southwest_winter']) {
      const st = jan.nodes[id];
      expect(st.value, id).toBe(1);
      expect(st.conflicting, id).toBe(false);
      expect(st.viaLinkIds.some((l) => l.startsWith('positive_pdo_')), id).toBe(true);
      expect(st.viaLinkIds.some((l) => l.startsWith('el_nino_')), id).toBe(true);
    }
    expect(jan.links.positive_pdo_pacific_northwest?.depth).toBe(2);
    expect(jan.links.positive_pdo_pacific_northwest?.confidence).toBe('contested');
    // Alaska has no direct ENSO link on this map: it is reached through the PDO only, at the downgraded tier.
    expect(jan.nodes.alaska_winter.value).toBe(1);
    expect(jan.nodes.alaska_winter.viaLinkIds).toEqual(['positive_pdo_alaska']);
    expect(jan.nodes.alaska_winter.confidence).toBe('contested');
  });
  it('under "established only" the pushed PDO is a ghost and Alaska stays hollow', () => {
    const est = propagate(graph, { driverId: 'enso', phaseId: 'el_nino', startMonth: 6, horizonMonths: HORIZON, maxDepth: 3, minConfidence: 'established' });
    const jan = est.months.find((m) => m.calendarMonth === 1)!;
    expect(jan.links.el_nino_positive_pdo?.status).toBe('ghost');
    expect(jan.nodes.pdo.value).toBe(0);
    expect(jan.nodes.alaska_winter.value).toBe(0);
  });
  it('La Niña pushes the PDO negative and the Southwest gets two dry pushes in winter', () => {
    const ln = runDeep('enso', 'la_nina', 6);
    const feb = ln.months.find((m) => m.calendarMonth === 2)!;
    expect(feb.nodes.pdo.value).toBe(-1);
    expect(feb.nodes.us_southwest_winter.value).toBe(-1);
    expect([...feb.nodes.us_southwest_winter.viaLinkIds].sort()).toEqual(['la_nina_us_southwest', 'negative_pdo_us_southwest']);
  });
});

describe('acceptance: the 2014–15 story, a positive PDO with El Niño from March', () => {
  const tl = runTwo(['pdo', 'positive'], ['enso', 'el_nino'], 11, 3);
  it('El Niño enters at month 4 (March) and is never pushed before it', () => {
    expect(chosenOnset(tl.scenario, 'enso')).toBe(4);
    for (const m of tl.months.slice(0, 4)) expect(m.nodes.enso.value, `month ${m.index}`).toBe(0);
    expect(tl.months[4].nodes.enso.value).toBe(1);
    for (const m of tl.months) expect(m.links.el_nino_positive_pdo, `month ${m.index}`).toBeUndefined();
  });
  it('the Northwest and the Southwest are applied through the PDO alone at month 3 (February)', () => {
    expect(tl.months[3].calendarMonth).toBe(2);
    expect(tl.months[3].nodes.pacific_northwest_winter.viaLinkIds).toEqual(['positive_pdo_pacific_northwest']);
    expect(tl.months[3].nodes.us_southwest_winter.viaLinkIds).toEqual(['positive_pdo_us_southwest']);
    expect(tl.months[3].nodes.us_southwest_winter.confidence).toBe('contested');
  });
  it('by month 12 (November 2015) the Southwest carries both arrows, same sign, rated by the weaker line', () => {
    const st = tl.months[12].nodes.us_southwest_winter;
    expect(tl.months[12].calendarMonth).toBe(11);
    expect([...st.viaLinkIds].sort()).toEqual(['el_nino_us_southwest', 'positive_pdo_us_southwest']);
    expect(st.value).toBe(1);
    expect(st.conflicting).toBe(false);
    expect(st.confidence).toBe('contested');
  });
  it('the shipped story uses these settings', () => {
    const s = graph.stories.find((x) => x.id === 'positive_pdo_2014_15')!;
    expect(s).toBeDefined();
    expect([s.driver, s.phase, s.drivers, s.start_month, s.start_year])
      .toEqual(['pdo', 'positive', [{ driver: 'enso', phase: 'el_nino', start_month: 3 }], 11, 2014]);
  });
});

// ---------------------------------------------------------------- M18: sixth driver (Atlantic Multidecadal Oscillation)
// The AMO holds a phase for decades; the year shown is one year inside such a
// phase, so its scenarios start in June and its summer links apply at once.
function runAmo(phaseId: string, startMonth = 6): Timeline {
  return propagate(graph, { driverId: 'amo', phaseId, startMonth, horizonMonths: HORIZON });
}

const POSITIVE_AMO: Array<[string, Value, string]> = [
  ['atlantic_hurricanes', 1, 'Atlantic hurricanes active'],
  ['sahel_rainfall', 1, 'the Sahel wet'],
  ['us_great_plains_summer', -1, 'the Great Plains dry'],
  ['western_europe_summer', 1, 'western Europe warm'],
  ['northeast_brazil', -1, 'the Nordeste dry'],
  ['indian_summer_monsoon', 1, 'the Indian monsoon stronger'],
];

describe('acceptance: positive AMO, June start', () => {
  const tl = runAmo('positive');
  for (const [id, sign, label] of POSITIVE_AMO) {
    it(`${label} within twelve months`, () => {
      expect(monthsWith(tl, id, sign).length, `${id} never reaches ${sign}`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, (-sign) as Value), `${id} also shows the opposite sign`).toHaveLength(0);
    });
  }
  it('hurricanes, the Plains, Europe and the monsoon are applied from month 0 (June); the Sahel from July; the Nordeste from February', () => {
    expect(tl.months[0].calendarMonth).toBe(6);
    expect(tl.months[0].nodes.atlantic_hurricanes.value).toBe(1);
    expect(tl.months[0].nodes.us_great_plains_summer.value).toBe(-1);
    expect(tl.months[0].nodes.western_europe_summer.value).toBe(1);
    expect(tl.months[0].nodes.indian_summer_monsoon.value).toBe(1);
    expect(tl.months[0].nodes.sahel_rainfall.value).toBe(0);
    expect(tl.months[0].nodes.sahel_rainfall.pendingLinkIds).toEqual(['positive_amo_sahel']);
    expect(tl.months[1].nodes.sahel_rainfall.value).toBe(1);
    expect(tl.months[7].calendarMonth).toBe(1);
    expect(tl.months[7].nodes.northeast_brazil.value).toBe(0);
    expect(tl.months[8].nodes.northeast_brazil.value).toBe(-1);
  });
  it('the summer links are pending, not applied, in winter (December)', () => {
    const dec = tl.months.find((m) => m.calendarMonth === 12)!;
    for (const id of ['atlantic_hurricanes', 'sahel_rainfall', 'us_great_plains_summer', 'western_europe_summer', 'indian_summer_monsoon']) {
      expect(dec.nodes[id].viaLinkIds, id).toHaveLength(0);
      expect(dec.nodes[id].pendingLinkIds.length, id).toBeGreaterThan(0);
    }
  });
  it('tiers: hurricanes and the Sahel established, the Plains and Europe probable, the Nordeste, the monsoon and the NAO contested', () => {
    const own = graph.links.filter((l) => l.from === 'amo');
    expect(own).toHaveLength(14);
    const tier = (to: string) => own.filter((l) => l.to === to).map((l) => l.confidence);
    expect(tier('atlantic_hurricanes')).toEqual(['established', 'established']);
    expect(tier('sahel_rainfall')).toEqual(['established', 'established']);
    expect(tier('us_great_plains_summer')).toEqual(['probable', 'probable']);
    expect(tier('western_europe_summer')).toEqual(['probable', 'probable']);
    expect(tier('northeast_brazil')).toEqual(['contested', 'contested']);
    expect(tier('indian_summer_monsoon')).toEqual(['contested', 'contested']);
    expect(tier('nao')).toEqual(['contested', 'contested']);
    expect(tl.months[0].nodes.atlantic_hurricanes.confidence).toBe('established');
    expect(tl.months[0].nodes.indian_summer_monsoon.confidence).toBe('contested');
  });
  it('regions of the other drivers stay hollow: the map does not fake an AMO effect', () => {
    for (const id of ['peru_coast_rainfall', 'indonesia_rainfall', 'east_australia_rainfall', 'alaska_winter', 'patagonia_rainfall', 'california_winter', 'east_africa_short_rains']) {
      for (const m of tl.months) {
        expect(m.nodes[id].viaLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
        expect(m.nodes[id].pendingLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
      }
    }
  });
  it('at depth 1 the NAO is pushed but its own links do not fire: northern Europe stays hollow', () => {
    expect(tl.months[6].nodes.nao.value).toBe(-1);
    for (const m of tl.months) expect(m.nodes.northern_europe_winter.viaLinkIds, `month ${m.index}`).toHaveLength(0);
  });
});

describe('acceptance: negative AMO, June start', () => {
  const tl = runAmo('negative');
  it('reverses the positive phase at every target, and never copies its sign', () => {
    const targets = new Set(graph.links.filter((l) => l.from === 'amo' && l.when === 'negative' && l.to !== 'nao').map((l) => l.to));
    expect(targets.size).toBe(POSITIVE_AMO.length);
    for (const [id, sign] of POSITIVE_AMO) {
      expect(targets.has(id), `${id} has no negative link`).toBe(true);
      expect(monthsWith(tl, id, (-sign) as Value).length, `${id} should reverse the positive phase`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, sign), `${id} copies the positive sign`).toHaveLength(0);
    }
  });
});

describe('acceptance: the AMO tilts the NAO (June start, chain on)', () => {
  const tl = runDeep('amo', 'positive', 6);
  it('a positive AMO pushes the NAO negative from December (winter only) at the contested tier', () => {
    for (const m of tl.months) expect(m.nodes.nao.value, `month ${m.index}`).toBe(m.calendarMonth === 12 || m.calendarMonth <= 3 ? -1 : 0);
    expect(tl.months[6].calendarMonth).toBe(12);
    expect(tl.months[6].links.positive_amo_negative_nao?.status).toBe('applied');
    expect(tl.months[6].nodes.nao.confidence).toBe('contested');
  });
  it('the pushed NAO cools northern Europe in winter, two hops down and never above contested', () => {
    const jan = tl.months.find((m) => m.calendarMonth === 1)!;
    expect(jan.nodes.northern_europe_winter.value).toBe(-1);
    expect(jan.nodes.northern_europe_winter.viaLinkIds).toEqual(['negative_nao_northern_europe']);
    expect(jan.nodes.northern_europe_winter.confidence).toBe('contested');
    expect(jan.links.negative_nao_northern_europe?.depth).toBe(2);
  });
  it('under "established only" the tilt is a ghost and northern Europe stays hollow', () => {
    const est = propagate(graph, { driverId: 'amo', phaseId: 'positive', startMonth: 6, horizonMonths: HORIZON, maxDepth: 3, minConfidence: 'established' });
    const jan = est.months.find((m) => m.calendarMonth === 1)!;
    expect(jan.links.positive_amo_negative_nao?.status).toBe('ghost');
    expect(jan.nodes.nao.value).toBe(0);
    expect(jan.nodes.northern_europe_winter.value).toBe(0);
  });
  it('a negative AMO pushes the NAO positive and northern Europe mild', () => {
    const neg = runDeep('amo', 'negative', 6);
    const jan = neg.months.find((m) => m.calendarMonth === 1)!;
    expect(jan.nodes.nao.value).toBe(1);
    expect(jan.nodes.northern_europe_winter.value).toBe(1);
  });
  it('nothing on the map pushes the AMO', () => {
    expect(graph.links.filter((l) => l.to === 'amo')).toHaveLength(0);
  });
});

describe('acceptance: the 1995 story, a positive AMO with La Niña from September', () => {
  const tl = runTwo(['amo', 'positive'], ['enso', 'la_nina'], 6, 9);
  it('La Niña enters at month 3 (September) and is never pushed before it', () => {
    expect(chosenOnset(tl.scenario, 'enso')).toBe(3);
    for (const m of tl.months.slice(0, 3)) expect(m.nodes.enso.value, `month ${m.index}`).toBe(0);
    expect(tl.months[3].nodes.enso.value).toBe(-1);
  });
  it('in October the hurricane region carries both arrows, same sign, rated established by both', () => {
    const oct = tl.months[4];
    expect(oct.calendarMonth).toBe(10);
    expect([...oct.nodes.atlantic_hurricanes.viaLinkIds].sort()).toEqual(['la_nina_atlantic_hurricanes', 'positive_amo_atlantic_hurricanes']);
    expect(oct.nodes.atlantic_hurricanes.value).toBe(1);
    expect(oct.nodes.atlantic_hurricanes.conflicting).toBe(false);
    expect(oct.nodes.atlantic_hurricanes.confidence).toBe('established');
  });
  it('the two drivers pull the NAO opposite ways by March: the AMO from December, La Niña once its lag has run, so the NAO conflicts and holds no phase', () => {
    const dec = tl.months[6];
    expect(dec.calendarMonth).toBe(12);
    expect(dec.nodes.nao.value).toBe(-1);
    const mar = tl.months[9];
    expect(mar.calendarMonth).toBe(3);
    expect([...mar.nodes.nao.viaLinkIds].sort()).toEqual(['la_nina_positive_nao', 'positive_amo_negative_nao']);
    expect(mar.nodes.nao.conflicting).toBe(true);
    expect(mar.nodes.nao.value).toBe(0);
    expect(mar.nodes.northern_europe_winter.viaLinkIds).toHaveLength(0);
  });
  it('the shipped story uses these settings', () => {
    const s = graph.stories.find((x) => x.id === 'positive_amo_1995')!;
    expect(s).toBeDefined();
    expect([s.driver, s.phase, s.drivers, s.start_month, s.start_year])
      .toEqual(['amo', 'positive', [{ driver: 'enso', phase: 'la_nina', start_month: 9 }], 6, 1995]);
  });
});

// ---------------------------------------------------------------- M19: seventh driver (Atlantic Niño)
// An Atlantic Niño peaks in June–August, in the West African monsoon season,
// so its scenarios start in May; the map holds the phase for the year.
function runAtl(phaseId: string, startMonth = 5, maxDepth = 1): Timeline {
  return propagate(graph, { driverId: 'atlantic_nino', phaseId, startMonth, horizonMonths: HORIZON, maxDepth });
}

const ATLANTIC_NINO: Array<[string, Value, string]> = [
  ['guinea_coast_rainfall', 1, 'the Guinea coast wet'],
  ['sahel_rainfall', -1, 'the Sahel dry'],
  ['indian_summer_monsoon', -1, 'the Indian monsoon weaker'],
];

describe('acceptance: Atlantic Niño, May start', () => {
  const tl = runAtl('warm');
  for (const [id, sign, label] of ATLANTIC_NINO) {
    it(`${label} within twelve months`, () => {
      expect(monthsWith(tl, id, sign).length, `${id} never reaches ${sign}`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, (-sign) as Value), `${id} also shows the opposite sign`).toHaveLength(0);
    });
  }
  it('the Guinea coast is applied from month 0 (May), the monsoon from June, the Sahel from July, and the coast is done by August', () => {
    expect(tl.months[0].calendarMonth).toBe(5);
    expect(tl.months[0].nodes.guinea_coast_rainfall.value).toBe(1);
    expect(tl.months[0].nodes.indian_summer_monsoon.value).toBe(0);
    expect(tl.months[0].nodes.indian_summer_monsoon.pendingLinkIds).toEqual(['atlantic_nino_indian_monsoon']);
    expect(tl.months[1].nodes.indian_summer_monsoon.value).toBe(-1);
    expect(tl.months[1].nodes.sahel_rainfall.value).toBe(0);
    expect(tl.months[2].nodes.sahel_rainfall.value).toBe(-1);
    expect(tl.months[3].calendarMonth).toBe(8);
    expect(tl.months[3].nodes.guinea_coast_rainfall.viaLinkIds).toHaveLength(0);
    expect(tl.months[3].nodes.guinea_coast_rainfall.pendingLinkIds).toEqual(['atlantic_nino_guinea_coast']);
  });
  it('tiers: the coast established, the Sahel and the monsoon contested, the push on ENSO probable; the cool phase has no monsoon link', () => {
    const own = graph.links.filter((l) => l.from === 'atlantic_nino');
    expect(own).toHaveLength(7);
    const tier = (to: string) => own.filter((l) => l.to === to).map((l) => l.confidence);
    expect(tier('guinea_coast_rainfall')).toEqual(['established', 'established']);
    expect(tier('sahel_rainfall')).toEqual(['contested', 'contested']);
    expect(tier('indian_summer_monsoon')).toEqual(['contested']);
    expect(tier('enso')).toEqual(['probable', 'probable']);
    expect(own.filter((l) => l.when === 'cool').map((l) => l.to).sort()).toEqual(['enso', 'guinea_coast_rainfall', 'sahel_rainfall']);
    expect(tl.months[2].nodes.sahel_rainfall.confidence).toBe('contested');
    expect(tl.months[0].nodes.guinea_coast_rainfall.confidence).toBe('established');
  });
  it('at depth 1 ENSO is pushed toward La Niña from October (lag 5) but its links do not fire', () => {
    for (const m of tl.months) expect(m.nodes.enso.value, `month ${m.index}`).toBe(m.index >= 5 ? -1 : 0);
    expect(tl.months[5].calendarMonth).toBe(10);
    for (const m of tl.months) expect(m.nodes.atlantic_hurricanes.viaLinkIds, `month ${m.index}`).toHaveLength(0);
  });
  it('regions of the other drivers stay hollow: the map does not fake an Atlantic Niño effect', () => {
    for (const id of ['peru_coast_rainfall', 'indonesia_rainfall', 'east_australia_rainfall', 'alaska_winter', 'northern_europe_winter', 'western_europe_summer', 'us_great_plains_summer', 'northeast_brazil']) {
      for (const m of tl.months) {
        expect(m.nodes[id].viaLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
        expect(m.nodes[id].pendingLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
      }
    }
  });
});

describe('acceptance: Atlantic Niña, May start', () => {
  const tl = runAtl('cool');
  it('reverses the coast and the Sahel, and never copies the warm sign', () => {
    for (const [id, sign] of ATLANTIC_NINO.filter(([id]) => id !== 'indian_summer_monsoon')) {
      expect(monthsWith(tl, id, (-sign) as Value).length, `${id} should reverse the warm phase`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, sign), `${id} copies the warm sign`).toHaveLength(0);
    }
  });
  it('leaves the monsoon hollow: the literature supports the warm phase only', () => {
    for (const m of tl.months) {
      expect(m.nodes.indian_summer_monsoon.viaLinkIds, `month ${m.index}`).toHaveLength(0);
      expect(m.nodes.indian_summer_monsoon.pendingLinkIds, `month ${m.index}`).toHaveLength(0);
    }
  });
  it('pushes ENSO toward El Niño from October', () => {
    expect(tl.months[5].nodes.enso.value).toBe(1);
    expect(tl.months[4].nodes.enso.value).toBe(0);
  });
});

describe('acceptance: the Atlantic Niño nudges the Pacific (May start, chain on)', () => {
  const tl = runAtl('warm', 5, 3);
  it('the pushed La Niña fires its own links one tier down: hurricanes active in October and November, rated probable', () => {
    const oct = tl.months[5];
    expect(oct.calendarMonth).toBe(10);
    expect(oct.links.atlantic_nino_la_nina?.status).toBe('applied');
    expect(oct.nodes.enso.confidence).toBe('probable');
    expect(oct.nodes.atlantic_hurricanes.value).toBe(1);
    expect(oct.nodes.atlantic_hurricanes.viaLinkIds).toEqual(['la_nina_atlantic_hurricanes']);
    expect(oct.nodes.atlantic_hurricanes.confidence).toBe('probable');
    expect(oct.links.la_nina_atlantic_hurricanes?.depth).toBe(2);
    expect(tl.months[7].nodes.atlantic_hurricanes.viaLinkIds).toHaveLength(0);
  });
  it('the pushed La Niña arrives after the Sahel and monsoon seasons, so it never conflicts with the Atlantic Niño there', () => {
    for (const m of tl.months) {
      expect(m.nodes.sahel_rainfall.conflicting, `month ${m.index}`).toBe(false);
      expect(m.nodes.indian_summer_monsoon.conflicting, `month ${m.index}`).toBe(false);
      expect(m.nodes.sahel_rainfall.viaLinkIds.some((l) => l.startsWith('la_nina_')), `month ${m.index}`).toBe(false);
    }
  });
  it('under "established only" the push is a ghost and the Sahel is hollow, while the coast is still applied', () => {
    const est = propagate(graph, { driverId: 'atlantic_nino', phaseId: 'warm', startMonth: 5, horizonMonths: HORIZON, maxDepth: 3, minConfidence: 'established' });
    expect(est.months[5].links.atlantic_nino_la_nina?.status).toBe('ghost');
    expect(est.months[5].nodes.enso.value).toBe(0);
    expect(est.months[2].nodes.sahel_rainfall.value).toBe(0);
    expect(est.months[2].links.atlantic_nino_sahel?.status).toBe('ghost');
    expect(est.months[0].nodes.guinea_coast_rainfall.value).toBe(1);
  });
  it('nothing on the map pushes the Atlantic Niño', () => {
    expect(graph.links.filter((l) => l.to === 'atlantic_nino')).toHaveLength(0);
  });
});

describe('acceptance: the 1984 story, an Atlantic Niño inside a cool AMO', () => {
  const tl = runTwo(['atlantic_nino', 'warm'], ['amo', 'negative'], 5, 5, true);
  it('the AMO is in phase from month 0 with an onset a year back', () => {
    expect(chosenOnset(tl.scenario, 'amo')).toBe(-12);
    expect(tl.months[0].nodes.amo.value).toBe(-1);
    expect(tl.months[0].nodes.atlantic_nino.value).toBe(1);
  });
  it('June: the Guinea coast wet through the Atlantic Niño alone', () => {
    expect(tl.months[1].calendarMonth).toBe(6);
    expect(tl.months[1].nodes.guinea_coast_rainfall.viaLinkIds).toEqual(['atlantic_nino_guinea_coast']);
    expect(tl.months[1].nodes.guinea_coast_rainfall.value).toBe(1);
  });
  it('August: the Sahel dry with both arrows, same sign, rated by the weaker (contested) line', () => {
    const aug = tl.months[3];
    expect(aug.calendarMonth).toBe(8);
    expect([...aug.nodes.sahel_rainfall.viaLinkIds].sort()).toEqual(['atlantic_nino_sahel', 'negative_amo_sahel']);
    expect(aug.nodes.sahel_rainfall.value).toBe(-1);
    expect(aug.nodes.sahel_rainfall.conflicting).toBe(false);
    expect(aug.nodes.sahel_rainfall.confidence).toBe('contested');
  });
  it('October: ENSO pushed toward La Niña by the Atlantic Niño; the cool AMO tilts the NAO positive from December', () => {
    expect(tl.months[5].nodes.enso.value).toBe(-1);
    expect(tl.months[5].nodes.enso.viaLinkIds).toEqual(['atlantic_nino_la_nina']);
    expect(tl.months[7].calendarMonth).toBe(12);
    expect(tl.months[7].nodes.nao.value).toBe(1);
  });
  it('the shipped story uses these settings', () => {
    const s = graph.stories.find((x) => x.id === 'atlantic_nino_1984')!;
    expect(s).toBeDefined();
    expect([s.driver, s.phase, s.drivers, s.start_month, s.start_year])
      .toEqual(['atlantic_nino', 'warm', [{ driver: 'amo', phase: 'negative', start_month: 5, starts_before: true }], 5, 1984]);
  });
});


// ---------------------------------------------------------------- M20: eighth driver (Indian Ocean Basin Mode)
// The basin warms a season after an El Niño begins, peaks in February–April
// and lasts into the summer, so its scenarios start in February.
function runIob(phaseId: string, startMonth = 2, maxDepth = 1): Timeline {
  return propagate(graph, { driverId: 'indian_ocean_basin', phaseId, startMonth, horizonMonths: HORIZON, maxDepth });
}

const WARM_BASIN: Array<[string, Value, string]> = [
  ['yangtze_summer_rainfall', 1, 'the Yangtze wet'],
  ['west_pacific_typhoons', -1, 'the typhoon season quiet'],
  ['south_china_rainfall', 1, 'South China wet'],
  ['indian_summer_monsoon', 1, 'the Indian monsoon stronger'],
  ['north_indian_ocean_cyclones', -1, 'the pre-monsoon cyclones fewer'],
];

describe('acceptance: warm Indian Ocean basin, February start', () => {
  const tl = runIob('warm');
  for (const [id, sign, label] of WARM_BASIN) {
    it(`${label} within twelve months`, () => {
      expect(monthsWith(tl, id, sign).length, `${id} never reaches ${sign}`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, (-sign) as Value), `${id} also shows the opposite sign`).toHaveLength(0);
    });
  }
  it('the Yangtze from June (month 4), pending before; South China from April; the cyclones April–June; the monsoon from June', () => {
    expect(tl.months[0].calendarMonth).toBe(2);
    expect(tl.months[3].nodes.yangtze_summer_rainfall.value).toBe(0);
    expect(tl.months[3].nodes.yangtze_summer_rainfall.pendingLinkIds).toEqual(['warm_basin_yangtze']);
    expect(tl.months[4].calendarMonth).toBe(6);
    expect(tl.months[4].nodes.yangtze_summer_rainfall.value).toBe(1);
    expect(tl.months[6].nodes.yangtze_summer_rainfall.value).toBe(1);
    expect(tl.months[7].nodes.yangtze_summer_rainfall.value).toBe(0);
    expect(tl.months[1].nodes.south_china_rainfall.value).toBe(0);
    expect(tl.months[2].nodes.south_china_rainfall.value).toBe(1);
    expect(tl.months[2].nodes.north_indian_ocean_cyclones.value).toBe(-1);
    expect(tl.months[4].nodes.north_indian_ocean_cyclones.value).toBe(-1);
    expect(tl.months[5].nodes.north_indian_ocean_cyclones.value).toBe(0);
    expect(tl.months[3].nodes.indian_summer_monsoon.value).toBe(0);
    expect(tl.months[4].nodes.indian_summer_monsoon.value).toBe(1);
    expect(tl.months[4].nodes.west_pacific_typhoons.value).toBe(-1);
  });
  it('tiers: the Yangtze established, typhoons and South China probable, the monsoon, the cyclones and India’s spring heat (M27) contested, the push on ENSO probable', () => {
    const own = graph.links.filter((l) => l.from === 'indian_ocean_basin');
    expect(own).toHaveLength(10);
    const tier = (to: string) => own.filter((l) => l.to === to).map((l) => `${l.when}:${l.confidence}`).sort();
    expect(tier('yangtze_summer_rainfall')).toEqual(['cool:probable', 'warm:established']);
    expect(tier('west_pacific_typhoons')).toEqual(['cool:contested', 'warm:probable']);
    expect(tier('south_china_rainfall')).toEqual(['cool:probable', 'warm:probable']);
    expect(tier('indian_summer_monsoon')).toEqual(['warm:contested']);
    expect(tier('north_indian_ocean_cyclones')).toEqual(['warm:contested']);
    expect(tier('india_premonsoon_heat')).toEqual(['warm:contested']);
    expect(tier('enso')).toEqual(['warm:probable']);
    expect(tl.months[4].nodes.yangtze_summer_rainfall.confidence).toBe('established');
    expect(tl.months[4].nodes.indian_summer_monsoon.confidence).toBe('contested');
    expect(tl.months[3].nodes.north_indian_ocean_cyclones.confidence).toBe('contested');
  });
  it('under "probable and above" the monsoon and the cyclones are hollow ghosts while the Yangtze and the typhoons still apply', () => {
    const prob = propagate(graph, { driverId: 'indian_ocean_basin', phaseId: 'warm', startMonth: 2, horizonMonths: HORIZON, maxDepth: 1, minConfidence: 'probable' });
    expect(prob.months[4].nodes.indian_summer_monsoon.value).toBe(0);
    expect(prob.months[4].links.warm_basin_indian_monsoon?.status).toBe('ghost');
    expect(prob.months[3].nodes.north_indian_ocean_cyclones.value).toBe(0);
    expect(prob.months[3].links.warm_basin_north_indian_ocean_cyclones?.status).toBe('ghost');
    expect(prob.months[4].nodes.yangtze_summer_rainfall.value).toBe(1);
    expect(prob.months[4].nodes.west_pacific_typhoons.value).toBe(-1);
  });
  it('at depth 1 ENSO is pushed toward La Niña from June (lag 4) but its links do not fire', () => {
    for (const m of tl.months) expect(m.nodes.enso.value, `month ${m.index}`).toBe(m.index >= 4 ? -1 : 0);
    expect(tl.months[4].calendarMonth).toBe(6);
    for (const m of tl.months) expect(m.nodes.indonesia_rainfall.viaLinkIds, `month ${m.index}`).toHaveLength(0);
  });
  it('the IOD is not pushed by the basin and the regions of the other drivers stay hollow', () => {
    for (const m of tl.months) expect(m.nodes.iod.value, `month ${m.index}`).toBe(0);
    for (const id of ['east_africa_short_rains', 'peru_coast_rainfall', 'northern_europe_winter', 'alaska_winter', 'sahel_rainfall', 'guinea_coast_rainfall', 'east_asia_summer']) {
      for (const m of tl.months) {
        expect(m.nodes[id].viaLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
        expect(m.nodes[id].pendingLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
      }
    }
  });
});

describe('acceptance: cool Indian Ocean basin, February start', () => {
  const tl = runIob('cool');
  it('reverses the Yangtze, the typhoons and South China, and never copies the warm sign', () => {
    for (const [id, sign] of WARM_BASIN.filter(([id]) => id !== 'indian_summer_monsoon' && id !== 'north_indian_ocean_cyclones')) {
      expect(monthsWith(tl, id, (-sign) as Value).length, `${id} should reverse the warm phase`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, sign), `${id} copies the warm sign`).toHaveLength(0);
    }
    expect(tl.months[4].nodes.yangtze_summer_rainfall.confidence).toBe('probable');
    expect(tl.months[4].nodes.west_pacific_typhoons.confidence).toBe('contested');
  });
  it('leaves the monsoon and the cyclones hollow, and does not push ENSO: the literature supports the warm phase only', () => {
    for (const m of tl.months) {
      for (const id of ['indian_summer_monsoon', 'north_indian_ocean_cyclones']) {
        expect(m.nodes[id].viaLinkIds, `${id} month ${m.index}`).toHaveLength(0);
        expect(m.nodes[id].pendingLinkIds, `${id} month ${m.index}`).toHaveLength(0);
      }
      expect(m.nodes.enso.value, `month ${m.index}`).toBe(0);
    }
  });
});

describe('acceptance: El Niño pushes the basin warm (June start, chain on): the capacitor chain', () => {
  const tl = runDeep('enso', 'el_nino', 6);
  it('the basin is pushed warm in September (lag 3) at depth 1, rated established', () => {
    expect(tl.months[2].nodes.indian_ocean_basin.value).toBe(0);
    expect(tl.months[3].calendarMonth).toBe(9);
    expect(tl.months[3].nodes.indian_ocean_basin.value).toBe(1);
    expect(tl.months[3].nodes.indian_ocean_basin.viaLinkIds).toEqual(['el_nino_warm_basin']);
    expect(tl.months[3].links.el_nino_warm_basin?.depth).toBe(1);
    expect(tl.months[3].nodes.indian_ocean_basin.confidence).toBe('established');
  });
  it('the Yangtze link reaches only the last month shown (June, month 12), one tier down; before that it is pending, the honest result', () => {
    for (const m of tl.months.slice(0, 12)) {
      expect(m.nodes.yangtze_summer_rainfall.viaLinkIds, `month ${m.index}`).toHaveLength(0);
      expect(m.links.warm_basin_yangtze?.status ?? 'absent', `month ${m.index}`).not.toBe('applied');
    }
    expect(tl.months[6].nodes.yangtze_summer_rainfall.pendingLinkIds).toEqual(['warm_basin_yangtze']);
    const jun = tl.months[12];
    expect(jun.calendarMonth).toBe(6);
    expect(jun.nodes.yangtze_summer_rainfall.viaLinkIds).toEqual(['warm_basin_yangtze']);
    expect(jun.nodes.yangtze_summer_rainfall.confidence).toBe('probable');
    expect(jun.links.warm_basin_yangtze?.depth).toBe(2);
  });
  it('the pushed basin reaches South China in April and May one tier down, alongside El Niño’s own arrow, same sign, rated by the weaker', () => {
    const apr = tl.months[10];
    expect(apr.calendarMonth).toBe(4);
    expect([...apr.nodes.south_china_rainfall.viaLinkIds].sort()).toEqual(['el_nino_south_china', 'warm_basin_south_china']);
    expect(apr.nodes.south_china_rainfall.value).toBe(1);
    expect(apr.nodes.south_china_rainfall.conflicting).toBe(false);
    expect(apr.links.warm_basin_south_china?.depth).toBe(2);
    expect(apr.links.warm_basin_south_china?.confidence).toBe('contested');
    expect(apr.nodes.south_china_rainfall.confidence).toBe('contested');
    expect(tl.months[9].nodes.south_china_rainfall.viaLinkIds).toEqual(['el_nino_south_china']);
  });
  it('the dipole and the basin are both pushed; the basin’s monsoon arrow reaches only month 12 and joins the conflict the dipole already makes there', () => {
    expect(tl.months[3].nodes.iod.value).toBe(1);
    for (const m of tl.months.slice(0, 12)) expect(m.links.warm_basin_indian_monsoon?.status ?? 'absent', `month ${m.index}`).not.toBe('applied');
    // El Niño's own weaker-monsoon arrow and the pushed dipole's stronger-monsoon arrow already conflict in June (month 0).
    expect(tl.months[0].nodes.indian_summer_monsoon.conflicting).toBe(true);
    const jun = tl.months[12];
    expect(jun.links.warm_basin_indian_monsoon?.status).toBe('applied');
    expect(jun.nodes.indian_summer_monsoon.conflicting).toBe(true);
    expect([...jun.nodes.indian_summer_monsoon.viaLinkIds].sort()).toEqual(['el_nino_indian_monsoon', 'positive_iod_indian_monsoon', 'warm_basin_indian_monsoon']);
  });
  it('the basin’s push back on ENSO is guarded: ENSO stays El Niño all year', () => {
    for (const m of tl.months) expect(m.nodes.enso.value, `month ${m.index}`).toBe(1);
    for (const m of tl.months) expect(m.links.warm_basin_la_nina?.status ?? 'absent', `month ${m.index}`).not.toBe('applied');
  });
  it('a La Niña from June pushes the basin cool in September, rated probable, and the cool basin pushes nothing back', () => {
    const ln = runDeep('enso', 'la_nina', 6);
    expect(ln.months[3].nodes.indian_ocean_basin.value).toBe(-1);
    expect(ln.months[3].nodes.indian_ocean_basin.confidence).toBe('probable');
    for (const m of ln.months) expect(m.nodes.enso.value, `month ${m.index}`).toBe(-1);
  });
});

describe('acceptance: the warm basin nudges the Pacific (February start, chain on)', () => {
  const tl = runIob('warm', 2, 3);
  it('the pushed La Niña fires its own links one tier down: the typhoons quiet through both arrows in August, Indonesia wet in June', () => {
    const jun = tl.months[4];
    expect(jun.links.warm_basin_la_nina?.status).toBe('applied');
    expect(jun.nodes.enso.confidence).toBe('probable');
    expect(jun.nodes.indonesia_rainfall.value).toBe(1);
    expect(jun.links.la_nina_indonesia?.depth).toBe(2);
    const aug = tl.months[6];
    expect(aug.calendarMonth).toBe(8);
    expect([...aug.nodes.west_pacific_typhoons.viaLinkIds].sort()).toEqual(['la_nina_west_pacific_typhoons', 'warm_basin_west_pacific_typhoons']);
    expect(aug.nodes.west_pacific_typhoons.value).toBe(-1);
    expect(aug.nodes.west_pacific_typhoons.conflicting).toBe(false);
  });
  it('the pushed La Niña reinforces the contested monsoon arrow rather than conflicting with it', () => {
    for (const m of tl.months) expect(m.nodes.indian_summer_monsoon.conflicting, `month ${m.index}`).toBe(false);
    expect(tl.months[5].nodes.indian_summer_monsoon.value).toBe(1);
  });
  it('the loop guard holds: the pushed La Niña does not push the basin cool', () => {
    for (const m of tl.months) expect(m.nodes.indian_ocean_basin.value, `month ${m.index}`).toBe(1);
  });
  it('under "established only" the push is a ghost and only the Yangtze is applied', () => {
    const est = propagate(graph, { driverId: 'indian_ocean_basin', phaseId: 'warm', startMonth: 2, horizonMonths: HORIZON, maxDepth: 3, minConfidence: 'established' });
    expect(est.months[4].links.warm_basin_la_nina?.status).toBe('ghost');
    expect(est.months[4].nodes.enso.value).toBe(0);
    expect(est.months[4].nodes.yangtze_summer_rainfall.value).toBe(1);
    expect(est.months[4].nodes.west_pacific_typhoons.value).toBe(0);
    expect(est.months[4].links.warm_basin_west_pacific_typhoons?.status).toBe('ghost');
  });
});

describe('acceptance: the 1998 scenario, a warm basin with the El Niño that began before', () => {
  // The plan's original design: the basin from February 1998 with El Niño
  // as a second driver from June 1997. It puts the Yangtze at full tier
  // through the chosen basin, but the map holds the El Niño through a
  // summer in which it had ended, so the shipped story leaves it out.
  const tl = runTwo(['indian_ocean_basin', 'warm'], ['enso', 'el_nino'], 2, 6, true);
  it('ENSO onset -8, the Yangtze from month 4 at full tier through the chosen basin', () => {
    expect(chosenOnset(tl.scenario, 'enso')).toBe(-8);
    expect(tl.months[4].nodes.yangtze_summer_rainfall.viaLinkIds).toEqual(['warm_basin_yangtze']);
    expect(tl.months[4].nodes.yangtze_summer_rainfall.confidence).toBe('established');
  });
  it('neither chosen driver is pushed by the other', () => {
    for (const m of tl.months) {
      expect(m.nodes.enso.value, `month ${m.index}`).toBe(1);
      expect(m.nodes.indian_ocean_basin.value, `month ${m.index}`).toBe(1);
    }
  });
  it('the held El Niño conflicts with the warm basin at the typhoons in August, the reason the shipped story omits it', () => {
    expect(tl.months[6].nodes.west_pacific_typhoons.conflicting).toBe(true);
  });
  it('the shipped story uses the basin alone from February 1998, held eight months since M32', () => {
    const s = graph.stories.find((x) => x.id === 'warm_basin_1998_yangtze')!;
    expect(s).toBeDefined();
    expect([s.driver, s.phase, s.drivers, s.start_month, s.start_year, s.hold_months]).toEqual(['indian_ocean_basin', 'warm', undefined, 2, 1998, 8]);
    expect(s.steps.map((st) => st.month)).toEqual([0, 3, 4, 5, 6, 12]);
  });
  it('with M32 the El Niño can be held twelve months from June 1997: over by May 1998, before the Yangtze arrives, and no conflict at the typhoons', () => {
    const tl = propagate(graph, { driverId: 'indian_ocean_basin', phaseId: 'warm', startMonth: 2, horizonMonths: HORIZON, maxDepth: 3, others: [{ driverId: 'enso', phaseId: 'el_nino', startMonth: 6, startsBefore: true, holdMonths: 12 }] });
    expect(chosenFade(tl.scenario, 'enso')).toBe(4);
    expect(tl.months[3].nodes.enso.value).toBe(1);
    expect(tl.months[4].nodes.enso.value).toBe(0);
    expect(tl.months[4].nodes.yangtze_summer_rainfall.viaLinkIds).toEqual(['warm_basin_yangtze']);
    expect(tl.months[6].nodes.west_pacific_typhoons.conflicting).toBe(false);
    expect(tl.months[6].links.el_nino_west_pacific_typhoons?.status).toBe('faded');
    expect(tl.months[6].nodes.west_pacific_typhoons.fadedLinkIds).toEqual(['el_nino_west_pacific_typhoons']);
  });
});


// ---------------------------------------------------------------- M21: ninth driver (Atlantic Meridional Mode)
// The mode peaks in March–May, so its scenarios start in March. Nothing on
// the map is pushed by it; ENSO and the NAO push it.
function runAmm(phaseId: string, startMonth = 3, maxDepth = 1): Timeline {
  return propagate(graph, { driverId: 'atlantic_meridional_mode', phaseId, startMonth, horizonMonths: HORIZON, maxDepth });
}

const POSITIVE_AMM: Array<[string, Value, string]> = [
  ['atlantic_hurricanes', 1, 'the hurricane season active'],
  ['northeast_brazil', -1, 'the Nordeste dry'],
  ['sahel_rainfall', 1, 'the Sahel wet'],
  ['southwest_amazon_dry_season', -1, 'the southern Amazon dry season harsher'],
  ['central_america_rainfall', 1, 'Central America wet'],
];

describe('acceptance: positive Atlantic meridional mode, March start', () => {
  const tl = runAmm('positive');
  for (const [id, sign, label] of POSITIVE_AMM) {
    it(`${label} within twelve months`, () => {
      expect(monthsWith(tl, id, sign).length, `${id} never reaches ${sign}`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, (-sign) as Value), `${id} also shows the opposite sign`).toHaveLength(0);
    });
  }
  it('the Nordeste dry from month 0 (March) through May; the hurricanes from June (month 3), pending in May; the Sahel July–September; the Amazon June–October; Central America May–July', () => {
    expect(tl.months[0].calendarMonth).toBe(3);
    expect(monthsWith(tl, 'northeast_brazil', -1)).toEqual([0, 1, 2, 11, 12]);
    expect(tl.months[3].nodes.northeast_brazil.pendingLinkIds).toEqual(['positive_amm_northeast_brazil']);
    expect(monthsWith(tl, 'atlantic_hurricanes', 1)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(tl.months[1].nodes.atlantic_hurricanes.pendingLinkIds).toHaveLength(0);
    expect(tl.months[2].nodes.atlantic_hurricanes.pendingLinkIds).toEqual(['positive_amm_atlantic_hurricanes']);
    expect(monthsWith(tl, 'sahel_rainfall', 1)).toEqual([4, 5, 6]);
    expect(monthsWith(tl, 'southwest_amazon_dry_season', -1)).toEqual([3, 4, 5, 6, 7]);
    expect(monthsWith(tl, 'central_america_rainfall', 1)).toEqual([2, 3, 4]);
  });
  it('tiers: hurricanes and the Nordeste established, the Sahel, the Amazon and Central America probable, the Amazon wet side contested', () => {
    const own = graph.links.filter((l) => l.from === 'atlantic_meridional_mode');
    expect(own).toHaveLength(9);
    const tier = (to: string) => own.filter((l) => l.to === to).map((l) => `${l.when}:${l.confidence}`).sort();
    expect(tier('atlantic_hurricanes')).toEqual(['negative:established', 'positive:established']);
    expect(tier('northeast_brazil')).toEqual(['negative:established', 'positive:established']);
    expect(tier('sahel_rainfall')).toEqual(['negative:probable', 'positive:probable']);
    expect(tier('southwest_amazon_dry_season')).toEqual(['negative:contested', 'positive:probable']);
    expect(tier('central_america_rainfall')).toEqual(['positive:probable']);
    expect(tl.months[3].nodes.atlantic_hurricanes.confidence).toBe('established');
    expect(tl.months[0].nodes.northeast_brazil.confidence).toBe('established');
    expect(tl.months[5].nodes.southwest_amazon_dry_season.confidence).toBe('probable');
  });
  it('under "established only" the Sahel, the Amazon and Central America are hollow ghosts while the hurricanes and the Nordeste still apply', () => {
    const est = propagate(graph, { driverId: 'atlantic_meridional_mode', phaseId: 'positive', startMonth: 3, horizonMonths: HORIZON, maxDepth: 1, minConfidence: 'established' });
    expect(est.months[5].nodes.sahel_rainfall.value).toBe(0);
    expect(est.months[5].links.positive_amm_sahel?.status).toBe('ghost');
    expect(est.months[5].nodes.southwest_amazon_dry_season.value).toBe(0);
    expect(est.months[5].links.positive_amm_southern_amazon?.status).toBe('ghost');
    expect(est.months[3].nodes.central_america_rainfall.value).toBe(0);
    expect(est.months[3].links.positive_amm_central_america?.status).toBe('ghost');
    expect(est.months[3].nodes.atlantic_hurricanes.value).toBe(1);
    expect(est.months[0].nodes.northeast_brazil.value).toBe(-1);
  });
  it('the mode pushes nothing: ENSO, the NAO and the AMO stay neutral even with the chain on, and the regions of the other drivers stay hollow', () => {
    const deep = runAmm('positive', 3, 3);
    for (const m of deep.months) {
      for (const id of ['enso', 'nao', 'amo', 'atlantic_nino', 'iod']) {
        expect(m.nodes[id].value, `${id} at month ${m.index}`).toBe(0);
        expect(m.nodes[id].pendingLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
      }
      for (const id of ['northern_amazon_rainfall', 'guinea_coast_rainfall', 'us_great_plains_summer', 'western_europe_summer', 'indonesia_rainfall', 'east_africa_short_rains']) {
        expect(m.nodes[id].viaLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
        expect(m.nodes[id].pendingLinkIds, `${id} at month ${m.index}`).toHaveLength(0);
      }
    }
  });
});

describe('acceptance: negative Atlantic meridional mode, March start', () => {
  const tl = runAmm('negative');
  it('reverses the hurricanes, the Nordeste, the Sahel and the Amazon, and never copies the positive sign', () => {
    for (const [id, sign] of POSITIVE_AMM.filter(([id]) => id !== 'central_america_rainfall')) {
      expect(monthsWith(tl, id, (-sign) as Value).length, `${id} should reverse the positive phase`).toBeGreaterThan(0);
      expect(monthsWith(tl, id, sign), `${id} copies the positive sign`).toHaveLength(0);
    }
    expect(tl.months[3].nodes.atlantic_hurricanes.confidence).toBe('established');
    expect(tl.months[0].nodes.northeast_brazil.confidence).toBe('established');
    expect(tl.months[5].nodes.sahel_rainfall.confidence).toBe('probable');
    expect(tl.months[5].nodes.southwest_amazon_dry_season.confidence).toBe('contested');
  });
  it('leaves Central America hollow: the literature supports the warm-north side only', () => {
    for (const m of tl.months) {
      expect(m.nodes.central_america_rainfall.viaLinkIds, `month ${m.index}`).toHaveLength(0);
      expect(m.nodes.central_america_rainfall.pendingLinkIds, `month ${m.index}`).toHaveLength(0);
    }
  });
});

describe('acceptance: El Niño pushes the mode positive the following spring (June start, chain on)', () => {
  const tl = runDeep('enso', 'el_nino', 6);
  it('the mode is pushed in March (lag 9) at depth 1, rated established, and holds to the end of the year shown', () => {
    expect(tl.months[8].nodes.atlantic_meridional_mode.value).toBe(0);
    expect(tl.months[9].calendarMonth).toBe(3);
    expect(tl.months[9].nodes.atlantic_meridional_mode.value).toBe(1);
    expect(tl.months[9].nodes.atlantic_meridional_mode.viaLinkIds).toEqual(['el_nino_positive_amm']);
    expect(tl.months[9].links.el_nino_positive_amm?.depth).toBe(1);
    expect(tl.months[9].nodes.atlantic_meridional_mode.confidence).toBe('established');
    expect(tl.months[12].nodes.atlantic_meridional_mode.value).toBe(1);
  });
  it('the Nordeste carries both arrows from March, same sign, rated by the weaker (the mode’s one tier down)', () => {
    expect(tl.months[8].nodes.northeast_brazil.viaLinkIds).toEqual(['el_nino_northeast_brazil']);
    const mar = tl.months[9];
    expect([...mar.nodes.northeast_brazil.viaLinkIds].sort()).toEqual(['el_nino_northeast_brazil', 'positive_amm_northeast_brazil']);
    expect(mar.nodes.northeast_brazil.value).toBe(-1);
    expect(mar.nodes.northeast_brazil.conflicting).toBe(false);
    expect(mar.links.positive_amm_northeast_brazil?.depth).toBe(2);
    expect(mar.links.positive_amm_northeast_brazil?.confidence).toBe('probable');
    expect(mar.nodes.northeast_brazil.confidence).toBe('probable');
  });
  it('at month 12 (June) the pushed mode says active hurricanes and the El Niño says quiet: a conflict, the compensation the literature describes', () => {
    const jun = tl.months[12];
    expect(jun.calendarMonth).toBe(6);
    expect([...jun.nodes.atlantic_hurricanes.viaLinkIds].sort()).toEqual(['el_nino_atlantic_hurricanes', 'positive_amm_atlantic_hurricanes']);
    expect(jun.nodes.atlantic_hurricanes.value).toBe(0);
    expect(jun.nodes.atlantic_hurricanes.conflicting).toBe(true);
    expect(tl.months[11].nodes.atlantic_hurricanes.pendingLinkIds).toContain('positive_amm_atlantic_hurricanes');
  });
  it('ENSO is never pushed back: the mode has no outward driver links', () => {
    for (const m of tl.months) expect(m.nodes.enso.value, `month ${m.index}`).toBe(1);
    expect(graph.links.filter((l) => l.from === 'atlantic_meridional_mode' && graph.nodes.find((n) => n.id === l.to)?.kind === 'driver')).toHaveLength(0);
  });
  it('a La Niña from June pushes the mode negative in March, rated probable', () => {
    const ln = runDeep('enso', 'la_nina', 6);
    expect(ln.months[8].nodes.atlantic_meridional_mode.value).toBe(0);
    expect(ln.months[9].nodes.atlantic_meridional_mode.value).toBe(-1);
    expect(ln.months[9].nodes.atlantic_meridional_mode.confidence).toBe('probable');
  });
});

describe('acceptance: a negative NAO winter pushes the mode positive in spring (December start, chain on)', () => {
  const tl = runDeep('nao', 'negative', 12);
  it('the mode is pushed in February (lag 2) at depth 1, rated probable', () => {
    expect(tl.months[1].nodes.atlantic_meridional_mode.value).toBe(0);
    expect(tl.months[2].calendarMonth).toBe(2);
    expect(tl.months[2].nodes.atlantic_meridional_mode.value).toBe(1);
    expect(tl.months[2].nodes.atlantic_meridional_mode.viaLinkIds).toEqual(['negative_nao_positive_amm']);
    expect(tl.months[2].nodes.atlantic_meridional_mode.confidence).toBe('probable');
  });
  it('the pushed mode dries the Nordeste February–May and fires the hurricanes from June, one tier down, with the Sahel contested in July', () => {
    expect(monthsWith(tl, 'northeast_brazil', -1)).toEqual([2, 3, 4, 5]);
    expect(tl.months[2].links.positive_amm_northeast_brazil?.depth).toBe(2);
    expect(tl.months[2].nodes.northeast_brazil.confidence).toBe('probable');
    expect(monthsWith(tl, 'atlantic_hurricanes', 1)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(tl.months[6].nodes.atlantic_hurricanes.confidence).toBe('probable');
    expect(monthsWith(tl, 'sahel_rainfall', 1)).toEqual([7, 8, 9]);
    expect(tl.months[7].nodes.sahel_rainfall.confidence).toBe('contested');
  });
  it('a positive NAO pushes the mode negative; under "established only" the push is a ghost and the mode stays neutral', () => {
    const pos = runDeep('nao', 'positive', 12);
    expect(pos.months[2].nodes.atlantic_meridional_mode.value).toBe(-1);
    const est = propagate(graph, { driverId: 'nao', phaseId: 'negative', startMonth: 12, horizonMonths: HORIZON, maxDepth: 3, minConfidence: 'established' });
    expect(est.months[2].links.negative_nao_positive_amm?.status).toBe('ghost');
    for (const m of est.months) expect(m.nodes.atlantic_meridional_mode.value, `month ${m.index}`).toBe(0);
  });
});

describe('acceptance: the 2005 story, the mode alone from March', () => {
  const s = graph.stories.find((x) => x.id === 'positive_amm_2005_amazon')!;
  it('ships with the mode positive from March 2005, no second driver, six steps', () => {
    expect(s).toBeDefined();
    expect([s.driver, s.phase, s.drivers, s.start_month, s.start_year]).toEqual(['atlantic_meridional_mode', 'positive', undefined, 3, 2005]);
    expect(s.steps.map((st) => st.month)).toEqual([0, 1, 3, 6, 7, 12]);
  });
  it('shows the hurricanes arrow at full tier from June with ENSO hollow all year', () => {
    const tl = propagate(graph, { driverId: s.driver, phaseId: s.phase, startMonth: s.start_month, horizonMonths: HORIZON, maxDepth: 3 });
    expect(tl.months[3].nodes.atlantic_hurricanes.viaLinkIds).toEqual(['positive_amm_atlantic_hurricanes']);
    expect(tl.months[3].nodes.atlantic_hurricanes.confidence).toBe('established');
    expect(tl.months[3].links.positive_amm_atlantic_hurricanes?.depth).toBe(1);
    for (const m of tl.months) {
      expect(m.nodes.enso.value, `month ${m.index}`).toBe(0);
      expect(m.nodes.enso.viaLinkIds, `month ${m.index}`).toHaveLength(0);
      expect(m.nodes.enso.pendingLinkIds, `month ${m.index}`).toHaveLength(0);
    }
    expect(tl.months[6].nodes.southwest_amazon_dry_season.value).toBe(-1);
    expect(tl.months[7].nodes.southwest_amazon_dry_season.value).toBe(-1);
  });
});


// ---------------------------------------------------------------- M22: tenth driver (Pacific Meridional Mode)
// The mode peaks in March–May, so its scenarios start in March. Its main
// work is to push ENSO; nothing on the map pushes it.
function runPmm(phaseId: string, startMonth = 3, maxDepth = 1): Timeline {
  return propagate(graph, { driverId: 'pacific_meridional_mode', phaseId, startMonth, horizonMonths: HORIZON, maxDepth });
}

describe('acceptance: positive Pacific meridional mode, March start', () => {
  const tl = runPmm('positive');
  it('the typhoons active and the eastern Pacific hurricanes busier June–November (months 3–8), pending in May, never the opposite sign', () => {
    expect(tl.months[0].calendarMonth).toBe(3);
    for (const id of ['west_pacific_typhoons', 'east_pacific_hurricanes']) {
      expect(monthsWith(tl, id, 1), id).toEqual([3, 4, 5, 6, 7, 8]);
      expect(monthsWith(tl, id, -1), id).toHaveLength(0);
      expect(tl.months[1].nodes[id].pendingLinkIds, `${id} April`).toHaveLength(0);
      expect(tl.months[2].nodes[id].pendingLinkIds, `${id} May`).toHaveLength(1);
      expect(tl.months[9].nodes[id].pendingLinkIds, `${id} December`).toHaveLength(1);
    }
  });
  it('tiers: the typhoons probable / contested, the hurricanes contested and positive only, ENSO probable / contested; no link into the mode and none to Hawaii', () => {
    const own = graph.links.filter((l) => l.from === 'pacific_meridional_mode');
    expect(own).toHaveLength(5);
    const tier = (to: string) => own.filter((l) => l.to === to).map((l) => `${l.when}:${l.confidence}`).sort();
    expect(tier('west_pacific_typhoons')).toEqual(['negative:contested', 'positive:probable']);
    expect(tier('east_pacific_hurricanes')).toEqual(['positive:contested']);
    expect(tier('enso')).toEqual(['negative:contested', 'positive:probable']);
    expect(tier('hawaii_winter_rainfall')).toEqual([]);
    expect(graph.links.filter((l) => l.to === 'pacific_meridional_mode')).toHaveLength(0);
    expect(own.every((l) => l.confidence !== 'established')).toBe(true);
    expect(tl.months[3].nodes.west_pacific_typhoons.confidence).toBe('probable');
    expect(tl.months[3].nodes.east_pacific_hurricanes.confidence).toBe('contested');
  });
  it('ENSO is pushed toward El Niño in September (lag 6), pending in August, and holds to the end of the year shown', () => {
    expect(tl.months[5].nodes.enso.value).toBe(0);
    expect(tl.months[5].nodes.enso.pendingLinkIds).toHaveLength(0);
    expect(tl.months[6].calendarMonth).toBe(9);
    expect(tl.months[6].nodes.enso.value).toBe(1);
    expect(tl.months[6].nodes.enso.viaLinkIds).toEqual(['positive_pmm_el_nino']);
    expect(tl.months[6].nodes.enso.confidence).toBe('probable');
    expect(tl.months[6].links.positive_pmm_el_nino?.depth).toBe(1);
    expect(tl.months[12].nodes.enso.value).toBe(1);
  });
  it('under "established only" every arrow of this driver is a ghost and nothing on the map is applied', () => {
    const est = propagate(graph, { driverId: 'pacific_meridional_mode', phaseId: 'positive', startMonth: 3, horizonMonths: HORIZON, maxDepth: 3, minConfidence: 'established' });
    for (const m of est.months) {
      for (const st of Object.values(m.nodes)) expect(st.viaLinkIds, `month ${m.index}`).toHaveLength(0);
      for (const [id, l] of Object.entries(m.links)) expect(l.status, `${id} at month ${m.index}`).toBe('ghost');
    }
    expect(est.months[3].links.positive_pmm_west_pacific_typhoons?.status).toBe('ghost');
    expect(est.months[6].links.positive_pmm_el_nino?.status).toBe('ghost');
    expect(est.months[6].nodes.enso.value).toBe(0);
  });
});

describe('acceptance: the positive mode pushes El Niño and its map follows one tier down (March start, chain on)', () => {
  const tl = runPmm('positive', 3, 3);
  const direct = runPmm('positive', 3, 1);
  it('Indonesia and eastern Australia dry from September (months 6–9) through the pushed El Niño, hollow under direct links; eastern Australia rated probable', () => {
    expect(monthsWith(tl, 'indonesia_rainfall', -1)).toEqual([6, 7, 8, 9]);
    expect(monthsWith(tl, 'east_australia_rainfall', -1).slice(0, 4)).toEqual([6, 7, 8, 9]);
    for (const id of ['indonesia_rainfall', 'east_australia_rainfall']) {
      for (const m of tl.months.slice(0, 6)) expect(m.nodes[id].viaLinkIds, `${id} month ${m.index}`).toHaveLength(0);
      for (const dm of direct.months) expect(dm.nodes[id].viaLinkIds, `${id} direct month ${dm.index}`).toHaveLength(0);
    }
    expect(tl.months[6].nodes.east_australia_rainfall.viaLinkIds).toEqual(['el_nino_east_australia']);
    expect(tl.months[6].nodes.east_australia_rainfall.confidence).toBe('probable');
    expect(tl.months[6].links.el_nino_indonesia).toEqual({ status: 'applied', confidence: 'probable', depth: 2 });
  });
  it('the third hop: the pushed El Niño pushes the dipole (depth 2, contested), whose arrow also lands on Indonesia at depth 3, so Indonesia is rated contested', () => {
    const sep = tl.months[6];
    expect(sep.nodes.iod.value).toBe(1);
    expect(sep.links.el_nino_positive_iod).toEqual({ status: 'applied', confidence: 'contested', depth: 2 });
    expect([...sep.nodes.indonesia_rainfall.viaLinkIds].sort()).toEqual(['el_nino_indonesia', 'positive_iod_indonesia']);
    expect(sep.links.positive_iod_indonesia).toEqual({ status: 'applied', confidence: 'contested', depth: 3 });
    expect(sep.nodes.indonesia_rainfall.confidence).toBe('contested');
    expect(sep.nodes.indonesia_rainfall.conflicting).toBe(false);
  });
  it('the Gulf Coast and Peru wet from January (month 10), Hawaii dry from February (month 11) rated contested: El Niño’s winter one tier down', () => {
    expect(tl.months[10].calendarMonth).toBe(1);
    expect(monthsWith(tl, 'us_gulf_coast_winter', 1)).toEqual([10, 11, 12]);
    expect(monthsWith(tl, 'peru_coast_rainfall', 1)).toEqual([10, 11, 12]);
    expect(monthsWith(tl, 'hawaii_winter_rainfall', -1)).toEqual([11, 12]);
    expect(tl.months[11].nodes.hawaii_winter_rainfall.confidence).toBe('contested');
    expect(tl.months[11].nodes.hawaii_winter_rainfall.viaLinkIds).toEqual(['el_nino_hawaii']);
  });
  it('the typhoons and the eastern Pacific hurricanes carry both arrows the same way from September, no conflict', () => {
    const sep = tl.months[6];
    expect([...sep.nodes.west_pacific_typhoons.viaLinkIds].sort()).toEqual(['el_nino_west_pacific_typhoons', 'positive_pmm_west_pacific_typhoons']);
    expect(sep.nodes.west_pacific_typhoons.value).toBe(1);
    expect(sep.nodes.west_pacific_typhoons.conflicting).toBe(false);
    expect([...sep.nodes.east_pacific_hurricanes.viaLinkIds].sort()).toEqual(['el_nino_east_pacific_hurricanes', 'positive_pmm_east_pacific_hurricanes']);
    expect(sep.nodes.east_pacific_hurricanes.value).toBe(1);
    expect(sep.nodes.east_pacific_hurricanes.conflicting).toBe(false);
    expect(tl.months[3].nodes.west_pacific_typhoons.viaLinkIds).toEqual(['positive_pmm_west_pacific_typhoons']);
  });
  it('the mode is never pushed back: it has no links in and holds its phase all year', () => {
    for (const m of tl.months) {
      expect(m.nodes.pacific_meridional_mode.value, `month ${m.index}`).toBe(1);
      expect(m.nodes.pacific_meridional_mode.viaLinkIds, `month ${m.index}`).toHaveLength(0);
    }
  });
});

describe('acceptance: negative Pacific meridional mode, March start, chain on', () => {
  const tl = runPmm('negative', 3, 3);
  it('the typhoons quiet June–November rated contested; the eastern Pacific hurricanes hollow (positive link only)', () => {
    expect(monthsWith(tl, 'west_pacific_typhoons', -1)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(tl.months[3].nodes.west_pacific_typhoons.confidence).toBe('contested');
    for (const m of tl.months.slice(0, 6)) {
      expect(m.nodes.east_pacific_hurricanes.viaLinkIds, `month ${m.index}`).toHaveLength(0);
      expect(m.nodes.east_pacific_hurricanes.pendingLinkIds, `month ${m.index}`).toHaveLength(0);
    }
  });
  it('ENSO is pushed toward La Niña in September rated contested, and the pushed La Niña’s map follows at the floor tier: Indonesia wet, the typhoons quiet through both arrows', () => {
    expect(tl.months[5].nodes.enso.value).toBe(0);
    expect(tl.months[6].nodes.enso.value).toBe(-1);
    expect(tl.months[6].nodes.enso.viaLinkIds).toEqual(['negative_pmm_la_nina']);
    expect(tl.months[6].nodes.enso.confidence).toBe('contested');
    expect(monthsWith(tl, 'indonesia_rainfall', 1)).toEqual([6, 7, 8, 9]);
    expect(tl.months[6].links.la_nina_indonesia).toEqual({ status: 'applied', confidence: 'contested', depth: 2 });
    const sep = tl.months[6];
    expect([...sep.nodes.west_pacific_typhoons.viaLinkIds].sort()).toEqual(['la_nina_west_pacific_typhoons', 'negative_pmm_west_pacific_typhoons']);
    expect(sep.nodes.west_pacific_typhoons.value).toBe(-1);
    expect(sep.nodes.west_pacific_typhoons.conflicting).toBe(false);
  });
});

describe('acceptance: the 2014–15 story, the mode alone from March with the chain on', () => {
  const s = graph.stories.find((x) => x.id === 'positive_pmm_2014_15')!;
  it('ships with the mode positive from March 2014, no second driver, five steps', () => {
    expect(s).toBeDefined();
    expect([s.driver, s.phase, s.drivers, s.start_month, s.start_year]).toEqual(['pacific_meridional_mode', 'positive', undefined, 3, 2014]);
    expect(s.steps.map((st) => st.month)).toEqual([0, 3, 6, 9, 12]);
    expect(s.steps.map((st) => st.focus)).toEqual(['pacific_meridional_mode', 'west_pacific_typhoons', 'enso', 'enso', 'enso']);
  });
  it('at the story’s steps the typhoon arrow is applied in June at full tier and ENSO is pushed from September, still pushed in March 2015', () => {
    const tl = propagate(graph, { driverId: s.driver, phaseId: s.phase, startMonth: s.start_month, horizonMonths: HORIZON, maxDepth: 3 });
    expect(tl.months[3].nodes.west_pacific_typhoons.viaLinkIds).toEqual(['positive_pmm_west_pacific_typhoons']);
    expect(tl.months[3].links.positive_pmm_west_pacific_typhoons?.depth).toBe(1);
    expect(tl.months[3].nodes.enso.value).toBe(0);
    expect(tl.months[6].nodes.enso.value).toBe(1);
    expect(tl.months[9].nodes.enso.value).toBe(1);
    expect(tl.months[9].nodes.indonesia_rainfall.value).toBe(-1);
    expect(tl.months[12].calendarMonth).toBe(3);
    expect(tl.months[12].nodes.enso.value).toBe(1);
  });
});



// ---------------------------------------------------------------- M26: eleventh driver (a large tropical volcanic eruption)
// An event, not a swing: one active phase (eruption) and a quiet one. The
// map holds it on for the whole year shown. Nothing pushes it.
function runVol(phaseId: string, startMonth = 6, maxDepth = 1): Timeline {
  return propagate(graph, { driverId: 'tropical_eruption', phaseId, startMonth, horizonMonths: HORIZON, maxDepth });
}

describe('acceptance: a tropical eruption from June, direct links only', () => {
  const tl = runVol('eruption');
  it('the driver has two phases, eruption (−1) and neutral (0), and every link leaves from the eruption; nothing points into it', () => {
    const d = graph.nodes.find((n) => n.id === 'tropical_eruption')!;
    expect(d.kind).toBe('driver');
    if (d.kind !== 'driver') return;
    expect(d.phases.map((p) => [p.id, p.value])).toEqual([['eruption', -1], ['neutral', 0]]);
    expect(d.default_start_month).toBe(6);
    const own = graph.links.filter((l) => l.from === 'tropical_eruption');
    expect(own).toHaveLength(7);
    expect(own.every((l) => l.when === 'eruption')).toBe(true);
    expect(graph.links.filter((l) => l.to === 'tropical_eruption')).toHaveLength(0);
    const tier = (to: string) => own.filter((l) => l.to === to).map((l) => l.confidence);
    expect(tier('global_mean_temperature')).toEqual(['established']);
    expect(tier('sahel_rainfall')).toEqual(['probable']);
    expect(tier('indian_summer_monsoon')).toEqual(['probable']);
    expect(tier('northern_europe_winter')).toEqual(['probable']);
    expect(tier('western_russia_winter')).toEqual(['probable']);
    expect(tier('nao')).toEqual(['probable']);
    expect(tier('enso')).toEqual(['contested']);
  });
  it('the world cools from September (lag 3) to the end of the year shown, rated established, nothing before', () => {
    expect(tl.months[0].calendarMonth).toBe(6);
    expect(monthsWith(tl, 'global_mean_temperature', -1)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(tl.months[2].nodes.global_mean_temperature.pendingLinkIds).toHaveLength(0);
    expect(tl.months[3].nodes.global_mean_temperature.confidence).toBe('established');
    expect(tl.months[3].links.eruption_global_cooling).toEqual({ status: 'applied', confidence: 'established', depth: 1 });
  });
  it('northern Europe and western Russia mild in the first winter only (December–February, months 6–8), pending from August and again from March', () => {
    for (const id of ['northern_europe_winter', 'western_russia_winter']) {
      expect(monthsWith(tl, id, 1), id).toEqual([6, 7, 8]);
      expect(monthsWith(tl, id, -1), id).toHaveLength(0);
      expect(tl.months[1].nodes[id].pendingLinkIds, `${id} July`).toHaveLength(0);
      expect(tl.months[2].nodes[id].pendingLinkIds, `${id} August`).toHaveLength(1);
      expect(tl.months[9].nodes[id].pendingLinkIds, `${id} March`).toHaveLength(1);
      expect(tl.months[6].nodes[id].confidence, id).toBe('probable');
    }
  });
  it('the Indian monsoon weaker at month 12 (the next June) only; the Sahel waits all year because its rains come in July, past the year shown', () => {
    expect(monthsWith(tl, 'indian_summer_monsoon', -1)).toEqual([12]);
    expect(tl.months[3].nodes.indian_summer_monsoon.pendingLinkIds).toHaveLength(0);
    expect(tl.months[4].nodes.indian_summer_monsoon.pendingLinkIds).toEqual(['eruption_indian_monsoon']);
    expect(tl.months[12].nodes.indian_summer_monsoon.confidence).toBe('probable');
    expect(monthsWith(tl, 'sahel_rainfall', -1)).toHaveLength(0);
    for (const m of tl.months.slice(4)) expect(m.nodes.sahel_rainfall.pendingLinkIds, `Sahel month ${m.index}`).toEqual(['eruption_sahel']);
    // An eruption in March reaches the Sahel's rains in July (month 4).
    expect(monthsWith(runVol('eruption', 3), 'sahel_rainfall', -1)).toEqual([4, 5, 6]);
  });
  it('the NAO is pushed positive December–March (months 6–9) rated probable, and ENSO toward El Niño from December rated contested; a December eruption still reaches February', () => {
    expect(monthsWith(tl, 'nao', 1)).toEqual([6, 7, 8, 9]);
    expect(tl.months[6].nodes.nao.viaLinkIds).toEqual(['eruption_positive_nao']);
    expect(tl.months[6].nodes.nao.confidence).toBe('probable');
    expect(tl.months[5].nodes.enso.value).toBe(0);
    expect(monthsWith(tl, 'enso', 1)).toEqual([6, 7, 8, 9, 10, 11, 12]);
    expect(tl.months[6].nodes.enso.viaLinkIds).toEqual(['eruption_el_nino']);
    expect(tl.months[6].nodes.enso.confidence).toBe('contested');
    const dec = runVol('eruption', 12);
    expect(monthsWith(dec, 'northern_europe_winter', 1)).toEqual([2, 12]);
    expect(monthsWith(dec, 'nao', 1)).toEqual([2, 3, 12]);
  });
  it('the neutral phase (no eruption) has no links and touches nothing', () => {
    const none = runVol('neutral', 6, 3);
    for (const m of none.months) {
      expect(Object.keys(m.links), `month ${m.index}`).toHaveLength(0);
      for (const st of Object.values(m.nodes)) { expect(st.viaLinkIds).toHaveLength(0); expect(st.pendingLinkIds).toHaveLength(0); }
    }
  });
  it('under "established only" the cooling is the one arrow that applies; every other arrow of this driver is a ghost and no driver is pushed', () => {
    const est = propagate(graph, { driverId: 'tropical_eruption', phaseId: 'eruption', startMonth: 6, horizonMonths: HORIZON, maxDepth: 3, minConfidence: 'established' });
    expect(monthsWith(est, 'global_mean_temperature', -1)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const m of est.months) {
      for (const [id, l] of Object.entries(m.links)) {
        if (id === 'eruption_global_cooling') continue;
        expect(l.status, `${id} at month ${m.index}`).toBe('ghost');
      }
      expect(m.nodes.nao.value, `NAO month ${m.index}`).toBe(0);
      expect(m.nodes.enso.value, `ENSO month ${m.index}`).toBe(0);
      expect(m.nodes.northern_europe_winter.viaLinkIds, `N Europe month ${m.index}`).toHaveLength(0);
    }
  });
});

describe('acceptance: a tropical eruption from June with the chain on', () => {
  const tl = runVol('eruption', 6, 3);
  it('December: the NAO is pushed positive at depth 1 and its winter map follows one tier down; northern Europe carries both arrows the same way without conflict', () => {
    const dec = tl.months[6];
    expect(dec.calendarMonth).toBe(12);
    expect(dec.links.eruption_positive_nao).toEqual({ status: 'applied', confidence: 'probable', depth: 1 });
    expect([...dec.nodes.northern_europe_winter.viaLinkIds].sort()).toEqual(['eruption_northern_europe_winter', 'positive_nao_northern_europe']);
    expect(dec.nodes.northern_europe_winter.value).toBe(1);
    expect(dec.nodes.northern_europe_winter.conflicting).toBe(false);
    expect(dec.links.positive_nao_northern_europe).toEqual({ status: 'applied', confidence: 'probable', depth: 2 });
    expect(dec.nodes.mediterranean_winter_rainfall.value).toBe(-1);
    expect(dec.nodes.mediterranean_winter_rainfall.viaLinkIds).toEqual(['positive_nao_mediterranean']);
    // The pushed NAO pushes the Atlantic meridional mode negative from February (lag 2), a third hop.
    expect(tl.months[8].nodes.atlantic_meridional_mode.value).toBe(-1);
    expect(tl.months[8].links.positive_nao_negative_amm?.depth).toBe(2);
  });
  it('December: ENSO is pushed toward El Niño rated contested, and El Niño’s map follows at the floor tier (Indonesia dry through the pushed El Niño)', () => {
    const dec = tl.months[6];
    expect(dec.links.eruption_el_nino).toEqual({ status: 'applied', confidence: 'contested', depth: 1 });
    expect(dec.nodes.enso.value).toBe(1);
    expect(dec.nodes.indonesia_rainfall.value).toBe(-1);
    expect(dec.nodes.indonesia_rainfall.viaLinkIds).toEqual(['el_nino_indonesia']);
    expect(dec.links.el_nino_indonesia).toEqual({ status: 'applied', confidence: 'contested', depth: 2 });
  });
  it('from March the pushed El Niño’s warming arrow reaches the global temperature and disagrees with the volcano’s cooling: value 0, flagged as conflicting (the map cannot weigh them)', () => {
    expect(monthsWith(tl, 'global_mean_temperature', -1)).toEqual([3, 4, 5, 6, 7, 8]);
    for (const m of tl.months.slice(9)) {
      const g = m.nodes.global_mean_temperature;
      expect(g.value, `month ${m.index}`).toBe(0);
      expect(g.conflicting, `month ${m.index}`).toBe(true);
      expect([...g.viaLinkIds].sort(), `month ${m.index}`).toEqual(['el_nino_global_temperature', 'eruption_global_cooling']);
    }
    expect(tl.months[8].nodes.global_mean_temperature.conflicting).toBe(false);
  });
  it('the eruption is never pushed: no links in, its phase held all year', () => {
    for (const m of tl.months) {
      expect(m.nodes.tropical_eruption.value, `month ${m.index}`).toBe(-1);
      expect(m.nodes.tropical_eruption.viaLinkIds, `month ${m.index}`).toHaveLength(0);
    }
  });
});

describe('acceptance: the 1991 Pinatubo story, the eruption from June with El Niño chosen from September', () => {
  const s = graph.stories.find((x) => x.id === 'pinatubo_1991')!;
  it('ships with the eruption from June 1991, El Niño as a second driver from September, five steps', () => {
    expect(s).toBeDefined();
    expect([s.driver, s.phase, s.drivers, s.start_month, s.start_year])
      .toEqual(['tropical_eruption', 'eruption', [{ driver: 'enso', phase: 'el_nino', start_month: 9 }], 6, 1991]);
    expect(s.steps.map((st) => st.month)).toEqual([0, 3, 6, 9, 12]);
    expect(s.steps.map((st) => st.focus)).toEqual(['tropical_eruption', 'global_mean_temperature', 'northern_europe_winter', 'enso', 'indian_summer_monsoon']);
  });
  it('at the story’s steps: cooling in September from the volcano alone, the two drivers disagreeing about the global temperature from December, northern Europe mild in December, no arrow from the volcano into the chosen El Niño, the monsoon weaker in June through both arrows', () => {
    const tl = propagate(graph, {
      driverId: s.driver, phaseId: s.phase, startMonth: s.start_month, horizonMonths: HORIZON, maxDepth: 3,
      others: [{ driverId: s.drivers![0].driver, phaseId: s.drivers![0].phase, startMonth: s.drivers![0].start_month }],
    });
    expect(tl.months[2].nodes.enso.value).toBe(0);
    expect(tl.months[3].nodes.enso.value).toBe(1);
    expect(tl.months[3].nodes.global_mean_temperature.value).toBe(-1);
    expect(tl.months[3].nodes.global_mean_temperature.viaLinkIds).toEqual(['eruption_global_cooling']);
    expect(tl.months[6].nodes.global_mean_temperature.value).toBe(0);
    expect(tl.months[6].nodes.global_mean_temperature.conflicting).toBe(true);
    expect(tl.months[6].nodes.northern_europe_winter.value).toBe(1);
    expect(tl.months[6].nodes.northern_europe_winter.viaLinkIds).toContain('eruption_northern_europe_winter');
    expect(tl.months[6].nodes.nao.value).toBe(1);
    // March: El Niño's own push on the NAO (negative, lag 6 from September) meets the volcano's (positive): they cancel.
    expect(tl.months[9].nodes.nao.value).toBe(0);
    expect(tl.months[9].nodes.nao.conflicting).toBe(true);
    for (const m of tl.months) expect(m.links.eruption_el_nino, `month ${m.index}`).toBeUndefined();
    expect(tl.months[12].calendarMonth).toBe(6);
    // June, chain on: the volcano and the El Niño say weaker, the El Niño's pushed
    // positive dipole and warm basin say stronger, and the map cannot weigh them.
    expect(tl.months[12].nodes.indian_summer_monsoon.value).toBe(0);
    expect(tl.months[12].nodes.indian_summer_monsoon.conflicting).toBe(true);
    expect([...tl.months[12].nodes.indian_summer_monsoon.viaLinkIds].sort()).toEqual(['el_nino_indian_monsoon', 'eruption_indian_monsoon', 'positive_iod_indian_monsoon', 'warm_basin_indian_monsoon']);
    expect(tl.months[12].nodes.sahel_rainfall.value).toBe(0);
    expect(tl.months[12].nodes.sahel_rainfall.pendingLinkIds).toContain('eruption_sahel');
    // Chain off: both chosen drivers say weaker and nothing argues.
    const direct = propagate(graph, {
      driverId: s.driver, phaseId: s.phase, startMonth: s.start_month, horizonMonths: HORIZON, maxDepth: 1,
      others: [{ driverId: s.drivers![0].driver, phaseId: s.drivers![0].phase, startMonth: s.drivers![0].start_month }],
    });
    expect(direct.months[12].nodes.indian_summer_monsoon.value).toBe(-1);
    expect(direct.months[12].nodes.indian_summer_monsoon.conflicting).toBe(false);
    expect([...direct.months[12].nodes.indian_summer_monsoon.viaLinkIds].sort()).toEqual(['el_nino_indian_monsoon', 'eruption_indian_monsoon']);
  });
});

describe('acceptance: outcome regions, third batch (M27), data only', () => {
  const NEW = ['central_asia_winter', 'us_midwest_summer', 'hudson_bay_winter', 'india_premonsoon_heat', 'tibet_winter_snow'];
  it('ships five new outcome nodes with thirteen cited, caveated links into them and no new driver', () => {
    for (const id of NEW) {
      const n = graph.nodes.find((x) => x.id === id)!;
      expect(n, id).toBeDefined();
      expect(n.kind).toBe('outcome');
      const into = graph.links.filter((l) => l.to === id);
      expect(into.length, id).toBeGreaterThan(0);
      for (const l of into) {
        expect(l.sources.length, l.id).toBeGreaterThan(0);
        expect(l.caveat.trim().length, l.id).toBeGreaterThan(20);
      }
    }
    expect(graph.links.filter((l) => NEW.includes(l.to))).toHaveLength(13);
    expect(graph.nodes.filter((n) => n.kind === 'outcome')).toHaveLength(62);   // 61 + central Siberia (M24)
    expect(graph.nodes.filter((n) => n.kind === 'driver')).toHaveLength(14);
  });
  it('El Niño from June, direct links: Central Asia wet November–April, the Midwest wet in the summer the event is in and again from the next May, northeastern Canada mild and Tibet snowy through the winter, India hot in the following spring', () => {
    const tl = run('el_nino');
    expect(monthsWith(tl, 'central_asia_winter', 1)).toEqual([5, 6, 7, 8, 9, 10]);
    expect(monthsWith(tl, 'us_midwest_summer', 1)).toEqual([0, 1, 2, 11, 12]);
    expect(monthsWith(tl, 'hudson_bay_winter', 1)).toEqual([6, 7, 8, 9]);
    expect(monthsWith(tl, 'tibet_winter_snow', 1)).toEqual([5, 6, 7, 8, 9]);
    expect(monthsWith(tl, 'india_premonsoon_heat', 1)).toEqual([9, 10, 11]);
    for (const id of NEW) expect(monthsWith(tl, id, -1), `${id} also shows the opposite sign`).toHaveLength(0);
    expect(tl.months[6].nodes.central_asia_winter.confidence).toBe('probable');
    expect(tl.months[0].nodes.us_midwest_summer.confidence).toBe('contested');
    expect(tl.months[6].nodes.hudson_bay_winter.confidence).toBe('contested');
    expect(tl.months[6].nodes.tibet_winter_snow.confidence).toBe('contested');
    expect(tl.months[9].nodes.india_premonsoon_heat.confidence).toBe('contested');
    // India's heat is out of season and pending until March.
    expect(tl.months[8].nodes.india_premonsoon_heat.value).toBe(0);
    expect(tl.months[8].nodes.india_premonsoon_heat.pendingLinkIds).toContain('el_nino_india_heat');
  });
  it('La Niña reverses all but Tibet, which has no La Niña link and stays untouched (no faked symmetry)', () => {
    const tl = run('la_nina');
    expect(monthsWith(tl, 'central_asia_winter', -1)).toEqual([5, 6, 7, 8, 9, 10]);
    expect(monthsWith(tl, 'us_midwest_summer', -1)).toEqual([0, 1, 2, 11, 12]);
    expect(tl.months[0].nodes.us_midwest_summer.confidence).toBe('probable');
    expect(monthsWith(tl, 'hudson_bay_winter', -1)).toEqual([6, 7, 8, 9]);
    expect(monthsWith(tl, 'india_premonsoon_heat', -1)).toEqual([9, 10, 11]);
    for (const id of NEW) expect(monthsWith(tl, id, 1), `${id} copies the El Niño sign`).toHaveLength(0);
    for (const m of tl.months) {
      expect(m.nodes.tibet_winter_snow.value, `Tibet at month ${m.index}`).toBe(0);
      expect(m.nodes.tibet_winter_snow.viaLinkIds).toHaveLength(0);
      expect(m.nodes.tibet_winter_snow.pendingLinkIds).toHaveLength(0);
    }
  });
  it('the NAO sets northeastern Canada with no lag, December–March, established: positive cold, negative mild', () => {
    const pos = propagate(graph, { driverId: 'nao', phaseId: 'positive', startMonth: 12, horizonMonths: HORIZON });
    expect(monthsWith(pos, 'hudson_bay_winter', -1)).toEqual([0, 1, 2, 3, 12]);
    expect(pos.months[0].nodes.hudson_bay_winter.confidence).toBe('established');
    const neg = propagate(graph, { driverId: 'nao', phaseId: 'negative', startMonth: 12, horizonMonths: HORIZON });
    expect(monthsWith(neg, 'hudson_bay_winter', 1)).toEqual([0, 1, 2, 3, 12]);
    expect(neg.months[0].nodes.hudson_bay_winter.confidence).toBe('established');
  });
  it('the positive dipole from June adds early-winter snow to Tibet in November–January; a warm basin from February heats India in March–May, both contested', () => {
    const iod = propagate(graph, { driverId: 'iod', phaseId: 'positive', startMonth: 6, horizonMonths: HORIZON });
    expect(monthsWith(iod, 'tibet_winter_snow', 1)).toEqual([5, 6, 7]);
    expect(iod.months[5].nodes.tibet_winter_snow.confidence).toBe('contested');
    const basin = propagate(graph, { driverId: 'indian_ocean_basin', phaseId: 'warm', startMonth: 2, horizonMonths: HORIZON });
    expect(basin.months[1].calendarMonth).toBe(3);
    expect(monthsWith(basin, 'india_premonsoon_heat', 1)).toEqual([1, 2, 3]);
    expect(basin.months[1].nodes.india_premonsoon_heat.confidence).toBe('contested');
  });
  it('with the chain on, El Niño reaches Tibet twice in November (its own link and the pushed positive dipole), northeastern Canada twice in January (its own link and the pushed negative NAO) and India twice in March (its own link and the pushed warm basin), always the same way, never conflicting', () => {
    const tl = propagate(graph, { driverId: 'enso', phaseId: 'el_nino', startMonth: 6, horizonMonths: HORIZON, maxDepth: 3 });
    expect(tl.months[5].calendarMonth).toBe(11);
    expect([...tl.months[5].nodes.tibet_winter_snow.viaLinkIds].sort()).toEqual(['el_nino_tibet_snow', 'positive_iod_tibet_snow']);
    expect(tl.months[5].nodes.tibet_winter_snow.value).toBe(1);
    expect(tl.months[5].nodes.tibet_winter_snow.conflicting).toBe(false);
    expect(tl.months[7].calendarMonth).toBe(1);
    expect([...tl.months[7].nodes.hudson_bay_winter.viaLinkIds].sort()).toEqual(['el_nino_hudson_bay', 'negative_nao_hudson_bay']);
    expect(tl.months[7].nodes.hudson_bay_winter.value).toBe(1);
    expect(tl.months[7].nodes.hudson_bay_winter.conflicting).toBe(false);
    expect(tl.months[9].calendarMonth).toBe(3);
    expect([...tl.months[9].nodes.india_premonsoon_heat.viaLinkIds].sort()).toEqual(['el_nino_india_heat', 'warm_basin_india_heat']);
    expect(tl.months[9].nodes.india_premonsoon_heat.value).toBe(1);
    expect(tl.months[9].nodes.india_premonsoon_heat.conflicting).toBe(false);
    for (const m of tl.months) for (const id of NEW) expect(m.nodes[id].conflicting, `${id} at month ${m.index}`).toBe(false);
  });
  it('under "established only" the new El Niño links are ghosts: nothing reaches the five regions from El Niño; the NAO still reaches northeastern Canada', () => {
    const est = propagate(graph, { driverId: 'enso', phaseId: 'el_nino', startMonth: 6, horizonMonths: HORIZON, maxDepth: 3, minConfidence: 'established' });
    for (const m of est.months) for (const id of NEW) expect(m.nodes[id].value, `${id} at month ${m.index}`).toBe(0);
    expect(est.months[6].links.el_nino_central_asia.status).toBe('ghost');
    const nao = propagate(graph, { driverId: 'nao', phaseId: 'positive', startMonth: 12, horizonMonths: HORIZON, minConfidence: 'established' });
    expect(nao.months[1].nodes.hudson_bay_winter.value).toBe(-1);
  });
});



// ---------------------------------------------------------------- M23: twelfth driver (the Quasi-Biennial Oscillation)
// A band of wind in the equatorial stratosphere with a westerly and an easterly
// phase. The map draws its pushes on the NAO (the Holton–Tan effect) and one
// link that stopped working (Atlantic hurricanes). Nothing pushes it.
function runQbo(phaseId: string, startMonth = 11, maxDepth = 1): Timeline {
  return propagate(graph, { driverId: 'qbo', phaseId, startMonth, horizonMonths: HORIZON, maxDepth });
}

describe('acceptance: the QBO from November, direct links only', () => {
  const east = runQbo('easterly');
  const west = runQbo('westerly');
  it('the driver has three phases (westerly +1, neutral 0, easterly −1), defaults to November, no area, four links out and none in', () => {
    const d = graph.nodes.find((n) => n.id === 'qbo')!;
    expect(d.kind).toBe('driver');
    if (d.kind !== 'driver') return;
    expect(d.phases.map((p) => [p.id, p.value])).toEqual([['westerly', 1], ['neutral', 0], ['easterly', -1]]);
    expect(d.default_start_month).toBe(11);
    expect(d.area).toBeUndefined();
    const own = graph.links.filter((l) => l.from === 'qbo');
    expect(own.map((l) => [l.when, l.to, l.effect, l.confidence]).sort()).toEqual([
      ['easterly', 'atlantic_hurricanes', -1, 'contested'], ['easterly', 'nao', -1, 'probable'],
      ['westerly', 'atlantic_hurricanes', 1, 'contested'], ['westerly', 'nao', 1, 'probable'],
    ]);
    expect(graph.links.filter((l) => l.to === 'qbo')).toHaveLength(0);
    // The Indian monsoon link the plan allowed "if at all" is deliberately not drawn.
    expect(own.some((l) => l.to === 'indian_summer_monsoon')).toBe(false);
  });
  it('easterly: the NAO is pushed negative December–February (months 1–3, lag 1) rated probable; before that it is untouched, afterwards the link waits for the next winter', () => {
    expect(east.months[0].calendarMonth).toBe(11);
    expect(monthsWith(east, 'nao', -1)).toEqual([1, 2, 3]);
    expect(east.months[0].nodes.nao.pendingLinkIds).toHaveLength(0);
    expect(east.months[1].links.easterly_qbo_negative_nao).toEqual({ status: 'applied', confidence: 'probable', depth: 1 });
    expect(east.months[1].nodes.nao.confidence).toBe('probable');
    for (const m of east.months.slice(4)) expect(m.nodes.nao.pendingLinkIds, `month ${m.index}`).toEqual(['easterly_qbo_negative_nao']);
  });
  it('westerly: the mirror, the NAO pushed positive December–February', () => {
    expect(monthsWith(west, 'nao', 1)).toEqual([1, 2, 3]);
    expect(monthsWith(west, 'nao', -1)).toHaveLength(0);
    expect(west.months[1].links.westerly_qbo_positive_nao).toEqual({ status: 'applied', confidence: 'probable', depth: 1 });
  });
  it('the hurricane link is read in the season itself: August–October (months 9–11), rated contested, easterly quieter and westerly busier; pending the rest of the year', () => {
    expect(monthsWith(east, 'atlantic_hurricanes', -1)).toEqual([9, 10, 11]);
    expect(monthsWith(west, 'atlantic_hurricanes', 1)).toEqual([9, 10, 11]);
    expect(east.months[9].nodes.atlantic_hurricanes.confidence).toBe('contested');
    expect(east.months[9].links.easterly_qbo_atlantic_hurricanes).toEqual({ status: 'applied', confidence: 'contested', depth: 1 });
    expect(east.months[0].nodes.atlantic_hurricanes.pendingLinkIds).toEqual(['easterly_qbo_atlantic_hurricanes']);
    expect(east.months[12].nodes.atlantic_hurricanes.pendingLinkIds).toEqual(['easterly_qbo_atlantic_hurricanes']);
  });
  it('from a June start the hurricane months come first (months 2–4) and the NAO push arrives in December (months 6–8)', () => {
    const jun = runQbo('easterly', 6);
    expect(monthsWith(jun, 'atlantic_hurricanes', -1)).toEqual([2, 3, 4]);
    expect(monthsWith(jun, 'nao', -1)).toEqual([6, 7, 8]);
  });
  it('direct links only: the NAO is pushed but its own regions stay hollow', () => {
    for (const m of east.months) {
      for (const id of ['northern_europe_winter', 'greenland_winter', 'mediterranean_winter_rainfall']) {
        expect(m.nodes[id].viaLinkIds, `${id} month ${m.index}`).toHaveLength(0);
      }
    }
  });
  it('the neutral phase (transition) has no links and touches nothing', () => {
    const none = runQbo('neutral', 11, 3);
    for (const m of none.months) {
      expect(Object.keys(m.links), `month ${m.index}`).toHaveLength(0);
      for (const st of Object.values(m.nodes)) { expect(st.viaLinkIds).toHaveLength(0); expect(st.pendingLinkIds).toHaveLength(0); }
    }
  });
  it('under "established only" every QBO arrow is a ghost: nothing is pushed and nothing is applied', () => {
    const est = propagate(graph, { driverId: 'qbo', phaseId: 'easterly', startMonth: 11, horizonMonths: HORIZON, maxDepth: 3, minConfidence: 'established' });
    for (const m of est.months) {
      expect(Object.keys(m.links).length, `month ${m.index}`).toBeGreaterThan(0);
      for (const [id, l] of Object.entries(m.links)) expect(l.status, `${id} at month ${m.index}`).toBe('ghost');
      expect(m.nodes.nao.value, `NAO month ${m.index}`).toBe(0);
      for (const st of Object.values(m.nodes)) expect(st.viaLinkIds).toHaveLength(0);
    }
  });
});

describe('acceptance: the easterly QBO from November with the chain on', () => {
  const tl = runQbo('easterly', 11, 3);
  it('December–February: the NAO is pushed at depth 1 and its winter map follows one tier down (northern Europe cold and Greenland mild at probable, eastern North America cold at contested)', () => {
    for (const i of [1, 2, 3]) {
      const m = tl.months[i];
      expect(m.links.easterly_qbo_negative_nao, `month ${i}`).toEqual({ status: 'applied', confidence: 'probable', depth: 1 });
      expect(m.nodes.northern_europe_winter.value, `month ${i}`).toBe(-1);
      expect(m.nodes.northern_europe_winter.confidence, `month ${i}`).toBe('probable');
      expect(m.links.negative_nao_northern_europe, `month ${i}`).toEqual({ status: 'applied', confidence: 'probable', depth: 2 });
      expect(m.nodes.greenland_winter.value, `month ${i}`).toBe(1);
      expect(m.nodes.mediterranean_winter_rainfall.value, `month ${i}`).toBe(1);
      expect(m.nodes.eastern_north_america_winter.confidence, `month ${i}`).toBe('contested');
      expect(m.nodes.hudson_bay_winter.value, `month ${i}`).toBe(1);
    }
    expect(tl.months[1].calendarMonth).toBe(12);
    expect(tl.months[4].nodes.northern_europe_winter.value).toBe(0);
    expect(tl.months[0].nodes.northern_europe_winter.viaLinkIds).toHaveLength(0);
  });
  it('the pushed NAO pushes the Atlantic meridional mode positive for the one month its lag allows (February, a third hop at the floor tier), and the hurricanes are never in conflict', () => {
    expect(tl.months[3].nodes.atlantic_meridional_mode.value).toBe(1);
    expect(tl.months[3].links.negative_nao_positive_amm).toEqual({ status: 'applied', confidence: 'contested', depth: 2 });
    expect(tl.months[2].nodes.atlantic_meridional_mode.value).toBe(0);
    expect(tl.months[4].nodes.atlantic_meridional_mode.value).toBe(0);
    for (const m of tl.months) expect(m.nodes.atlantic_hurricanes.conflicting, `month ${m.index}`).toBe(false);
    expect(monthsWith(tl, 'atlantic_hurricanes', -1)).toEqual([9, 10, 11]);
  });
  it('the QBO is never pushed: no links in, its phase held all year', () => {
    for (const m of tl.months) {
      expect(m.nodes.qbo.value, `month ${m.index}`).toBe(-1);
      expect(m.nodes.qbo.viaLinkIds, `month ${m.index}`).toHaveLength(0);
    }
  });
});

describe('acceptance: the 2009–10 story, the easterly QBO from November with El Niño chosen since June', () => {
  const s = graph.stories.find((x) => x.id === 'easterly_qbo_2009_10')!;
  it('ships with the QBO easterly from November 2009, El Niño as a second driver that began in June, five steps', () => {
    expect(s).toBeDefined();
    expect([s.driver, s.phase, s.drivers, s.start_month, s.start_year])
      .toEqual(['qbo', 'easterly', [{ driver: 'enso', phase: 'el_nino', start_month: 6, starts_before: true }], 11, 2009]);
    expect(s.steps.map((st) => st.month)).toEqual([0, 1, 3, 9, 12]);
    expect(s.steps.map((st) => st.focus)).toEqual(['qbo', 'nao', 'northern_europe_winter', 'atlantic_hurricanes', 'qbo']);
  });
  it('at the story’s steps: the NAO pushed by the QBO alone in December and by both drivers from January, northern Europe cold in February through the pushed NAO, the hurricanes hatched in August (the QBO and El Niño say quieter, the El Niño’s warm Atlantic says busier), the QBO held to the end', () => {
    const tl = propagate(graph, {
      driverId: s.driver, phaseId: s.phase, startMonth: s.start_month, horizonMonths: HORIZON, maxDepth: 3,
      others: [{ driverId: s.drivers![0].driver, phaseId: s.drivers![0].phase, startMonth: s.drivers![0].start_month, startsBefore: true }],
    });
    expect(tl.months[0].nodes.enso.value).toBe(1);
    expect(tl.months[0].nodes.nao.value).toBe(0);
    expect(tl.months[1].nodes.nao.value).toBe(-1);
    expect(tl.months[1].nodes.nao.viaLinkIds).toEqual(['easterly_qbo_negative_nao']);
    expect(tl.months[1].nodes.nao.pendingLinkIds).toEqual(['el_nino_negative_nao']);
    expect([...tl.months[2].nodes.nao.viaLinkIds].sort()).toEqual(['easterly_qbo_negative_nao', 'el_nino_negative_nao']);
    expect(tl.months[2].nodes.nao.conflicting).toBe(false);
    expect(tl.months[3].calendarMonth).toBe(2);
    expect(tl.months[3].nodes.northern_europe_winter.value).toBe(-1);
    expect(tl.months[3].nodes.northern_europe_winter.confidence).toBe('probable');
    expect(tl.months[3].nodes.northern_europe_winter.viaLinkIds).toEqual(['negative_nao_northern_europe']);
    // March: the QBO's winter is over but El Niño's own push (January–March) still holds the NAO.
    expect(tl.months[4].nodes.nao.viaLinkIds).toEqual(['el_nino_negative_nao']);
    expect(tl.months[9].calendarMonth).toBe(8);
    const h = tl.months[9].nodes.atlantic_hurricanes;
    expect(h.value).toBe(-1);
    expect(h.conflicting).toBe(true);
    expect([...h.viaLinkIds].sort()).toEqual(['easterly_qbo_atlantic_hurricanes', 'el_nino_atlantic_hurricanes', 'positive_amm_atlantic_hurricanes']);
    expect(tl.months[9].nodes.atlantic_meridional_mode.viaLinkIds).toEqual(['el_nino_positive_amm']);
    for (const m of tl.months) expect(m.nodes.qbo.value, `month ${m.index}`).toBe(-1);
    // Chain off: nobody argues, the two chosen drivers both say quieter.
    const direct = propagate(graph, {
      driverId: s.driver, phaseId: s.phase, startMonth: s.start_month, horizonMonths: HORIZON, maxDepth: 1,
      others: [{ driverId: s.drivers![0].driver, phaseId: s.drivers![0].phase, startMonth: s.drivers![0].start_month, startsBefore: true }],
    });
    expect(direct.months[9].nodes.atlantic_hurricanes.value).toBe(-1);
    expect(direct.months[9].nodes.atlantic_hurricanes.conflicting).toBe(false);
    expect(direct.months[3].nodes.northern_europe_winter.viaLinkIds).toHaveLength(0);
  });
});


// ---------------------------------------------------------------- M24: thirteenth driver (Barents–Kara autumn sea ice)
// A contested driver, on the map because the dispute is the lesson. Only the
// low-ice phase draws arrows: central Siberia, western Russia and East Asia
// colder and the NAO pushed negative, every one of them contested. Nothing
// pushes the ice.
function runIce(phaseId: string, startMonth = 10, maxDepth = 1): Timeline {
  return propagate(graph, { driverId: 'barents_kara_ice', phaseId, startMonth, horizonMonths: HORIZON, maxDepth });
}

describe('acceptance: Barents–Kara sea ice from October, direct links only', () => {
  const low = runIce('low');
  it('the driver has three phases (high +1, neutral 0, low −1), defaults to October, has an area, four links out (all contested, all from the low phase) and none in; a new Siberian outcome node', () => {
    const d = graph.nodes.find((n) => n.id === 'barents_kara_ice')!;
    expect(d.kind).toBe('driver');
    if (d.kind !== 'driver') return;
    expect(d.phases.map((p) => [p.id, p.value])).toEqual([['high', 1], ['neutral', 0], ['low', -1]]);
    expect(d.default_start_month).toBe(10);
    expect(d.area).toBeDefined();
    const own = graph.links.filter((l) => l.from === 'barents_kara_ice');
    expect(own.map((l) => [l.when, l.to, l.effect, l.confidence]).sort()).toEqual([
      ['low', 'east_asia_winter', -1, 'contested'], ['low', 'nao', -1, 'contested'],
      ['low', 'siberia_winter', -1, 'contested'], ['low', 'western_russia_winter', -1, 'contested'],
    ]);
    expect(graph.links.filter((l) => l.to === 'barents_kara_ice')).toHaveLength(0);
    const sib = graph.nodes.find((n) => n.id === 'siberia_winter')!;
    expect(sib.kind).toBe('outcome');
    if (sib.kind === 'outcome') expect(sib.axis).toBe('warm_cool');
    expect(graph.links.filter((l) => l.to === 'siberia_winter').map((l) => l.id)).toEqual(['low_ice_siberia_cold']);
  });
  it('low ice: Siberia, western Russia and East Asia cold and the NAO pushed negative in December–February (months 2–4), all rated contested; October untouched, November waiting, and from March the arrows wait for the next winter', () => {
    expect(low.months[0].calendarMonth).toBe(10);
    for (const id of ['siberia_winter', 'western_russia_winter', 'east_asia_winter', 'nao']) {
      expect(monthsWith(low, id, -1), id).toEqual([2, 3, 4]);
      expect(low.months[0].nodes[id].pendingLinkIds, `${id} October`).toHaveLength(0);
      expect(low.months[1].nodes[id].pendingLinkIds, `${id} November`).toHaveLength(1);
      expect(low.months[2].nodes[id].confidence, id).toBe('contested');
      for (const m of low.months.slice(5)) expect(m.nodes[id].pendingLinkIds, `${id} month ${m.index}`).toHaveLength(1);
    }
    expect(low.months[2].links.low_ice_siberia_cold).toEqual({ status: 'applied', confidence: 'contested', depth: 1 });
    expect(low.months[2].links.low_ice_negative_nao).toEqual({ status: 'applied', confidence: 'contested', depth: 1 });
    expect(low.months[1].links.low_ice_siberia_cold).toEqual({ status: 'pending', confidence: 'contested', depth: 1 });
  });
  it('direct links only: the NAO is pushed but its own regions stay hollow', () => {
    for (const m of low.months) {
      for (const id of ['northern_europe_winter', 'greenland_winter', 'eastern_north_america_winter']) {
        expect(m.nodes[id].viaLinkIds, `${id} month ${m.index}`).toHaveLength(0);
      }
    }
  });
  it('the high-ice and neutral phases draw nothing: the argument is about ice loss', () => {
    for (const phase of ['high', 'neutral']) {
      const tl = runIce(phase, 10, 3);
      for (const m of tl.months) {
        expect(Object.keys(m.links), `${phase} month ${m.index}`).toHaveLength(0);
        for (const st of Object.values(m.nodes)) { expect(st.viaLinkIds).toHaveLength(0); expect(st.pendingLinkIds).toHaveLength(0); }
      }
    }
  });
  it('under "probable and above", not just "established only", every arrow from the ice is a ghost: the whole driver disappears, which is the lesson', () => {
    for (const minConfidence of ['probable', 'established'] as const) {
      const tl = propagate(graph, { driverId: 'barents_kara_ice', phaseId: 'low', startMonth: 10, horizonMonths: HORIZON, maxDepth: 3, minConfidence });
      for (const m of tl.months.slice(1)) {
        expect(Object.keys(m.links).length, `${minConfidence} month ${m.index}`).toBe(4);
        for (const [id, l] of Object.entries(m.links)) expect(l.status, `${id} at month ${m.index}`).toBe('ghost');
        expect(m.nodes.nao.value, `NAO month ${m.index}`).toBe(0);
        for (const st of Object.values(m.nodes)) expect(st.viaLinkIds).toHaveLength(0);
      }
    }
  });
});

describe('acceptance: low Barents–Kara ice from October with the chain on', () => {
  const tl = runIce('low', 10, 3);
  it('December–February: the NAO is pushed at depth 1 and its winter map follows at the floor tier (northern Europe cold, Greenland mild, northeastern Canada mild, all contested); western Russia is cold twice over from one cause and not in conflict', () => {
    for (const i of [2, 3, 4]) {
      const m = tl.months[i];
      expect(m.links.low_ice_negative_nao, `month ${i}`).toEqual({ status: 'applied', confidence: 'contested', depth: 1 });
      expect(m.nodes.northern_europe_winter.value, `month ${i}`).toBe(-1);
      expect(m.nodes.northern_europe_winter.confidence, `month ${i}`).toBe('contested');
      expect(m.links.negative_nao_northern_europe, `month ${i}`).toEqual({ status: 'applied', confidence: 'contested', depth: 2 });
      expect(m.nodes.greenland_winter.value, `month ${i}`).toBe(1);
      expect(m.nodes.hudson_bay_winter.value, `month ${i}`).toBe(1);
      expect(m.nodes.eastern_north_america_winter.value, `month ${i}`).toBe(-1);
      expect([...m.nodes.western_russia_winter.viaLinkIds].sort(), `month ${i}`).toEqual(['low_ice_western_russia_cold', 'negative_nao_western_russia']);
      expect(m.nodes.western_russia_winter.conflicting, `month ${i}`).toBe(false);
      expect(m.nodes.western_russia_winter.value, `month ${i}`).toBe(-1);
    }
    expect(tl.months[2].calendarMonth).toBe(12);
    expect(tl.months[1].nodes.northern_europe_winter.viaLinkIds).toHaveLength(0);
    // March: the NAO's own regions are still in season but the NAO is no longer pushed, so they go hollow with the ice's arrows waiting.
    expect(tl.months[5].nodes.nao.value).toBe(0);
    expect(tl.months[5].nodes.northern_europe_winter.viaLinkIds).toHaveLength(0);
  });
  it('the ice is never pushed: no links in, its phase held all year, and every applied arrow on the map is contested', () => {
    for (const m of tl.months) {
      expect(m.nodes.barents_kara_ice.value, `month ${m.index}`).toBe(-1);
      expect(m.nodes.barents_kara_ice.viaLinkIds, `month ${m.index}`).toHaveLength(0);
      for (const [id, l] of Object.entries(m.links)) if (l.status === 'applied') expect(l.confidence, `${id} month ${m.index}`).toBe('contested');
    }
  });
  it('with El Niño chosen as a second driver that began in June, East Asia is hatched in the winter: the ice says colder, the El Niño milder', () => {
    const two = runTwo(['barents_kara_ice', 'low'], ['enso', 'el_nino'], 10, 6, true);
    for (const i of [2, 3, 4]) {
      const ea = two.months[i].nodes.east_asia_winter;
      expect(ea.conflicting, `month ${i}`).toBe(true);
      expect([...ea.viaLinkIds].sort(), `month ${i}`).toEqual(['el_nino_east_asia_winter', 'low_ice_east_asia_cold']);
    }
    expect(two.months[2].nodes.siberia_winter.value).toBe(-1);
    expect(two.months[2].nodes.siberia_winter.conflicting).toBe(false);
  });
});

describe('acceptance: the 2012–13 story, low Barents–Kara ice from October', () => {
  const s = graph.stories.find((x) => x.id === 'low_ice_2012_13')!;
  it('ships with low ice from October 2012, no second driver, five steps', () => {
    expect(s).toBeDefined();
    expect([s.driver, s.phase, s.drivers, s.start_month, s.start_year]).toEqual(['barents_kara_ice', 'low', undefined, 10, 2012]);
    expect(s.steps.map((st) => st.month)).toEqual([0, 2, 3, 4, 12]);
    expect(s.steps.map((st) => st.focus)).toEqual(['barents_kara_ice', 'siberia_winter', 'east_asia_winter', 'nao', 'barents_kara_ice']);
    for (const st of s.steps) expect(st.sources.length, `step ${st.month}`).toBeGreaterThan(0);
  });
  it('at the story’s steps with the chain on: October quiet, December Siberia cold along a dotted arrow, January East Asia cold, February the NAO pushed and northern Europe cold through it at the floor tier, the next October quiet again with every arrow waiting', () => {
    const tl = propagate(graph, { driverId: s.driver, phaseId: s.phase, startMonth: s.start_month, horizonMonths: HORIZON, maxDepth: 3 });
    expect(tl.months[0].calendarMonth).toBe(10);
    expect(Object.keys(tl.months[0].links)).toHaveLength(0);
    expect(tl.months[2].nodes.siberia_winter.value).toBe(-1);
    expect(tl.months[2].nodes.siberia_winter.confidence).toBe('contested');
    expect(tl.months[3].calendarMonth).toBe(1);
    expect(tl.months[3].nodes.east_asia_winter.value).toBe(-1);
    expect(tl.months[4].calendarMonth).toBe(2);
    expect(tl.months[4].nodes.nao.value).toBe(-1);
    expect(tl.months[4].nodes.nao.viaLinkIds).toEqual(['low_ice_negative_nao']);
    expect(tl.months[4].nodes.northern_europe_winter.value).toBe(-1);
    expect(tl.months[4].nodes.northern_europe_winter.confidence).toBe('contested');
    expect(tl.months[12].calendarMonth).toBe(10);
    for (const st of Object.values(tl.months[12].nodes)) expect(st.viaLinkIds).toHaveLength(0);
    expect(tl.months[12].nodes.siberia_winter.pendingLinkIds).toEqual(['low_ice_siberia_cold']);
  });
});


// ---------------------------------------------------------------- M25: fourteenth driver (Eurasian October snow cover)
// The second contested Arctic precursor, paired with the Barents–Kara ice as
// one lesson. Only the high-snow phase draws arrows: the NAO pushed negative,
// northern Europe and the eastern United States colder, every one contested,
// lag 2–3 so an October reading reaches December. Nothing pushes the snow.
function runSnow(phaseId: string, startMonth = 10, maxDepth = 1): Timeline {
  return propagate(graph, { driverId: 'eurasian_october_snow', phaseId, startMonth, horizonMonths: HORIZON, maxDepth });
}

describe('acceptance: Eurasian October snow from October, direct links only', () => {
  const high = runSnow('high');
  it('the driver has three phases (high +1, neutral 0, low −1), defaults to October, has an area, three links out (all contested, all from the high phase) and none in; no new outcome node', () => {
    const d = graph.nodes.find((n) => n.id === 'eurasian_october_snow')!;
    expect(d.kind).toBe('driver');
    if (d.kind !== 'driver') return;
    expect(d.phases.map((p) => [p.id, p.value])).toEqual([['high', 1], ['neutral', 0], ['low', -1]]);
    expect(d.default_start_month).toBe(10);
    expect(d.area).toBeDefined();
    const own = graph.links.filter((l) => l.from === 'eurasian_october_snow');
    expect(own.map((l) => [l.when, l.to, l.effect, l.confidence, l.lag_months[0]]).sort()).toEqual([
      ['high', 'eastern_north_america_winter', -1, 'contested', 2], ['high', 'nao', -1, 'contested', 2], ['high', 'northern_europe_winter', -1, 'contested', 2],
    ]);
    expect(graph.links.filter((l) => l.to === 'eurasian_october_snow')).toHaveLength(0);
    expect(graph.nodes.filter((n) => n.kind === 'outcome')).toHaveLength(62);
  });
  it('high snow: the NAO pushed negative and northern Europe and the eastern United States cold in December–February (months 2–4), all contested; October and November have nothing available (lag 2), and from March the arrows wait', () => {
    expect(high.months[0].calendarMonth).toBe(10);
    for (const id of ['nao', 'northern_europe_winter', 'eastern_north_america_winter']) {
      expect(monthsWith(high, id, -1), id).toEqual([2, 3, 4]);
      expect(high.months[0].nodes[id].pendingLinkIds, `${id} October`).toHaveLength(0);
      expect(high.months[1].nodes[id].pendingLinkIds, `${id} November`).toHaveLength(0);
      expect(high.months[2].nodes[id].confidence, id).toBe('contested');
      for (const m of high.months.slice(5)) expect(m.nodes[id].pendingLinkIds, `${id} month ${m.index}`).toHaveLength(1);
    }
    expect(Object.keys(high.months[1].links)).toHaveLength(0);
    expect(high.months[2].links.high_snow_negative_nao).toEqual({ status: 'applied', confidence: 'contested', depth: 1 });
    expect(high.months[5].links.high_snow_negative_nao).toEqual({ status: 'pending', confidence: 'contested', depth: 1 });
  });
  it('the low-snow and neutral phases draw nothing: the map draws only what has been argued over', () => {
    for (const phase of ['low', 'neutral']) {
      const tl = runSnow(phase, 10, 3);
      for (const m of tl.months) {
        expect(Object.keys(m.links), `${phase} month ${m.index}`).toHaveLength(0);
        for (const st of Object.values(m.nodes)) { expect(st.viaLinkIds).toHaveLength(0); expect(st.pendingLinkIds).toHaveLength(0); }
      }
    }
  });
  it('under "probable and above" every arrow from the snow is a ghost and the driver disappears', () => {
    const tl = propagate(graph, { driverId: 'eurasian_october_snow', phaseId: 'high', startMonth: 10, horizonMonths: HORIZON, maxDepth: 3, minConfidence: 'probable' });
    for (const m of tl.months.slice(2)) {
      expect(Object.keys(m.links).length, `month ${m.index}`).toBe(3);
      for (const [id, l] of Object.entries(m.links)) expect(l.status, `${id} at month ${m.index}`).toBe('ghost');
      expect(m.nodes.nao.value, `NAO month ${m.index}`).toBe(0);
      for (const st of Object.values(m.nodes)) expect(st.viaLinkIds).toHaveLength(0);
    }
  });
});

describe('acceptance: high October snow with the chain on, alone and with the Barents–Kara ice', () => {
  const tl = runSnow('high', 10, 3);
  it('December–February: northern Europe and the eastern United States carry two arrows from one cause (the snow’s own and the pushed NAO’s) and are not hatched; Greenland mild through the NAO at the floor tier', () => {
    for (const i of [2, 3, 4]) {
      const m = tl.months[i];
      expect(m.links.high_snow_negative_nao, `month ${i}`).toEqual({ status: 'applied', confidence: 'contested', depth: 1 });
      expect([...m.nodes.northern_europe_winter.viaLinkIds].sort(), `month ${i}`).toEqual(['high_snow_northern_europe_cold', 'negative_nao_northern_europe']);
      expect([...m.nodes.eastern_north_america_winter.viaLinkIds].sort(), `month ${i}`).toEqual(['high_snow_eastern_us_cold', 'negative_nao_eastern_north_america']);
      expect(m.nodes.northern_europe_winter.conflicting, `month ${i}`).toBe(false);
      expect(m.nodes.northern_europe_winter.value, `month ${i}`).toBe(-1);
      expect(m.nodes.greenland_winter.value, `month ${i}`).toBe(1);
      expect(m.nodes.greenland_winter.confidence, `month ${i}`).toBe('contested');
      for (const [id, l] of Object.entries(m.links)) if (l.status === 'applied') expect(l.confidence, `${id} month ${i}`).toBe('contested');
    }
    expect(tl.months[5].nodes.nao.value).toBe(0);
    expect(tl.months[5].nodes.northern_europe_winter.viaLinkIds).toHaveLength(0);
  });
  it('the snow is never pushed: no links in, its phase held all year', () => {
    for (const m of tl.months) {
      expect(m.nodes.eurasian_october_snow.value, `month ${m.index}`).toBe(1);
      expect(m.nodes.eurasian_october_snow.viaLinkIds, `month ${m.index}`).toHaveLength(0);
    }
  });
  it('with low Barents–Kara ice chosen as a second driver in the same October, the NAO carries both precursors’ arrows, agreeing, and nothing on the map is hatched: the map draws both, which is not evidence that they add up', () => {
    const two = propagate(graph, {
      driverId: 'eurasian_october_snow', phaseId: 'high', startMonth: 10, horizonMonths: HORIZON, maxDepth: 3,
      others: [{ driverId: 'barents_kara_ice', phaseId: 'low', startMonth: 10 }],
    });
    for (const i of [2, 3, 4]) {
      const m = two.months[i];
      expect([...m.nodes.nao.viaLinkIds].sort(), `month ${i}`).toEqual(['high_snow_negative_nao', 'low_ice_negative_nao']);
      expect(m.nodes.nao.value, `month ${i}`).toBe(-1);
      expect(m.nodes.nao.conflicting, `month ${i}`).toBe(false);
      expect(m.nodes.siberia_winter.value, `month ${i}`).toBe(-1);
      for (const [id, st] of Object.entries(m.nodes)) expect(st.conflicting, `${id} month ${i}`).toBe(false);
      for (const [id, l] of Object.entries(m.links)) if (l.status === 'applied') expect(l.confidence, `${id} month ${i}`).toBe('contested');
    }
  });
});

describe('acceptance: the 2009–10 story, high October snow from October', () => {
  const s = graph.stories.find((x) => x.id === 'high_snow_2009_10')!;
  it('ships with high snow from October 2009, no second driver, five steps', () => {
    expect(s).toBeDefined();
    expect([s.driver, s.phase, s.drivers, s.start_month, s.start_year]).toEqual(['eurasian_october_snow', 'high', undefined, 10, 2009]);
    expect(s.steps.map((st) => st.month)).toEqual([0, 2, 3, 4, 12]);
    expect(s.steps.map((st) => st.focus)).toEqual(['eurasian_october_snow', 'nao', 'northern_europe_winter', 'eastern_north_america_winter', 'eurasian_october_snow']);
    for (const st of s.steps) expect(st.sources.length, `step ${st.month}`).toBeGreaterThan(0);
  });
  it('at the story’s steps with the chain on: October quiet, December the NAO pushed along the snow’s arrow, January northern Europe cold twice over, February the eastern United States cold twice over, the next October quiet with the arrows waiting', () => {
    const tl = propagate(graph, { driverId: s.driver, phaseId: s.phase, startMonth: s.start_month, horizonMonths: HORIZON, maxDepth: 3 });
    expect(Object.keys(tl.months[0].links)).toHaveLength(0);
    expect(tl.months[2].calendarMonth).toBe(12);
    expect(tl.months[2].nodes.nao.viaLinkIds).toEqual(['high_snow_negative_nao']);
    expect(tl.months[3].nodes.northern_europe_winter.viaLinkIds).toHaveLength(2);
    expect(tl.months[3].nodes.northern_europe_winter.conflicting).toBe(false);
    expect(tl.months[4].calendarMonth).toBe(2);
    expect(tl.months[4].nodes.eastern_north_america_winter.value).toBe(-1);
    expect(tl.months[4].nodes.eastern_north_america_winter.viaLinkIds).toHaveLength(2);
    expect(tl.months[12].calendarMonth).toBe(10);
    for (const st of Object.values(tl.months[12].nodes)) expect(st.viaLinkIds).toHaveLength(0);
    expect(tl.months[12].nodes.nao.pendingLinkIds).toEqual(['high_snow_negative_nao']);
  });
});
