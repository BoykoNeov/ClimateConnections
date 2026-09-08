// Season dial helpers (M13). Pure: no DOM. The dial shows the calendar year
// as a circle and, month by month, which of the scenario's links pass the
// season gate of docs/PLAN.md §4 rule 3. It says nothing about lags: a link
// can be in season and still waiting, which is the timeline's job to show.

import type { Graph, Link, Timeline } from '../types';

/** One calendar month of the season profile: which links are in season. */
export interface SeasonMonth {
  calendarMonth: number;
  /** link ids whose season is empty (all year) or includes this month */
  inSeason: string[];
  /** link ids whose season excludes this month */
  outOfSeason: string[];
}

/**
 * Links in play in a timeline: every link the engine reported as applied or
 * pending in at least one month, in graph order. Ghosts (below the
 * confidence filter) are not in play, and neither are links the scenario
 * never reaches (the wrong phase, a driver that was never pushed, a second
 * driver's links before its own start month if it never comes, a link that
 * was only ever reported faded because the event ended before its lag had
 * run, M32).
 */
export function linksInPlay(graph: Graph, timeline: Timeline): Link[] {
  const ids = new Set<string>();
  for (const m of timeline.months) {
    for (const [id, ls] of Object.entries(m.links)) if (ls.status === 'applied' || ls.status === 'pending') ids.add(id);
  }
  return graph.links.filter((l) => ids.has(l.id));
}

/** Whether a link passes the season gate in a calendar month (1–12). */
export function inSeason(link: Link, calendarMonth: number): boolean {
  return link.season.length === 0 || link.season.includes(calendarMonth);
}

/** The season gate by calendar month for a set of links: twelve entries, January first. */
export function seasonProfile(links: Link[]): SeasonMonth[] {
  const out: SeasonMonth[] = [];
  for (let cal = 1; cal <= 12; cal++) {
    const month: SeasonMonth = { calendarMonth: cal, inSeason: [], outOfSeason: [] };
    for (const l of links) (inSeason(l, cal) ? month.inSeason : month.outOfSeason).push(l.id);
    out.push(month);
  }
  return out;
}

/**
 * The month index to show for a calendar month: the first index at or after
 * 0 whose calendar month it is. The start month itself maps to 0 (month 12
 * is the same calendar month a year on; the timeline's last tick is there
 * for it).
 */
export function indexForCalendarMonth(startMonth: number, calendarMonth: number): number {
  return (calendarMonth - startMonth + 12) % 12;
}
