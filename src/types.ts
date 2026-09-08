// Types mirroring the data schema in docs/DATA_FORMAT.md and the engine
// contract in docs/PLAN.md §4. Keep in sync with scripts/build-data.mjs.

export type Confidence = 'established' | 'probable' | 'contested';
export type Axis = 'wet_dry' | 'warm_cool' | 'active_quiet' | 'high_low';
export type Effect = 1 | -1;
export type Value = -1 | 0 | 1;

export interface Phase {
  id: string;
  label: string;
  color: string;
  summary: string;
  /** where this phase sits on the driver's own axis: +1, 0 (neutral) or -1.
   *  A link into a driver with effect +1 pushes it toward its +1 phase (M10). */
  value: Value;
}

interface NodeBase {
  id: string;
  name: string;
  /** short label for the map marker; falls back to name */
  label?: string;
  /** rough outline of the affected region as [lon, lat] corners (illustrative) */
  area?: [number, number][];
  lat: number;
  lon: number;
  region: string;
  timescale: string;
  summary: string;
  sources: string[];
}

export interface DriverNode extends NodeBase {
  kind: 'driver';
  /** one plain sentence shown under the start-month control: when events usually begin */
  onset_hint: string;
  /** 1–12; calendar month the start-month control jumps to when this driver is picked */
  default_start_month: number;
  /** [min, max] months a real event of this driver typically lasts (M32),
   *  each 1–12; the "Event lasts" control offers the middle of the range
   *  as "typical". A driver that really lasts longer than a year (the PDO,
   *  the AMO) says [12, 12] and explains itself in `onset_hint`. */
  typical_duration_months: [number, number];
  phases: Phase[];
}

export interface OutcomeNode extends NodeBase {
  kind: 'outcome';
  axis: Axis;
  labels: { plus: string; zero: string; minus: string };
  global: boolean;
}

export type GraphNode = DriverNode | OutcomeNode;

/** One driver whose chosen phase weakens a link (M35, rule 10): while that
 *  driver is chosen by hand and holds that phase, the link is shown one
 *  confidence tier lower. Never the link's own `from` driver. */
export interface Modulation {
  driver: string;
  phase: string;
  /** the studies that found the weakening; at least one */
  sources: string[];
}

export interface Link {
  id: string;
  from: string;
  when: string;
  to: string;
  effect: Effect;
  lag_months: [number, number];
  season: number[];
  confidence: Confidence;
  mechanism: string;
  caveat: string;
  evidence_note?: string;
  sources: string[];
  /** drivers whose chosen phase weakens this link by one tier (M35);
   *  a link with this field always has an `evidence_note` saying so */
  weakened_by?: Modulation[];
}

export interface Source {
  key: string;
  citation: string;
  url?: string;
}

export interface StoryStep {
  /** month index on the timeline to jump to */
  month: number;
  /** node id to highlight and open in the card */
  focus: string;
  text: string;
  sources: string[];
}

export interface Story {
  id: string;
  title: string;
  intro: string;
  driver: string;
  phase: string;
  start_month: number;
  /** calendar year of month index 0, for stories about a real event */
  start_year?: number;
  /** how many months (1–12) the main driver holds its phase (M32); omitted =
   *  the whole year shown */
  hold_months?: number;
  /** the other drivers chosen by hand for the whole story (M11; any number
   *  since M33), each with its own start month and hold. Never the story's
   *  own driver, never the same driver twice. The data build also accepts
   *  the pre-M33 `second_driver` / `second_phase` / `second_start_month` /
   *  `second_starts_before` / `second_hold_months` fields for one
   *  milestone and writes them into this list, so the app reads only
   *  this. */
  drivers?: StoryDriver[];
  steps: StoryStep[];
}

/** One driver a story chooses by hand besides its own (M33). */
export interface StoryDriver {
  driver: string;
  phase: string;
  /** calendar month the driver enters its phase (M12); defaults to the
   *  story's `start_month`. Read within the twelve months shown: a month
   *  earlier than `start_month` falls in the following year. */
  start_month?: number;
  /** the driver began before the story's own (M15): `start_month` is read
   *  backwards, so the driver is already in its phase when the year begins */
  starts_before?: boolean;
  /** how many months (1–12) it holds its phase (M32), from its own onset */
  hold_months?: number;
}

/** One driver's phase in one real year (M34), read from an index dataset. */
export interface YearDriver {
  driver: string;
  phase: string;
  /** calendar month (1–12) the phase began; absent for a neutral phase */
  onset_month?: number;
  /** the year it began, only when that is before the row's year (the phase
   *  was already under way when the year began) */
  onset_year?: number;
  /** how many months the phase held from its onset, uncapped (a La Niña can
   *  hold thirty); omitted = at least to the end of the twelve months shown */
  duration_months?: number;
  /** what the index did, in one sentence */
  index_note?: string;
  /** the index dataset: a source key whose citation states the threshold rule */
  source: string;
}

/** One row of the table of real years (M34). A driver absent from the row
 *  is "not recorded" that year, which is not the same as neutral. */
export interface YearRow {
  year: number;
  /** one to three plain sentences on what the year was like */
  note: string;
  sources: string[];
  drivers: YearDriver[];
}

export interface Graph {
  nodes: GraphNode[];
  links: Link[];
  sources: Source[];
  stories: Story[];
  /** the table of real years (M34); absent in a graph.json built before it */
  years?: YearRow[];
}

// ---------------------------------------------------------------- engine
/** A driver whose phase the scenario fixes by hand. */
export interface ScenarioDriver {
  driverId: string;
  phaseId: string;
  /** calendar month (1–12) the driver enters its phase (M12; any chosen
   *  driver other than the first). Omitted = the scenario's `startMonth`,
   *  i.e. month index 0. Read
   *  within the twelve months shown: the driver enters its phase the first
   *  time this calendar month comes up at or after month 0, so a month
   *  earlier than `startMonth` falls in the following year. */
  startMonth?: number;
  /** the driver began before the first one (M15): `startMonth` is read
   *  backwards from the scenario's start, so the onset is a month index
   *  from -12 (the same calendar month a year earlier) to -1. The driver is
   *  already in its phase at month 0 and its links count their lag from
   *  that earlier onset. */
  startsBefore?: boolean;
  /** how many months (1–12) the driver holds its phase from its onset
   *  (M32, rule 9). From month index `onset + holdMonths` it holds no phase
   *  and its links are reported `faded` instead of applied or pending.
   *  Omitted = the whole horizon, the pre-M32 behaviour exactly. */
  holdMonths?: number;
}

export interface Scenario {
  /** the first driver: month index 0 is its onset */
  driverId: string;
  phaseId: string;
  /** 1–12; calendar month of month index 0 */
  startMonth: number;
  horizonMonths: number;
  /** how many months (1–12) the first driver holds its phase (M32, rule 9);
   *  omitted = the whole horizon. See `ScenarioDriver.holdMonths`. */
  holdMonths?: number;
  /** every other driver chosen by hand (M11 for one; any number since M33,
   *  rule 8). Each enters its phase at month 0 like the first, or in its
   *  own `startMonth` (M12, M15), fires its own links at the first hop at
   *  full confidence, holds its phase for its own `holdMonths` (M32), and
   *  is never pushed by a link, not even before it enters its phase. No
   *  driver may appear twice, `driverId` included; the engine throws. There
   *  is no order among them beyond their onsets. */
  others?: ScenarioDriver[];
  /** @deprecated pre-M33 spelling of a one-element `others`, accepted for
   *  one milestone: the engine reads it as the first entry of `others`. */
  secondary?: ScenarioDriver;
  /** how many hops of links to follow (M10). 1 = only the scenario driver's
   *  own links, the version-1 behaviour and the default; 2 lets a driver that
   *  was set off by the scenario driver fire its own links, and so on. */
  maxDepth?: number;
  /** links whose effective confidence is below this tier apply nothing and
   *  are reported as ghosts (the confidence filter). Default: contested, i.e. all. */
  minConfidence?: Confidence;
}

export type LinkStatus = 'applied' | 'pending' | 'ghost' | 'faded';

/** What happened to one link in one month (M10). Only links that are past
 *  their minimum lag from the onset of their source driver's phase appear,
 *  except after a chosen driver's phase has ended (M32): from then on every
 *  link of that phase is reported `faded` (or `ghost` if the confidence
 *  filter leaves it out), whether or not its lag had run. */
export interface LinkState {
  status: LinkStatus;
  /** the link's confidence after the per-hop downgrade and, M35, the
   *  modulation; the line style to draw */
  confidence: Confidence;
  /** 1 for the scenario driver's own links, 2 for links of a driver it set off, ... */
  depth: number;
  /** the link's `weakened_by` entries in force this month (M35, rule 10):
   *  a chosen driver holding the listed phase. Present only when at least
   *  one is; the confidence above is then one tier lower than it would
   *  otherwise be (floored at contested). */
  weakenedBy?: Modulation[];
}

export interface NodeState {
  /** outcomes: state on their axis. Drivers: the value of the phase they hold
   *  (the scenario driver's chosen phase, or the phase another driver pushed
   *  them into); 0 when not in play. */
  value: Value;
  confidence: Confidence | null;
  /** links applied this month (in season and past their minimum lag) */
  viaLinkIds: string[];
  /** links past their minimum lag but out of season this month */
  pendingLinkIds: string[];
  /** links from a chosen driver whose phase has ended (M32): no longer
   *  applied, or never arrived because the event ended before their lag
   *  had run. They apply nothing. */
  fadedLinkIds: string[];
  inSeason: boolean;
  conflicting: boolean;
}

export interface MonthState {
  index: number;
  calendarMonth: number;
  nodes: Record<string, NodeState>;
  /** per-link status this month, keyed by link id (M10) */
  links: Record<string, LinkState>;
}

export interface Timeline {
  scenario: Scenario;
  months: MonthState[];
}

export const CONFIDENCE_ORDER: Record<Confidence, number> = {
  established: 3,
  probable: 2,
  contested: 1,
};

export const CONFIDENCE_TEXT: Record<Confidence, string> = {
  established: 'Found in most events and in most studies; textbook material.',
  probable: 'Found in a majority of events, but with notable exceptions or regional disagreement.',
  contested: 'Reported by some studies, disputed or weak in others; shown so you can see where the science is unsettled.',
};

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
