// Right panel: details for the selected node in the current month.

import type { DriverNode, Graph, GraphNode, Link, LinkState, MonthState, NodeState, OutcomeNode, Source } from '../types';
import { CONFIDENCE_TEXT, MONTH_NAMES } from '../types';
import { phaseForValue } from '../engine/propagate';
import { compareNode, type Verdict } from '../engine/compare';
import { countInfluences, type DriverInfluences, type Influence } from '../engine/inverse';
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
  /** how many months it holds the phase (M32); null = the whole year shown */
  hold: number | null;
  /** month index from which it holds no phase (`onset + hold`); null with no hold */
  fade: number | null;
}

/** Calendar month name `index` months after `startMonth`, for any index. */
function monthAt(startMonth: number, index: number): string {
  return MONTH_NAMES[((((startMonth - 1 + index) % 12) + 12) % 12)];
}

interface Ctx {
  sources: Map<string, Source>;
  nodeById: Map<string, GraphNode>;
  linkById: Map<string, Link>;
  /** drivers chosen by hand: id -> phase and onset (one, or two since M11) */
  chosen: Map<string, ChosenPhase>;
}

function linkBlock(link: Link, ctx: Ctx, status: 'applied' | 'pending' | 'faded', ls: LinkState | null): string {
  const timing = `Expected from month ${link.lag_months[0]}${link.lag_months[1] !== link.lag_months[0] ? `–${link.lag_months[1]}` : ''} after onset; season: ${seasonText(link)}.`;
  const from = ctx.nodeById.get(link.from);
  // Say where the link comes from when that is not obvious: "through" a
  // pushed driver, or "from" one of two chosen drivers.
  const fromLabel = !from || !ls ? '' : ls.depth > 1 ? `through ${esc(shortName(from))}` : ctx.chosen.size > 1 ? `from ${esc(shortName(from))}` : '';
  const via = fromLabel ? ` <span class="via">${fromLabel}</span>` : '';
  const toDriver = ctx.nodeById.get(link.to)?.kind === 'driver';
  // Lags count from the month the firing driver entered its phase: the month
  // it was pushed there, or the second chosen driver's own start month (M12).
  const chosenFrom = from ? ctx.chosen.get(from.id) : undefined;
  // Faded (M32): the chosen driver's phase has ended. Either the effect had
  // arrived and is no longer applied, or its lag was longer than the hold
  // and it never arrives on this map.
  const never = status === 'faded' && !!chosenFrom && chosenFrom.hold !== null && link.lag_months[0] >= chosenFrom.hold;
  const heading = status === 'pending' ? 'Expected, but out of season right now'
    : status === 'faded' ? (never ? 'Never arrives: the event ended first' : 'Faded: the event has ended')
    : toDriver ? 'What pushes it there' : 'Why this happens';
  const onsetNote = ls && ls.depth > 1 && from ? ` Month 0 here is when ${esc(shortName(from))} was pushed into this phase.`
    : ls && from && chosenFrom && chosenFrom.onset > 0 ? ` Month 0 here is ${MONTH_NAMES[chosenFrom.startMonth - 1]}, when ${esc(shortName(from))} entered its phase (month ${chosenFrom.onset} on the timeline).`
    : ls && from && chosenFrom && chosenFrom.onset < 0 ? ` Month 0 here is ${MONTH_NAMES[chosenFrom.startMonth - 1]}, when ${esc(shortName(from))} entered its phase, ${monthsWord(-chosenFrom.onset)} before the year shown begins.` : '';
  let fadeNote = '';
  if (status === 'faded' && from && chosenFrom && chosenFrom.hold !== null && chosenFrom.fade !== null) {
    fadeNote = never
      ? ` This effect needs ${monthsWord(link.lag_months[0])} to arrive and the event was set to last ${monthsWord(chosenFrom.hold)}, so on this map it never arrives; in reality the ocean can carry such an effect past the end of the event.`
      : ` Faded: ${esc(shortName(from))} was set to last ${monthsWord(chosenFrom.hold)} and its phase ended in ${monthAt(chosenFrom.startMonth, chosenFrom.hold)}${chosenFrom.fade > 0 ? ` (month ${chosenFrom.fade})` : ', before the year shown'}, so this effect is no longer applied.`;
  }
  return `<div class="link-block${status === 'faded' ? ' faded' : ''}">
    <h4>${heading}${via} <span class="badge ${ls?.confidence ?? link.confidence}">${ls?.confidence ?? link.confidence}</span></h4>
    <p>${esc(link.mechanism.trim())}</p>
    <p class="hint">${esc(timing)}${onsetNote}${fadeNote}</p>
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
    if (info.fade !== null && info.hold !== null && month.index >= info.fade) {
      // Chosen by hand, but its phase has ended (M32).
      const control = ctx.chosen.size > 1 && info.onset !== 0 ? '"Second driver lasts"' : '"Event lasts"';
      const line = info.fade <= 0
        ? `Over before the year shown began: entered ${label} in ${MONTH_NAMES[info.startMonth - 1]}, held it ${monthsWord(info.hold)}, and ended in ${monthAt(info.startMonth, info.hold)}`
        : `Faded: held ${label} from ${MONTH_NAMES[info.startMonth - 1]} for ${monthsWord(info.hold)}; no phase since ${monthAt(info.startMonth, info.hold)} (month ${info.fade})`;
      html += `<div class="state-line zero" style="background:#f0f2f5">${line}</div>`;
      html += `<p class="hint">You set how long this event lasts under ${control}. Since it ended its arrows are drawn grey and faded and apply nothing: the effects that had arrived have stopped, and any whose lag had not run by then never arrives on this map, though in reality the ocean can carry an effect past the end of an event. It is still not pushed by any other driver: a driver you chose stays pinned.</p>`;
      html += `<h2>What it is</h2><p>${esc(node.summary.trim())}</p>`;
      html += `<h2>Sources</h2>${sourcesHtml(node.sources, ctx.sources)}`;
      html += feedbackBlock(node, graph, ctx);
      return html;
    }
    html += `<div class="state-line" style="background:${phase?.color ?? '#ccc'};color:#fff">Current phase: ${label}${ctx.chosen.size > 1 ? ' · chosen by hand' : ''}</div>`;
    // Set to end (M32): say when.
    const lasts = info.fade !== null && info.hold !== null ? ` Set to last ${monthsWord(info.hold)}: it fades in ${monthAt(info.startMonth, info.hold)} (month ${info.fade}), and from then its arrows apply nothing.` : '';
    if (ctx.chosen.size > 1) {
      let when = '';
      if (info.onset > 0) when = ` It entered this phase in ${MONTH_NAMES[info.startMonth - 1]} (month ${info.onset} on the timeline); its links count their lag from then.`;
      else if (info.onset < 0) {
        // Began before the first driver (M15): already under way at month 0.
        const held = month.index - info.onset;
        when = ` It entered this phase in ${MONTH_NAMES[info.startMonth - 1]}, ${monthsWord(-info.onset)} before the year shown begins, and has held it since: ${monthsWord(held)} so far. Its links count their lag from then, so some of its effects were already being felt at month 0.`;
        if (held > 12) when += ` That is more than a year in one phase, longer than most real events last: treat the later months as a teaching convenience.`;
      }
      html += `<p class="hint">One of two drivers you chose. Its links fire at full confidence, and no link is allowed to push it into another phase.${when}${lasts}</p>`;
    } else if (lasts) {
      html += `<p class="hint">${lasts.trim()}</p>`;
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
  if (st.fadedLinkIds.length > 0) {
    // The push into it came from an event that has ended (M32).
    const first = ctx.linkById.get(st.fadedLinkIds[0])!;
    const phase = phaseForValue(node, first.effect);
    const pushers = [...new Set(st.fadedLinkIds.map((id) => ctx.linkById.get(id)?.from).filter((x): x is string => !!x))].map((id) => shortName(ctx.nodeById.get(id)!));
    html += `<div class="state-line zero" style="background:#f0f2f5">No phase: the push toward ${esc(phase?.label ?? 'a phase')} from ${esc(pushers.join(' and '))} has faded</div>`;
    html += `<p class="hint">The event that pushed it has ended, so it holds no phase and its own links do not fire.</p>`;
    for (const id of st.fadedLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'faded', month.links[id] ?? null);
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
      if (st.fadedLinkIds.length > 0) return { text: 'no phase: the push has faded', color: '#f0f2f5' };
      return { text: st.conflicting ? 'no phase: pushes cancel out' : 'not in play', color: '#f0f2f5' };
    }
    const phase = phaseForValue(node, st.value);
    return { text: phase?.label ?? 'a phase', color: phase?.color ?? '#f0f2f5' };
  }
  if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length === 0) return { text: st.fadedLinkIds.length > 0 ? 'faded: the event has ended' : 'no known effect', color: '#f0f2f5' };
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
    html += st.fadedLinkIds.length > 0
      ? `<p class="empty">Nothing acts here now: the only known ${st.fadedLinkIds.length === 1 ? 'effect' : 'effects'} came from an event that has ended (below).</p>`
      : `<p class="empty">No known effect from ${ctx.chosen.size > 1 ? 'either chosen driver phase' : 'the current driver phase'} at this point in the timeline.</p>`;
  }
  html += `<p>${esc(node.summary.trim())}</p>`;
  for (const id of st.viaLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'applied', month.links[id] ?? null);
  for (const id of st.pendingLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'pending', month.links[id] ?? null);
  for (const id of st.fadedLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'faded', month.links[id] ?? null);
  container.innerHTML = html;
}

// ---------------------------------------------------------------- region mode (M28)

/** "October–December", "all year", "June, September–November". */
function seasonRanges(link: Link): string {
  if (link.season.length === 0) return 'all year';
  const months = [...link.season].sort((a, b) => a - b);
  // Runs of consecutive months, joined across the year end (Dec–Feb).
  const runs: number[][] = [];
  for (const m of months) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === m - 1) last.push(m);
    else runs.push([m]);
  }
  if (runs.length > 1 && runs[0][0] === 1 && runs[runs.length - 1][runs[runs.length - 1].length - 1] === 12) {
    runs[0] = [...runs.pop()!, ...runs[0]];
  }
  return runs.map((r) => (r.length === 1 ? MONTH_NAMES[r[0] - 1] : `${MONTH_NAMES[r[0] - 1]}–${MONTH_NAMES[r[r.length - 1] - 1]}`)).join(', ');
}

/** "arriving 0–2 months after the event begins", "arriving 4 months after". */
function lagWords(link: Link): string {
  const [a, b] = link.lag_months;
  if (a === b) return a === 0 ? 'arriving as soon as the event begins' : `arriving ${monthsWord(a)} after the event begins`;
  return `arriving ${a}–${b} months after the event begins`;
}

/** Twelve cells, January first, the in-season ones filled. */
function stripHtml(inf: Influence, color: string): string {
  const cells = inf.months.map((on, i) => `<i class="${on ? 'on' : ''}" style="${on ? `background:${color}` : ''}" title="${MONTH_NAMES[i]}${on ? ': in season' : ''}">${MONTH_NAMES[i][0]}</i>`).join('');
  return `<span class="strip" aria-label="In season: ${esc(seasonRanges(inf.link))}">${cells}</span>`;
}

/**
 * Region mode (M28): the place, then one block per driver that reaches it,
 * phase by phase, each link with its tendency, tier, season, lag, the
 * mechanism, "How sure are we?" and sources. Nothing is computed: every
 * line is read from the data as it stands. A button per phase hands the
 * page a single-driver scenario to watch.
 */
export function renderRegionCard(container: HTMLElement, graph: Graph, node: OutcomeNode, groups: DriverInfluences[]): void {
  const sources = new Map(graph.sources.map((s) => [s.key, s]));
  const total = countInfluences(groups);
  let html = `<h3>${esc(node.name)}</h3><p class="region">${esc(node.region)} · ${esc(node.timescale)}</p>`;
  html += `<div class="state-line zero" style="background:#f0f2f5">Everything known to reach this place on this map: ${groups.length === 1 ? 'one driver' : `${groups.length} drivers`}, ${total === 1 ? 'one connection' : `${total} connections`}</div>`;
  html += `<p class="hint">Each connection is listed as the research rates it, with the months it is felt and how long after the driver's event it tends to arrive. Nothing is added up here: to see two drivers act together, or a driver reach this place through another, pick them under "Driver" on the left.</p>`;
  html += `<p>${esc(node.summary.trim())}</p>`;
  for (const g of groups) {
    html += `<h2>${esc(shortName(g.driver))}</h2>`;
    for (const ph of g.phases) {
      for (const inf of ph.links) {
        const l = inf.link;
        const tendency = l.effect > 0 ? node.labels.plus : node.labels.minus;
        html += `<div class="link-block region-link">
          <h4><span class="swatch" style="background:${ph.phase.color}"></span>${esc(ph.phase.label)}: ${esc(tendency)} <span class="badge ${inf.confidence}">${inf.confidence}</span></h4>
          <p class="hint">${esc(seasonRanges(l))}, ${esc(lagWords(l))}. ${stripHtml(inf, ph.phase.color)}</p>
          <p>${esc(l.mechanism.trim())}</p>
          ${sureBlock(l, null)}
          ${sourcesHtml(l.sources, sources)}
        </div>`;
      }
      html += `<p class="watch"><button type="button" class="watch-btn" data-driver="${esc(g.driver.id)}" data-phase="${esc(ph.phase.id)}"><span class="swatch" style="background:${ph.phase.color}"></span>Watch ${esc(ph.phase.label)} arrive</button></p>`;
    }
  }
  html += `<h2>Sources for the place</h2>${sourcesHtml(node.sources, sources)}`;
  container.innerHTML = html;
}
