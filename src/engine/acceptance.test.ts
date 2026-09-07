// Acceptance checks from docs/PLAN.md section 7 (version 1) and M8 (second driver), run against the
// shipped data with the real engine. Each expected effect must be applied
// with the right sign at some month of a June-start scenario; effects are
// season-gated, so "by month 12" means "at some point in the year", and the
// month-12 map (June again) shows winter effects as pending, not applied.

import { describe, expect, it } from 'vitest';
import { chosenOnset, propagate } from './propagate';
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
  const DRIVERS = ['amo', 'enso', 'iod', 'nao', 'pdo', 'sam'];
  it('ships ENSO, the IOD, the NAO, the SAM, the PDO and the AMO as drivers, each with a neutral phase, an onset hint and a default start month', () => {
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
  it('ships twelve driver-to-driver links, each with an evidence note and no self-loop', () => {
    expect(d2d.map((l) => l.id).sort()).toEqual([
      'el_nino_negative_nao', 'el_nino_negative_sam', 'el_nino_positive_iod', 'el_nino_positive_pdo', 'la_nina_negative_iod', 'la_nina_negative_pdo', 'la_nina_positive_nao', 'la_nina_positive_sam',
      'negative_amo_positive_nao', 'negative_iod_el_nino_next_year', 'positive_amo_negative_nao', 'positive_iod_la_nina_next_year',
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
    secondary: secondStartMonth === undefined ? { driverId: b[0], phaseId: b[1] }
      : startsBefore ? { driverId: b[0], phaseId: b[1], startMonth: secondStartMonth, startsBefore: true }
      : { driverId: b[0], phaseId: b[1], startMonth: secondStartMonth },
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
    expect(s.second_driver).toBe('iod');
    expect(s.second_starts_before).toBe(true);
    expect(s.second_start_month).toBe(5);
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
  it('every shipped story that starts its second driver before the first has a second driver', () => {
    for (const s of graph.stories) {
      if (s.second_starts_before === undefined) continue;
      expect(s.second_driver).toBeDefined();
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
    expect([s.driver, s.phase, s.second_driver, s.second_phase, s.second_start_month, s.second_starts_before, s.start_month, s.start_year])
      .toEqual(['sam', 'negative', 'iod', 'positive', 6, true, 11, 2019]);
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
    expect([s.driver, s.phase, s.second_driver, s.second_phase, s.second_start_month, s.second_starts_before, s.start_month, s.start_year])
      .toEqual(['pdo', 'positive', 'enso', 'el_nino', 3, undefined, 11, 2014]);
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
    expect([s.driver, s.phase, s.second_driver, s.second_phase, s.second_start_month, s.second_starts_before, s.start_month, s.start_year])
      .toEqual(['amo', 'positive', 'enso', 'la_nina', 9, undefined, 6, 1995]);
  });
});
