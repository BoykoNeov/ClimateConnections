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
  steps: StoryStep[];
}

export interface Graph {
  nodes: GraphNode[];
  links: Link[];
  sources: Source[];
  stories: Story[];
}

// ---------------------------------------------------------------- engine
export interface Scenario {
  driverId: string;
  phaseId: string;
  /** 1–12; calendar month of month index 0 */
  startMonth: number;
  horizonMonths: number;
}

export interface NodeState {
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
