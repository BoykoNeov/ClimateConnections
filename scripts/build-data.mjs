// Validates data/nodes.yaml, data/links.yaml and data/stories.yaml and writes public/data/graph.json.
// Fails loudly on any schema error, unknown id, or missing source.
// Run: npm run build:data

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { z } from 'zod';

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
  phases: z.array(Phase).min(2)
    .refine((ps) => new Set(ps.map((p) => p.value)).size === ps.length, 'two phases share the same value')
    .refine((ps) => ps.some((p) => p.value === 0), 'a driver needs a neutral phase (value 0)'),
}).strict();

const OutcomeNode = NodeBase.extend({
  kind: z.literal('outcome'),
  axis: Axis,
  labels: z.object({ plus: z.string().min(1), zero: z.string().min(1), minus: z.string().min(1) }).strict(),
  global: z.boolean().optional().default(false),
}).strict();

const Node = z.discriminatedUnion('kind', [DriverNode, OutcomeNode]);

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
}).strict();

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

const Story = z.object({
  id: Id,
  title: z.string().min(3),
  intro: z.string().min(20),
  driver: Id,
  phase: Id,
  start_month: Month,
  start_year: z.number().int().min(1800).max(2100).optional(),
  /** a second driver chosen by hand for the whole story (M11); both or neither */
  second_driver: Id.optional(),
  second_phase: Id.optional(),
  /** calendar month the second driver enters its phase (M12); defaults to start_month */
  second_start_month: Month.optional(),
  /** the second driver began before the first (M15): second_start_month is read
   *  backwards from start_month, so the driver is already in its phase at month 0 */
  second_starts_before: z.boolean().optional(),
  steps: z.array(StoryStep).min(3),
}).strict()
  .refine((s) => (s.second_driver === undefined) === (s.second_phase === undefined), 'second_driver and second_phase go together')
  .refine((s) => s.second_start_month === undefined || s.second_driver !== undefined, 'second_start_month needs a second_driver')
  .refine((s) => s.second_starts_before === undefined || s.second_driver !== undefined, 'second_starts_before needs a second_driver');

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

if (nodesFile && linksFile && storiesFile) {
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
  }

  const linkIds = new Set();
  // Flags absolute language unless it is negated ("not always", "does not guarantee").
  const banned = /(?<!\bnot\s)(?<!\bnever\s)\b(will|always|causes|guarantees)\b/i;
  for (const l of linksFile.links) {
    if (linkIds.has(l.id)) fail(`links.yaml: duplicate link id "${l.id}"`);
    linkIds.add(l.id);
    const from = nodes.get(l.from);
    const to = nodes.get(l.to);
    if (!from) fail(`link "${l.id}": unknown from node "${l.from}"`);
    else if (from.kind !== 'driver') fail(`link "${l.id}": from node "${l.from}" is not a driver`);
    else if (!from.phases.some((p) => p.id === l.when)) fail(`link "${l.id}": "${l.when}" is not a phase of "${l.from}"`);
    if (!to) fail(`link "${l.id}": unknown to node "${l.to}"`);
    else if (to.kind === 'driver') {
      // Driver-to-driver (M10): the effect must name a phase of the target.
      if (to.id === l.from) fail(`link "${l.id}": a driver cannot push itself`);
      else if (!to.phases.some((p) => p.value === l.effect)) fail(`link "${l.id}": driver "${l.to}" has no phase with value ${l.effect}`);
    }
    for (const k of l.sources) {
      if (!sources.has(k)) fail(`link "${l.id}": unknown source "${k}"`);
      usedSources.add(k);
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
  // ---- stories: scenario must exist, every step must point at a node that
  // is genuinely affected in that month (same rule as the engine: past the
  // minimum lag and in season, directly from a chosen driver or through one
  // driver a chosen driver has pushed; a chosen driver is never pushed), and
  // every step must cite a source. This is a copy of the engine rule without
  // sum-and-clamp; src/engine/stories.test.ts runs the real engine over the
  // same stories.
  const calendarMonth = (start, index) => ((start - 1 + index) % 12) + 1;
  const links = linksFile.links;
  const appliedAt = (l, onsetIdx, m, start) =>
    m >= onsetIdx + l.lag_months[0] && (l.season.length === 0 || l.season.includes(calendarMonth(start, m)));
  /** The drivers a story fixes by hand: [driverId, phaseId, onset month index]
   *  for the main one (onset 0) and, if any, the second (M11), which enters
   *  its phase at month 0 or in its own start month (M12), read within the
   *  twelve months shown, or backwards from the start (M15: a negative onset,
   *  already in phase at month 0). */
  const chosenOf = (s) => {
    const out = [[s.driver, s.phase, 0]];
    if (s.second_driver) {
      const after = ((s.second_start_month ?? s.start_month) - s.start_month + 12) % 12;
      out.push([s.second_driver, s.second_phase, s.second_starts_before ? after - 12 : after]);
    }
    return out;
  };
  /** Drivers pushed into a phase at month m: [driverId, phaseId, onset month]. */
  const pushedAt = (s, m) => {
    const out = [];
    const chosenIds = new Set(chosenOf(s).map(([d]) => d));
    for (const [cd, cp, co] of chosenOf(s)) {
      for (const l of links) {
        if (l.from !== cd || l.when !== cp) continue;
        const d = nodes.get(l.to);
        if (!d || d.kind !== 'driver' || chosenIds.has(d.id) || !appliedAt(l, co, m, s.start_month)) continue;
        let onsetIdx = co;
        while (onsetIdx < m && !appliedAt(l, co, onsetIdx, s.start_month)) onsetIdx++;
        const phase = d.phases.find((p) => p.value === l.effect);
        if (phase) out.push([d.id, phase.id, onsetIdx]);
      }
    }
    return out;
  };
  const affectedAt = (s, focusId, m) => {
    if (chosenOf(s).some(([cd, cp, co]) => links.some((l) => l.from === cd && l.when === cp && l.to === focusId && appliedAt(l, co, m, s.start_month)))) return true;
    return pushedAt(s, m).some(([d, p, onsetIdx]) =>
      links.some((l) => l.from === d && l.when === p && l.to === focusId && appliedAt(l, onsetIdx, m, s.start_month)));
  };
  const storyIds = new Set();
  for (const s of storiesFile.stories) {
    if (storyIds.has(s.id)) fail(`stories.yaml: duplicate story id "${s.id}"`);
    storyIds.add(s.id);
    const driver = nodes.get(s.driver);
    if (!driver) { fail(`story "${s.id}": unknown driver "${s.driver}"`); continue; }
    if (driver.kind !== 'driver') { fail(`story "${s.id}": "${s.driver}" is not a driver`); continue; }
    if (!driver.phases.some((p) => p.id === s.phase)) fail(`story "${s.id}": "${s.phase}" is not a phase of "${s.driver}"`);
    if (s.second_driver) {
      const second = nodes.get(s.second_driver);
      if (!second) { fail(`story "${s.id}": unknown second driver "${s.second_driver}"`); continue; }
      if (second.kind !== 'driver') { fail(`story "${s.id}": "${s.second_driver}" is not a driver`); continue; }
      if (second.id === s.driver) { fail(`story "${s.id}": the second driver must differ from "${s.driver}"`); continue; }
      if (!second.phases.some((p) => p.id === s.second_phase)) fail(`story "${s.id}": "${s.second_phase}" is not a phase of "${s.second_driver}"`);
    }
    const chosenIds = new Set(chosenOf(s).map(([d]) => d));
    let lastMonth = -1;
    s.steps.forEach((step, i) => {
      const where = `story "${s.id}" step ${i + 1}`;
      if (step.month < lastMonth) fail(`${where}: month ${step.month} goes backwards (previous step was month ${lastMonth})`);
      lastMonth = step.month;
      const focus = nodes.get(step.focus);
      if (!focus) { fail(`${where}: unknown focus node "${step.focus}"`); return; }
      if (!chosenIds.has(focus.id) && !affectedAt(s, step.focus, step.month)) {
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

  for (const k of sources.keys()) if (!usedSources.has(k)) warnings.push(`source "${k}" is never cited`);

  if (errors.length === 0) {
    const graph = {
      generatedFrom: ['data/nodes.yaml', 'data/links.yaml', 'data/stories.yaml'],
      nodes: nodesFile.nodes,
      links: linksFile.links,
      sources: linksFile.sources,
      stories: storiesFile.stories,
    };
    mkdirSync(join(root, 'public/data'), { recursive: true });
    writeFileSync(join(root, 'public/data/graph.json'), JSON.stringify(graph, null, 2) + '\n');
    console.log(`graph.json: ${graph.nodes.length} nodes, ${graph.links.length} links, ${graph.sources.length} sources, ${graph.stories.length} stories`);
  }
}

for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} error(s). public/data/graph.json NOT written.`);
  process.exit(1);
}
