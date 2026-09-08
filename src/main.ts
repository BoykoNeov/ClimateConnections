import './style.css';
import type { Confidence, DriverNode, Graph, GraphNode, Link, MonthState, OutcomeNode, Scenario, Timeline } from '../src/types';
import { MONTH_NAMES } from './types';
import { chosenFade, chosenOnset, phaseForValue, propagate } from './engine/propagate';
import { indexForCalendarMonth, linksInPlay, seasonProfile, type SeasonMonth } from './engine/season';
import { differing } from './engine/compare';
import { influencesOn, regionNodes } from './engine/inverse';
import { MapView, stateColor } from './ui/map';
import { SeasonDialView, seasonWords, type DialRing } from './ui/dial';
import { TimelineView } from './ui/timeline';
import { ControlsView, editedSide, lastsControl, scenarioSettings, sideSettings, type ConfidenceFilter, type ControlState, type OtherDriver, type ScenarioSettings, type Side } from './ui/controls';
import { renderCard, renderRegionCard, type CardCompare, type ChosenPhase } from './ui/card';
import { StoryView } from './ui/story';
import { YearView } from './ui/year';
import { calendarAt, scenarioForYear, yearRow, yearRows, type YearScenario } from './engine/years';

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

/** One of the other chosen drivers (M11; any number since M33), resolved. */
interface ChosenOther {
  driver: DriverNode;
  phase: DriverNode['phases'][number];
  settings: OtherDriver;
}

/** What the chosen drivers' phases mean for the map and the card in one month. */
interface Chosen {
  driver: DriverNode;
  phase: DriverNode['phases'][number];
  others: ChosenOther[];
  /** id -> phase colour, only once the driver is in its phase */
  colors: Map<string, string>;
  /** id -> phase and onset for the card */
  phases: Map<string, ChosenPhase>;
}

/** "A, B and C" */
function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function shortName(d: GraphNode): string {
  return d.name.replace(/\s*\(.*\)$/, '');
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/** "a month", "4 months". */
function monthsWord(n: number): string {
  return n === 1 ? 'a month' : `${n} months`;
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

  const regions = regionNodes(graph);
  const regionById = (id: string | null): OutcomeNode | null => (id ? regions.find((n) => n.id === id) ?? null : null);
  /** Region mode (M28) is the one thing the URL hash carries: "#region=<id>",
   *  so a teacher can link straight to "everything that reaches Nairobi". */
  const regionFromHash = (): string | null => {
    const m = /^#region=([\w-]+)$/.exec(location.hash);
    return m && regionById(m[1]) ? m[1] : null;
  };
  const controls: ControlState = { driverId: drivers[0].id, phaseId: drivers[0].phases[0].id, startMonth: drivers[0].default_start_month, hold: null, filter: 'all', showAreas: true, showAllLabels: false, showImpacts: false, chain: true, others: [], compare: null, region: regionFromHash() };
  let monthIndex = 0;
  let selectedNodeId: string | null = null;
  let focusNodeId: string | null = null;
  /** start month the timeline's ticks currently show (the edited side's) */
  let tlStart = controls.startMonth;

  const mapEl = document.getElementById('map-container')!;
  const cardEl = document.getElementById('card')!;
  const monthEl = document.getElementById('month-display')!;
  const captionEl = document.getElementById('print-caption')!;

  const tlEl = document.getElementById('timeline')!;
  const tl = new TimelineView(tlEl, HORIZON, controls.startMonth);
  const years = yearRows(graph);
  const ctl = new ControlsView(document.getElementById('controls')!, drivers, graph.stories, years.map((r) => r.year), regions, controls);
  const sources = new Map(graph.sources.map((s) => [s.key, s]));
  const story = new StoryView(document.getElementById('story')!, sources, new Set(years.map((r) => r.year)));
  const yearView = new YearView(document.getElementById('year')!, graph);
  /** the real year on show (M34), or null: its drivers fill the controls, which are locked */
  let yearActive: YearScenario | null = null;
  const dial = new SeasonDialView(ctl.dialHost);

  const panes = new Map<Side, Pane>();
  for (const side of SIDES) {
    const el = mapEl.querySelector<HTMLElement>(`.pane[data-side="${side}"]`)!;
    const head = el.querySelector<HTMLButtonElement>('.pane-head')!;
    const map = new MapView(el.querySelector<HTMLElement>('.pane-map')!, graph, side === 'a' ? '' : 'b-');
    map.onNodeClick = (id) => {
      if (controls.region) { regionClick(id); return; }
      selectedNodeId = selectedNodeId === id ? null : id;
      draw();
    };
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
    const scenario: Scenario = {
      driverId: s.driverId, phaseId: s.phaseId, startMonth: s.startMonth, horizonMonths: HORIZON,
      maxDepth: s.chain ? MAX_DEPTH : 1, minConfidence: FILTER_MIN[s.filter],
    };
    if (s.hold !== null) scenario.holdMonths = s.hold;
    // The impacts layer (M37) is shared by both sides: it runs the impact hop.
    if (controls.showImpacts) scenario.impacts = true;
    if (s.others.length > 0) {
      scenario.others = s.others.map((o) => {
        const d: NonNullable<Scenario['others']>[number] = { driverId: o.driverId, phaseId: o.phaseId, startMonth: o.startMonth, startsBefore: o.startsBefore };
        if (o.hold !== null) d.holdMonths = o.hold;
        return d;
      });
    }
    return scenario;
  }

  function recompute(): void {
    for (const side of shown()) {
      const p = pane(side);
      p.timeline = propagate(graph, scenarioFor(sideSettings(controls, side)));
      p.prevApplied = new Set();
      p.inPlay = linksInPlay(graph, p.timeline);
      p.profile = seasonProfile(p.inPlay);
    }
    // The timeline's ticks and onset marks follow the side being edited.
    const e = sideSettings(controls, editedSide(controls));
    if (e.startMonth !== tlStart) { tlStart = e.startMonth; tl.setStartMonth(e.startMonth); }
    const scenario = pane(editedSide(controls)).timeline.scenario;
    tl.setOtherOnsets(e.others.map((o) => ({ index: chosenOnset(scenario, o.driverId), name: shortName(driverById(o.driverId)) })));
    // A small mark where a chosen driver's phase ends (M32).
    const fades: { index: number; title: string }[] = [];
    for (const id of [e.driverId, ...e.others.map((o) => o.driverId)]) {
      const fade = chosenFade(scenario, id);
      if (fade !== null) fades.push({ index: fade, title: `${shortName(driverById(id))} ends here: no phase from this month on` });
    }
    tl.setFades(fades);
  }

  /** In year mode (M34): what the record says about a chosen driver where
   *  the engine reads it differently, for the card: a start more than a
   *  year before month 0 (read as at most a year back), or a hold the
   *  engine cannot place exactly. */
  function recordNote(id: string): string | undefined {
    if (!yearActive) return undefined;
    const ys = yearActive;
    const p = ys.drivers.find((x) => x.driver.driver === id);
    if (!p || !p.placed || p.neutral || !p.onset) return undefined;
    const at = (i: number) => { const c = calendarAt(ys.startYear, ys.scenario.startMonth, i); return `${MONTH_NAMES[c.month - 1]} ${c.year}`; };
    const parts: string[] = [];
    if (p.recordOnset < p.engineOnset) parts.push(`In the record this phase began in ${MONTH_NAMES[p.onset.month - 1]} ${p.onset.year}, ${monthsWord(-p.recordOnset)} before month 0; the map reads an earlier start as at most a year before, which changes nothing here, since every lag had run.`);
    if (p.recordFade !== null && p.engineFade !== p.recordFade && (p.recordFade > 0 || (p.engineFade ?? 0) > 0)) {
      if (p.recordFade > HORIZON) parts.push(`In the record it held to ${at(p.recordFade - 1)}, beyond the months shown.`);
      else parts.push(`The record has it ending in ${at(p.recordFade)} (month ${p.recordFade}); the map can hold a phase for at most twelve months from a start it reads as at most a year back, so here it ${p.engineFade === null ? 'holds to the end of the months shown' : `ends in ${at(p.engineFade)} (month ${p.engineFade})`}.`);
    }
    return parts.length > 0 ? parts.join(' ') : undefined;
  }

  /** The drivers chosen by hand on one side: id -> phase colour for the map
   *  (only while the driver is in its phase: a chosen driver with a later
   *  start month is drawn grey until then; one that began before the first,
   *  M15, is in phase from month 0; one whose hold has run out, M32, is grey
   *  from its fade month on), id -> phase, onset and hold for the card. */
  function chosenFor(s: ScenarioSettings, timeline: Timeline, month: MonthState): Chosen {
    const driver = driverById(s.driverId);
    const phase = driver.phases.find((p) => p.id === s.phaseId)!;
    const total = s.others.length + 1;
    const colors = new Map<string, string>();
    const phases = new Map<string, ChosenPhase>();
    const fade = chosenFade(timeline.scenario, driver.id);
    if (fade === null || month.index < fade) colors.set(driver.id, phase.color);
    phases.set(driver.id, { phaseId: phase.id, onset: 0, startMonth: s.startMonth, hold: s.hold, fade, control: lastsControl(1, total), record: recordNote(driver.id) });
    const others: ChosenOther[] = s.others.map((settings, i) => {
      const other = driverById(settings.driverId);
      const otherPhase = other.phases.find((p) => p.id === settings.phaseId)!;
      const onset = chosenOnset(timeline.scenario, other.id);
      const fadeO = chosenFade(timeline.scenario, other.id);
      if (month.index >= onset && (fadeO === null || month.index < fadeO)) colors.set(other.id, otherPhase.color);
      phases.set(other.id, { phaseId: otherPhase.id, onset, startMonth: settings.startMonth, hold: settings.hold, fade: fadeO, control: lastsControl(i + 2, total), record: recordNote(other.id) });
      return { driver: other, phase: otherPhase, settings };
    });
    return { driver, phase, others, colors, phases };
  }

  /** "El Niño from June for 10 months + Negative IOD from September · direct
   *  links only"; "since May" for a chosen driver that began before the
   *  first (M15); "for N months" only with a hold (M32); one " + " per
   *  other chosen driver (M33). */
  function scenarioTitle(s: ScenarioSettings, c: Chosen): string {
    const lasts = (hold: number | null) => (hold === null ? '' : hold === 1 ? ' for a month' : ` for ${hold} months`);
    let t = `${c.phase.label} from ${MONTH_NAMES[s.startMonth - 1]}${lasts(s.hold)}`;
    for (const o of c.others) t += ` + ${o.phase.label} ${o.settings.startsBefore ? 'since' : 'from'} ${MONTH_NAMES[o.settings.startMonth - 1]}${lasts(o.settings.hold)}`;
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
        ? `toward ${phaseForValue(node, l.effect)?.label ?? 'a phase'}`
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

  /**
   * Region mode (M28): one map, no month. The place, every driver that
   * reaches it and each incoming link as the data rates it; the card lists
   * them driver by driver. No scenario runs and nothing is added up.
   */
  function drawRegion(node: OutcomeNode): void {
    const groups = influencesOn(graph, node.id);
    mapEl.classList.remove('compare');
    for (const side of SIDES) {
      const p = pane(side);
      p.el.hidden = side === 'b';
      p.head.hidden = true;
      p.el.classList.remove('editing');
    }
    pane('a').prevApplied = new Set();
    pane('a').map.renderRegion({ nodeId: node.id, groups, showAreas: controls.showAreas, showAllLabels: controls.showAllLabels });
    monthEl.innerHTML = `By region<small>everything that reaches ${esc(shortName(node))}</small>`;
    captionEl.textContent = `Everything that is known to reach ${node.name} on this map: ${groups.length === 1 ? 'one driver' : `${groups.length} drivers`}, each connection in its own season and confidence tier, no month or scenario chosen. Printed from Climate Connections, ${location.origin}${location.pathname}`;
    renderRegionCard(cardEl, graph, node, groups);
  }

  /** A click on the map in region mode: a driver opens its own scenario
   *  (the first of its phases that reaches the place, or its first phase),
   *  another place becomes the region. */
  function regionClick(id: string): void {
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) return;
    if (node.kind === 'outcome') {
      if (node.id === controls.region) return;
      ctl.setState({ region: node.id });
      applyControls({ ...controls, region: node.id });
      return;
    }
    if (node.kind !== 'driver') return; // impacts are not drawn in region mode
    const groups = influencesOn(graph, controls.region!);
    const reaching = groups.find((g) => g.driver.id === node.id);
    watch(node.id, reaching ? reaching.phases[0].phase.id : node.phases[0].id);
  }

  /** From "what reaches my home" to "watch it arrive" (M28): leave region
   *  mode for the single-driver scenario, with the place selected so its
   *  card follows the year, and play from month 0. */
  function watch(driverId: string, phaseId: string): void {
    const d = driverById(driverId);
    const phase = d.phases.find((p) => p.id === phaseId) ?? d.phases[0];
    const regionId = controls.region;
    const next: Partial<ControlState> = { driverId: d.id, phaseId: phase.id, startMonth: d.default_start_month, hold: null, others: [], compare: null, region: null };
    selectedNodeId = regionId;
    monthIndex = 0;
    tl.setIndex(0);
    ctl.setState(next);
    applyControls({ ...controls, ...next });
    tl.play();
  }

  function draw(): void {
    const region = regionById(controls.region);
    tlEl.hidden = !!region;
    if (region) { drawRegion(region); return; }
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
      p.map.render(month, { chosen: c.colors, arrivals, selectedNodeId, focusNodeId, showAreas: controls.showAreas, showAllLabels: controls.showAllLabels, showImpacts: controls.showImpacts, differs });
      if (compare) setHead(p.head, side, titles.get(side)!, month);
    }

    const month = months.get(edited)!;
    const other = compare ? months.get(edited === 'a' ? 'b' : 'a')! : null;
    if (other && other.calendarMonth !== month.calendarMonth) {
      monthEl.innerHTML = `Month ${month.index}<small>A: ${MONTH_NAMES[months.get('a')!.calendarMonth - 1]} · B: ${MONTH_NAMES[months.get('b')!.calendarMonth - 1]}, month ${month.index} after onset</small>`;
    } else if (yearActive) {
      const cal = calendarAt(yearActive.startYear, yearActive.scenario.startMonth, month.index);
      monthEl.innerHTML = `${MONTH_NAMES[cal.month - 1]} ${cal.year}<small>real year ${yearActive.row.year}, month ${month.index}</small>`;
    } else {
      monthEl.innerHTML = `${MONTH_NAMES[month.calendarMonth - 1]}<small>month ${month.index} after onset</small>`;
    }
    captionEl.textContent = yearActive ? yearCaption(yearActive, month, sideSettings(controls, edited)) + (controls.showImpacts ? ` ${IMPACTS_CAPTION.trim()}` : '') : printCaption(months, chosenBySide);
    if (differs) ctl.compareNote.textContent = differs.size === 0 ? 'The two maps agree this month.' : differs.size === 1 ? 'One marker differs this month (dark ring).' : `${differs.size} markers differ this month (dark rings).`;

    const node = selectedNodeId ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
    const cardCompare: CardCompare | undefined = compare ? {
      side: edited.toUpperCase() as 'A' | 'B',
      a: { month: months.get('a')!, title: titles.get('a')!, chosen: chosenBySide.get('a')!.phases },
      b: { month: months.get('b')!, title: titles.get('b')!, chosen: chosenBySide.get('b')!.phases },
    } : undefined;
    // An impact's card (M37) is only reachable with the layer on; if the layer
    // went off while one was selected, the selection is dropped.
    if (node?.kind === 'impact' && !controls.showImpacts) selectedNodeId = null;
    renderCard(cardEl, graph, selectedNodeId ? node : null, month, chosenBySide.get(edited)!.phases, cardCompare, yearActive?.row.year, controls.showImpacts);

    const s = sideSettings(controls, edited);
    const c = chosenBySide.get(edited)!;
    dial.render({
      startMonth: s.startMonth,
      currentMonth: month.calendarMonth,
      others: c.others.map((o) => ({ month: o.settings.startMonth, color: o.phase.color, name: shortName(o.driver), before: o.settings.startsBefore, onset: c.phases.get(o.driver.id)!.onset })),
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
    // Region mode is one place, not a scenario: entering it ends a story too,
    // and a real year (M34); the year's controls are locked, so a scenario
    // change here comes from a story or from region mode's "watch".
    if ((scenarioChanged || controls.region) && yearActive) yearView.exit();
    if ((scenarioChanged || controls.region) && story.active) story.exit();
    if (controls.region) tl.pause();
    syncHash();
    recompute();
    draw();
  }
  ctl.onChange = applyControls;
  /** Keep "#region=<id>" in the address bar in step with region mode, and
   *  follow it when the address changes (back button, a pasted link). */
  function syncHash(): void {
    const want = controls.region ? `#region=${controls.region}` : '';
    if (location.hash === want || (!want && !location.hash)) return;
    history.replaceState(null, '', want || location.pathname + location.search);
  }
  window.addEventListener('hashchange', () => {
    const id = regionFromHash();
    if (id === controls.region) return;
    ctl.setState({ region: id });
    applyControls({ ...controls, region: id });
  });
  // "Watch <phase> arrive" buttons on the region card.
  cardEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button.watch-btn');
    if (!btn || !controls.region) return;
    watch(btn.dataset.driver!, btn.dataset.phase!);
  });
  tl.onChange = (i) => { monthIndex = i; draw(); };
  // The dial jumps by calendar month: the first time that month comes up in
  // the year shown. Like the scrubber, it pauses play and leaves a story alone.
  dial.onPick = (cal) => { tl.pause(); tl.set(indexForCalendarMonth(sideSettings(controls, editedSide(controls)).startMonth, cal)); };

  ctl.onStory = (id) => {
    const s = id ? graph.stories.find((x) => x.id === id) : undefined;
    if (!s) { story.exit(); return; }
    if (yearActive) yearView.exit();
    // Set the scenario the story needs, silently, then let the first step
    // draw. A story is one scenario, so compare mode goes off.
    controls.driverId = s.driver;
    controls.phaseId = s.phase;
    controls.startMonth = s.start_month;
    controls.hold = s.hold_months ?? null;
    controls.others = (s.drivers ?? []).map((d) => ({ driverId: d.driver, phaseId: d.phase, startMonth: d.start_month ?? s.start_month, startsBefore: !!d.starts_before, hold: d.hold_months ?? null }));
    controls.compare = null;
    controls.region = null;
    // A story on impacts (M37) turns the layer on; any other leaves it as it is.
    if (s.impacts) controls.showImpacts = true;
    ctl.setState({ driverId: s.driver, phaseId: s.phase, startMonth: s.start_month, hold: controls.hold, others: controls.others, compare: null, region: null, showImpacts: controls.showImpacts });
    tl.pause();
    syncHash();
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

  /** A real year from the table (M34): its row becomes the scenario (the
   *  engine reads it through `scenarioForYear`; nothing new is computed),
   *  the controls show it and are locked, the year panel opens above the
   *  card, and the timeline sits at month 0, paused. A story and compare
   *  mode go off: a year is one scenario. */
  function openYear(year: number): void {
    const row = yearRow(graph, year);
    if (!row) return;
    const ys = scenarioForYear(graph, row, HORIZON);
    if (story.active) story.exit();
    const sc = ys.scenario;
    const next: Partial<ControlState> = {
      driverId: sc.driverId, phaseId: sc.phaseId, startMonth: sc.startMonth, hold: sc.holdMonths ?? null,
      others: (sc.others ?? []).map((o) => ({ driverId: o.driverId, phaseId: o.phaseId, startMonth: o.startMonth ?? sc.startMonth, startsBefore: !!o.startsBefore, hold: o.holdMonths ?? null })),
      compare: null, region: null,
    };
    Object.assign(controls, next);
    ctl.setState(next);
    ctl.setYear(year);
    ctl.setLocked(true);
    yearActive = ys;
    selectedNodeId = null;
    focusNodeId = null;
    monthIndex = 0;
    tl.setIndex(0);
    tl.pause();
    syncHash();
    recompute();
    yearView.show(ys);
    draw();
  }
  ctl.onYear = (year) => { if (year === null) yearView.exit(); else openYear(year); };
  // Leaving the year, or "Edit this scenario", frees the controls; the
  // scenario stays as the year set it.
  yearView.onExit = () => {
    yearActive = null;
    ctl.setLocked(false);
    ctl.setYear(null);
    draw();
  };
  yearView.onEdit = () => yearView.exit();
  yearView.onStory = (id) => { ctl.setStory(id); ctl.onStory(id); };
  story.onYear = (year) => openYear(year);

  // Keyboard: arrows and Space drive the scrubber; while a story plays the
  // arrows step the story instead and Escape leaves it. Form fields keep
  // their own keys.
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    let used = false;
    if (controls.region) {
      // No month to step through; Escape goes back to the scenario.
      if (e.key === 'Escape') { ctl.setState({ region: null }); applyControls({ ...controls, region: null }); e.preventDefault(); }
      return;
    }
    if (yearActive && e.key === 'Escape') { yearView.exit(); used = true; }
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
    const months = (n: number) => (n === 1 ? 'a month' : `${n} months`);
    let who: string;
    if (c.others.length === 0) {
      who = `${driverName}: ${c.phase.label}, event beginning in ${when}. `;
    } else {
      // Each other chosen driver: beginning in its own month, or (M15)
      // already under way since a month before the year shown.
      const parts = c.others.map((o) => {
        const when2 = MONTH_NAMES[o.settings.startMonth - 1];
        if (o.settings.startsBefore) return `${shortName(o.driver)}: ${o.phase.label} already under way since ${when2}, ${months(-c.phases.get(o.driver.id)!.onset)} earlier`;
        return `${shortName(o.driver)}: ${o.phase.label} beginning in ${when2}`;
      });
      who = `${driverName}: ${c.phase.label} beginning in ${when}, and ${listWords(parts)}. `;
    }
    // How long each is held (M32), when that is not the whole year.
    const held: string[] = [];
    if (s.hold !== null) held.push(`${driverName} is set to last ${months(s.hold)}, ending in ${MONTH_NAMES[((s.startMonth - 1 + s.hold) % 12)]}`);
    for (const o of c.others) if (o.settings.hold !== null) held.push(`${shortName(o.driver)} is set to last ${months(o.settings.hold)} from its own start`);
    if (held.length > 0) who += `${held.join('; ')}; after that its arrows are drawn faded and apply nothing. `;
    return who +
      `Shown: ${MONTH_NAMES[month.calendarMonth - 1]}, month ${month.index} after onset. Showing ${filterText}` +
      `${s.chain ? ', following links through other drivers' : ', direct links only'}. `;
  }

  /** The printed caption in year mode (M34): the year, every recorded
   *  phase with its start, the drivers not recorded, the month shown, the
   *  honesty sentence and the index sources. */
  function yearCaption(ys: YearScenario, month: MonthState, s: ScenarioSettings): string {
    const row = ys.row;
    const cal = calendarAt(ys.startYear, ys.scenario.startMonth, month.index);
    const parts = ys.drivers.map((p) => {
      const d = driverById(p.driver.driver);
      const label = d.phases.find((x) => x.id === p.driver.phase)?.label ?? p.driver.phase;
      return p.onset ? `${label} from ${MONTH_NAMES[p.onset.month - 1]} ${p.onset.year}` : `${shortName(d)} neutral`;
    });
    const notRecorded = drivers.filter((d) => !row.drivers.some((x) => x.driver === d.id)).map(shortName);
    const keys = [...new Set(row.drivers.map((d) => d.source))];
    const names = keys.map((k) => sources.get(k)?.citation.split('. ')[0] ?? k);
    const filterText = { all: 'all connections, including contested ones', probable: 'probable and established connections', established: 'established connections only' }[s.filter];
    return `Real year ${row.year}, from the record: ${listWords(parts)}${notRecorded.length > 0 ? `; not recorded: ${listWords(notRecorded)}` : ''}. ` +
      `Shown: ${MONTH_NAMES[cal.month - 1]} ${cal.year}, month ${month.index}; the twelve months run from ${MONTH_NAMES[ys.scenario.startMonth - 1]} ${ys.startYear}. ` +
      `The map shows the tendencies for the phases that were observed, not what happened that year. Index sources: ${names.join('; ')}. ` +
      `Showing ${filterText}${s.chain ? ', following links through other drivers' : ', direct links only'}. Printed from Climate Connections, ${location.origin}${location.pathname}`;
  }

  /** The impacts layer (M37) in a printed caption: what a square is and the fixed sentence. */
  const IMPACTS_CAPTION = 'Squares are impacts on people (harvests, disease seasons, fires, rivers, catches) that tend to follow from the weather beside them, drawn one confidence tier lower; how much of this reaches people depends on preparation, prices and policy, and the map shows only the push from the weather. ';

  function printCaption(months: Map<Side, MonthState>, chosen: Map<Side, Chosen>): string {
    const parts = shown().map((side) => scenarioSentence(sideSettings(controls, side), chosen.get(side)!, months.get(side)!));
    const body = controls.compare ? `Two scenarios compared. A: ${parts[0]}B: ${parts[1]}` : parts[0];
    return `${body}${controls.showImpacts ? IMPACTS_CAPTION : ''}Printed from Climate Connections, ${location.origin}${location.pathname}`;
  }

  recompute();
  draw();
}

main().catch((err) => {
  document.getElementById('map-container')!.innerHTML = `<pre style="padding:20px;color:#b00">${String(err)}</pre>`;
  console.error(err);
});
