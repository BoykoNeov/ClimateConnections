// Right panel: details for the selected node in the current month.

import type { DriverNode, Graph, GraphNode, Link, LinkState, MonthState, Source } from '../types';
import { CONFIDENCE_TEXT, MONTH_NAMES } from '../types';
import { phaseForValue } from '../engine/propagate';
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

interface Ctx {
  sources: Map<string, Source>;
  nodeById: Map<string, GraphNode>;
  linkById: Map<string, Link>;
}

function linkBlock(link: Link, ctx: Ctx, status: 'applied' | 'pending', ls: LinkState | null): string {
  const timing = `Expected from month ${link.lag_months[0]}${link.lag_months[1] !== link.lag_months[0] ? `–${link.lag_months[1]}` : ''} after onset; season: ${seasonText(link)}.`;
  const from = ctx.nodeById.get(link.from);
  const via = ls && ls.depth > 1 && from ? ` <span class="via">through ${esc(shortName(from))}</span>` : '';
  const toDriver = ctx.nodeById.get(link.to)?.kind === 'driver';
  const heading = status === 'pending' ? 'Expected, but out of season right now' : toDriver ? 'What pushes it there' : 'Why this happens';
  const onsetNote = ls && ls.depth > 1 && from ? ` Month 0 here is when ${esc(shortName(from))} was pushed into this phase.` : '';
  return `<div class="link-block">
    <h4>${heading}${via} <span class="badge ${ls?.confidence ?? link.confidence}">${ls?.confidence ?? link.confidence}</span></h4>
    <p>${esc(link.mechanism.trim())}</p>
    <p class="hint">${esc(timing)}${onsetNote}</p>
    ${sureBlock(link, ls)}
    ${sourcesHtml(link.sources, ctx.sources)}
  </div>`;
}

/** Links from other drivers into this driver: never drawn when it is the
 *  scenario driver (they would loop back onto the chosen phase), so the
 *  card tells them in words. */
function feedbackBlock(node: DriverNode, graph: Graph, ctx: Ctx): string {
  const incoming = graph.links.filter((l) => l.to === node.id);
  if (incoming.length === 0) return '';
  let html = `<h2>Feedback from other drivers</h2>
    <p class="hint">Not drawn: an effect is never allowed to loop back onto the driver you picked. Pick the other driver to see these links in action.</p>`;
  for (const l of incoming) {
    const from = ctx.nodeById.get(l.from);
    if (!from || from.kind !== 'driver') continue;
    const fromPhase = from.phases.find((p) => p.id === l.when);
    const toPhase = phaseForValue(node, l.effect);
    html += `<div class="link-block">
      <h4>${esc(fromPhase?.label ?? l.when)} tends to push toward ${esc(toPhase?.label ?? String(l.effect))} <span class="badge ${l.confidence}">${l.confidence}</span></h4>
      <p>${esc(l.mechanism.trim())}</p>
      <p class="hint">Expected from month ${l.lag_months[0]}${l.lag_months[1] !== l.lag_months[0] ? `–${l.lag_months[1]}` : ''} after ${esc(shortName(from))} enters that phase; season: ${seasonText(l)}.</p>
      ${sureBlock(l, null)}
      ${sourcesHtml(l.sources, ctx.sources)}
    </div>`;
  }
  return html;
}

function driverCard(node: DriverNode, graph: Graph, ctx: Ctx, month: MonthState, driverId: string, phaseId: string): string {
  let html = '';
  const st = month.nodes[node.id];
  if (node.id === driverId) {
    const phase = node.phases.find((p) => p.id === phaseId);
    html += `<div class="state-line" style="background:${phase?.color ?? '#ccc'};color:#fff">Current phase: ${esc(phase?.label ?? phaseId)}</div>`;
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
  html += `<p class="empty">Pick it under "Driver" in the left panel to see its phases and connections.</p>`;
  html += `<h2>What it is</h2><p>${esc(node.summary.trim())}</p>`;
  html += `<h2>Sources</h2>${sourcesHtml(node.sources, ctx.sources)}`;
  return html;
}

export function renderCard(container: HTMLElement, graph: Graph, node: GraphNode | null, month: MonthState, driverId: string, phaseId: string): void {
  if (!node) {
    container.innerHTML = `<h2>Details</h2><p class="empty">Click any circle on the map to read what tends to happen there, why, and how sure the science is.</p>`;
    return;
  }
  const ctx: Ctx = {
    sources: new Map(graph.sources.map((s) => [s.key, s])),
    nodeById: new Map(graph.nodes.map((n) => [n.id, n])),
    linkById: new Map(graph.links.map((l) => [l.id, l])),
  };
  let html = `<h3>${esc(node.name)}</h3><p class="region">${esc(node.region)} · ${esc(node.timescale)}</p>`;

  if (node.kind === 'driver') {
    container.innerHTML = html + driverCard(node, graph, ctx, month, driverId, phaseId);
    return;
  }

  const st = month.nodes[node.id];
  const label = st.value > 0 ? node.labels.plus : st.value < 0 ? node.labels.minus : node.labels.zero;
  const cls = st.value > 0 ? 'plus' : st.value < 0 ? 'minus' : 'zero';
  const bg = st.value === 0 ? '#f0f2f5' : stateColor(node, st.value);
  html += `<div class="state-line ${cls}" style="background:${bg}">${esc(label)}${st.conflicting ? ' (conflicting influences)' : ''}</div>`;
  if (st.conflicting) {
    html += `<p class="hint">Two or more links push this place opposite ways this month. The map adds them up; here they ${st.value === 0 ? 'cancel out' : 'do not fully cancel'}. Read each link’s "How sure are we?" to judge which is likelier to win.</p>`;
  }
  if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length === 0) {
    html += `<p class="empty">No known effect from the current driver phase at this point in the timeline.</p>`;
  }
  html += `<p>${esc(node.summary.trim())}</p>`;
  for (const id of st.viaLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'applied', month.links[id] ?? null);
  for (const id of st.pendingLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'pending', month.links[id] ?? null);
  container.innerHTML = html;
}
