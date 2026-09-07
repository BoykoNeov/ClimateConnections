import './style.css';
import type { Confidence, DriverNode, Graph, Scenario, Timeline } from '../src/types';
import { MONTH_NAMES } from './types';
import { propagate } from './engine/propagate';
import { MapView } from './ui/map';
import { TimelineView } from './ui/timeline';
import { ControlsView, type ConfidenceFilter, type ControlState } from './ui/controls';
import { renderCard } from './ui/card';
import { StoryView } from './ui/story';

const HORIZON = 12;
const FILTER_MIN: Record<ConfidenceFilter, Confidence> = { all: 'contested', probable: 'probable', established: 'established' };
/** Hops to follow when "Follow links through other drivers" is on: enough
 *  for every driver to appear once (a driver is never pushed twice). */
const MAX_DEPTH = 3;

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

  const controls: ControlState = { driverId: drivers[0].id, phaseId: drivers[0].phases[0].id, startMonth: drivers[0].default_start_month, filter: 'all', showAreas: true, chain: true, second: null };
  let monthIndex = 0;
  let selectedNodeId: string | null = null;
  let focusNodeId: string | null = null;
  let timeline: Timeline;
  let prevApplied = new Set<string>();

  const mapEl = document.getElementById('map-container')!;
  const cardEl = document.getElementById('card')!;
  const monthEl = document.getElementById('month-display')!;
  const captionEl = document.getElementById('print-caption')!;

  const map = new MapView(mapEl, graph);
  const tl = new TimelineView(document.getElementById('timeline')!, HORIZON, controls.startMonth);
  const ctl = new ControlsView(document.getElementById('controls')!, drivers, graph.stories, controls);
  const story = new StoryView(document.getElementById('story')!, new Map(graph.sources.map((s) => [s.key, s])));

  function recompute(): void {
    const scenario: Scenario = {
      driverId: controls.driverId, phaseId: controls.phaseId, startMonth: controls.startMonth, horizonMonths: HORIZON,
      maxDepth: controls.chain ? MAX_DEPTH : 1, minConfidence: FILTER_MIN[controls.filter],
      secondary: controls.second ?? undefined,
    };
    timeline = propagate(graph, scenario);
    prevApplied = new Set();
  }

  function draw(): void {
    const month = timeline.months[monthIndex];
    const applied = new Set<string>();
    for (const st of Object.values(month.nodes)) for (const id of st.viaLinkIds) applied.add(id);
    const arrivals = new Set([...applied].filter((id) => !prevApplied.has(id)));
    prevApplied = applied;
    const driver = driverById(controls.driverId);
    const phase = driver.phases.find((p) => p.id === controls.phaseId)!;
    const second = controls.second ? driverById(controls.second.driverId) : null;
    const secondPhase = second ? second.phases.find((p) => p.id === controls.second!.phaseId)! : null;
    // The drivers chosen by hand: id -> phase colour for the map, id -> phase id for the card.
    const chosen = new Map<string, string>([[driver.id, phase.color]]);
    const chosenPhases = new Map<string, string>([[driver.id, phase.id]]);
    if (second && secondPhase) { chosen.set(second.id, secondPhase.color); chosenPhases.set(second.id, secondPhase.id); }
    map.render(month, { chosen, arrivals, selectedNodeId, focusNodeId, showAreas: controls.showAreas });
    monthEl.innerHTML = `${MONTH_NAMES[month.calendarMonth - 1]}<small>month ${month.index} after onset</small>`;
    captionEl.textContent = printCaption(driver, phase.label, second, secondPhase?.label ?? null, month.index, month.calendarMonth);
    const node = selectedNodeId ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
    renderCard(cardEl, graph, node, month, chosenPhases);
  }

  ctl.onChange = (s) => {
    const monthChanged = s.startMonth !== controls.startMonth;
    const secondChanged = (s.second?.driverId ?? null) !== (controls.second?.driverId ?? null) || (s.second?.phaseId ?? null) !== (controls.second?.phaseId ?? null);
    const scenarioChanged = monthChanged || secondChanged || s.phaseId !== controls.phaseId || s.driverId !== controls.driverId;
    Object.assign(controls, s);
    if (monthChanged) tl.setStartMonth(s.startMonth);
    // Changing the scenario by hand ends the story; the filter and areas
    // toggle are just ways of looking at it.
    if (scenarioChanged && story.active) story.exit();
    recompute();
    draw();
  };
  tl.onChange = (i) => { monthIndex = i; draw(); };
  map.onNodeClick = (id) => { selectedNodeId = selectedNodeId === id ? null : id; draw(); };

  ctl.onStory = (id) => {
    const s = id ? graph.stories.find((x) => x.id === id) : undefined;
    if (!s) { story.exit(); return; }
    // Set the scenario the story needs, silently, then let the first step draw.
    controls.driverId = s.driver;
    controls.phaseId = s.phase;
    controls.startMonth = s.start_month;
    controls.second = s.second_driver && s.second_phase ? { driverId: s.second_driver, phaseId: s.second_phase } : null;
    ctl.setState({ driverId: s.driver, phaseId: s.phase, startMonth: s.start_month, second: controls.second });
    tl.setStartMonth(s.start_month);
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

  function printCaption(driver: DriverNode, phaseLabel: string, second: DriverNode | null, secondLabel: string | null, index: number, calendarMonth: number): string {
    const filterText = { all: 'all connections, including contested ones', probable: 'probable and established connections', established: 'established connections only' }[controls.filter];
    const driverName = driver.name.replace(/\s*\(.*\)$/, '');
    const secondName = second?.name.replace(/\s*\(.*\)$/, '');
    const when = MONTH_NAMES[controls.startMonth - 1];
    const who = second && secondLabel ? `${driverName}: ${phaseLabel} and ${secondName}: ${secondLabel}, both beginning in ${when}. ` : `${driverName}: ${phaseLabel}, event beginning in ${when}. `;
    return who +
      `Shown: ${MONTH_NAMES[calendarMonth - 1]}, month ${index} after onset. Showing ${filterText}` +
      `${controls.chain ? ', following links through other drivers' : ', direct links only'}. ` +
      `Printed from Climate Connections, ${location.origin}${location.pathname}`;
  }

  recompute();
  draw();
}

main().catch((err) => {
  document.getElementById('map-container')!.innerHTML = `<pre style="padding:20px;color:#b00">${String(err)}</pre>`;
  console.error(err);
});
