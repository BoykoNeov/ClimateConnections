// Right panel: details for the selected node in the current month.

import type { DriverNode, Graph, GraphNode, Link, LinkState, MonthState, NodeState, Source } from '../types';
import { CONFIDENCE_TEXT, MONTH_NAMES } from '../types';
import { phaseForValue } from '../engine/propagate';
import { compareNode, type Verdict } from '../engine/compare';
import { stateColor } from './map';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function seasonText(link: Link): string {
  if (link.season.length === 0) return 'all year';
  const names = [...link.season].map((m) => MONTH_NAMES[m - 1].slice(0, 3));
  return names.join(', ');
}

function shortName(node: GraphNode): string {
  return node.name.replace(/\s*\(.*\)$/, '');
}

/** "a month", "4 months". */
function monthsWord(n: number): string {
  return n === 1 ? 'a month' : `${n} months`;
}

function sourcesHtml(keys: string[], sources: Map<string, Source>): string {
  const items = keys.map((k) => {
    const s = sources.get(k);
    if (!s) return `<li>${esc(k)}</li>`;
    return s.url ? `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.citation)}</a></li>` : `<li>${esc(s.citation)}</li>`;
  });
  return `<ul class="sources">${items.join('')}</ul>`;
}

/** "How sure are we?" for a link as it acts this month. `ls` carries the
 *  confidence after the per-hop downgrade; when it differs from the link's
 *  own rating the block says so. */
function sureBlock(link: Link, ls: LinkState | null): string {
  const shown = ls?.confidence ?? link.confidence;
  const downgraded = shown !== link.confidence;
  return `<div class="sure"><strong>How sure are we?</strong>
    <span class="badge ${shown}">${shown}</span> ${esc(CONFIDENCE_TEXT[shown])}
    ${downgraded ? `<p class="hint">The source rates this link <em>${link.confidence}</em>. It is shown one tier lower for each driver it passes through, and never higher than the link that set that driver off.</p>` : ''}
    <p><em>Why it might not happen:</em> ${esc(link.caveat.trim())}</p>
    ${link.evidence_note ? `<p><em>What the evidence says:</em> ${esc(link.evidence_note.trim())}</p>` : ''}
  </div>`;
}

/** A driver chosen by hand: its phase, and when it enters it (M12: the
 *  second driver may start later than month 0; M15: or before it). */
export interface ChosenPhase {
  phaseId: string;
  /** month index at which the driver enters the phase (0 for the main
   *  driver; negative when the second driver began before the first) */
  onset: number;
  /** calendar month (1–12) of that onset */
  startMonth: number;
}

interface Ctx {
  sources: Map<string, Source>;
  nodeById: Map<string, GraphNode>;
  linkById: Map<string, Link>;
  /** drivers chosen by hand: id -> phase and onset (one, or two since M11) */
  chosen: Map<string, ChosenPhase>;
}

function linkBlock(link: Link, ctx: Ctx, status: 'applied' | 'pending', ls: LinkState | null): string {
  const timing = `Expected from month ${link.lag_months[0]}${link.lag_months[1] !== link.lag_months[0] ? `–${link.lag_months[1]}` : ''} after onset; season: ${seasonText(link)}.`;
  const from = ctx.nodeById.get(link.from);
  // Say where the link comes from when that is not obvious: "through" a
  // pushed driver, or "from" one of two chosen drivers.
  const fromLabel = !from || !ls ? '' : ls.depth > 1 ? `through ${esc(shortName(from))}` : ctx.chosen.size > 1 ? `from ${esc(shortName(from))}` : '';
  const via = fromLabel ? ` <span class="via">${fromLabel}</span>` : '';
  const toDriver = ctx.nodeById.get(link.to)?.kind === 'driver';
  const heading = status === 'pending' ? 'Expected, but out of season right now' : toDriver ? 'What pushes it there' : 'Why this happens';
  // Lags count from the month the firing driver entered its phase: the month
  // it was pushed there, or the second chosen driver's own start month (M12).
  const chosenFrom = from ? ctx.chosen.get(from.id) : undefined;
  const onsetNote = ls && ls.depth > 1 && from ? ` Month 0 here is when ${esc(shortName(from))} was pushed into this phase.`
    : ls && from && chosenFrom && chosenFrom.onset > 0 ? ` Month 0 here is ${MONTH_NAMES[chosenFrom.startMonth - 1]}, when ${esc(shortName(from))} entered its phase (month ${chosenFrom.onset} on the timeline).`
    : ls && from && chosenFrom && chosenFrom.onset < 0 ? ` Month 0 here is ${MONTH_NAMES[chosenFrom.startMonth - 1]}, when ${esc(shortName(from))} entered its phase, ${monthsWord(-chosenFrom.onset)} before the year shown begins.` : '';
  return `<div class="link-block">
    <h4>${heading}${via} <span class="badge ${ls?.confidence ?? link.confidence}">${ls?.confidence ?? link.confidence}</span></h4>
    <p>${esc(link.mechanism.trim())}</p>
    <p class="hint">${esc(timing)}${onsetNote}</p>
    ${sureBlock(link, ls)}
    ${sourcesHtml(link.sources, ctx.sources)}
  </div>`;
}

/** Links from other drivers into this driver: never drawn when it is a
 *  chosen driver (they would loop back onto the chosen phase), so the
 *  card tells them in words. */
function feedbackBlock(node: DriverNode, graph: Graph, ctx: Ctx): string {
  const incoming = graph.links.filter((l) => l.to === node.id);
  if (incoming.length === 0) return '';
  let html = `<h2>Feedback from other drivers</h2>
    <p class="hint">Not drawn: an effect is never allowed to loop back onto a driver you picked. Pick the other driver on its own to see these links in action.</p>`;
  for (const l of incoming) {
    const from = ctx.nodeById.get(l.from);
    if (!from || from.kind !== 'driver') continue;
    const fromPhase = from.phases.find((p) => p.id === l.when);
    const toPhase = phaseForValue(node, l.effect);
    const alsoChosen = ctx.chosen.has(from.id) ? `<p class="hint">${esc(shortName(from))} is also chosen by hand in this scenario, so this link is skipped: you have set both phases.</p>` : '';
    html += `<div class="link-block">
      <h4>${esc(fromPhase?.label ?? l.when)} tends to push toward ${esc(toPhase?.label ?? String(l.effect))} <span class="badge ${l.confidence}">${l.confidence}</span></h4>
      ${alsoChosen}
      <p>${esc(l.mechanism.trim())}</p>
      <p class="hint">Expected from month ${l.lag_months[0]}${l.lag_months[1] !== l.lag_months[0] ? `–${l.lag_months[1]}` : ''} after ${esc(shortName(from))} enters that phase; season: ${seasonText(l)}.</p>
      ${sureBlock(l, null)}
      ${sourcesHtml(l.sources, ctx.sources)}
    </div>`;
  }
  return html;
}

function driverCard(node: DriverNode, graph: Graph, ctx: Ctx, month: MonthState): string {
  let html = '';
  const st = month.nodes[node.id];
  const info = ctx.chosen.get(node.id);
  if (info) {
    const phase = node.phases.find((p) => p.id === info.phaseId);
    const label = esc(phase?.label ?? info.phaseId);
    if (month.index < info.onset) {
      // Chosen by hand, but its own start month has not come yet (M12).
      html += `<div class="state-line zero" style="background:#f0f2f5">Not yet in play: enters ${label} in ${MONTH_NAMES[info.startMonth - 1]}, month ${info.onset}</div>`;
      html += `<p class="hint">One of two drivers you chose, with a start month of its own. Until then it is held out of play: it has no phase, its links do not fire, and no link is allowed to push it.</p>`;
      html += `<h2>What it is</h2><p>${esc(node.summary.trim())}</p>`;
      html += `<h2>Sources</h2>${sourcesHtml(node.sources, ctx.sources)}`;
      html += feedbackBlock(node, graph, ctx);
      return html;
    }
    html += `<div class="state-line" style="background:${phase?.color ?? '#ccc'};color:#fff">Current phase: ${label}${ctx.chosen.size > 1 ? ' · chosen by hand' : ''}</div>`;
    if (ctx.chosen.size > 1) {
      let when = '';
      if (info.onset > 0) when = ` It entered this phase in ${MONTH_NAMES[info.startMonth - 1]} (month ${info.onset} on the timeline); its links count their lag from then.`;
      else if (info.onset < 0) {
        // Began before the first driver (M15): already under way at month 0.
        const held = month.index - info.onset;
        when = ` It entered this phase in ${MONTH_NAMES[info.startMonth - 1]}, ${monthsWord(-info.onset)} before the year shown begins, and has held it since: ${monthsWord(held)} so far. Its links count their lag from then, so some of its effects were already being felt at month 0.`;
        if (held > 12) when += ` That is more than a year in one phase, longer than most real events last: treat the later months as a teaching convenience.`;
      }
      html += `<p class="hint">One of two drivers you chose. Its links fire at full confidence, and no link is allowed to push it into another phase.${when}</p>`;
    }
    html += `<p>${esc(phase?.summary.trim() ?? '')}</p><h2>What it is</h2><p>${esc(node.summary.trim())}</p>`;
    html += `<h2>Sources</h2>${sourcesHtml(node.sources, ctx.sources)}`;
    html += feedbackBlock(node, graph, ctx);
    return html;
  }
  if (st.viaLinkIds.length > 0) {
    // Pushed into a phase by another driver (M10).
    const phase = phaseForValue(node, st.value);
    const pushers = [...new Set(st.viaLinkIds.map((id) => ctx.linkById.get(id)?.from).filter((x): x is string => !!x))]
      .map((id) => shortName(ctx.nodeById.get(id)!));
    if (phase) {
      html += `<div class="state-line" style="background:${phase.color};color:#fff">Current phase: ${esc(phase.label)} · pushed there by ${esc(pushers.join(' and '))}</div>`;
      html += `<p>${esc(phase.summary.trim())}</p>`;
      html += `<p class="hint">Its own links now fire from this marker, one confidence tier lower than on its own card.</p>`;
    } else {
      html += `<div class="state-line zero" style="background:#f0f2f5">No phase: conflicting pushes from ${esc(pushers.join(' and '))} cancel out</div>`;
    }
    for (const id of st.viaLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'applied', month.links[id] ?? null);
    for (const id of st.pendingLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'pending', month.links[id] ?? null);
    html += `<h2>What it is</h2><p>${esc(node.summary.trim())}</p>`;
    html += `<h2>Sources</h2>${sourcesHtml(node.sources, ctx.sources)}`;
    return html;
  }
  if (st.pendingLinkIds.length > 0) {
    const first = ctx.linkById.get(st.pendingLinkIds[0])!;
    const phase = phaseForValue(node, first.effect);
    html += `<div class="state-line zero" style="background:#f0f2f5">Expected to be pushed toward ${esc(phase?.label ?? 'a phase')}, but out of season right now</div>`;
    for (const id of st.pendingLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'pending', month.links[id] ?? null);
    html += `<h2>What it is</h2><p>${esc(node.summary.trim())}</p>`;
    html += `<h2>Sources</h2>${sourcesHtml(node.sources, ctx.sources)}`;
    return html;
  }
  html += `<div class="state-line zero" style="background:#f0f2f5">Not part of the current scenario</div>`;
  html += `<p class="empty">Pick it under "Driver" or "Second driver" in the left panel to see its phases and connections.</p>`;
  html += `<h2>What it is</h2><p>${esc(node.summary.trim())}</p>`;
  html += `<h2>Sources</h2>${sourcesHtml(node.sources, ctx.sources)}`;
  return html;
}

/** Compare mode (M14): the same month on both sides, and which side the
 *  details below describe. */
export interface CardCompare {
  /** the side the rest of the card is about (the one being edited) */
  side: 'A' | 'B';
  a: { month: MonthState; title: string };
  b: { month: MonthState; title: string };
}

/** One node's state in one month, in plain words, for the comparison block. */
function stateWords(node: GraphNode, st: NodeState): { text: string; color: string } {
  if (node.kind === 'driver') {
    if (st.value === 0 && st.viaLinkIds.length === 0) {
      if (st.pendingLinkIds.length > 0) return { text: 'expected to be pushed, out of season', color: '#f0f2f5' };
      return { text: st.conflicting ? 'no phase: pushes cancel out' : 'not in play', color: '#f0f2f5' };
    }
    const phase = phaseForValue(node, st.value);
    return { text: phase?.label ?? 'a phase', color: phase?.color ?? '#f0f2f5' };
  }
  if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length === 0) return { text: 'no known effect', color: '#f0f2f5' };
  if (st.viaLinkIds.length === 0) return { text: 'expected, out of season', color: '#f0f2f5' };
  const label = st.value > 0 ? node.labels.plus : st.value < 0 ? node.labels.minus : node.labels.zero;
  return { text: st.conflicting ? `${label} (conflicting)` : label, color: st.value === 0 ? '#f0f2f5' : stateColor(node, st.value) };
}

const VERDICT_TEXT: Record<Verdict, string> = {
  none: 'Neither scenario acts here this month.',
  same: 'Same in both scenarios this month.',
  opposite: 'Opposite: the two scenarios pull this place different ways.',
  only_a: 'Only scenario A acts here this month.',
  only_b: 'Only scenario B acts here this month.',
  differ: 'The scenarios differ here: one pushes, the other is still waiting for its season, cancelled out or not in play.',
};

/** Side-by-side states of the node in both scenarios, a one-line verdict,
 *  and which side the rest of the card describes. */
function compareBlock(node: GraphNode, cmp: CardCompare): string {
  const a = cmp.a.month.nodes[node.id];
  const b = cmp.b.month.nodes[node.id];
  if (!a || !b) return '';
  const verdict = compareNode(a, b);
  const cell = (side: 'A' | 'B', title: string, st: NodeState) => {
    const w = stateWords(node, st);
    const light = w.color === '#f0f2f5';
    return `<div class="cmp-cell${side === cmp.side ? ' editing' : ''}"><div class="cmp-title"><span class="side-tag">${side}</span> ${esc(title)}</div>
      <div class="state-line ${light ? 'zero' : 'plus'}" style="background:${w.color}${light ? ';color:inherit' : ''}">${esc(w.text)}</div></div>`;
  };
  return `<div class="compare-block">
    <div class="cmp-grid">${cell('A', cmp.a.title, a)}${cell('B', cmp.b.title, b)}</div>
    <p class="cmp-verdict ${verdict}">${VERDICT_TEXT[verdict]}</p>
    <p class="hint">Details below are for scenario ${cmp.side}, the one you are editing. Switch sides in the left panel or click the other map's title to read the other.</p>
  </div>`;
}

/** `chosen` maps each driver chosen by hand to its phase and onset (one, or two since M11).
 *  `compare` (M14) adds the other scenario's month for a side-by-side block on top. */
export function renderCard(container: HTMLElement, graph: Graph, node: GraphNode | null, month: MonthState, chosen: Map<string, ChosenPhase>, compare?: CardCompare): void {
  if (!node) {
    container.innerHTML = `<h2>Details</h2><p class="empty">Click any circle on ${compare ? 'either map' : 'the map'} to read what tends to happen there, why, and how sure the science is.</p>`;
    return;
  }
  const ctx: Ctx = {
    sources: new Map(graph.sources.map((s) => [s.key, s])),
    nodeById: new Map(graph.nodes.map((n) => [n.id, n])),
    linkById: new Map(graph.links.map((l) => [l.id, l])),
    chosen,
  };
  let html = `<h3>${esc(node.name)}</h3><p class="region">${esc(node.region)} · ${esc(node.timescale)}</p>`;
  if (compare) html += compareBlock(node, compare);

  if (node.kind === 'driver') {
    container.innerHTML = html + driverCard(node, graph, ctx, month);
    return;
  }

  const st = month.nodes[node.id];
  const label = st.value > 0 ? node.labels.plus : st.value < 0 ? node.labels.minus : node.labels.zero;
  const cls = st.value > 0 ? 'plus' : st.value < 0 ? 'minus' : 'zero';
  const bg = st.value === 0 ? '#f0f2f5' : stateColor(node, st.value);
  html += `<div class="state-line ${cls}" style="background:${bg}">${esc(label)}${st.conflicting ? ' (conflicting influences)' : ''}</div>`;
  if (st.conflicting) {
    html += `<p class="hint">Two or more links push this place opposite ways this month. The map adds them up; here they ${st.value === 0 ? 'cancel out, so the marker is hatched' : 'do not fully cancel'}. Read each link’s "How sure are we?" to judge which is likelier to win.</p>`;
  }
  if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length === 0) {
    html += `<p class="empty">No known effect from ${ctx.chosen.size > 1 ? 'either chosen driver phase' : 'the current driver phase'} at this point in the timeline.</p>`;
  }
  html += `<p>${esc(node.summary.trim())}</p>`;
  for (const id of st.viaLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'applied', month.links[id] ?? null);
  for (const id of st.pendingLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'pending', month.links[id] ?? null);
  container.innerHTML = html;
}
