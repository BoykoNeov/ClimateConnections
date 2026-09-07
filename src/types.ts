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
  phases: Phase[];
}

export interface OutcomeNode extends NodeBase {
  kind: 'outcome';
  axis: Axis;
  labels: { plus: string; zero: string; minus: string };
  global: boolean;
}

export type GraphNode = DriverNode | OutcomeNode;

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
  /** a second driver chosen by hand for the whole story, with its phase (M11);
   *  both or neither */
  second_driver?: string;
  second_phase?: string;
  /** calendar month the second driver enters its phase (M12); defaults to
   *  `start_month`. Read within the twelve months shown: a month earlier
   *  than `start_month` falls in the following year. */
  second_start_month?: number;
  /** the second driver began before the first (M15): `second_start_month`
   *  is read backwards from `start_month`, so the driver is already in its
   *  phase when the story's year begins. Needs `second_driver`. */
  second_starts_before?: boolean;
  steps: StoryStep[];
}

export interface Graph {
  nodes: GraphNode[];
  links: Link[];
  sources: Source[];
  stories: Story[];
}

// ---------------------------------------------------------------- engine
/** A driver whose phase the scenario fixes by hand. */
export interface ScenarioDriver {
  driverId: string;
  phaseId: string;
  /** calendar month (1–12) the driver enters its phase (M12, second driver
   *  only). Omitted = the scenario's `startMonth`, i.e. month index 0. Read
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
}

export interface Scenario {
  driverId: string;
  phaseId: string;
  /** 1–12; calendar month of month index 0 */
  startMonth: number;
  horizonMonths: number;
  /** a second driver chosen by hand (M11). It enters its phase at month 0
   *  like the first, or in its own `startMonth` (M12), fires its own links
   *  at the first hop, and is never pushed by a link, not even before it
   *  enters its phase. Must not name the same driver as `driverId`. */
  secondary?: ScenarioDriver;
  /** how many hops of links to follow (M10). 1 = only the scenario driver's
   *  own links, the version-1 behaviour and the default; 2 lets a driver that
   *  was set off by the scenario driver fire its own links, and so on. */
  maxDepth?: number;
  /** links whose effective confidence is below this tier apply nothing and
   *  are reported as ghosts (the confidence filter). Default: contested, i.e. all. */
  minConfidence?: Confidence;
}

export type LinkStatus = 'applied' | 'pending' | 'ghost';

/** What happened to one link in one month (M10). Only links that are past
 *  their minimum lag from the onset of their source driver's phase appear. */
export interface LinkState {
  status: LinkStatus;
  /** the link's confidence after the per-hop downgrade; the line style to draw */
  confidence: Confidence;
  /** 1 for the scenario driver's own links, 2 for links of a driver it set off, ... */
  depth: number;
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
