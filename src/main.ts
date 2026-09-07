import './style.css';
import type { DriverNode, Graph, Link, Scenario, Timeline } from '../src/types';
import { CONFIDENCE_ORDER, MONTH_NAMES } from './types';
import { activeLinks, propagate } from './engine/propagate';
import { MapView } from './ui/map';
import { TimelineView } from './ui/timeline';
import { ControlsView, type ConfidenceFilter, type ControlState } from './ui/controls';
import { renderCard } from './ui/card';

const HORIZON = 12;
const FILTER_MIN: Record<ConfidenceFilter, number> = { all: 1, probable: 2, established: 3 };

async function main(): Promise<void> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/graph.json`);
  if (!res.ok) throw new Error(`Could not load graph.json (${res.status}). Run: npm run build:data`);
  const graph = (await res.json()) as Graph;
  const driver = graph.nodes.find((n): n is DriverNode => n.kind === 'driver');
  if (!driver) throw new Error('graph has no driver node');

  const controls: ControlState = { phaseId: driver.phases[0].id, startMonth: 6, filter: 'all' };
  let monthIndex = 0;
  let selectedNodeId: string | null = null;
  let timeline: Timeline;
  let ghostLinks: Link[] = [];
  let prevApplied = new Set<string>();

  const mapEl = document.getElementById('map-container')!;
  const cardEl = document.getElementById('card')!;
  const monthEl = document.getElementById('month-display')!;

  const map = new MapView(mapEl, graph);
  const tl = new TimelineView(document.getElementById('timeline')!, HORIZON, controls.startMonth);
  const ctl = new ControlsView(document.getElementById('controls')!, driver, controls);

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
    map.render(month, { phaseColor: phase.color, ghostLinks, arrivals, selectedNodeId });
    monthEl.innerHTML = `${MONTH_NAMES[month.calendarMonth - 1]}<small>month ${month.index} after onset</small>`;
    const node = selectedNodeId ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
    renderCard(cardEl, graph, node, month, controls.phaseId);
  }

  ctl.onChange = (s) => {
    const monthChanged = s.startMonth !== controls.startMonth;
    Object.assign(controls, s);
    if (monthChanged) tl.setStartMonth(s.startMonth);
    recompute();
    draw();
  };
  tl.onChange = (i) => { monthIndex = i; draw(); };
  map.onNodeClick = (id) => { selectedNodeId = selectedNodeId === id ? null : id; draw(); };

  recompute();
  draw();
}

main().catch((err) => {
  document.getElementById('map-container')!.innerHTML = `<pre style="padding:20px;color:#b00">${String(err)}</pre>`;
  console.error(err);
});
