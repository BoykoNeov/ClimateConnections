// Right panel: details for the selected node in the current month.

import type { Graph, GraphNode, Link, MonthState, Source } from '../types';
import { CONFIDENCE_TEXT, MONTH_NAMES } from '../types';
import { stateColor } from './map';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function seasonText(link: Link): string {
  if (link.season.length === 0) return 'all year';
  const names = [...link.season].map((m) => MONTH_NAMES[m - 1].slice(0, 3));
  return names.join(', ');
}

function sourcesHtml(keys: string[], sources: Map<string, Source>): string {
  const items = keys.map((k) => {
    const s = sources.get(k);
    if (!s) return `<li>${esc(k)}</li>`;
    return s.url ? `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.citation)}</a></li>` : `<li>${esc(s.citation)}</li>`;
  });
  return `<ul class="sources">${items.join('')}</ul>`;
}

function sureBlock(link: Link): string {
  return `<div class="sure"><strong>How sure are we?</strong>
    <span class="badge ${link.confidence}">${link.confidence}</span> ${esc(CONFIDENCE_TEXT[link.confidence])}
    <p><em>Why it might not happen:</em> ${esc(link.caveat.trim())}</p>
    ${link.evidence_note ? `<p><em>What the evidence says:</em> ${esc(link.evidence_note.trim())}</p>` : ''}
  </div>`;
}

function linkBlock(link: Link, sources: Map<string, Source>, status: 'applied' | 'pending'): string {
  const timing = `Expected from month ${link.lag_months[0]}${link.lag_months[1] !== link.lag_months[0] ? `–${link.lag_months[1]}` : ''} after onset; season: ${seasonText(link)}.`;
  return `<div class="link-block">
    <h4>${status === 'pending' ? 'Expected, but out of season right now' : 'Why this happens'} <span class="badge ${link.confidence}">${link.confidence}</span></h4>
    <p>${esc(link.mechanism.trim())}</p>
    <p class="hint">${esc(timing)}</p>
    ${sureBlock(link)}
    ${sourcesHtml(link.sources, sources)}
  </div>`;
}

export function renderCard(container: HTMLElement, graph: Graph, node: GraphNode | null, month: MonthState, driverId: string, phaseId: string): void {
  const sources = new Map(graph.sources.map((s) => [s.key, s]));
  if (!node) {
    container.innerHTML = `<h2>Details</h2><p class="empty">Click any circle on the map to read what tends to happen there, why, and how sure the science is.</p>`;
    return;
  }
  const linkById = new Map(graph.links.map((l) => [l.id, l]));
  let html = `<h3>${esc(node.name)}</h3><p class="region">${esc(node.region)} · ${esc(node.timescale)}</p>`;

  if (node.kind === 'driver') {
    if (node.id !== driverId) {
      html += `<div class="state-line zero" style="background:#f0f2f5">Not part of the current scenario</div>`;
      html += `<p class="empty">Pick it under "Driver" in the left panel to see its phases and connections.</p>`;
      html += `<h2>What it is</h2><p>${esc(node.summary.trim())}</p>`;
      html += `<h2>Sources</h2>${sourcesHtml(node.sources, sources)}`;
      container.innerHTML = html;
      return;
    }
    const phase = node.phases.find((p) => p.id === phaseId);
    html += `<div class="state-line" style="background:${phase?.color ?? '#ccc'};color:#fff">Current phase: ${esc(phase?.label ?? phaseId)}</div>`;
    html += `<p>${esc(phase?.summary.trim() ?? '')}</p><h2>What it is</h2><p>${esc(node.summary.trim())}</p>`;
    html += `<h2>Sources</h2>${sourcesHtml(node.sources, sources)}`;
    container.innerHTML = html;
    return;
  }

  const st = month.nodes[node.id];
  const label = st.value > 0 ? node.labels.plus : st.value < 0 ? node.labels.minus : node.labels.zero;
  const cls = st.value > 0 ? 'plus' : st.value < 0 ? 'minus' : 'zero';
  const bg = st.value === 0 ? '#f0f2f5' : stateColor(node, st.value);
  html += `<div class="state-line ${cls}" style="background:${bg}">${esc(label)}${st.conflicting ? ' (conflicting influences)' : ''}</div>`;
  if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length === 0) {
    html += `<p class="empty">No known effect from the current driver phase at this point in the timeline.</p>`;
  }
  html += `<p>${esc(node.summary.trim())}</p>`;
  for (const id of st.viaLinkIds) html += linkBlock(linkById.get(id)!, sources, 'applied');
  for (const id of st.pendingLinkIds) html += linkBlock(linkById.get(id)!, sources, 'pending');
  container.innerHTML = html;
}
