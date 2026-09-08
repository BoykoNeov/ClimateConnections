// The table of real years (M34): turns one row of data/years.yaml into a
// scenario the engine already understands (rule 8, any number of chosen
// drivers; rule 9, holds). Pure: no DOM, no Date. Nothing new is computed
// here; the only decisions are where month 0 sits and how each recorded
// phase is written as a chosen driver, and both are spelled out below.

import type { Graph, Scenario, ScenarioDriver, YearDriver, YearRow } from '../types';

export interface YearMonth { year: number; month: number }

/** Months from `a` to `b` (negative when `b` is earlier). */
export function monthsBetween(a: YearMonth, b: YearMonth): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** The calendar month `index` months after month 0 of a scenario that
 *  begins in `startMonth` of `startYear`; any index, negative included. */
export function calendarAt(startYear: number, startMonth: number, index: number): YearMonth {
  const n = startYear * 12 + (startMonth - 1) + index;
  return { year: Math.floor(n / 12), month: ((n % 12) + 12) % 12 + 1 };
}

export function yearRows(graph: Graph): YearRow[] {
  return graph.years ?? [];
}

export function yearRow(graph: Graph, year: number): YearRow | undefined {
  return yearRows(graph).find((r) => r.year === year);
}

/** When a recorded phase began: its onset month in its onset year (the
 *  row's year unless `onset_year` says earlier); null for a neutral phase. */
export function phaseOnset(row: YearRow, d: YearDriver): YearMonth | null {
  if (d.onset_month === undefined) return null;
  return { year: d.onset_year ?? row.year, month: d.onset_month };
}

/** The last month a recorded phase held, from its duration; null when the
 *  row gives no duration (the phase held at least to the end of the twelve
 *  months shown) or the phase is neutral. */
export function phaseEnd(row: YearRow, d: YearDriver): YearMonth | null {
  const onset = phaseOnset(row, d);
  if (!onset || d.duration_months === undefined) return null;
  return calendarAt(onset.year, onset.month, d.duration_months - 1);
}

/** How month 0 of a year's scenario was fixed. */
export type Anchor =
  /** January of the year: some recorded driver is neutral, or entered its phase in January */
  | 'january'
  /** the first onset of the year: nothing recorded holds a phase from January */
  | 'onset'
  /** an onset in an earlier year: nothing recorded holds a phase from
   *  January and a phase that began late in the year before covers more
   *  of the year than any onset in it (or, before 1980, nothing began in
   *  the year at all and ENSO's phase simply continued) */
  | 'earlier';

/** One recorded driver as the engine will read it. */
export interface PlacedDriver {
  driver: YearDriver;
  neutral: boolean;
  /** false for the rare entry the scenario leaves out: a phase that begins
   *  as the months shown end (see `approximations`) */
  placed: boolean;
  /** calendar onset; null for a neutral phase, pinned from month 0 */
  onset: YearMonth | null;
  /** month index of the onset as the record has it (0 for a neutral phase;
   *  may lie well below -12 for a phase years old) */
  recordOnset: number;
  /** month index the engine reads it at: 0 for the first driver and for a
   *  neutral phase, otherwise `chosenOnset` (an earlier start is read as at
   *  most twelve months before month 0, rule 8) */
  engineOnset: number;
  /** month index the phase ends in the record (onset + duration), or null
   *  when the row gives no duration */
  recordFade: number | null;
  /** month index the engine ends it at (rule 9), or null when it holds to
   *  the end of the months shown */
  engineFade: number | null;
}

export interface YearScenario {
  row: YearRow;
  /** the scenario: first driver, start month, holds and `others`; no
   *  `maxDepth` or `minConfidence` (those are the page's own settings) */
  scenario: Scenario;
  /** calendar year of month index 0 */
  startYear: number;
  anchor: Anchor;
  /** every recorded driver in row order, the first driver included */
  drivers: PlacedDriver[];
  /** drivers the engine cannot place exactly: a phase shown ending earlier
   *  or later than the record has it (a hold longer than twelve months from
   *  a start read as at most a year back), or one left out because it
   *  begins as the months shown end (`placed` false). The page says so. */
  approximations: PlacedDriver[];
}

/**
 * The scenario for one real year. Month 0 is January of the year whenever
 * the engine allows it: the first driver is the first recorded driver (row
 * order, ENSO first) that is neutral or entered its phase that January.
 * Failing that, month 0 is the onset, in the year or the year before, whose
 * twelve months cover most of the year (a tie goes to an onset in the year,
 * then to row order), that driver first. Every other
 * recorded driver is a chosen driver: a neutral phase pinned from month 0,
 * any other from its own month, read backwards (rule 8, `startsBefore`)
 * when it began before month 0. A duration becomes a hold (rule 9) when
 * the phase ends within the months shown; a duration that outlasts them is
 * dropped, which changes nothing the map draws. Drivers absent from the row
 * are not chosen: they are "not recorded", free to be pushed by a chain.
 */
export function scenarioForYear(graph: Graph, row: YearRow, horizon = 12): YearScenario {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  interface Info { d: YearDriver; neutral: boolean; onset: YearMonth | null }
  const info: Info[] = row.drivers.map((d) => {
    const node = nodeById.get(d.driver);
    if (!node || node.kind !== 'driver') throw new Error(`year ${row.year}: unknown driver "${d.driver}"`);
    const phase = node.phases.find((p) => p.id === d.phase);
    if (!phase) throw new Error(`year ${row.year}: "${d.phase}" is not a phase of "${d.driver}"`);
    const neutral = phase.value === 0;
    const onset = neutral ? null : phaseOnset(row, d);
    if (!neutral && !onset) throw new Error(`year ${row.year}: ${d.driver} in phase "${d.phase}" has no onset_month`);
    return { d, neutral, onset };
  });
  const seen = new Set<string>();
  for (const i of info) {
    if (seen.has(i.d.driver)) throw new Error(`year ${row.year}: driver "${i.d.driver}" listed twice`);
    seen.add(i.d.driver);
  }

  // Where month 0 sits, and which driver is the first.
  let first = info.find((i) => i.neutral || (i.onset!.year === row.year && i.onset!.month === 1));
  let anchor: Anchor = 'january';
  let start: YearMonth = { year: row.year, month: 1 };
  if (!first) {
    // No January anchor: month 0 is the onset, in the year or the year
    // before, whose twelve months cover most of the year (a tie goes to an
    // onset in the year, then to row order). An onset in the year from
    // month m covers 13 - m months of it; one in the year before, in month
    // m, covers m; anything earlier covers none.
    const coverage = (i: Info): number => {
      const o = i.onset!;
      return o.year === row.year ? 13 - o.month : o.year === row.year - 1 ? o.month : 0;
    };
    let best = info[0];
    for (const i of info) {
      const c = coverage(i);
      const b = coverage(best);
      if (c > b || (c === b && i.onset!.year === row.year && best.onset!.year !== row.year)) best = i;
    }
    first = best;
    start = first.onset!;
    anchor = start.year === row.year ? 'onset' : 'earlier';
  }

  const scenario: Scenario = { driverId: first.d.driver, phaseId: first.d.phase, startMonth: start.month, horizonMonths: horizon };
  const placed: PlacedDriver[] = [];
  const approximations: PlacedDriver[] = [];
  const others: ScenarioDriver[] = [];
  for (const i of info) {
    if (i === first) {
      const recordFade = i.neutral || i.d.duration_months === undefined ? null : i.d.duration_months;
      let engineFade: number | null = null;
      if (recordFade !== null && recordFade <= horizon) {
        scenario.holdMonths = recordFade;
        engineFade = recordFade;
      }
      placed.push({ driver: i.d, neutral: i.neutral, placed: true, onset: i.onset, recordOnset: 0, engineOnset: 0, recordFade, engineFade });
      continue;
    }
    const o: ScenarioDriver = { driverId: i.d.driver, phaseId: i.d.phase };
    let recordOnset = 0;
    let engineOnset = 0;
    let approximate = false;
    if (i.neutral) {
      // Pinned neutral for the whole of the months shown: onset 0.
      o.startMonth = start.month;
    } else {
      recordOnset = monthsBetween(start, i.onset!);
      if (recordOnset >= horizon) {
        // Begins as the months shown end (only possible when month 0 sits in
        // the year before): rule 8 cannot place it, so it is left out and
        // reported. Nothing of it would have been drawn anyway.
        const recordFade = i.d.duration_months === undefined ? null : recordOnset + i.d.duration_months;
        const p: PlacedDriver = { driver: i.d, neutral: false, placed: false, onset: i.onset, recordOnset, engineOnset: recordOnset, recordFade, engineFade: null };
        placed.push(p);
        approximations.push(p);
        continue;
      }
      o.startMonth = i.onset!.month;
      const after = (i.onset!.month - start.month + 12) % 12;
      if (recordOnset < 0) {
        o.startsBefore = true;
        engineOnset = after - 12;
      } else {
        engineOnset = after;
      }
    }
    let recordFade: number | null = null;
    let engineFade: number | null = null;
    if (!i.neutral && i.d.duration_months !== undefined) {
      recordFade = recordOnset + i.d.duration_months;
      if (recordFade <= engineOnset) {
        // Over before the start the engine reads: no month shown has the
        // phase either way, so a one-month hold says the same thing exactly.
        o.holdMonths = 1;
        engineFade = engineOnset + 1;
      } else if (recordFade <= horizon) {
        let hold = recordFade - engineOnset;
        if (hold > 12 && recordFade === horizon) {
          // Ends at the last month shown, and rule 9 cannot place that fade
          // from a start read a year back: held through, one month long at
          // the edge, not worth a warning.
          hold = 0;
        } else if (hold > 12) {
          // A phase older than a year at month 0 that ends inside the months
          // shown later than twelve months after its read-back start: rule 9
          // cannot place the fade. Take whichever is closer to the record:
          // the fade capped at twelve months (ends early) or no hold at all
          // (ends late), and say so.
          approximate = true;
          const early = recordFade - (engineOnset + 12);
          const late = horizon + 1 - recordFade;
          hold = early < late ? 12 : 0;
        }
        if (hold > 0) {
          o.holdMonths = hold;
          engineFade = engineOnset + hold;
        }
      }
    }
    others.push(o);
    const p: PlacedDriver = { driver: i.d, neutral: i.neutral, placed: true, onset: i.onset, recordOnset, engineOnset, recordFade, engineFade };
    placed.push(p);
    if (approximate) approximations.push(p);
  }
  if (others.length > 0) scenario.others = others;
  return { row, scenario, startYear: start.year, anchor, drivers: placed, approximations };
}
