import './style.css';
import type { Confidence, DriverNode, Graph, Link, MonthState, Scenario, Timeline } from '../src/types';
import { MONTH_NAMES } from './types';
import { chosenOnset, propagate } from './engine/propagate';
import { indexForCalendarMonth, linksInPlay, seasonProfile, type SeasonMonth } from './engine/season';
import { differing } from './engine/compare';
import { MapView, stateColor } from './ui/map';
import { SeasonDialView, seasonWords, type DialRing } from './ui/dial';
import { TimelineView } from './ui/timeline';
import { ControlsView, editedSide, scenarioSettings, sideSettings, type ConfidenceFilter, type ControlState, type ScenarioSettings, type Side } from './ui/controls';
import { renderCard, type CardCompare, type ChosenPhase } from './ui/card';
import { StoryView } from './ui/story';

const HORIZON = 12;
const FILTER_MIN: Record<ConfidenceFilter, Confidence> = { all: 'contested', probable: 'probable', established: 'established' };
/** Hops to follow when "Follow links through other drivers" is on: enough
 *  for every driver to appear once (a driver is never pushed twice). */
const MAX_DEPTH = 3;
const SIDES: Side[] = ['a', 'b'];

/** One map and what is computed for the scenario it shows. There are two
 *  (M14, compare mode); only A is shown until compare is switched on. */
interface Pane {
  side: Side;
  el: HTMLElement;
  head: HTMLButtonElement;
  map: MapView;
  timeline: Timeline;
  /** links applied last draw, to animate the ones that arrive this month */
  prevApplied: Set<string>;
  /** the links in play in the timeline and their season gate by calendar month (M13) */
  inPlay: Link[];
  profile: SeasonMonth[];
}

/** What a chosen driver's phase means for the map and the card in one month. */
interface Chosen {
  driver: DriverNode;
  phase: DriverNode['phases'][number];
  second: DriverNode | null;
  secondPhase: DriverNode['phases'][number] | null;
  /** id -> phase colour, only once the driver is in its phase */
  colors: Map<string, string>;
  /** id -> phase and onset for the card */
  phases: Map<string, ChosenPhase>;
}

function shortName(d: DriverNode): string {
  return d.name.replace(/\s*\(.*\)$/, '');
}

async function main(): Promise<void> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/graph.json`);
  if (!res.ok) throw new Error(`Could not load graph.json (${res.status}). Run: npm run build:data`);
  const graph = (await res.json()) as Graph;
  const drivers = graph.nodes.filter((n): n is DriverNode => n.kind === 'driver');
  if (drivers.length === 0) throw new Error('graph has no driver node');
  const driverById = (id: string): DriverNode => {
    const d = drivers.find((x) => x.id === id);
    if (!d) throw new Error(`unknown driver ${id}`);
    return d;
  };

  const controls: ControlState = { driverId: drivers[0].id, phaseId: drivers[0].phases[0].id, startMonth: drivers[0].default_start_month, filter: 'all', showAreas: true, chain: true, second: null, compare: null };
  let monthIndex = 0;
  let selectedNodeId: string | null = null;
  let focusNodeId: string | null = null;
  /** start month the timeline's ticks currently show (the edited side's) */
  let tlStart = controls.startMonth;

  const mapEl = document.getElementById('map-container')!;
  const cardEl = document.getElementById('card')!;
  const monthEl = document.getElementById('month-display')!;
  const captionEl = document.getElementById('print-caption')!;

  const tl = new TimelineView(document.getElementById('timeline')!, HORIZON, controls.startMonth);
  const ctl = new ControlsView(document.getElementById('controls')!, drivers, graph.stories, controls);
  const story = new StoryView(document.getElementById('story')!, new Map(graph.sources.map((s) => [s.key, s])));
  const dial = new SeasonDialView(ctl.dialHost);

  const panes = new Map<Side, Pane>();
  for (const side of SIDES) {
    const el = mapEl.querySelector<HTMLElement>(`.pane[data-side="${side}"]`)!;
    const head = el.querySelector<HTMLButtonElement>('.pane-head')!;
    const map = new MapView(el.querySelector<HTMLElement>('.pane-map')!, graph, side === 'a' ? '' : 'b-');
    map.onNodeClick = (id) => { selectedNodeId = selectedNodeId === id ? null : id; draw(); };
    // Clicking a map's title makes it the side the controls edit.
    head.addEventListener('click', () => {
      if (!controls.compare || controls.compare.side === side) return;
      ctl.setState({ compare: { ...controls.compare, side } });
      applyControls({ ...controls, compare: { ...controls.compare, side } });
    });
    panes.set(side, { side, el, head, map, timeline: null as unknown as Timeline, prevApplied: new Set(), inPlay: [], profile: [] });
  }
  const pane = (side: Side): Pane => panes.get(side)!;
  /** the sides drawn right now: A alone, or both in compare mode */
  const shown = (): Side[] => (controls.compare ? SIDES : ['a']);

  function scenarioFor(s: ScenarioSettings): Scenario {
    return {
      driverId: s.driverId, phaseId: s.phaseId, startMonth: s.startMonth, horizonMonths: HORIZON,
      maxDepth: s.chain ? MAX_DEPTH : 1, minConfidence: FILTER_MIN[s.filter],
      secondary: s.second ?? undefined,
    };
  }

  function recompute(): void {
    for (const side of shown()) {
      const p = pane(side);
      p.timeline = propagate(graph, scenarioFor(sideSettings(controls, side)));
      p.prevApplied = new Set();
      p.inPlay = linksInPlay(graph, p.timeline);
      p.profile = seasonProfile(p.inPlay);
    }
    // The timeline's ticks and second-onset mark follow the side being edited.
    const e = sideSettings(controls, editedSide(controls));
    if (e.startMonth !== tlStart) { tlStart = e.startMonth; tl.setStartMonth(e.startMonth); }
    tl.setSecondOnset(e.second ? chosenOnset(pane(editedSide(controls)).timeline.scenario, e.second.driverId) : null);
  }

  /** The drivers chosen by hand on one side: id -> phase colour for the map
   *  (only once the driver is in its phase: a second driver with a later start
   *  month is drawn grey until then), id -> phase and onset for the card. */
  function chosenFor(s: ScenarioSettings, timeline: Timeline, month: MonthState): Chosen {
    const driver = driverById(s.driverId);
    const phase = driver.phases.find((p) => p.id === s.phaseId)!;
    const second = s.second ? driverById(s.second.driverId) : null;
    const secondPhase = second && s.second ? second.phases.find((p) => p.id === s.second!.phaseId)! : null;
    const colors = new Map<string, string>([[driver.id, phase.color]]);
    const phases = new Map<string, ChosenPhase>([[driver.id, { phaseId: phase.id, onset: 0, startMonth: s.startMonth }]]);
    if (second && secondPhase && s.second) {
      const onset = chosenOnset(timeline.scenario, second.id);
      if (month.index >= onset) colors.set(second.id, secondPhase.color);
      phases.set(second.id, { phaseId: secondPhase.id, onset, startMonth: s.second.startMonth });
    }
    return { driver, phase, second, secondPhase, colors, phases };
  }

  /** "El Niño from June + Negative IOD from September · direct links only" */
  function scenarioTitle(s: ScenarioSettings, c: Chosen): string {
    let t = `${c.phase.label} from ${MONTH_NAMES[s.startMonth - 1]}`;
    if (c.second && c.secondPhase && s.second) t += ` + ${c.secondPhase.label} from ${MONTH_NAMES[s.second.startMonth - 1]}`;
    if (s.filter !== 'all') t += s.filter === 'established' ? ' · established only' : ' · probable and above';
    if (!s.chain) t += ' · direct links only';
    return t;
  }

  /** The links in play that act on a node, as dial rings (M13): colour of the
   *  effect, tooltip naming the firing driver, the tendency and the season. */
  function ringsFor(nodeId: string, inPlay: Link[]): DialRing[] {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return [];
    return inPlay.filter((l) => l.to === nodeId).map((l) => {
      const from = graph.nodes.find((n) => n.id === l.from);
      const fromName = from ? from.name.replace(/\s*\(.*\)$/, '') : l.from;
      const tendency = node.kind === 'driver'
        ? `toward ${node.phases.find((p) => p.value === l.effect)?.label ?? 'a phase'}`
        : l.effect > 0 ? node.labels.plus : node.labels.minus;
      return { id: l.id, months: l.season, color: stateColor(node, l.effect), title: `From ${fromName}: ${tendency}. Season: ${seasonWords(l.season)}. Expected from month ${l.lag_months[0]} after onset.` };
    });
  }

  function setHead(head: HTMLButtonElement, side: Side, title: string, month: MonthState): void {
    head.innerHTML = '';
    const tag = document.createElement('span');
    tag.className = 'side-tag';
    tag.textContent = side.toUpperCase();
    const what = document.createElement('span');
    what.className = 'what';
    what.textContent = title;
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = `${MONTH_NAMES[month.calendarMonth - 1]}, month ${month.index}`;
    head.append(tag, what, when);
    head.setAttribute('aria-label', `Scenario ${side.toUpperCase()}: ${title}. ${when.textContent}. Edit this scenario`);
  }

  function draw(): void {
    const compare = !!controls.compare;
    const edited = editedSide(controls);
    mapEl.classList.toggle('compare', compare);
    for (const side of SIDES) {
      const p = pane(side);
      p.el.hidden = side === 'b' && !compare;
      p.head.hidden = !compare;
      p.el.classList.toggle('editing', compare && side === edited);
    }
    const months = new Map<Side, MonthState>(shown().map((side) => [side, pane(side).timeline.months[monthIndex]]));
    const differs = compare ? new Set(differing(months.get('a')!, months.get('b')!)) : undefined;

    const titles = new Map<Side, string>();
    const chosenBySide = new Map<Side, Chosen>();
    for (const side of shown()) {
      const p = pane(side);
      const s = sideSettings(controls, side);
      const month = months.get(side)!;
      const applied = new Set<string>();
      for (const st of Object.values(month.nodes)) for (const id of st.viaLinkIds) applied.add(id);
      const arrivals = new Set([...applied].filter((id) => !p.prevApplied.has(id)));
      p.prevApplied = applied;
      const c = chosenFor(s, p.timeline, month);
      chosenBySide.set(side, c);
      titles.set(side, scenarioTitle(s, c));
      p.map.render(month, { chosen: c.colors, arrivals, selectedNodeId, focusNodeId, showAreas: controls.showAreas, differs });
      if (compare) setHead(p.head, side, titles.get(side)!, month);
    }

    const month = months.get(edited)!;
    const other = compare ? months.get(edited === 'a' ? 'b' : 'a')! : null;
    if (other && other.calendarMonth !== month.calendarMonth) {
      monthEl.innerHTML = `Month ${month.index}<small>A: ${MONTH_NAMES[months.get('a')!.calendarMonth - 1]} · B: ${MONTH_NAMES[months.get('b')!.calendarMonth - 1]}, month ${month.index} after onset</small>`;
    } else {
      monthEl.innerHTML = `${MONTH_NAMES[month.calendarMonth - 1]}<small>month ${month.index} after onset</small>`;
    }
    captionEl.textContent = printCaption(months, chosenBySide);
    if (differs) ctl.compareNote.textContent = differs.size === 0 ? 'The two maps agree this month.' : differs.size === 1 ? 'One marker differs this month (dark ring).' : `${differs.size} markers differ this month (dark rings).`;

    const node = selectedNodeId ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
    const cardCompare: CardCompare | undefined = compare ? {
      side: edited.toUpperCase() as 'A' | 'B',
      a: { month: months.get('a')!, title: titles.get('a')! },
      b: { month: months.get('b')!, title: titles.get('b')! },
    } : undefined;
    renderCard(cardEl, graph, node, month, chosenBySide.get(edited)!.phases, cardCompare);

    const s = sideSettings(controls, edited);
    const c = chosenBySide.get(edited)!;
    dial.render({
      startMonth: s.startMonth,
      currentMonth: month.calendarMonth,
      second: c.second && c.secondPhase && s.second ? { month: s.second.startMonth, color: c.secondPhase.color, name: shortName(c.second) } : null,
      profile: pane(edited).profile,
      rings: node ? ringsFor(node.id, pane(edited).inPlay) : null,
      selectedName: node ? node.name.replace(/\s*\(.*\)$/, '') : null,
    });
  }

  /** New control state from the panel (or a pane title): recompute what
   *  changed and redraw. Changing a scenario by hand ends the story; the
   *  areas toggle and the edited side are just ways of looking at it. */
  function applyControls(s: ControlState): void {
    const keyA = JSON.stringify(scenarioSettings(controls));
    const keyB = JSON.stringify(controls.compare?.b ?? null);
    const wasCompare = !!controls.compare;
    Object.assign(controls, s);
    const scenarioChanged = keyA !== JSON.stringify(scenarioSettings(controls)) || keyB !== JSON.stringify(controls.compare?.b ?? null) || wasCompare !== !!controls.compare;
    if (scenarioChanged && story.active) story.exit();
    recompute();
    draw();
  }
  ctl.onChange = applyControls;
  tl.onChange = (i) => { monthIndex = i; draw(); };
  // The dial jumps by calendar month: the first time that month comes up in
  // the year shown. Like the scrubber, it pauses play and leaves a story alone.
  dial.onPick = (cal) => { tl.pause(); tl.set(indexForCalendarMonth(sideSettings(controls, editedSide(controls)).startMonth, cal)); };

  ctl.onStory = (id) => {
    const s = id ? graph.stories.find((x) => x.id === id) : undefined;
    if (!s) { story.exit(); return; }
    // Set the scenario the story needs, silently, then let the first step
    // draw. A story is one scenario, so compare mode goes off.
    controls.driverId = s.driver;
    controls.phaseId = s.phase;
    controls.startMonth = s.start_month;
    controls.second = s.second_driver && s.second_phase ? { driverId: s.second_driver, phaseId: s.second_phase, startMonth: s.second_start_month ?? s.start_month } : null;
    controls.compare = null;
    ctl.setState({ driverId: s.driver, phaseId: s.phase, startMonth: s.start_month, second: controls.second, compare: null });
    tl.pause();
    recompute();
    story.start(s);
  };
  story.onStep = (_s, step) => {
    tl.pause();
    focusNodeId = step.focus;
    selectedNodeId = step.focus;
    monthIndex = step.month;
    tl.setIndex(step.month);
    draw();
  };
  story.onExit = () => {
    focusNodeId = null;
    ctl.setStory(null);
    draw();
  };

  // Keyboard: arrows and Space drive the scrubber; while a story plays the
  // arrows step the story instead and Escape leaves it. Form fields keep
  // their own keys.
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    let used = false;
    if (story.active) {
      if (e.key === 'ArrowRight') { story.next(); used = true; }
      else if (e.key === 'ArrowLeft') { story.prev(); used = true; }
      else if (e.key === 'Escape') { story.exit(); used = true; }
    }
    if (!used) used = tl.handleKey(e);
    if (used) e.preventDefault();
  });

  /** One scenario in a sentence for the printed caption. */
  function scenarioSentence(s: ScenarioSettings, c: Chosen, month: MonthState): string {
    const filterText = { all: 'all connections, including contested ones', probable: 'probable and established connections', established: 'established connections only' }[s.filter];
    const driverName = shortName(c.driver);
    const when = MONTH_NAMES[s.startMonth - 1];
    const when2 = s.second ? MONTH_NAMES[s.second.startMonth - 1] : when;
    const who = c.second && c.secondPhase
      ? (when2 === when ? `${driverName}: ${c.phase.label} and ${shortName(c.second)}: ${c.secondPhase.label}, both beginning in ${when}. ` : `${driverName}: ${c.phase.label} beginning in ${when}, and ${shortName(c.second)}: ${c.secondPhase.label} beginning in ${when2}. `)
      : `${driverName}: ${c.phase.label}, event beginning in ${when}. `;
    return who +
      `Shown: ${MONTH_NAMES[month.calendarMonth - 1]}, month ${month.index} after onset. Showing ${filterText}` +
      `${s.chain ? ', following links through other drivers' : ', direct links only'}. `;
  }

  function printCaption(months: Map<Side, MonthState>, chosen: Map<Side, Chosen>): string {
    const parts = shown().map((side) => scenarioSentence(sideSettings(controls, side), chosen.get(side)!, months.get(side)!));
    const body = controls.compare ? `Two scenarios compared. A: ${parts[0]}B: ${parts[1]}` : parts[0];
    return `${body}Printed from Climate Connections, ${location.origin}${location.pathname}`;
  }

  recompute();
  draw();
}

main().catch((err) => {
  document.getElementById('map-container')!.innerHTML = `<pre style="padding:20px;color:#b00">${String(err)}</pre>`;
  console.error(err);
});
