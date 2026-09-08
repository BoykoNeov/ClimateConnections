// The table of real years (M34): `scenarioForYear` reads one row as a
// scenario the engine already understands, and the validator's checks
// (scripts/years-schema.mjs) refuse a bad row. Nothing here computes a
// climate fact; the tests pin the reading of the shipped table.

import { describe, expect, it } from 'vitest';
import { calendarAt, monthsBetween, phaseEnd, phaseOnset, scenarioForYear, yearRow, yearRows, type YearScenario } from './years';
import { chosenDrivers, chosenFade, chosenOnset, propagate } from './propagate';
import { checkYears, YearsFile } from '../../scripts/years-schema.mjs';
import type { Graph, YearRow } from '../types';
import graphJson from '../../public/data/graph.json';

const graph = graphJson as unknown as Graph;
const row = (year: number): YearRow => {
  const r = yearRow(graph, year);
  if (!r) throw new Error(`no row for ${year}`);
  return r;
};
const other = (ys: YearScenario, id: string) => {
  const o = ys.scenario.others?.find((x) => x.driverId === id);
  if (!o) throw new Error(`${ys.row.year}: ${id} is not among the others`);
  return o;
};
const SEVEN = ['enso', 'iod', 'nao', 'sam', 'pdo', 'amo', 'atlantic_nino'];

describe('the shipped table', () => {
  it('covers 1950–2025: ENSO alone before 1980, the seven index drivers from 1980, in row order', () => {
    const years = yearRows(graph).map((r) => r.year);
    expect(years).toEqual(Array.from({ length: 76 }, (_, i) => 1950 + i));
    for (const r of yearRows(graph)) {
      expect(r.drivers.map((d) => d.driver), String(r.year)).toEqual(r.year < 1980 ? ['enso'] : SEVEN);
    }
  });
  it('every dated story has a row to compare with', () => {
    for (const s of graph.stories) if (s.start_year !== undefined) expect(yearRow(graph, s.start_year), s.id).toBeDefined();
  });
  it('every row builds a scenario the engine accepts, one chosen driver per entry, each placed where the engine reads it', () => {
    for (const r of yearRows(graph)) {
      const ys = scenarioForYear(graph, r);
      const tl = propagate(graph, { ...ys.scenario, maxDepth: 3 });
      expect(tl.months.length).toBe(13);
      expect(chosenDrivers(ys.scenario).length, String(r.year)).toBe(ys.drivers.filter((p) => p.placed).length);
      expect(ys.drivers.map((p) => p.driver.driver)).toEqual(r.drivers.map((d) => d.driver));
      for (const p of ys.drivers) {
        if (!p.placed) continue;
        expect(chosenOnset(ys.scenario, p.driver.driver), `${r.year} ${p.driver.driver} onset`).toBe(p.engineOnset);
        expect(chosenFade(ys.scenario, p.driver.driver), `${r.year} ${p.driver.driver} fade`).toBe(p.engineFade);
        // A phase from the record is never read as beginning later than it did.
        expect(p.engineOnset).toBeGreaterThanOrEqual(p.recordOnset);
      }
    }
  });
  it('places every recorded phase exactly except the few the engine cannot hold: a phase over a year old at month 0 that ends inside the months shown', () => {
    const approx = yearRows(graph).flatMap((r) => scenarioForYear(graph, r).approximations.map((p) => (p.placed ? `${r.year} ${p.driver.driver} record ${p.recordFade} shown ${p.engineFade}` : `${r.year} ${p.driver.driver} not placed, onset ${p.recordOnset}`)));
    expect(approx).toEqual([
      '1983 enso record 6 shown 4',
      '1989 enso record 5 shown 4',
      '1992 enso record 6 shown 5',
      '2024 iod record 5 shown 3',
      '2024 nao not placed, onset 12',
    ]);
  });
  it('month 0 is January whenever the engine allows it; otherwise the start that covers most of the year', () => {
    for (const r of yearRows(graph)) {
      const ys = scenarioForYear(graph, r);
      if (ys.anchor === 'january') { expect(ys.startYear).toBe(r.year); expect(ys.scenario.startMonth).toBe(1); }
      if (ys.anchor === 'onset') expect(ys.startYear).toBe(r.year);
      if (ys.anchor === 'earlier') expect(ys.startYear).toBeLessThan(r.year);
    }
    const fallback = yearRows(graph).filter((r) => scenarioForYear(graph, r).anchor === 'earlier').map((r) => r.year);
    expect(fallback).toEqual([1952, 1955, 1956, 1959, 1966, 1971, 1975, 1978, 2024]);
    const onsets = yearRows(graph).filter((r) => r.year >= 1980 && scenarioForYear(graph, r).anchor === 'onset').map((r) => `${r.year} ${scenarioForYear(graph, r).scenario.driverId} ${scenarioForYear(graph, r).scenario.startMonth}`);
    expect(onsets).toEqual(['1984 iod 7', '2023 iod 3']);
    // 2024: nothing neutral, nothing from January, the first new phase in
    // November; the SAM phase from December 2023 covers the year best.
    const y2024 = scenarioForYear(graph, row(2024));
    expect(y2024.startYear).toBe(2023);
    expect(y2024.scenario).toMatchObject({ driverId: 'sam', phaseId: 'positive', startMonth: 12, holdMonths: 4 });
    expect(other(y2024, 'enso')).toEqual({ driverId: 'enso', phaseId: 'el_nino', startMonth: 5, startsBefore: true, holdMonths: 12 });
    expect(y2024.scenario.others!.some((o) => o.driverId === 'nao')).toBe(false);
  });
});

describe('scenarioForYear', () => {
  it('1997: January on the neutral NAO; El Niño from May, the dipole from July, the Atlantic Niña since October with its hold, the PDO since the year before', () => {
    const ys = scenarioForYear(graph, row(1997));
    expect(ys.anchor).toBe('january');
    expect(ys.startYear).toBe(1997);
    expect(ys.scenario.driverId).toBe('nao');
    expect(ys.scenario.phaseId).toBe('neutral');
    expect(ys.scenario.startMonth).toBe(1);
    expect(ys.scenario.holdMonths).toBeUndefined();
    expect(other(ys, 'enso')).toEqual({ driverId: 'enso', phaseId: 'el_nino', startMonth: 5 });
    expect(chosenOnset(ys.scenario, 'enso')).toBe(4);
    expect(other(ys, 'iod')).toEqual({ driverId: 'iod', phaseId: 'positive', startMonth: 7 });
    expect(other(ys, 'atlantic_nino')).toEqual({ driverId: 'atlantic_nino', phaseId: 'cool', startMonth: 10, startsBefore: true, holdMonths: 10 });
    expect(chosenOnset(ys.scenario, 'atlantic_nino')).toBe(-3);
    expect(chosenFade(ys.scenario, 'atlantic_nino')).toBe(7);
    expect(other(ys, 'pdo')).toEqual({ driverId: 'pdo', phaseId: 'positive', startMonth: 1, startsBefore: true });
    expect(other(ys, 'sam')).toEqual({ driverId: 'sam', phaseId: 'neutral', startMonth: 1 });
    expect(other(ys, 'amo')).toEqual({ driverId: 'amo', phaseId: 'neutral', startMonth: 1 });
    const enso = ys.drivers.find((p) => p.driver.driver === 'enso')!;
    expect(enso).toMatchObject({ neutral: false, onset: { year: 1997, month: 5 }, recordOnset: 4, engineOnset: 4, recordFade: 16, engineFade: null });
  });
  it('1997 run through the engine: El Niño from month 4, the Atlantic Niña faded from month 7, the neutral NAO pinned so El Niño never pushes it', () => {
    const ys = scenarioForYear(graph, row(1997));
    expect(graph.links.some((l) => l.from === 'enso' && l.when === 'el_nino' && l.to === 'nao')).toBe(true);
    const tl = propagate(graph, { ...ys.scenario, maxDepth: 3 });
    for (const m of tl.months) {
      expect(m.nodes.enso.value, `enso month ${m.index}`).toBe(m.index >= 4 ? 1 : 0);
      expect(m.nodes.nao.value, `nao month ${m.index}`).toBe(0);
      expect(m.nodes.nao.viaLinkIds).toEqual([]);
      expect(m.nodes.atlantic_nino.value, `atlantic month ${m.index}`).toBe(m.index < 7 ? -1 : 0);
    }
    expect(tl.months[8].nodes.indonesia_rainfall.value).toBe(-1);
  });
  it('1972, ENSO alone: month 0 is the onset in May, the El Niño held eleven months', () => {
    const ys = scenarioForYear(graph, row(1972));
    expect(ys.anchor).toBe('onset');
    expect(ys.startYear).toBe(1972);
    expect(ys.scenario).toEqual({ driverId: 'enso', phaseId: 'el_nino', startMonth: 5, horizonMonths: 12, holdMonths: 11 });
    expect(ys.approximations).toEqual([]);
  });
  it('1999: the La Niña since July 1998 is read backwards to month -6 and holds through, the neutral dipole anchors January', () => {
    const ys = scenarioForYear(graph, row(1999));
    expect(ys.scenario.driverId).toBe('iod');
    expect(other(ys, 'enso')).toEqual({ driverId: 'enso', phaseId: 'la_nina', startMonth: 7, startsBefore: true });
    expect(chosenOnset(ys.scenario, 'enso')).toBe(-6);
    expect(chosenFade(ys.scenario, 'enso')).toBeNull();
    const enso = ys.drivers.find((p) => p.driver.driver === 'enso')!;
    expect(enso.recordOnset).toBe(-6);
    expect(enso.recordFade).toBe(26);
  });
  it('2001: the same La Niña, thirty months old, ends in February: read as at most a year back, its hold lands the fade at month 2 exactly', () => {
    const ys = scenarioForYear(graph, row(2001));
    expect(other(ys, 'enso')).toEqual({ driverId: 'enso', phaseId: 'la_nina', startMonth: 7, startsBefore: true, holdMonths: 8 });
    const enso = ys.drivers.find((p) => p.driver.driver === 'enso')!;
    expect(enso.recordOnset).toBe(-30);
    expect(enso.engineOnset).toBe(-6);
    expect(enso.recordFade).toBe(2);
    expect(enso.engineFade).toBe(2);
    expect(ys.approximations).toEqual([]);
    const tl = propagate(graph, { ...ys.scenario, maxDepth: 3 });
    expect(tl.months[1].nodes.enso.value).toBe(-1);
    expect(tl.months[2].nodes.enso.value).toBe(0);
    expect(Object.values(tl.months[2].links).some((l) => l.status === 'faded')).toBe(true);
  });
  it('1955 and 1959, ENSO alone and nothing new: the earlier onset is month 0, the row says so', () => {
    const a = scenarioForYear(graph, row(1955));
    expect(a.anchor).toBe('earlier');
    expect(a.startYear).toBe(1954);
    expect(a.scenario).toEqual({ driverId: 'enso', phaseId: 'la_nina', startMonth: 5, horizonMonths: 12 });
    const b = scenarioForYear(graph, row(1959));
    expect(b.startYear).toBe(1958);
    expect(b.scenario).toEqual({ driverId: 'enso', phaseId: 'el_nino', startMonth: 11, horizonMonths: 12, holdMonths: 5 });
  });
  it('1983: the 1982–83 El Niño, fourteen months from May 1982, ends in June; the engine cannot hold it that long from a start read a year back, so it ends two months early and the row says so', () => {
    const ys = scenarioForYear(graph, row(1983));
    expect(ys.scenario.driverId).toBe('iod'); // neutral, the first January anchor in row order after ENSO
    expect(other(ys, 'enso')).toEqual({ driverId: 'enso', phaseId: 'el_nino', startMonth: 5, startsBefore: true, holdMonths: 12 });
    const enso = ys.drivers.find((p) => p.driver.driver === 'enso')!;
    expect(enso).toMatchObject({ recordOnset: -8, engineOnset: -8, recordFade: 6, engineFade: 4 });
    expect(ys.approximations.map((p) => p.driver.driver)).toEqual(['enso']);
  });
  it('a year with every recorded driver neutral gives an empty map', () => {
    const r: YearRow = { year: 1990, note: 'Nothing happened, as far as the indices know.', sources: ['noaa_oni_index'], drivers: SEVEN.map((d) => ({ driver: d, phase: 'neutral', source: 'noaa_oni_index' })) };
    const ys = scenarioForYear(graph, r);
    expect(ys.scenario.driverId).toBe('enso');
    expect(chosenDrivers(ys.scenario).length).toBe(7);
    const tl = propagate(graph, { ...ys.scenario, maxDepth: 3 });
    for (const m of tl.months) for (const [id, st] of Object.entries(m.nodes)) {
      expect(st.value, `${id} month ${m.index}`).toBe(0);
      expect(st.viaLinkIds).toEqual([]);
    }
  });
  it('nothing neutral and nothing from January: the earliest onset of the year is month 0, the first in row order (ENSO) on a tie', () => {
    const r: YearRow = { year: 2000, note: 'A made-up year for the tie rule.', sources: ['noaa_oni_index'], drivers: [
      { driver: 'enso', phase: 'el_nino', onset_month: 6, duration_months: 3, source: 'noaa_oni_index' },
      { driver: 'iod', phase: 'positive', onset_month: 6, source: 'noaa_oni_index' },
      { driver: 'sam', phase: 'negative', onset_month: 4, duration_months: 2, source: 'noaa_oni_index' },
    ] };
    const ys = scenarioForYear(graph, r);
    expect(ys.anchor).toBe('onset');
    expect(ys.scenario.driverId).toBe('sam');
    expect(ys.scenario.startMonth).toBe(4);
    expect(ys.scenario.holdMonths).toBe(2);
    expect(other(ys, 'enso')).toEqual({ driverId: 'enso', phaseId: 'el_nino', startMonth: 6, holdMonths: 3 });
    expect(chosenOnset(ys.scenario, 'enso')).toBe(2);
    expect(chosenFade(ys.scenario, 'enso')).toBe(5);
    const r2: YearRow = { ...r, drivers: r.drivers.filter((d) => d.driver !== 'sam') };
    expect(scenarioForYear(graph, r2).scenario.driverId).toBe('enso');
  });
  it('an onset at or after the end of the months shown is left out and reported', () => {
    const r: YearRow = { year: 1956, note: 'A made-up row: a phase from the December before, and one from this December.', sources: ['noaa_oni_index'], drivers: [
      { driver: 'sam', phase: 'positive', onset_month: 12, onset_year: 1955, duration_months: 4, source: 'noaa_oni_index' },
      { driver: 'nao', phase: 'positive', onset_month: 12, duration_months: 3, source: 'noaa_oni_index' },
    ] };
    const ys = scenarioForYear(graph, r);
    expect(ys.anchor).toBe('earlier');
    expect(ys.startYear).toBe(1955);
    expect(ys.scenario).toEqual({ driverId: 'sam', phaseId: 'positive', startMonth: 12, horizonMonths: 12, holdMonths: 4 });
    const nao = ys.drivers.find((p) => p.driver.driver === 'nao')!;
    expect(nao.recordOnset).toBe(12);
    expect(nao.placed).toBe(false);
    expect(ys.scenario.others).toBeUndefined();
    expect(ys.approximations.map((p) => p.driver.driver)).toEqual(['nao']);
  });
  it('refuses an unknown driver, an unknown phase, a phase without an onset and a driver twice', () => {
    const base = { year: 2000, note: 'A made-up row for the refusals.', sources: ['noaa_oni_index'] };
    expect(() => scenarioForYear(graph, { ...base, drivers: [{ driver: 'moon', phase: 'full', onset_month: 1, source: 'x' }] })).toThrow(/unknown driver/);
    expect(() => scenarioForYear(graph, { ...base, drivers: [{ driver: 'enso', phase: 'modoki', onset_month: 1, source: 'x' }] })).toThrow(/not a phase/);
    expect(() => scenarioForYear(graph, { ...base, drivers: [{ driver: 'enso', phase: 'el_nino', source: 'x' }] })).toThrow(/onset_month/);
    expect(() => scenarioForYear(graph, { ...base, drivers: [{ driver: 'enso', phase: 'neutral', source: 'x' }, { driver: 'enso', phase: 'el_nino', onset_month: 5, source: 'x' }] })).toThrow(/twice/);
  });
});

describe('helpers', () => {
  it('monthsBetween and calendarAt agree, across years and backwards', () => {
    expect(monthsBetween({ year: 1997, month: 1 }, { year: 1997, month: 5 })).toBe(4);
    expect(monthsBetween({ year: 2001, month: 1 }, { year: 1998, month: 7 })).toBe(-30);
    expect(calendarAt(1997, 1, 4)).toEqual({ year: 1997, month: 5 });
    expect(calendarAt(1997, 5, 12)).toEqual({ year: 1998, month: 5 });
    expect(calendarAt(2001, 1, -30)).toEqual({ year: 1998, month: 7 });
    expect(calendarAt(2001, 1, -1)).toEqual({ year: 2000, month: 12 });
  });
  it('phaseOnset and phaseEnd read a row entry', () => {
    const r = row(1998);
    const enso = r.drivers.find((d) => d.driver === 'enso')!;
    expect(phaseOnset(r, enso)).toEqual({ year: 1998, month: 7 });
    expect(phaseEnd(r, enso)).toEqual({ year: 2001, month: 2 });
    const nao = row(1997).drivers.find((d) => d.driver === 'nao')!;
    expect(phaseOnset(row(1997), nao)).toBeNull();
    expect(phaseEnd(row(1997), nao)).toBeNull();
    const amo = row(2019).drivers.find((d) => d.driver === 'amo')!;
    expect(phaseOnset(row(2019), amo)).toEqual({ year: 2019, month: 1 });
    expect(phaseEnd(row(2019), amo)).toBeNull();
  });
});

describe('the validator (scripts/years-schema.mjs)', () => {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const sources = new Map(graph.sources.map((s) => [s.key, s]));
  const ok = (drivers: unknown[], year = 2000) => ({ years: [{ year, note: 'A made-up row for the validator tests.', sources: ['noaa_oni_index'], drivers }] });
  const errorsOf = (file: unknown) => {
    const parsed = YearsFile.safeParse(file);
    if (!parsed.success) return parsed.error.issues.map((i: { message: string }) => i.message);
    return checkYears(parsed.data, nodes, sources);
  };
  it('accepts the shipped table', () => {
    expect(errorsOf({ years: yearRows(graph) })).toEqual([]);
  });
  it('refuses an unknown driver, a non-driver, an unknown phase', () => {
    expect(errorsOf(ok([{ driver: 'moon', phase: 'full', onset_month: 1, source: 'noaa_oni_index' }]))).toEqual(['years.yaml: year 2000: unknown driver "moon"']);
    expect(errorsOf(ok([{ driver: 'indonesia_rainfall', phase: 'wet', onset_month: 1, source: 'noaa_oni_index' }]))).toEqual(['years.yaml: year 2000: "indonesia_rainfall" is not a driver']);
    expect(errorsOf(ok([{ driver: 'enso', phase: 'modoki', onset_month: 1, source: 'noaa_oni_index' }]))).toEqual(['years.yaml: year 2000: "modoki" is not a phase of "enso"']);
  });
  it('refuses a neutral phase with an onset and a real phase without one', () => {
    expect(errorsOf(ok([{ driver: 'enso', phase: 'neutral', onset_month: 5, source: 'noaa_oni_index' }]))).toEqual(['years.yaml: year 2000: enso is neutral, so it has no onset or duration']);
    expect(errorsOf(ok([{ driver: 'enso', phase: 'el_nino', source: 'noaa_oni_index' }]))).toEqual(['years.yaml: year 2000: enso in phase "el_nino" needs an onset_month']);
  });
  it('refuses an onset month out of range, a duration under one, an onset year not before the row', () => {
    expect(errorsOf(ok([{ driver: 'enso', phase: 'el_nino', onset_month: 13, source: 'noaa_oni_index' }])).length).toBeGreaterThan(0);
    expect(errorsOf(ok([{ driver: 'enso', phase: 'el_nino', onset_month: 5, duration_months: 0, source: 'noaa_oni_index' }])).length).toBeGreaterThan(0);
    expect(errorsOf(ok([{ driver: 'enso', phase: 'el_nino', onset_month: 5, onset_year: 2000, source: 'noaa_oni_index' }]))).toEqual(['years.yaml: year 2000: enso onset_year 2000 must be before 2000 (omit it for a phase that began this year)']);
  });
  it('refuses a driver twice, an unknown source, a year twice, years out of order', () => {
    expect(errorsOf(ok([{ driver: 'enso', phase: 'neutral', source: 'noaa_oni_index' }, { driver: 'enso', phase: 'el_nino', onset_month: 5, source: 'noaa_oni_index' }]))).toEqual(['years.yaml: year 2000: driver "enso" listed twice']);
    expect(errorsOf(ok([{ driver: 'enso', phase: 'neutral', source: 'nobody' }]))).toEqual(['years.yaml: year 2000: enso cites unknown source "nobody"']);
    const one = ok([{ driver: 'enso', phase: 'neutral', source: 'noaa_oni_index' }]).years[0];
    expect(errorsOf({ years: [one, one] })).toEqual(['years.yaml: year 2000: listed twice']);
    expect(errorsOf({ years: [{ ...one, year: 2001 }, one] })).toEqual(['years.yaml: year 2000: years must be in ascending order']);
    expect(errorsOf({ years: [{ ...one, sources: ['nobody'] }] })).toEqual(['years.yaml: year 2000: unknown source "nobody"']);
  });
});
