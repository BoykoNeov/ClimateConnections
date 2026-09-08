// Right panel: details for the selected node in the current month.

import type { DriverNode, Graph, GraphNode, ImpactNode, Link, LinkState, Modulation, MonthState, NodeState, OutcomeNode, Phase, Source } from '../types';
import { CONFIDENCE_TEXT, MONTH_NAMES } from '../types';
import { downgrade, phaseForValue } from '../engine/propagate';
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

/** "<driver> is in its <phase> phase", naming both from the data. */
function modulatorWords(w: Modulation, nodeById: Map<string, GraphNode>): string {
  const d = nodeById.get(w.driver);
  const phase = d?.kind === 'driver' ? d.phases.find((p) => p.id === w.phase) : undefined;
  return `${esc(d ? shortName(d) : w.driver)} is in its ${esc(phase?.label ?? w.phase)} phase`;
}

/** The modulation lines of "How sure are we?" (M35, rule 10). In force
 *  this month (`ls.weakenedBy`): which chosen driver weakens the link and
 *  what that did to the tier, with the studies. Otherwise, for a link that
 *  can be weakened: when, so the student knows what to add. */
function modulationHtml(link: Link, ls: LinkState | null, nodeById: Map<string, GraphNode>, sources: Map<string, Source>): string {
  if (!link.weakened_by || link.weakened_by.length === 0) return '';
  const inForce = ls?.weakenedBy ?? [];
  if (inForce.length > 0) {
    const hops = ls ? ls.depth - 1 : 0;
    // The tier before the weakening, ignoring the cap at the pushing driver's tier.
    const atFloor = downgrade(link.confidence, hops) === 'contested';
    const who = inForce.map((w) => modulatorWords(w, nodeById)).join(' and ');
    const what = atFloor ? 'this link, already at the lowest tier, keeps its line style but can be expected to show up less reliably still'
      : hops > 0 ? 'this link is drawn one tier lower still' : 'this link is drawn one tier lower than its rating';
    const keys = [...new Set(inForce.flatMap((w) => w.sources))];
    return `<p class="hint weaker"><strong>Weaker this month:</strong> ${who} in this scenario, so ${what}. It is still applied, with the same effect, in the same months.</p>${sourcesHtml(keys, sources)}`;
  }
  const when = link.weakened_by.map((w) => modulatorWords(w, nodeById).replace(' is in its ', ' in its ')).join(', or ');
  const keys = [...new Set(link.weakened_by.flatMap((w) => w.sources))];
  return `<p class="hint weaker"><strong>Weaker when</strong> ${when}: choose that driver too and this link drops one tier while both are in phase.</p>${sourcesHtml(keys, sources)}`;
}

/** The fixed sentence on every impact's card (M37, rule 12): in the UI, not
 *  in the data, so no impact can be written without it. */
export const IMPACT_NOTE = 'How much of this reaches people depends on preparation, prices and policy; the map shows only the push from the weather.';

/** "How sure are we?" for a link as it acts this month. `ls` carries the
 *  confidence after the per-hop downgrade and, M35, the modulation; when
 *  it differs from the link's own rating the block says why. An impact
 *  link (M37) is always shown below its rating, one hop beyond the weather. */
function sureBlock(link: Link, ls: LinkState | null, nodeById: Map<string, GraphNode>, sources: Map<string, Source>): string {
  const shown = ls?.confidence ?? link.confidence;
  const byHops = !!ls && ls.depth > 1 && shown !== link.confidence;
  const fromOutcome = nodeById.get(link.from)?.kind === 'outcome';
  const why = fromOutcome
    ? 'It is shown one tier lower because it is one step further from the driver than the weather it follows from, and never higher than that weather’s own tier.'
    : 'It is shown one tier lower for each driver it passes through, and never higher than the link that set that driver off.';
  return `<div class="sure"><strong>How sure are we?</strong>
    <span class="badge ${shown}">${shown}</span> ${esc(CONFIDENCE_TEXT[shown])}
    ${byHops ? `<p class="hint">The source rates this link <em>${link.confidence}</em>. ${why}</p>` : ''}
    ${modulationHtml(link, ls, nodeById, sources)}
    <p><em>Why it might not happen:</em> ${esc(link.caveat.trim())}</p>
    ${link.evidence_note ? `<p><em>What the evidence says:</em> ${esc(link.evidence_note.trim())}</p>` : ''}
  </div>`;
}

/** What a driver weakens (M35): the links that name one of its phases in
 *  `weakened_by`, grouped by phase, on the driver's own card. */
function weakensBlock(node: DriverNode, graph: Graph, ctx: Ctx): string {
  const byPhase = new Map<string, Link[]>();
  for (const l of graph.links) {
    for (const w of l.weakened_by ?? []) {
      if (w.driver !== node.id) continue;
      byPhase.set(w.phase, [...(byPhase.get(w.phase) ?? []), l]);
    }
  }
  if (byPhase.size === 0) return '';
  let html = `<h2>Links it weakens</h2>
    <p class="hint">Not an effect of its own: while this driver is chosen and holds the phase named, each link below is drawn one confidence tier lower (dashed instead of solid) and its card says so. Nothing is added up and the link still applies.</p>`;
  for (const [phaseId, links] of byPhase) {
    const phase = node.phases.find((p) => p.id === phaseId);
    const items = links.map((l) => {
      const from = ctx.nodeById.get(l.from);
      const fromPhase = from?.kind === 'driver' ? from.phases.find((p) => p.id === l.when) : undefined;
      const to = ctx.nodeById.get(l.to);
      return `<li>${esc(fromPhase?.label ?? l.when)} → ${esc(to ? shortName(to) : l.to)} <span class="badge ${l.confidence}">${l.confidence}</span></li>`;
    });
    html += `<h4><span class="swatch" style="background:${phase?.color ?? '#999'}"></span>${esc(phase?.label ?? phaseId)} weakens</h4><ul class="weakens">${items.join('')}</ul>`;
  }
  return html;
}

/** A driver chosen by hand: its phase, and when it enters it (M12: a
 *  chosen driver other than the first may start later than month 0; M15:
 *  or before it). */
export interface ChosenPhase {
  phaseId: string;
  /** month index at which the driver enters the phase (0 for the first
   *  driver; negative when another chosen driver began before the first) */
  onset: number;
  /** calendar month (1–12) of that onset */
  startMonth: number;
  /** how many months it holds the phase (M32); null = the whole year shown */
  hold: number | null;
  /** month index from which it holds no phase (`onset + hold`); null with no hold */
  fade: number | null;
  /** the control that sets its hold, to name it: "Event lasts", "Second driver lasts", ... */
  control: string;
  /** in year mode (M34): what the record says where the engine reads the
   *  phase differently (a start more than a year back, a hold it cannot place) */
  record?: string;
}

/** "two", "three", ... for small counts, digits beyond. */
function countWord(n: number): string {
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'][n] ?? String(n);
}

/** Calendar month name `index` months after `startMonth`, for any index. */
function monthAt(startMonth: number, index: number): string {
  return MONTH_NAMES[((((startMonth - 1 + index) % 12) + 12) % 12)];
}

interface Ctx {
  sources: Map<string, Source>;
  nodeById: Map<string, GraphNode>;
  linkById: Map<string, Link>;
  /** drivers chosen by hand: id -> phase and onset (one; two since M11; any number since M33) */
  chosen: Map<string, ChosenPhase>;
  /** the real year on show (M34): the chosen drivers come from the record, not the controls */
  year?: number;
  /** the impacts layer is on (M37): an outcome's card lists the impacts that follow from it */
  impacts?: boolean;
  /** the arrival window is shown (M30): the timing lines say the window */
  window?: boolean;
}

/** The timing line of a link block: the lag range, counted from `after`
 *  ("after onset", "after Indonesia first shows \"drier\""), and the season.
 *  With the arrival window shown (M30) and a range wider than one month it
 *  says the window instead, in one of three forms: not yet settled (the
 *  arrow is faint), settled (the later month has passed), or pending. A
 *  faded link, or one not reported this month, keeps the plain form. */
function timingLine(link: Link, ctx: Ctx, status: 'applied' | 'pending' | 'faded', ls: LinkState | null, after: string): string {
  const [a, b] = link.lag_months;
  const season = `season: ${seasonText(link)}`;
  const plain = `Expected from month ${a}${b !== a ? `–${b}` : ''} ${after}; ${season}.`;
  if (!ctx.window || status === 'faded' || !ls) return plain;
  if (a === b) return `${plain} The studies give one lag here, so there is no arrival window.`;
  let text: string;
  if (status === 'pending') text = `May arrive any time from month ${a} to month ${b} ${after}; ${season}. Out of season now; in season it is drawn faint until month ${b}${ls.settled ? ', which has passed' : ''}.`;
  else if (ls.settled) text = `Could have arrived any time from month ${a} to month ${b} ${after}; month ${b} has passed, so the arrow is drawn in full. ${season[0].toUpperCase()}${season.slice(1)}.`;
  else text = `May arrive any time from month ${a} to month ${b} ${after}; drawn faint until month ${b}. ${season[0].toUpperCase()}${season.slice(1)}.`;
  return `<span class="window">${text}</span>`;
}

/** "you chose" or, in year mode, "set from the record for 1997". */
function whoChose(ctx: Ctx): string {
  return ctx.year === undefined ? 'you chose' : `set from the record for ${ctx.year}`;
}

/** "the tendency" a link pushes its target toward, in the target's own words. */
function tendencyWords(link: Link, to: GraphNode | undefined): string {
  if (!to) return link.effect > 0 ? 'higher' : 'lower';
  if (to.kind === 'driver') return `toward ${phaseForValue(to, link.effect)?.label ?? 'a phase'}`;
  return link.effect > 0 ? to.labels.plus : to.labels.minus;
}

/** The kind note of a link block (M36, rule 11): "Only for this kind" on a
 *  link of a variant phase; "Holds for both kinds" on a parent's link
 *  fired by a chosen driver holding a variant. Empty otherwise. */
function kindNote(link: Link, from: GraphNode | undefined, ctx: Ctx): string {
  if (!from || from.kind !== 'driver') return '';
  const when = from.phases.find((p) => p.id === link.when);
  if (!when) return '';
  if (when.variant_of) return ` <span class="kind-note">Only for this kind: ${esc(when.label)}.</span>`;
  const chosen = ctx.chosen.get(from.id);
  const held = chosen ? from.phases.find((p) => p.id === chosen.phaseId) : undefined;
  if (held?.variant_of === when.id) return ` <span class="kind-note">Holds for both kinds of ${esc(when.label)}.</span>`;
  return '';
}

/** A link block for an impact link (M37, rule 12): what it follows from
 *  (the outcome and its state), the mechanism, the timing counted from the
 *  month the outcome first held that state, and "How sure are we?". */
function impactLinkBlock(link: Link, from: OutcomeNode, ctx: Ctx, status: 'applied' | 'pending', ls: LinkState | null): string {
  const state = link.when === 'plus' ? from.labels.plus : from.labels.minus;
  const heading = status === 'pending' ? 'Expected, but out of season right now' : 'What pushes it';
  const timing = `${timingLine(link, ctx, status, ls, `after ${esc(shortName(from))} first shows "${esc(state.toLowerCase())}"`)} Drawn only while that place holds this state.`;
  return `<div class="link-block impact-link">
    <h4>${heading} <span class="via">from ${esc(shortName(from))}: ${esc(state.toLowerCase())}</span> <span class="badge ${ls?.confidence ?? link.confidence}">${ls?.confidence ?? link.confidence}</span></h4>
    <p>${esc(link.mechanism.trim())}</p>
    <p class="hint">${timing}</p>
    ${sureBlock(link, ls, ctx.nodeById, ctx.sources)}
    ${sourcesHtml(link.sources, ctx.sources)}
  </div>`;
}

function linkBlock(link: Link, ctx: Ctx, status: 'applied' | 'pending' | 'faded', ls: LinkState | null): string {
  const from = ctx.nodeById.get(link.from);
  if (from?.kind === 'outcome' && status !== 'faded') return impactLinkBlock(link, from, ctx, status, ls);
  const timing = timingLine(link, ctx, status, ls, 'after onset');
  // Say where the link comes from when that is not obvious: "through" a
  // pushed driver, or "from" one of two chosen drivers.
  const fromLabel = !from || !ls ? '' : ls.depth > 1 ? `through ${esc(shortName(from))}` : ctx.chosen.size > 1 ? `from ${esc(shortName(from))}` : '';
  const via = fromLabel ? ` <span class="via">${fromLabel}</span>` : '';
  const toDriver = ctx.nodeById.get(link.to)?.kind === 'driver';
  // Lags count from the month the firing driver entered its phase: the month
  // it was pushed there, or a chosen driver's own start month (M12).
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
    <p class="hint">${timing}${onsetNote}${fadeNote}${kindNote(link, from, ctx)}</p>
    ${sureBlock(link, ls, ctx.nodeById, ctx.sources)}
    ${sourcesHtml(link.sources, ctx.sources)}
  </div>`;
}

/** The parent-phase links into a place that a chosen driver holding a
 *  variant does not fire (M36, rule 11): [link, the driver, the variant
 *  it holds, the parent phase]. Only while the driver is in its phase. */
function exceptedInto(nodeId: string, ctx: Ctx, month: MonthState): { link: Link; driver: DriverNode; held: Phase; parent: Phase }[] {
  const out: { link: Link; driver: DriverNode; held: Phase; parent: Phase }[] = [];
  for (const [driverId, info] of ctx.chosen) {
    if (month.index < info.onset || (info.fade !== null && month.index >= info.fade)) continue;
    const driver = ctx.nodeById.get(driverId);
    if (!driver || driver.kind !== 'driver') continue;
    const held = driver.phases.find((p) => p.id === info.phaseId);
    const parent = held?.variant_of ? driver.phases.find((p) => p.id === held.variant_of) : undefined;
    if (!held || !parent) continue;
    for (const link of ctx.linkById.values()) {
      if (link.from === driverId && link.when === parent.id && link.to === nodeId && (link.except ?? []).includes(held.id)) out.push({ link, driver, held, parent });
    }
  }
  return out;
}

/** "Not expected in this kind": a classic link that does not hold for the
 *  chosen variant, with when it would have been felt, the parent link's
 *  evidence note and sources. */
function exceptedBlock(x: { link: Link; driver: DriverNode; held: Phase; parent: Phase }, ctx: Ctx): string {
  const { link, driver, held, parent } = x;
  const to = ctx.nodeById.get(link.to);
  const timing = `A classic ${esc(parent.label)} would be felt here from month ${link.lag_months[0]}${link.lag_months[1] !== link.lag_months[0] ? `–${link.lag_months[1]}` : ''} after onset, season: ${seasonText(link)}.`;
  return `<div class="link-block excepted">
    <h4>Not expected in this kind <span class="via">from ${esc(shortName(driver))}</span> <span class="badge ${link.confidence}">${link.confidence}</span></h4>
    <p>${esc(parent.label)} usually brings "${esc(tendencyWords(link, to))}" here (a link rated ${link.confidence}), but that link is not drawn for ${esc(held.label)}, the kind ${ctx.year === undefined ? 'chosen on the left' : `set for ${ctx.year}`}. Nothing is being predicted here: the map says the classic effect is not expected in this kind.</p>
    <p class="hint">${timing}</p>
    ${link.evidence_note ? `<p><em>What the evidence says:</em> ${esc(link.evidence_note.trim())}</p>` : ''}
    ${sourcesHtml(link.sources, ctx.sources)}
  </div>`;
}

/** The fixed sentence on strength (rule 13): not a climate fact, a property of the map. */
const STRENGTH_NOTE = 'Strength is not a kind: a stronger event tends to give the same map more reliably, and this map draws direction only, never size.';

/** "What is different in this kind" (M36, rule 11) on the card of a driver
 *  chosen in a variant phase: the variant's own links, the parent's links
 *  that do not hold for it, and what the map cannot tell. */
function variantBlock(node: DriverNode, phase: Phase, graph: Graph, ctx: Ctx): string {
  const parent = node.phases.find((p) => p.id === phase.variant_of);
  if (!parent) return '';
  const own = graph.links.filter((l) => l.from === node.id && l.when === phase.id);
  const dropped = graph.links.filter((l) => l.from === node.id && l.when === parent.id && (l.except ?? []).includes(phase.id));
  const item = (l: Link, note: string, cls = '') => {
    const to = ctx.nodeById.get(l.to);
    return `<li${cls ? ` class="${cls}"` : ''}>${esc(to ? shortName(to) : l.to)}: ${esc(tendencyWords(l, to))} <span class="badge ${l.confidence}">${l.confidence}</span>${note}</li>`;
  };
  const replaces = new Set(dropped.map((l) => l.to));
  let html = `<h2>What is different in this kind</h2>`;
  if (own.length > 0) {
    html += `<p class="hint">Links of its own, drawn only for ${esc(phase.label)}:</p><ul class="kinds">${own.map((l) => item(l, replaces.has(l.to) ? ` <span class="hint">(replaces the ${esc(parent.label)} link)</span>` : '')).join('')}</ul>`;
  }
  const notReplaced = dropped.filter((l) => !own.some((o) => o.to === l.to));
  if (notReplaced.length > 0) {
    html += `<p class="hint">Not expected in this kind, so not drawn: the ${esc(parent.label)} links to</p><ul class="kinds">${notReplaced.map((l) => item(l, '', 'dropped')).join('')}</ul>`;
  }
  const inherited = graph.links.filter((l) => l.from === node.id && l.when === parent.id && !(l.except ?? []).includes(phase.id)).length;
  html += `<p class="hint">Every other ${esc(parent.label)} link (${inherited === 1 ? 'one' : countWord(inherited)} of them) is drawn for this kind too, as far as the evidence goes; each of their cards says "Holds for both kinds". ${STRENGTH_NOTE} A driver pushed into ${esc(parent.label)} along a chain is always drawn as the classic kind: the map cannot tell which kind it would be.</p>`;
  return html;
}

/** On the card of a driver chosen in a phase that has variants: where the
 *  other kinds are. */
function kindsHint(node: DriverNode, phase: Phase): string {
  const kinds = node.phases.filter((p) => p.variant_of === phase.id);
  if (kinds.length === 0) return '';
  return `<p class="hint">This is the classic kind. ${kinds.length === 1 ? 'Another kind' : 'Other kinds'}, ${esc(kinds.map((k) => k.label).join(', '))}, can be picked under "Which kind of ${esc(phase.label)}?" on the left; its card starts with what is different. ${STRENGTH_NOTE}</p>`;
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
    const alsoChosen = ctx.chosen.has(from.id) ? `<p class="hint">${esc(shortName(from))} is also ${ctx.year === undefined ? 'chosen by hand in this scenario, so this link is skipped: you have set both phases' : `recorded for ${ctx.year}, so this link is skipped: both phases come from the record`}.</p>` : '';
    html += `<div class="link-block">
      <h4>${esc(fromPhase?.label ?? l.when)} tends to push toward ${esc(toPhase?.label ?? String(l.effect))} <span class="badge ${l.confidence}">${l.confidence}</span></h4>
      ${alsoChosen}
      <p>${esc(l.mechanism.trim())}</p>
      <p class="hint">Expected from month ${l.lag_months[0]}${l.lag_months[1] !== l.lag_months[0] ? `–${l.lag_months[1]}` : ''} after ${esc(shortName(from))} enters that phase; season: ${seasonText(l)}.</p>
      ${sureBlock(l, null, ctx.nodeById, ctx.sources)}
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
      html += `<p class="hint">One of ${countWord(ctx.chosen.size)} drivers ${whoChose(ctx)}, with a start month of its own. Until then it is held out of play: it has no phase, its links do not fire, and no link is allowed to push it.</p>`;
      html += `<h2>What it is</h2><p>${esc(node.summary.trim())}</p>`;
      html += `<h2>Sources</h2>${sourcesHtml(node.sources, ctx.sources)}`;
      html += feedbackBlock(node, graph, ctx);
      return html;
    }
    if (info.fade !== null && info.hold !== null && month.index >= info.fade) {
      // Chosen by hand, but its phase has ended (M32).
      const control = `"${esc(info.control)}"`;
      const line = info.fade <= 0
        ? `Over before the year shown began: entered ${label} in ${MONTH_NAMES[info.startMonth - 1]}, held it ${monthsWord(info.hold)}, and ended in ${monthAt(info.startMonth, info.hold)}`
        : `Faded: held ${label} from ${MONTH_NAMES[info.startMonth - 1]} for ${monthsWord(info.hold)}; no phase since ${monthAt(info.startMonth, info.hold)} (month ${info.fade})`;
      html += `<div class="state-line zero" style="background:#f0f2f5">${line}</div>`;
      html += `<p class="hint">${ctx.year === undefined ? `You set how long this event lasts under ${control}.` : `The record for ${ctx.year} has this event ending here.${info.record ? ` ${esc(info.record)}` : ''}`} Since it ended its arrows are drawn grey and faded and apply nothing: the effects that had arrived have stopped, and any whose lag had not run by then never arrives on this map, though in reality the ocean can carry an effect past the end of an event. It is still not pushed by any other driver: a ${ctx.year === undefined ? 'driver you chose' : 'recorded driver'} stays pinned.</p>`;
      html += `<h2>What it is</h2><p>${esc(node.summary.trim())}</p>`;
      html += `<h2>Sources</h2>${sourcesHtml(node.sources, ctx.sources)}`;
      html += feedbackBlock(node, graph, ctx);
      return html;
    }
    html += `<div class="state-line" style="background:${phase?.color ?? '#ccc'};color:#fff">Current phase: ${label}${ctx.year !== undefined ? ' · from the record' : ctx.chosen.size > 1 ? ' · chosen by hand' : ''}</div>`;
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
      html += `<p class="hint">One of ${countWord(ctx.chosen.size)} drivers ${whoChose(ctx)}. Its links fire at full confidence, and no link is allowed to push it into another phase.${when}${lasts}${info.record ? ` ${esc(info.record)}` : ''}</p>`;
    } else if (lasts || info.record) {
      html += `<p class="hint">${lasts.trim()}${info.record ? ` ${esc(info.record)}` : ''}</p>`;
    }
    html += `<p>${esc(phase?.summary.trim() ?? '')}</p>`;
    // A kind of a phase (M36): what is different, before anything else.
    if (phase?.variant_of) html += variantBlock(node, phase, graph, ctx);
    else if (phase) html += kindsHint(node, phase);
    html += `<h2>What it is</h2><p>${esc(node.summary.trim())}</p>`;
    html += `<h2>Sources</h2>${sourcesHtml(node.sources, ctx.sources)}`;
    html += weakensBlock(node, graph, ctx);
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
      html += `<p class="hint">Its own links now fire from this marker, one confidence tier lower than on its own card.${node.phases.some((p) => p.variant_of === phase.id) ? ` A driver pushed along a chain is always drawn in the classic kind of ${esc(phase.label)}: the map cannot tell which kind it would be.` : ''}</p>`;
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
  html += `<div class="state-line zero" style="background:#f0f2f5">${ctx.year === undefined ? 'Not part of the current scenario' : `Not recorded for ${ctx.year}`}</div>`;
  html += ctx.year === undefined
    ? `<p class="empty">Pick it under "Driver", "Second driver" or "More drivers" in the left panel to see its phases and connections.</p>`
    : `<p class="empty">The table of real years has no index for this driver. The map may still push it into a phase along a chain from a recorded driver; that is a tendency, not a record.</p>`;
  html += `<h2>What it is</h2><p>${esc(node.summary.trim())}</p>`;
  html += `<h2>Sources</h2>${sourcesHtml(node.sources, ctx.sources)}`;
  html += weakensBlock(node, graph, ctx);
  return html;
}

/** Compare mode (M14): the same month on both sides, and which side the
 *  details below describe. */
export interface CardCompare {
  /** the side the rest of the card is about (the one being edited) */
  side: 'A' | 'B';
  a: { month: MonthState; title: string; chosen?: Map<string, ChosenPhase> };
  b: { month: MonthState; title: string; chosen?: Map<string, ChosenPhase> };
}

/** One node's state in one month, in plain words, for the comparison block.
 *  `chosen` names the phase a driver chosen by hand holds on that side, so
 *  a kind of a phase (M36) is named rather than its parent. */
function stateWords(node: GraphNode, st: NodeState, chosen?: Map<string, ChosenPhase>): { text: string; color: string } {
  if (node.kind === 'driver') {
    if (st.value === 0 && st.viaLinkIds.length === 0) {
      if (st.pendingLinkIds.length > 0) return { text: 'expected to be pushed, out of season', color: '#f0f2f5' };
      if (st.fadedLinkIds.length > 0) return { text: 'no phase: the push has faded', color: '#f0f2f5' };
      return { text: st.conflicting ? 'no phase: pushes cancel out' : 'not in play', color: '#f0f2f5' };
    }
    const held = chosen?.get(node.id) ? node.phases.find((p) => p.id === chosen.get(node.id)!.phaseId) : undefined;
    const phase = held && held.value === st.value ? held : phaseForValue(node, st.value);
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
  const cell = (side: 'A' | 'B', title: string, st: NodeState, chosen?: Map<string, ChosenPhase>) => {
    const w = stateWords(node, st, chosen);
    const light = w.color === '#f0f2f5';
    return `<div class="cmp-cell${side === cmp.side ? ' editing' : ''}"><div class="cmp-title"><span class="side-tag">${side}</span> ${esc(title)}</div>
      <div class="state-line ${light ? 'zero' : 'plus'}" style="background:${w.color}${light ? ';color:inherit' : ''}">${esc(w.text)}</div></div>`;
  };
  return `<div class="compare-block">
    <div class="cmp-grid">${cell('A', cmp.a.title, a, cmp.a.chosen)}${cell('B', cmp.b.title, b, cmp.b.chosen)}</div>
    <p class="cmp-verdict ${verdict}">${VERDICT_TEXT[verdict]}</p>
    <p class="hint">Details below are for scenario ${cmp.side}, the one you are editing. Switch sides in the left panel or click the other map's title to read the other.</p>
  </div>`;
}

/** The impacts on people that follow from an outcome (M37), on its card:
 *  with the layer on, each with its tendency, tier and whether it is drawn
 *  this month; with the layer off, one line saying how many and where to
 *  turn them on. Empty when none follow. */
function impactsFromBlock(node: OutcomeNode, graph: Graph, ctx: Ctx, month: MonthState): string {
  const out = graph.links.filter((l) => l.from === node.id);
  if (out.length === 0) return '';
  if (!ctx.impacts) {
    return `<p class="hint impacts-off">${out.length === 1 ? 'One impact on people follows' : `${countWord(out.length)} impacts on people follow`} from this place; turn on "Impacts on people" under Map, on the left, to see ${out.length === 1 ? 'it' : 'them'}.</p>`;
  }
  const items = out.map((l) => {
    const to = ctx.nodeById.get(l.to);
    const ls = month.links[l.id];
    const state = l.when === 'plus' ? node.labels.plus : node.labels.minus;
    const now = ls?.status === 'applied' ? 'drawn this month' : ls?.status === 'pending' ? 'out of season this month' : ls?.status === 'ghost' ? 'below the confidence filter' : `not now: it follows "${esc(state.toLowerCase())}"`;
    return `<li${ls?.status === 'applied' ? '' : ' class="off"'}>${esc(to ? shortName(to) : l.to)}: ${esc(tendencyWords(l, to))} <span class="badge ${l.confidence}">${l.confidence}</span> <span class="hint">${now}</span></li>`;
  });
  return `<h2>Impacts on people that follow</h2>
    <p class="hint">Squares on the map. Each is drawn one tier lower than its rating, and only while this place holds the state it follows from. ${esc(IMPACT_NOTE)}</p>
    <ul class="impacts">${items.join('')}</ul>`;
}

/** The card of an impact on people (M37, rule 12): the sector, the fixed
 *  sentence, the state in plain words and one block per impact link. */
function impactCard(node: ImpactNode, ctx: Ctx, month: MonthState): string {
  const st = month.nodes[node.id];
  const label = st.value > 0 ? node.labels.plus : st.value < 0 ? node.labels.minus : node.labels.zero;
  const cls = st.value > 0 ? 'plus' : st.value < 0 ? 'minus' : 'zero';
  const bg = st.value === 0 ? '#f0f2f5' : stateColor(node, st.value);
  let html = `<p class="sector">Sector: ${esc(node.sector)}</p>`;
  html += `<p class="impact-note">${esc(IMPACT_NOTE)}</p>`;
  html += `<div class="state-line ${cls}" style="background:${bg}">${esc(label)}${st.conflicting ? ' (conflicting influences)' : ''}</div>`;
  if (st.conflicting) {
    html += `<p class="hint">Two or more links push this the opposite way this month. The map adds them up; here they ${st.value === 0 ? 'cancel out, so the square is hatched' : 'do not fully cancel'}.</p>`;
  }
  if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length === 0) {
    const from = [...new Set([...ctx.linkById.values()].filter((l) => l.to === node.id).map((l) => ctx.nodeById.get(l.from)).filter((n): n is GraphNode => !!n).map(shortName))];
    html += `<p class="empty">No push from the weather at this point in the timeline: ${from.length > 0 ? `${esc(from.join(' and '))} ${from.length > 1 ? 'do' : 'does'} not hold the state this follows from` : 'nothing reaches it'}.</p>`;
  }
  html += `<p>${esc(node.summary.trim())}</p>`;
  for (const id of st.viaLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'applied', month.links[id] ?? null);
  for (const id of st.pendingLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'pending', month.links[id] ?? null);
  html += `<h2>Sources</h2>${sourcesHtml(node.sources, ctx.sources)}`;
  return html;
}

/** `chosen` maps each driver chosen by hand to its phase and onset (one, or two since M11).
 *  `compare` (M14) adds the other scenario's month for a side-by-side block on top.
 *  `year` (M34) says the chosen drivers come from the table of real years, so
 *  the wording says "from the record" instead of "you chose".
 *  `impacts` (M37) says the impacts layer is on; `window` (M30) that the
 *  arrival window is shown, so the timing lines say it. */
export function renderCard(container: HTMLElement, graph: Graph, node: GraphNode | null, month: MonthState, chosen: Map<string, ChosenPhase>, compare?: CardCompare, year?: number, impacts = false, window = false): void {
  if (!node) {
    container.innerHTML = `<h2>Details</h2><p class="empty">Click any circle on ${compare ? 'either map' : 'the map'} to read what tends to happen there, why, and how sure the science is.</p>`;
    return;
  }
  const ctx: Ctx = {
    sources: new Map(graph.sources.map((s) => [s.key, s])),
    nodeById: new Map(graph.nodes.map((n) => [n.id, n])),
    linkById: new Map(graph.links.map((l) => [l.id, l])),
    chosen,
    impacts,
    window,
  };
  if (year !== undefined) ctx.year = year;
  let html = `<h3>${esc(node.name)}</h3><p class="region">${esc(node.region)} · ${esc(node.timescale)}</p>`;
  if (compare) html += compareBlock(node, compare);

  if (node.kind === 'driver') {
    container.innerHTML = html + driverCard(node, graph, ctx, month);
    return;
  }
  if (node.kind === 'impact') {
    container.innerHTML = html + impactCard(node, ctx, month);
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
  // Classic links a chosen kind of a phase does not fire here (M36, rule 11).
  const excepted = exceptedInto(node.id, ctx, month);
  if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length === 0) {
    html += st.fadedLinkIds.length > 0
      ? `<p class="empty">Nothing acts here now: the only known ${st.fadedLinkIds.length === 1 ? 'effect' : 'effects'} came from an event that has ended (below).</p>`
      : excepted.length > 0
        ? `<p class="empty">Nothing acts here: the classic ${esc(excepted[0].parent.label)} link is not expected in ${esc(excepted[0].held.label)} (below).</p>`
        : `<p class="empty">No known effect from ${ctx.chosen.size > 1 ? 'either chosen driver phase' : 'the current driver phase'} at this point in the timeline.</p>`;
  }
  html += `<p>${esc(node.summary.trim())}</p>`;
  for (const id of st.viaLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'applied', month.links[id] ?? null);
  for (const id of st.pendingLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'pending', month.links[id] ?? null);
  for (const id of st.fadedLinkIds) html += linkBlock(ctx.linkById.get(id)!, ctx, 'faded', month.links[id] ?? null);
  for (const x of excepted) html += exceptedBlock(x, ctx);
  html += impactsFromBlock(node, graph, ctx, month);
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
  const nodeById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]));
  const total = countInfluences(groups);
  let html = `<h3>${esc(node.name)}</h3><p class="region">${esc(node.region)} · ${esc(node.timescale)}</p>`;
  html += `<div class="state-line zero" style="background:#f0f2f5">Everything known to reach this place on this map: ${groups.length === 1 ? 'one driver' : `${groups.length} drivers`}, ${total === 1 ? 'one connection' : `${total} connections`}</div>`;
  html += `<p class="hint">Each connection is listed as the research rates it, with the months it is felt and how long after the driver's event it tends to arrive. Nothing is added up here: to see two drivers act together, or a driver reach this place through another, pick them under "Driver" on the left.</p>`;
  html += `<p>${esc(node.summary.trim())}</p>`;
  for (const g of groups) {
    html += `<h2>${esc(shortName(g.driver))}</h2>`;
    for (const ph of g.phases) {
      const parent = ph.phase.variant_of ? g.driver.phases.find((p) => p.id === ph.phase.variant_of) : undefined;
      for (const inf of ph.links) {
        const l = inf.link;
        const tendency = l.effect > 0 ? node.labels.plus : node.labels.minus;
        // A kind of a phase (M36): its own link, and whether it replaces the classic one.
        const kind = parent ? ` <span class="kind-note">Only for this kind${ph.except.some((x) => x.to === l.to) ? `; it replaces the ${esc(parent.label)} link above` : `, on top of every ${esc(parent.label)} link above`}.</span>` : '';
        html += `<div class="link-block region-link">
          <h4><span class="swatch" style="background:${ph.phase.color}"></span>${esc(ph.phase.label)}: ${esc(tendency)} <span class="badge ${inf.confidence}">${inf.confidence}</span></h4>
          <p class="hint">${esc(seasonRanges(l))}, ${esc(lagWords(l))}. ${stripHtml(inf, ph.phase.color)}${kind}</p>
          <p>${esc(l.mechanism.trim())}</p>
          ${sureBlock(l, null, nodeById, sources)}
          ${sourcesHtml(l.sources, sources)}
        </div>`;
      }
      // The classic links this kind does not fire here (M36, rule 11).
      for (const l of ph.except) {
        if (!parent) continue;
        const tendency = l.effect > 0 ? node.labels.plus : node.labels.minus;
        html += `<div class="link-block region-link excepted">
          <h4><span class="swatch" style="background:${ph.phase.color}"></span>${esc(ph.phase.label)}: not expected <span class="badge ${l.confidence}">${l.confidence}</span></h4>
          <p class="hint">The ${esc(parent.label)} link above (${esc(tendency.toLowerCase())}) is not drawn for this kind${ph.links.some((o) => o.link.to === l.to) ? '; the link of its own above replaces it' : ''}.</p>
          ${l.evidence_note ? `<p><em>What the evidence says:</em> ${esc(l.evidence_note.trim())}</p>` : ''}
        </div>`;
      }
      html += `<p class="watch"><button type="button" class="watch-btn" data-driver="${esc(g.driver.id)}" data-phase="${esc(ph.phase.id)}"><span class="swatch" style="background:${ph.phase.color}"></span>Watch ${esc(ph.phase.label)} arrive</button></p>`;
    }
  }
  html += `<h2>Sources for the place</h2>${sourcesHtml(node.sources, sources)}`;
  container.innerHTML = html;
}
