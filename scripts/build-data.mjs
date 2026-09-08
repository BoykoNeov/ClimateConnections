// Validates data/nodes.yaml, data/links.yaml, data/stories.yaml and data/years.yaml and writes public/data/graph.json.
// Fails loudly on any schema error, unknown id, or missing source.
// Run: npm run build:data

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { z } from 'zod';
import { YearsFile, checkYears } from './years-schema.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => yaml.load(readFileSync(join(root, p), 'utf8'));

// ---------------------------------------------------------------- schema
const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are lowercase snake_case');
const Month = z.number().int().min(1).max(12);
const Confidence = z.enum(['established', 'probable', 'contested']);
const Axis = z.enum(['wet_dry', 'warm_cool', 'active_quiet', 'high_low']);

const Value = z.union([z.literal(1), z.literal(0), z.literal(-1)]);

const Phase = z.object({
  id: Id,
  label: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  summary: z.string().min(20),
  /** where the phase sits on the driver's own axis; a link into the driver
   *  with effect +1 / -1 pushes it into the phase with that value (M10) */
  value: Value,
  /** the phase this one is a variant of (M36, rule 11): another phase of
   *  the same driver with the same value; checked below the schema */
  variant_of: Id.optional(),
});

const NodeBase = z.object({
  id: Id,
  name: z.string().min(1),
  label: z.string().min(1).max(24).optional(),
  area: z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(3).optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  region: z.string().min(1),
  timescale: z.string().min(1),
  summary: z.string().min(20),
  sources: z.array(Id).optional().default([]),
});

const DriverNode = NodeBase.extend({
  kind: z.literal('driver'),
  /** one plain sentence shown under the start-month control: when events usually begin */
  onset_hint: z.string().min(20),
  /** calendar month the start-month control jumps to when this driver is picked */
  default_start_month: Month,
  /** [min, max] months a real event typically lasts (M32), each 1–12; the
   *  "Event lasts" control offers the middle of the range as "typical" */
  typical_duration_months: z.tuple([Month, Month]).refine(([a, b]) => a <= b, 'typical_duration_months[0] must be <= typical_duration_months[1]'),
  phases: z.array(Phase).min(2)
    // Values are unique among the phases that are not variants (rule 11); a
    // variant shares its parent's value, checked below the schema.
    .refine((ps) => { const main = ps.filter((p) => p.variant_of === undefined); return new Set(main.map((p) => p.value)).size === main.length; }, 'two phases share the same value')
    .refine((ps) => ps.some((p) => p.value === 0 && p.variant_of === undefined), 'a driver needs a neutral phase (value 0)')
    .refine((ps) => new Set(ps.map((p) => p.id)).size === ps.length, 'two phases share the same id'),
}).strict();

const OutcomeNode = NodeBase.extend({
  kind: z.literal('outcome'),
  axis: Axis,
  labels: z.object({ plus: z.string().min(1), zero: z.string().min(1), minus: z.string().min(1) }).strict(),
  global: z.boolean().optional().default(false),
}).strict();

/** An impact on people (M37, docs/PLAN.md §4 rule 12): reached from an
 *  outcome only, one hop further, with a sector from a fixed list. Not a
 *  region, so no area. */
const SECTORS = ['agriculture', 'health', 'water', 'energy', 'fisheries', 'fire', 'economy'];
const ImpactNode = NodeBase.omit({ area: true }).extend({
  kind: z.literal('impact'),
  axis: z.literal('more_less'),
  sector: z.enum(SECTORS),
  /** what more / near normal / less mean for this impact, in plain words */
  labels: z.object({ plus: z.string().min(1), zero: z.string().min(1), minus: z.string().min(1) }).strict(),
}).strict();

/** A seasonal feature (M41, docs/PLAN.md §4 rule 13): a fixture of the
 *  year's weather the links work through, drawn as an H or L (or a ring)
 *  in the months it is present. No axis, labels, phases or sector; no link
 *  starts or ends at it (checked below); every feature has a link through
 *  it (checked below). */
const FEATURE_SYMBOLS = ['high', 'low', 'vortex'];
const FeatureNode = NodeBase.extend({
  kind: z.literal('feature'),
  label: z.string().min(1).max(24),
  symbol: z.enum(FEATURE_SYMBOLS),
  /** calendar months it is present; empty = all year */
  months: z.array(Month).refine((s) => new Set(s).size === s.length, 'months has duplicates'),
}).strict();

const Node = z.discriminatedUnion('kind', [DriverNode, OutcomeNode, ImpactNode, FeatureNode]);

/** One driver whose chosen phase weakens a link by one confidence tier
 *  (M35, rule 10), with the studies that found the weakening. */
const Modulation = z.object({
  driver: Id,
  phase: Id,
  sources: z.array(Id).min(1, 'every weakened_by entry needs at least one source'),
}).strict();

const Link = z.object({
  id: Id,
  from: Id,
  when: Id,
  to: Id,
  effect: z.union([z.literal(1), z.literal(-1)]),
  lag_months: z.tuple([z.number().int().min(0).max(24), z.number().int().min(0).max(24)])
    .refine(([a, b]) => a <= b, 'lag_months[0] must be <= lag_months[1]'),
  season: z.array(Month).refine((s) => new Set(s).size === s.length, 'season has duplicates'),
  confidence: Confidence,
  mechanism: z.string().min(20),
  caveat: z.string().min(20),
  evidence_note: z.string().min(20).optional(),
  sources: z.array(Id).min(1, 'every link needs at least one source'),
  /** drivers whose chosen phase weakens this link (M35); the link must then
   *  carry an evidence_note that says so in plain words */
  weakened_by: z.array(Modulation).min(1).optional(),
  /** variants of the `when` phase for which the link does not hold (M36,
   *  rule 11); the link must then carry an evidence_note saying why */
  except: z.array(Id).min(1).optional(),
  /** the seasonal features the link works through (M41, rule 13); each
   *  must be a feature the link's own text names, checked below */
  via: z.array(Id).min(1).optional(),
}).strict()
  .refine((l) => l.via === undefined || new Set(l.via).size === l.via.length, 'via lists a feature twice')
  .refine((l) => l.weakened_by === undefined || l.evidence_note !== undefined, 'a link with weakened_by needs an evidence_note saying what weakens it')
  .refine((l) => l.except === undefined || l.evidence_note !== undefined, 'a link with except needs an evidence_note saying why the effect is not expected in that kind')
  .refine((l) => l.except === undefined || new Set(l.except).size === l.except.length, 'except lists a phase twice');

const Source = z.object({
  key: Id,
  citation: z.string().min(10),
  url: z.string().url().optional(),
}).strict();

// The app's timeline is 12 months long (HORIZON in src/main.ts).
const HORIZON = 12;

const StoryStep = z.object({
  month: z.number().int().min(0).max(HORIZON),
  focus: Id,
  text: z.string().min(40),
  sources: z.array(Id).min(1, 'every story step needs at least one source'),
}).strict();

/** One driver a story chooses by hand besides its own (M33): its phase, and
 *  optionally its own start month (M12), read backwards (M15) and its hold (M32). */
const StoryDriver = z.object({
  driver: Id,
  phase: Id,
  /** calendar month the driver enters its phase; defaults to the story's start_month */
  start_month: Month.optional(),
  /** the driver began before the story's own: start_month is read backwards, so
   *  the driver is already in its phase at month 0 */
  starts_before: z.boolean().optional(),
  /** how many months (1–12) it holds its phase, from its own onset; omitted = the whole year shown */
  hold_months: Month.optional(),
}).strict();

const SECOND_FIELDS = ['second_driver', 'second_phase', 'second_start_month', 'second_starts_before', 'second_hold_months'];

const Story = z.object({
  id: Id,
  title: z.string().min(3),
  intro: z.string().min(20),
  driver: Id,
  phase: Id,
  start_month: Month,
  start_year: z.number().int().min(1800).max(2100).optional(),
  /** how many months (1–12) the story's own driver holds its phase (M32); omitted = the whole year shown */
  hold_months: Month.optional(),
  /** the other drivers chosen by hand for the whole story (M11, any number since M33) */
  drivers: z.array(StoryDriver).optional(),
  /** the story points at an impact on people (M37): the impacts layer is
   *  turned on when it starts; only such a story may focus an impact node */
  impacts: z.boolean().optional(),
  /** the story points at a seasonal feature (M41): the features layer is
   *  turned on when it starts; only such a story may focus a feature */
  features: z.boolean().optional(),
  /** the pre-M33 spelling of a one-element `drivers` list, accepted for one
   *  milestone and written into `drivers` below: a second driver chosen by
   *  hand (M11; both or neither), its own start month (M12), read backwards
   *  (M15) and its hold (M32). */
  second_driver: Id.optional(),
  second_phase: Id.optional(),
  second_start_month: Month.optional(),
  second_starts_before: z.boolean().optional(),
  second_hold_months: Month.optional(),
  steps: z.array(StoryStep).min(3),
}).strict()
  .refine((s) => (s.second_driver === undefined) === (s.second_phase === undefined), 'second_driver and second_phase go together')
  .refine((s) => s.second_start_month === undefined || s.second_driver !== undefined, 'second_start_month needs a second_driver')
  .refine((s) => s.second_starts_before === undefined || s.second_driver !== undefined, 'second_starts_before needs a second_driver')
  .refine((s) => s.second_hold_months === undefined || s.second_driver !== undefined, 'second_hold_months needs a second_driver')
  .refine((s) => s.drivers === undefined || s.second_driver === undefined, 'drivers and second_driver cannot both be given: write the second driver as the first entry of drivers')
  .transform((s) => {
    // Normalise: the app and graph.json know only `drivers`.
    if (s.second_driver === undefined) return s;
    const d = { driver: s.second_driver, phase: s.second_phase };
    if (s.second_start_month !== undefined) d.start_month = s.second_start_month;
    if (s.second_starts_before !== undefined) d.starts_before = s.second_starts_before;
    if (s.second_hold_months !== undefined) d.hold_months = s.second_hold_months;
    const out = { ...s, drivers: [d] };
    for (const k of SECOND_FIELDS) delete out[k];
    return out;
  });

const NodesFile = z.object({ nodes: z.array(Node).min(1) }).strict();
const LinksFile = z.object({ links: z.array(Link).min(1), sources: z.array(Source).min(1) }).strict();
const StoriesFile = z.object({ stories: z.array(Story).min(1) }).strict();

// ---------------------------------------------------------------- load + validate
const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);

function parse(schema, data, label) {
  const r = schema.safeParse(data);
  if (!r.success) {
    for (const issue of r.error.issues) fail(`${label}: ${issue.path.join('.')}: ${issue.message}`);
    return null;
  }
  return r.data;
}

const nodesFile = parse(NodesFile, read('data/nodes.yaml'), 'nodes.yaml');
const linksFile = parse(LinksFile, read('data/links.yaml'), 'links.yaml');
const storiesFile = parse(StoriesFile, read('data/stories.yaml'), 'stories.yaml');
const yearsFile = parse(YearsFile, read('data/years.yaml'), 'years.yaml');

if (nodesFile && linksFile && storiesFile && yearsFile) {
  const nodes = new Map();
  for (const n of nodesFile.nodes) {
    if (nodes.has(n.id)) fail(`nodes.yaml: duplicate node id "${n.id}"`);
    nodes.set(n.id, n);
  }
  const sources = new Map();
  for (const s of linksFile.sources) {
    if (sources.has(s.key)) fail(`links.yaml: duplicate source key "${s.key}"`);
    sources.set(s.key, s);
  }
  const usedSources = new Set();
  for (const n of nodesFile.nodes) {
    for (const k of n.sources) {
      if (!sources.has(k)) fail(`nodes.yaml: node "${n.id}" cites unknown source "${k}"`);
      usedSources.add(k);
    }
    // Phase variants (M36, rule 11): the parent is another phase of the same
    // driver, not itself a variant, with the same value.
    if (n.kind !== 'driver') continue;
    for (const p of n.phases) {
      if (p.variant_of === undefined) continue;
      const parent = n.phases.find((q) => q.id === p.variant_of);
      if (!parent) fail(`node "${n.id}": phase "${p.id}" is a variant of unknown phase "${p.variant_of}"`);
      else if (parent.id === p.id) fail(`node "${n.id}": phase "${p.id}" cannot be a variant of itself`);
      else if (parent.variant_of !== undefined) fail(`node "${n.id}": phase "${p.id}" is a variant of "${parent.id}", which is itself a variant`);
      else if (parent.value !== p.value) fail(`node "${n.id}": variant "${p.id}" has value ${p.value} but its parent "${parent.id}" has ${parent.value}`);
    }
  }
  /** Whether a link fires for a driver holding `phaseId` (rule 11): its own
   *  phase, or the parent of a variant that the link does not except. */
  const firesFor = (l, driverId, phaseId) => {
    if (l.from !== driverId) return false;
    if (l.when === phaseId) return true;
    const d = nodes.get(driverId);
    const parent = d?.kind === 'driver' ? d.phases.find((p) => p.id === phaseId)?.variant_of : undefined;
    return parent !== undefined && l.when === parent && !(l.except ?? []).includes(phaseId);
  };
  /** The phase a driver is pushed into for an effect: never a variant (rule 11). */
  const pushedPhase = (d, effect) => d.phases.find((p) => p.value === effect && p.variant_of === undefined);

  const linkIds = new Set();
  // Flags absolute language unless it is negated ("not always", "does not guarantee").
  const banned = /(?<!\bnot\s)(?<!\bnever\s)\b(will|always|causes|guarantees)\b/i;
  for (const l of linksFile.links) {
    if (linkIds.has(l.id)) fail(`links.yaml: duplicate link id "${l.id}"`);
    linkIds.add(l.id);
    const from = nodes.get(l.from);
    const to = nodes.get(l.to);
    if (!from) fail(`link "${l.id}": unknown from node "${l.from}"`);
    else if (from.kind === 'impact') fail(`link "${l.id}": an impact cannot have outgoing links ("${l.from}")`);
    else if (from.kind === 'feature') fail(`link "${l.id}": a seasonal feature cannot have outgoing links ("${l.from}", rule 13); a link names the features it works through in via`);
    else if (from.kind === 'outcome') {
      // An impact link (M37, rule 12): from an outcome, into an impact,
      // `when` naming the outcome's state; never weakened, never excepted.
      if (!['plus', 'minus'].includes(l.when)) fail(`link "${l.id}": a link from the outcome "${l.from}" needs when: plus or minus, got "${l.when}"`);
      if (to && to.kind !== 'impact') fail(`link "${l.id}": a link from an outcome can only point at an impact, not at "${l.to}" (${to.kind})`);
      if (l.weakened_by !== undefined) fail(`link "${l.id}": an impact link cannot have weakened_by`);
      if (l.except !== undefined) fail(`link "${l.id}": an impact link cannot have except`);
      // Its season must overlap the season of some link into its outcome,
      // or the impact could never be drawn.
      if (l.season.length > 0 && !linksFile.links.some((u) => u.to === l.from && (u.season.length === 0 || u.season.some((m) => l.season.includes(m))))) fail(`link "${l.id}": its season shares no month with any link into "${l.from}", so it could never be drawn`);
    }
    else if (!from.phases.some((p) => p.id === l.when)) fail(`link "${l.id}": "${l.when}" is not a phase of "${l.from}"`);
    if (!to) fail(`link "${l.id}": unknown to node "${l.to}"`);
    else if (to.kind === 'feature') fail(`link "${l.id}": a link cannot point at the seasonal feature "${l.to}" (rule 13); name it in via instead`);
    else if (to.kind === 'impact' && from && from.kind === 'driver') fail(`link "${l.id}": a driver cannot point at an impact; impacts follow from outcomes (rule 12)`);
    else if (to.kind === 'driver') {
      // Driver-to-driver (M10): the effect must name a phase of the target
      // that is not a variant (rule 11: a push lands on the parent).
      if (to.id === l.from) fail(`link "${l.id}": a driver cannot push itself`);
      else if (!pushedPhase(to, l.effect)) fail(`link "${l.id}": driver "${l.to}" has no phase with value ${l.effect} that is not a variant`);
    }
    // Phase variants (M36, rule 11): `except` names variants of the link's
    // own phase, and a link of a variant phase cannot except anything.
    if (from && from.kind === 'driver') {
      const when = from.phases.find((p) => p.id === l.when);
      if (l.except !== undefined && when?.variant_of !== undefined) fail(`link "${l.id}": a link of the variant phase "${l.when}" cannot have except`);
      for (const x of l.except ?? []) {
        const v = from.phases.find((p) => p.id === x);
        if (!v) fail(`link "${l.id}": except names unknown phase "${x}" of "${l.from}"`);
        else if (v.variant_of !== l.when) fail(`link "${l.id}": except names "${x}", which is not a variant of "${l.when}"`);
      }
    }
    for (const k of l.sources) {
      if (!sources.has(k)) fail(`link "${l.id}": unknown source "${k}"`);
      usedSources.add(k);
    }
    // Seasonal features (M41, rule 13): each `via` entry is a feature that
    // the link's own text names, so via is never a claim the text does not
    // make; never on an impact link; a season the feature is there for.
    if (l.via !== undefined) {
      if (from && from.kind === 'outcome') fail(`link "${l.id}": an impact link cannot have via`);
      const text = [l.mechanism, l.caveat, l.evidence_note ?? ''].join(' ').toLowerCase();
      for (const v of l.via) {
        const f = nodes.get(v);
        if (!f) { fail(`link "${l.id}": via names unknown node "${v}"`); continue; }
        if (f.kind !== 'feature') { fail(`link "${l.id}": via names "${v}", which is ${f.kind === 'driver' ? 'a driver' : f.kind === 'outcome' ? 'a place' : 'an impact'}, not a seasonal feature`); continue; }
        if (!text.includes(f.label.toLowerCase())) fail(`link "${l.id}": via names "${v}" but neither the mechanism, the caveat nor the evidence note names "${f.label}"`);
        if (l.season.length > 0 && f.months.length > 0 && !l.season.some((m) => f.months.includes(m))) fail(`link "${l.id}": its season shares no month with the months of "${v}", so it could never be drawn through it`);
      }
    }
    // Modulation (M35, rule 10): the weakening driver exists, has that
    // phase, is not the link's own driver, no pair twice, sources resolve.
    const pairs = new Set();
    for (const w of l.weakened_by ?? []) {
      const m = nodes.get(w.driver);
      if (!m) fail(`link "${l.id}": weakened_by names unknown driver "${w.driver}"`);
      else if (m.kind !== 'driver') fail(`link "${l.id}": weakened_by "${w.driver}" is not a driver`);
      else if (!m.phases.some((p) => p.id === w.phase)) fail(`link "${l.id}": "${w.phase}" is not a phase of "${w.driver}"`);
      else if (m.id === l.from) fail(`link "${l.id}": a link cannot be weakened by its own driver "${l.from}"`);
      const key = `${w.driver}|${w.phase}`;
      if (pairs.has(key)) fail(`link "${l.id}": weakened_by lists ${w.driver}/${w.phase} twice`);
      pairs.add(key);
      for (const k of w.sources) {
        if (!sources.has(k)) fail(`link "${l.id}": weakened_by cites unknown source "${k}"`);
        usedSources.add(k);
      }
    }
    for (const field of ['mechanism', 'caveat']) {
      const m = l[field].match(banned);
      if (m) warnings.push(`link "${l.id}": ${field} uses "${m[0]}"; prefer tendency language ("tends to")`);
    }
  }
  const dup = new Set();
  for (const l of linksFile.links) {
    const key = `${l.from}|${l.when}|${l.to}`;
    if (dup.has(key)) fail(`links.yaml: two links from ${l.from}/${l.when} to ${l.to} (${l.id})`);
    dup.add(key);
  }
  // Rule 12: every impact has at least one link into it, from an outcome.
  for (const n of nodesFile.nodes) {
    if (n.kind === 'impact' && !linksFile.links.some((l) => l.to === n.id)) fail(`nodes.yaml: impact "${n.id}" has no link into it`);
  }
  // Rule 13: every seasonal feature has at least one link through it.
  for (const n of nodesFile.nodes) {
    if (n.kind === 'feature' && !linksFile.links.some((l) => (l.via ?? []).includes(n.id))) fail(`nodes.yaml: feature "${n.id}" has no link through it (no link lists it in via)`);
  }
  // Rule 11: a target reached by a driver in a variant phase and in the
  // parent phase must be excepted on the parent link, so it is never
  // reached twice by one driver in one phase.
  for (const l of linksFile.links) {
    const from = nodes.get(l.from);
    const when = from?.kind === 'driver' ? from.phases.find((p) => p.id === l.when) : undefined;
    if (!when || when.variant_of === undefined) continue;
    const parentLink = linksFile.links.find((m) => m.from === l.from && m.when === when.variant_of && m.to === l.to);
    if (parentLink && !(parentLink.except ?? []).includes(l.when)) fail(`link "${l.id}": "${parentLink.id}" reaches the same target in the parent phase "${when.variant_of}" and must list "${l.when}" in except`);
  }
  // ---- stories: scenario must exist, every step must point at a node that
  // is genuinely affected in that month (same rule as the engine: past the
  // minimum lag and in season, directly from a chosen driver or through one
  // driver a chosen driver has pushed; a chosen driver is never pushed), and
  // every step must cite a source. This is a copy of the engine rule without
  // sum-and-clamp; src/engine/stories.test.ts runs the real engine over the
  // same stories.
  const calendarMonth = (start, index) => ((start - 1 + index) % 12) + 1;
  const links = linksFile.links;
  /** A link from a driver that entered its phase at `onsetIdx` is applied at
   *  month `m` if its lag has run, its season includes the month and (M32)
   *  the driver's phase has not ended: `fade` is the month index it ends,
   *  or null for the whole year. */
  const appliedAt = (l, onsetIdx, m, start, fade = null) =>
    m >= onsetIdx + l.lag_months[0] && (fade === null || m < fade) && (l.season.length === 0 || l.season.includes(calendarMonth(start, m)));
  /** The drivers a story fixes by hand: [driverId, phaseId, onset month
   *  index, fade month index or null] for the main one (onset 0) and each
   *  of the others (M11; any number since M33), which enters its phase at
   *  month 0 or in its own start month (M12), read within the twelve months
   *  shown, or backwards from the start (M15: a negative onset, already in
   *  phase at month 0). The fade (M32) is the onset plus the story's hold
   *  for that driver. */
  const chosenOf = (s) => {
    const out = [[s.driver, s.phase, 0, s.hold_months === undefined ? null : s.hold_months]];
    for (const d of s.drivers ?? []) {
      const after = ((d.start_month ?? s.start_month) - s.start_month + 12) % 12;
      const onset = d.starts_before ? after - 12 : after;
      out.push([d.driver, d.phase, onset, d.hold_months === undefined ? null : onset + d.hold_months]);
    }
    return out;
  };
  /** Drivers pushed into a phase at month m: [driverId, phaseId, onset month]. */
  const pushedAt = (s, m) => {
    const out = [];
    const chosenIds = new Set(chosenOf(s).map(([d]) => d));
    for (const [cd, cp, co, cf] of chosenOf(s)) {
      for (const l of links) {
        if (!firesFor(l, cd, cp)) continue;
        const d = nodes.get(l.to);
        if (!d || d.kind !== 'driver' || chosenIds.has(d.id) || !appliedAt(l, co, m, s.start_month, cf)) continue;
        let onsetIdx = co;
        while (onsetIdx < m && !appliedAt(l, co, onsetIdx, s.start_month, cf)) onsetIdx++;
        const phase = pushedPhase(d, l.effect);
        if (phase) out.push([d.id, phase.id, onsetIdx]);
      }
    }
    return out;
  };
  const affectedAt = (s, focusId, m) => {
    if (chosenOf(s).some(([cd, cp, co, cf]) => links.some((l) => firesFor(l, cd, cp) && l.to === focusId && appliedAt(l, co, m, s.start_month, cf)))) return true;
    return pushedAt(s, m).some(([d, p, onsetIdx]) =>
      links.some((l) => firesFor(l, d, p) && l.to === focusId && appliedAt(l, onsetIdx, m, s.start_month)));
  };
  /** Rule 12 (M37): an outcome is affected with a given sign at month m
   *  (some link into it with that effect applied; the copy has no
   *  sum-and-clamp, so an opposite link is not subtracted). */
  const affectedWithSign = (s, outcomeId, effect, m) => {
    const hit = (l, onsetIdx, fade) => l.to === outcomeId && l.effect === effect && appliedAt(l, onsetIdx, m, s.start_month, fade);
    if (chosenOf(s).some(([cd, cp, co, cf]) => links.some((l) => firesFor(l, cd, cp) && hit(l, co, cf)))) return true;
    return pushedAt(s, m).some(([d, p, onsetIdx]) => links.some((l) => firesFor(l, d, p) && hit(l, onsetIdx, null)));
  };
  /** Rule 12: an impact is affected at month m when some impact link into
   *  it follows from an outcome holding the named state that month, the
   *  lag from the outcome's first month in that state has run, and the
   *  month is in the link's season. */
  const impactAffectedAt = (s, focusId, m) =>
    links.some((l) => {
      if (l.to !== focusId) return false;
      const from = nodes.get(l.from);
      if (!from || from.kind !== 'outcome') return false;
      const effect = l.when === 'plus' ? 1 : -1;
      if (!affectedWithSign(s, l.from, effect, m)) return false;
      let onsetIdx = 0;
      while (onsetIdx < m && !affectedWithSign(s, l.from, effect, onsetIdx)) onsetIdx++;
      return m >= onsetIdx + l.lag_months[0] && (l.season.length === 0 || l.season.includes(calendarMonth(s.start_month, m)));
    });
  /** Rule 13 (M41): an applied link at month m, from a chosen driver or a
   *  driver one has pushed, lists the feature in `via`, so the feature is
   *  drawn filled that month. */
  const throughAt = (s, featureId, m) => {
    const lists = (l) => (l.via ?? []).includes(featureId);
    if (chosenOf(s).some(([cd, cp, co, cf]) => links.some((l) => firesFor(l, cd, cp) && lists(l) && appliedAt(l, co, m, s.start_month, cf)))) return true;
    return pushedAt(s, m).some(([d, p, onsetIdx]) => links.some((l) => firesFor(l, d, p) && lists(l) && appliedAt(l, onsetIdx, m, s.start_month)));
  };
  /** Rule 11: a place that a parent link excepted for a chosen variant would
   *  have reached this month, so a story can point at what did not happen. */
  const exceptedAt = (s, focusId, m) =>
    chosenOf(s).some(([cd, cp, co, cf]) => {
      const d = nodes.get(cd);
      const parent = d?.kind === 'driver' ? d.phases.find((p) => p.id === cp)?.variant_of : undefined;
      return parent !== undefined && links.some((l) => l.from === cd && l.when === parent && (l.except ?? []).includes(cp) && l.to === focusId && appliedAt(l, co, m, s.start_month, cf));
    });
  const storyIds = new Set();
  for (const s of storiesFile.stories) {
    if (storyIds.has(s.id)) fail(`stories.yaml: duplicate story id "${s.id}"`);
    storyIds.add(s.id);
    const driver = nodes.get(s.driver);
    if (!driver) { fail(`story "${s.id}": unknown driver "${s.driver}"`); continue; }
    if (driver.kind !== 'driver') { fail(`story "${s.id}": "${s.driver}" is not a driver`); continue; }
    if (!driver.phases.some((p) => p.id === s.phase)) fail(`story "${s.id}": "${s.phase}" is not a phase of "${s.driver}"`);
    // The other chosen drivers (M33): each a driver, none the story's own,
    // none twice (the engine throws on a repeat; the validator says it first).
    let badDrivers = false;
    const seenDrivers = new Set([s.driver]);
    for (const d of s.drivers ?? []) {
      const other = nodes.get(d.driver);
      if (!other) { fail(`story "${s.id}": unknown chosen driver "${d.driver}"`); badDrivers = true; continue; }
      if (other.kind !== 'driver') { fail(`story "${s.id}": chosen driver "${d.driver}" is not a driver`); badDrivers = true; continue; }
      if (seenDrivers.has(other.id)) { fail(`story "${s.id}": driver "${other.id}" is chosen twice`); badDrivers = true; continue; }
      seenDrivers.add(other.id);
      if (!other.phases.some((p) => p.id === d.phase)) fail(`story "${s.id}": "${d.phase}" is not a phase of "${d.driver}"`);
    }
    if (badDrivers) continue;
    const chosenIds = new Set(chosenOf(s).map(([d]) => d));
    let lastMonth = -1;
    s.steps.forEach((step, i) => {
      const where = `story "${s.id}" step ${i + 1}`;
      if (step.month < lastMonth) fail(`${where}: month ${step.month} goes backwards (previous step was month ${lastMonth})`);
      lastMonth = step.month;
      const focus = nodes.get(step.focus);
      if (!focus) { fail(`${where}: unknown focus node "${step.focus}"`); return; }
      if (focus.kind === 'feature') {
        // Rule 13: only a story that turns the features layer on may point
        // at a feature, and an arrow drawn that month must work through it.
        if (!s.features) fail(`${where}: "${step.focus}" is a seasonal feature, so the story needs features: true`);
        else if (!throughAt(s, step.focus, step.month)) fail(`${where}: no arrow drawn at month ${step.month} (calendar month ${calendarMonth(s.start_month, step.month)}) works through "${step.focus}"; the feature would be hollow`);
      } else if (focus.kind === 'impact') {
        // Rule 12: only a story that turns the impacts layer on may point
        // at an impact, and it must be reached that month.
        if (!s.impacts) fail(`${where}: "${step.focus}" is an impact on people, so the story needs impacts: true`);
        else if (!impactAffectedAt(s, step.focus, step.month)) fail(`${where}: the impact "${step.focus}" is not reached at month ${step.month} (calendar month ${calendarMonth(s.start_month, step.month)}); the square would be hollow`);
      } else if (!chosenIds.has(focus.id) && !affectedAt(s, step.focus, step.month) && !exceptedAt(s, step.focus, step.month)) {
        const cal = calendarMonth(s.start_month, step.month);
        const by = chosenOf(s).map(([d, p]) => `${d}/${p}`).join(' or ');
        fail(`${where}: "${step.focus}" is not affected by ${by} at month ${step.month} (calendar month ${cal}), directly or through a pushed driver; the marker would be ${focus.kind === 'driver' ? 'grey' : 'hollow'}`);
      }
      for (const k of step.sources) {
        if (!sources.has(k)) fail(`${where}: unknown source "${k}"`);
        usedSources.add(k);
      }
    });
  }

  // ---- years (M34): the table of real years. Every driver and phase must
  // exist, a neutral phase has no onset, every other phase has one, no driver
  // twice, every source resolves. scripts/years-schema.mjs holds the rules so
  // src/engine/years.test.ts can run them too.
  for (const e of checkYears(yearsFile, nodes, sources, usedSources)) fail(e);

  for (const k of sources.keys()) if (!usedSources.has(k)) warnings.push(`source "${k}" is never cited`);

  if (errors.length === 0) {
    const graph = {
      generatedFrom: ['data/nodes.yaml', 'data/links.yaml', 'data/stories.yaml', 'data/years.yaml'],
      nodes: nodesFile.nodes,
      links: linksFile.links,
      sources: linksFile.sources,
      stories: storiesFile.stories,
      years: yearsFile.years,
    };
    mkdirSync(join(root, 'public/data'), { recursive: true });
    writeFileSync(join(root, 'public/data/graph.json'), JSON.stringify(graph, null, 2) + '\n');
    const impacts = graph.nodes.filter((n) => n.kind === 'impact').length;
    const features = graph.nodes.filter((n) => n.kind === 'feature').length;
    console.log(`graph.json: ${graph.nodes.length} nodes (${impacts} impacts on people, ${features} seasonal features), ${graph.links.length} links, ${graph.sources.length} sources, ${graph.stories.length} stories, ${graph.years.length} years`);
  }
}

for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} error(s). public/data/graph.json NOT written.`);
  process.exit(1);
}
