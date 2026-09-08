// Real-year panel (M34): sits above the node card, like the story panel,
// while a year from the table is on show. It owns nothing but its own
// rendering; main.ts sets the scenario from `scenarioForYear` and keeps the
// controls locked until "Edit this scenario" or "Leave the year".

import type { DriverNode, Graph, Source } from '../types';
import { MONTH_NAMES } from '../types';
import { phaseEnd, phaseOnset, type YearScenario } from '../engine/years';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function shortName(d: DriverNode): string {
  return d.name.replace(/\s*\(.*\)$/, '');
}

/** "A, B and C" */
function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function monthYear(m: { year: number; month: number }): string {
  return `${MONTH_NAMES[m.month - 1]} ${m.year}`;
}

/** The sentence that must be on every year card (docs/PLAN_V3.md, M34). */
export const YEAR_HONESTY = 'The map shows the tendencies for the phases that were observed. It does not show what happened that year; where a story exists for this year it tells you where the real weather broke the pattern.';

/** "The twelve months shown run from January 1997." and why. */
export function windowSentence(ys: YearScenario, driverName: (id: string) => string): string {
  const from = monthYear({ year: ys.startYear, month: ys.scenario.startMonth });
  const first = driverName(ys.scenario.driverId);
  switch (ys.anchor) {
    case 'january':
      return `The twelve months shown run from ${from}.`;
    case 'onset':
      return `Nothing recorded for ${ys.row.year} holds a phase from January, so the twelve months shown run from ${from}, when ${first} entered its phase: the start that covers most of the year.`;
    case 'earlier':
      return `Nothing recorded for ${ys.row.year} holds a phase from January, and ${first} had entered its phase in ${from}, the start that covers most of the year, so the twelve months shown run from then; the map counts a driver's lags from its onset.`;
  }
}

export class YearView {
  private current: YearScenario | null = null;
  private sources: Map<string, Source>;
  onExit: () => void = () => {};
  onEdit: () => void = () => {};
  onStory: (storyId: string) => void = () => {};

  constructor(private container: HTMLElement, private graph: Graph) {
    this.sources = new Map(graph.sources.map((s) => [s.key, s]));
    container.hidden = true;
    container.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act], button[data-story]');
      if (!btn) return;
      if (btn.dataset.story) this.onStory(btn.dataset.story);
      else if (btn.dataset.act === 'exit') this.exit();
      else if (btn.dataset.act === 'edit') this.onEdit();
    });
  }

  get active(): YearScenario | null { return this.current; }

  show(ys: YearScenario): void {
    this.current = ys;
    this.render();
  }

  exit(): void {
    if (!this.current) return;
    this.current = null;
    this.container.hidden = true;
    this.container.innerHTML = '';
    this.onExit();
  }

  private driver(id: string): DriverNode | undefined {
    const d = this.graph.nodes.find((n) => n.id === id);
    return d && d.kind === 'driver' ? d : undefined;
  }

  private render(): void {
    const ys = this.current!;
    const row = ys.row;
    const name = (id: string) => { const d = this.driver(id); return d ? shortName(d) : id; };
    const lines = row.drivers.map((d) => {
      const driver = this.driver(d.driver);
      const phase = driver?.phases.find((p) => p.id === d.phase);
      const label = esc(phase?.label ?? d.phase);
      const onset = phaseOnset(row, d);
      const end = phaseEnd(row, d);
      let what: string;
      if (!onset) what = `${label}.`;
      else {
        what = `${label} from ${monthYear(onset)}`;
        if (onset.year < row.year) what += ', already under way when the year began';
        what += end ? `, to ${monthYear(end)} (${d.duration_months === 1 ? 'one month' : `${d.duration_months} months`}).` : ', still holding at the end of the months shown.';
      }
      const swatch = `<span class="swatch" style="background:${phase?.color ?? '#999'}"></span>`;
      return `<li>${swatch}<strong>${esc(name(d.driver))}:</strong> ${what}${d.index_note ? ` <span class="idx">${esc(d.index_note)}</span>` : ''}</li>`;
    });
    const recorded = new Set(row.drivers.map((d) => d.driver));
    const notRecorded = this.graph.nodes.filter((n): n is DriverNode => n.kind === 'driver' && !recorded.has(n.id)).map(shortName);
    const approx = ys.approximations.map((p) => {
      const d = name(p.driver.driver);
      if (!p.placed) return `${d} is not placed on the map: its phase begins as the months shown end (month ${p.recordOnset}).`;
      return `${d} is shown ${p.engineFade === null ? 'holding to the end of the months shown' : `ending at month ${p.engineFade}`} although the record has it ending at month ${p.recordFade}: the map can hold a phase for at most twelve months from a start it reads as at most a year before month 0.`;
    });
    const stories = this.graph.stories.filter((s) => s.start_year === row.year);
    const keys = [...new Set([...row.sources, ...row.drivers.map((d) => d.source)])];
    const sources = keys.map((k) => {
      const s = this.sources.get(k);
      if (!s) return `<li>${esc(k)}</li>`;
      return s.url ? `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.citation)}</a></li>` : `<li>${esc(s.citation)}</li>`;
    });
    this.container.hidden = false;
    this.container.innerHTML = `
      <div class="story-head">
        <span class="story-kicker">Real year</span>
        <button type="button" data-act="exit" class="story-exit" aria-label="Leave the year">✕ Leave the year</button>
      </div>
      <h3>${row.year}</h3>
      <p class="story-text">${esc(row.note.trim())}</p>
      <p class="year-window">${esc(windowSentence(ys, name))}</p>
      <ul class="year-drivers">${lines.join('')}</ul>
      ${notRecorded.length > 0 ? `<p class="hint">Not recorded for ${row.year}: ${esc(listWords(notRecorded))}. ${row.year < 1980 ? 'Only ENSO is recorded before 1980. ' : ''}The map may still push an unrecorded driver into a phase along a chain from a recorded one; that is a tendency, not a record.</p>` : ''}
      ${approx.length > 0 ? `<p class="hint year-approx">${esc(approx.join(' '))}</p>` : ''}
      <p class="year-honesty">${esc(YEAR_HONESTY)}</p>
      ${stories.length > 0 ? `<p class="year-stories">${stories.length === 1 ? 'A story about this year' : 'Stories about this year'}: ${stories.map((s) => `<button type="button" data-story="${esc(s.id)}">${esc(s.title)}</button>`).join(', ')}</p>` : ''}
      <ul class="sources">${sources.join('')}</ul>
      <div class="story-nav">
        <button type="button" data-act="edit">Edit this scenario</button>
      </div>`;
    if (this.container.parentElement) this.container.parentElement.scrollTop = 0;
  }
}
