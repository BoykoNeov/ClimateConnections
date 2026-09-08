// Schema and checks for data/years.yaml (M34): the table of real years.
// Imported by scripts/build-data.mjs and by src/engine/years.test.ts, so the
// validator's refusals are tested like the engine.

import { z } from 'zod';

const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are lowercase snake_case');
const Month = z.number().int().min(1).max(12);

/** One driver's phase in one year, read from an index dataset. */
export const YearDriver = z.object({
  driver: Id,
  phase: Id,
  /** calendar month the phase began; required unless the phase is neutral */
  onset_month: Month.optional(),
  /** the year it began, when that is before the row's year (already under way) */
  onset_year: z.number().int().min(1800).max(2100).optional(),
  /** how many months the phase held from its onset, uncapped; omitted = at
   *  least to the end of the twelve months the map shows */
  duration_months: z.number().int().min(1).optional(),
  /** what the index did, in one sentence */
  index_note: z.string().min(10).optional(),
  /** the index dataset, a source key whose citation states the threshold rule */
  source: Id,
}).strict();

export const Year = z.object({
  year: z.number().int().min(1800).max(2100),
  /** one to three plain sentences on what the year was like */
  note: z.string().min(20),
  sources: z.array(Id).min(1, 'every year needs at least one source'),
  drivers: z.array(YearDriver).min(1, 'a year needs at least one driver'),
}).strict();

export const YearsFile = z.object({ years: z.array(Year).min(1) }).strict();

/**
 * Cross-checks after the schema: every driver and phase exists, a neutral
 * phase has no onset, any other phase has one, an earlier onset year is
 * earlier, no driver twice in a year, years unique and ascending, every
 * source resolves. `nodes` and `sources` are Maps by id/key; `usedSources`
 * collects the keys cited. Returns the error messages.
 */
export function checkYears(yearsFile, nodes, sources, usedSources = new Set()) {
  const errors = [];
  const fail = (m) => errors.push(m);
  const seenYears = new Set();
  let lastYear = -Infinity;
  for (const y of yearsFile.years) {
    const where = `years.yaml: year ${y.year}`;
    if (seenYears.has(y.year)) fail(`${where}: listed twice`);
    seenYears.add(y.year);
    if (y.year < lastYear) fail(`${where}: years must be in ascending order`);
    lastYear = y.year;
    for (const k of y.sources) {
      if (!sources.has(k)) fail(`${where}: unknown source "${k}"`);
      usedSources.add(k);
    }
    const seenDrivers = new Set();
    for (const d of y.drivers) {
      const node = nodes.get(d.driver);
      if (!node) { fail(`${where}: unknown driver "${d.driver}"`); continue; }
      if (node.kind !== 'driver') { fail(`${where}: "${d.driver}" is not a driver`); continue; }
      if (seenDrivers.has(d.driver)) fail(`${where}: driver "${d.driver}" listed twice`);
      seenDrivers.add(d.driver);
      const phase = node.phases.find((p) => p.id === d.phase);
      if (!phase) { fail(`${where}: "${d.phase}" is not a phase of "${d.driver}"`); continue; }
      if (phase.value === 0) {
        if (d.onset_month !== undefined || d.onset_year !== undefined || d.duration_months !== undefined) fail(`${where}: ${d.driver} is neutral, so it has no onset or duration`);
      } else if (d.onset_month === undefined) {
        fail(`${where}: ${d.driver} in phase "${d.phase}" needs an onset_month`);
      }
      if (d.onset_year !== undefined && d.onset_year >= y.year) fail(`${where}: ${d.driver} onset_year ${d.onset_year} must be before ${y.year} (omit it for a phase that began this year)`);
      if (!sources.has(d.source)) fail(`${where}: ${d.driver} cites unknown source "${d.source}"`);
      usedSources.add(d.source);
    }
  }
  return errors;
}
