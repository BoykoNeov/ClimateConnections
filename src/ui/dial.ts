// Season dial (M13): the calendar year as a circle. Twelve month sectors
// (January at the top, clockwise), the month on screen filled, a mark where
// the year shown begins (and one where each other chosen driver begins), and inside
// either a ring of how many of the scenario's links are in season each month
// or, while a place is selected, one ring per link acting on it showing the
// months it can be felt. Clicking a month jumps the timeline to it. The dial
// shows the season gate only; lags are the timeline's business.

import { select } from 'd3-selection';
import type { Selection } from 'd3-selection';
import type { SeasonMonth } from '../engine/season';
import { MONTH_NAMES } from '../types';

/** One link acting on the selected place, as a ring. */
export interface DialRing {
  id: string;
  /** calendar months (1–12) the link can be felt in; empty = all year */
  months: number[];
  color: string;
  /** tooltip: what the link does and its season, in words */
  title: string;
}

export interface DialModel {
  /** calendar month the year shown begins in (the first driver's onset) */
  startMonth: number;
  /** calendar month on screen */
  currentMonth: number;
  /** each other chosen driver's own start month and phase colour (M12; any
   *  number since M33); `before` (M15) when it began before the year shown,
   *  `onset` its month index. Empty = one driver. */
  others: { month: number; color: string; name: string; before: boolean; onset: number }[];
  /** the season gate for every link in play, January first */
  profile: SeasonMonth[];
  /** the links acting on the selected place, or null when nothing is selected */
  rings: DialRing[] | null;
  /** short name of the selected place (with `rings`) */
  selectedName: string | null;
}

const SIZE = 220;
const C = SIZE / 2;
const R_OUT = 100, R_IN = 80;      // month sectors
const R_MARK = 108;                // onset marks, outside the sectors
const R_RING_OUT = 76, R_RING_IN = 30; // room for the inner ring(s)
const PAD = 1.2;                   // degrees between segments

function point(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

/** Annular sector from angle a0 to a1 (degrees clockwise from the top). */
function sector(r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = point(r1, a0), [x1, y1] = point(r1, a1);
  const [x2, y2] = point(r0, a1), [x3, y3] = point(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r1},${r1} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}A${r0},${r0} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)}Z`;
}

function monthAngles(cal: number): [number, number] {
  const a0 = (cal - 1) * 30;
  return [a0 + PAD, a0 + 30 - PAD];
}

/** "Dec–Mar", "Jun–Sep, Dec", or "all year". */
export function seasonWords(months: number[]): string {
  if (months.length === 0) return 'all year';
  const set = new Set(months);
  const runs: string[] = [];
  // Start each run at a month whose predecessor is out of season, so a run
  // that wraps the year (Dec–Mar) reads as one.
  const starts = [...set].filter((m) => !set.has(((m + 10) % 12) + 1)).sort((a, b) => a - b);
  if (starts.length === 0) return 'all year';
  for (const s of starts) {
    let e = s;
    while (set.has((e % 12) + 1) && (e % 12) + 1 !== s) e = (e % 12) + 1;
    const name = (m: number) => MONTH_NAMES[m - 1].slice(0, 3);
    runs.push(s === e ? name(s) : `${name(s)}–${name(e)}`);
  }
  return runs.join(', ');
}

export class SeasonDialView {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private months: Selection<SVGGElement, unknown, null, undefined>;
  private marks: Selection<SVGGElement, unknown, null, undefined>;
  private inner: Selection<SVGGElement, unknown, null, undefined>;
  private centre: Selection<SVGGElement, unknown, null, undefined>;
  private caption: HTMLParagraphElement;
  private model: DialModel | null = null;
  onPick: (calendarMonth: number) => void = () => {};

  constructor(container: HTMLElement) {
    container.innerHTML = '';
    container.classList.add('season-dial');
    this.svg = select(container).append('svg')
      .attr('viewBox', `-6 -6 ${SIZE + 12} ${SIZE + 12}`)
      .attr('role', 'group')
      .attr('aria-label', 'Season dial: the calendar year as a circle');
    this.inner = this.svg.append('g').attr('class', 'dial-inner');
    this.months = this.svg.append('g').attr('class', 'dial-months');
    this.marks = this.svg.append('g').attr('class', 'dial-marks');
    this.centre = this.svg.append('g').attr('class', 'dial-centre');
    this.centre.append('text').attr('class', 'dial-count').attr('x', C).attr('y', C - 2).attr('text-anchor', 'middle');
    this.centre.append('text').attr('class', 'dial-note').attr('x', C).attr('y', C + 11).attr('text-anchor', 'middle');
    this.caption = document.createElement('p');
    this.caption.className = 'hint dial-caption';
    container.append(this.caption);

    // Month sectors are buttons: click, Enter or Space jumps the timeline.
    const view = this;
    this.months.selectAll<SVGGElement, number>('g.month')
      .data([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], (d) => String(d))
      .join((enter) => {
        const g = enter.append('g').attr('class', 'month').attr('role', 'button').attr('tabindex', 0)
          .attr('data-month', (d) => d);
        g.append('path').attr('d', (d) => sector(R_IN, R_OUT, ...monthAngles(d)));
        g.append('text')
          .attr('x', (d) => point((R_IN + R_OUT) / 2, (d - 0.5) * 30)[0])
          .attr('y', (d) => point((R_IN + R_OUT) / 2, (d - 0.5) * 30)[1] + 3)
          .attr('text-anchor', 'middle')
          .text((d) => MONTH_NAMES[d - 1].slice(0, 3));
        g.append('title');
        g.on('click', (_e, d) => view.onPick(d));
        g.on('keydown', (e: KeyboardEvent, d) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); view.onPick(d); }
        });
        return g;
      });
  }

  render(model: DialModel): void {
    this.model = model;
    const { startMonth, currentMonth, profile } = model;
    const total = profile[0].inSeason.length + profile[0].outOfSeason.length;
    const index = (m: number) => (m - startMonth + 12) % 12;

    this.months.selectAll<SVGGElement, number>('g.month')
      .classed('current', (d) => d === currentMonth)
      .classed('start', (d) => d === startMonth)
      .attr('aria-label', (d) => `Jump to ${MONTH_NAMES[d - 1]}, month ${index(d)} after onset`)
      .attr('aria-pressed', (d) => String(d === currentMonth))
      .select('title').text((d) => {
        const p = profile[d - 1];
        return `${MONTH_NAMES[d - 1]}: month ${index(d)} after onset. ${p.inSeason.length} of ${total} connections in season. Click to jump there.`;
      });

    // Onset marks: a dark triangle where the year shown begins, a dot in
    // each other chosen driver's phase colour where it begins (a hollow one
    // when it began before the year shown, M15: that month came up last
    // year). Two drivers beginning in the same month sit side by side
    // within that month's sector.
    this.marks.selectAll('*').remove();
    const a = (startMonth - 0.5) * 30;
    const [tx, ty] = point(R_MARK, a);
    this.marks.append('path')
      .attr('class', 'dial-onset')
      .attr('d', 'M0,-5L5,4L-5,4Z')
      .attr('transform', `translate(${tx.toFixed(2)},${ty.toFixed(2)}) rotate(${a + 180})`)
      .append('title').text(`The year shown begins here: ${MONTH_NAMES[startMonth - 1]}, month 0`);
    const atMonth = new Map<number, number>();
    for (const other of model.others) {
      if (other.month === startMonth) continue;
      const stacked = atMonth.get(other.month) ?? 0;
      atMonth.set(other.month, stacked + 1);
      const b = (other.month - 0.5) * 30 + [0, 9, -9, 18, -18][stacked % 5];
      const [sx, sy] = point(R_MARK, b);
      const { before, onset, name, color, month } = other;
      this.marks.append('circle')
        .attr('class', before ? 'dial-second before' : 'dial-second')
        .attr('cx', sx.toFixed(2)).attr('cy', sy.toFixed(2)).attr('r', 4.5)
        .attr('fill', before ? '#ffffff' : color)
        .attr('stroke', before ? color : null)
        .attr('stroke-width', before ? 2 : null)
        .append('title').text(before
          ? `${name} has been in its phase since ${MONTH_NAMES[month - 1]}, ${-onset === 1 ? 'a month' : `${-onset} months`} before the year shown begins (month ${onset})`
          : `${name} begins here: ${MONTH_NAMES[month - 1]}, month ${index(month)}`);
    }

    this.inner.selectAll('*').remove();
    const rings = model.rings && model.rings.length > 0 ? model.rings : null;
    if (rings) {
      // One ring per link acting on the selected place, first link outermost.
      const n = rings.length;
      const thick = Math.min(14, (R_RING_OUT - R_RING_IN - 2 * (n - 1)) / n);
      rings.forEach((ring, i) => {
        const r1 = R_RING_OUT - i * (thick + 2);
        const r0 = r1 - thick;
        const g = this.inner.append('g').attr('class', 'dial-ring').attr('data-link', ring.id);
        g.append('title').text(ring.title);
        for (let cal = 1; cal <= 12; cal++) {
          const on = ring.months.length === 0 || ring.months.includes(cal);
          g.append('path')
            .attr('class', on ? 'on' : 'off')
            .attr('d', sector(r0, r1, ...monthAngles(cal)))
            .attr('fill', on ? ring.color : null);
        }
      });
      const now = rings.filter((r) => r.months.length === 0 || r.months.includes(currentMonth)).length;
      this.centre.select('.dial-count').text(`${now} of ${n}`);
      this.centre.select('.dial-note').text('in season now');
      this.caption.textContent = `Rings: the ${n === 1 ? 'connection' : `${n} connections`} acting on ${model.selectedName ?? 'the selected place'}, coloured by effect; grey where out of season.`;
    } else {
      // The whole scenario: darker where more links are in season. Shaded
      // against the busiest month, so the shape of the year shows even when
      // every month has some links in season.
      const g = this.inner.append('g').attr('class', 'dial-heat');
      const most = Math.max(0, ...profile.map((p) => p.inSeason.length));
      for (const p of profile) {
        const share = most === 0 ? 0 : p.inSeason.length / most;
        g.append('path')
          .attr('d', sector(R_RING_OUT - 24, R_RING_OUT, ...monthAngles(p.calendarMonth)))
          .attr('fill-opacity', total === 0 ? 0.06 : 0.1 + 0.9 * share)
          .append('title').text(`${MONTH_NAMES[p.calendarMonth - 1]}: ${p.inSeason.length} of ${total} connections in season`);
      }
      const now = profile[currentMonth - 1].inSeason.length;
      this.centre.select('.dial-count').text(total === 0 ? '—' : `${now} of ${total}`);
      this.centre.select('.dial-note').text(total === 0 ? 'nothing in play' : 'in season now');
      this.caption.textContent = model.rings && model.rings.length === 0 && model.selectedName
        ? `No connection acts on ${model.selectedName} in this scenario. Ring: all ${total} connections in play, darker where more are in season.`
        : `Ring: all ${total} connections in play, darker where more are in season.`;
    }
  }

  /** The current model (for tests and checks). */
  get current(): DialModel | null { return this.model; }
}
