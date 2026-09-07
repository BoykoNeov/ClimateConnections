import './style.css';
import type { DriverNode, Graph, Link, Scenario, Timeline } from '../src/types';
import { CONFIDENCE_ORDER, MONTH_NAMES } from './types';
import { activeLinks, propagate } from './engine/propagate';
import { MapView } from './ui/map';
import { TimelineView } from './ui/timeline';
import { ControlsView, type ConfidenceFilter, type ControlState } from './ui/controls';
import { renderCard } from './ui/card';
import { StoryView } from './ui/story';

const HORIZON = 12;
const FILTER_MIN: Record<ConfidenceFilter, number> = { all: 1, probable: 2, established: 3 };

async function main(): Promise<void> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/graph.json`);
  if (!res.ok) throw new Error(`Could not load graph.json (${res.status}). Run: npm run build:data`);
  const graph = (await res.json()) as Graph;
  const driver = graph.nodes.find((n): n is DriverNode => n.kind === 'driver');
  if (!driver) throw new Error('graph has no driver node');

  const controls: ControlState = { phaseId: driver.phases[0].id, startMonth: 6, filter: 'all', showAreas: true };
  let monthIndex = 0;
  let selectedNodeId: string | null = null;
  let focusNodeId: string | null = null;
  let timeline: Timeline;
  let ghostLinks: Link[] = [];
  let prevApplied = new Set<string>();

  const mapEl = document.getElementById('map-container')!;
  const cardEl = document.getElementById('card')!;
  const monthEl = document.getElementById('month-display')!;
  const captionEl = document.getElementById('print-caption')!;

  const map = new MapView(mapEl, graph);
  const tl = new TimelineView(document.getElementById('timeline')!, HORIZON, controls.startMonth);
  const ctl = new ControlsView(document.getElementById('controls')!, driver, graph.stories, controls);
  const story = new StoryView(document.getElementById('story')!, new Map(graph.sources.map((s) => [s.key, s])));

  function recompute(): void {
    const scenario: Scenario = { driverId: driver!.id, phaseId: controls.phaseId, startMonth: controls.startMonth, horizonMonths: HORIZON };
    const min = FILTER_MIN[controls.filter];
    const visible: Graph = { ...graph, links: graph.links.filter((l) => CONFIDENCE_ORDER[l.confidence] >= min) };
    timeline = propagate(visible, scenario);
    ghostLinks = activeLinks(graph, scenario).filter((l) => CONFIDENCE_ORDER[l.confidence] < min);
    prevApplied = new Set();
  }

  function draw(): void {
    const month = timeline.months[monthIndex];
    const applied = new Set<string>();
    for (const st of Object.values(month.nodes)) for (const id of st.viaLinkIds) applied.add(id);
    const arrivals = new Set([...applied].filter((id) => !prevApplied.has(id)));
    prevApplied = applied;
    const phase = driver!.phases.find((p) => p.id === controls.phaseId)!;
    map.render(month, { phaseColor: phase.color, ghostLinks, arrivals, selectedNodeId, focusNodeId, showAreas: controls.showAreas });
    monthEl.innerHTML = `${MONTH_NAMES[month.calendarMonth - 1]}<small>month ${month.index} after onset</small>`;
    captionEl.textContent = printCaption(phase.label, month.index, month.calendarMonth);
    const node = selectedNodeId ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
    renderCard(cardEl, graph, node, month, controls.phaseId);
  }

  ctl.onChange = (s) => {
    const monthChanged = s.startMonth !== controls.startMonth;
    const scenarioChanged = monthChanged || s.phaseId !== controls.phaseId;
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
    controls.phaseId = s.phase;
    controls.startMonth = s.start_month;
    ctl.setState({ phaseId: s.phase, startMonth: s.start_month });
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

  function printCaption(phaseLabel: string, index: number, calendarMonth: number): string {
    const filterText = { all: 'all connections, including contested ones', probable: 'probable and established connections', established: 'established connections only' }[controls.filter];
    return `${phaseLabel}, event beginning in ${MONTH_NAMES[controls.startMonth - 1]}. ` +
      `Shown: ${MONTH_NAMES[calendarMonth - 1]}, month ${index} after onset. Showing ${filterText}. ` +
      `Printed from Climate Connections, ${location.origin}${location.pathname}`;
  }

  recompute();
  draw();
}

main().catch((err) => {
  document.getElementById('map-container')!.innerHTML = `<pre style="padding:20px;color:#b00">${String(err)}</pre>`;
  console.error(err);
});
