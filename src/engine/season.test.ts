import { describe, expect, it } from 'vitest';
import { propagate } from './propagate';
import { indexForCalendarMonth, inSeason, linksInPlay, seasonProfile } from './season';
import type { Graph, Link, Scenario } from '../types';
import graphJson from '../../public/data/graph.json';

function graphWith(links: Partial<Link>[]): Graph {
  return {
    nodes: [
      {
        id: 'drv', name: 'Driver', kind: 'driver', onset_hint: '', default_start_month: 6, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [],
        phases: [{ id: 'warm', label: 'Warm', color: '#000000', summary: '', value: 1 }, { id: 'mid', label: 'Mid', color: '#000000', summary: '', value: 0 }, { id: 'cool', label: 'Cool', color: '#000000', summary: '', value: -1 }],
      },
      {
        id: 'd2', name: 'Second driver', kind: 'driver', onset_hint: '', default_start_month: 6, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [],
        phases: [{ id: 'up', label: 'Up', color: '#000000', summary: '', value: 1 }, { id: 'mid', label: 'Mid', color: '#000000', summary: '', value: 0 }, { id: 'down', label: 'Down', color: '#000000', summary: '', value: -1 }],
      },
      { id: 'a', name: 'A', kind: 'outcome', axis: 'wet_dry', labels: { plus: '', zero: '', minus: '' }, global: false, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [] },
      { id: 'b', name: 'B', kind: 'outcome', axis: 'wet_dry', labels: { plus: '', zero: '', minus: '' }, global: false, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [] },
    ],
    links: links.map((l, i) => ({
      id: `l${i}`, from: 'drv', when: 'warm', to: 'a', effect: 1, lag_months: [0, 0], season: [],
      confidence: 'established', mechanism: '', caveat: '', sources: ['s'], ...l,
    })),
    sources: [{ key: 's', citation: 'x' }],
    stories: [],
  };
}

const base: Scenario = { driverId: 'drv', phaseId: 'warm', startMonth: 6, horizonMonths: 12 };

describe('indexForCalendarMonth', () => {
  it('maps a calendar month to the first index that shows it', () => {
    expect(indexForCalendarMonth(6, 6)).toBe(0);
    expect(indexForCalendarMonth(6, 7)).toBe(1);
    expect(indexForCalendarMonth(6, 12)).toBe(6);
    expect(indexForCalendarMonth(6, 1)).toBe(7);
    expect(indexForCalendarMonth(6, 5)).toBe(11);
    expect(indexForCalendarMonth(12, 1)).toBe(1);
    expect(indexForCalendarMonth(12, 11)).toBe(11);
  });
});

describe('inSeason and seasonProfile', () => {
  it('an empty season is every month; a listed season is only those months', () => {
    const [all, winter] = graphWith([{ season: [] }, { season: [12, 1, 2] }]).links;
    for (let m = 1; m <= 12; m++) expect(inSeason(all, m)).toBe(true);
    expect(inSeason(winter, 12)).toBe(true);
    expect(inSeason(winter, 1)).toBe(true);
    expect(inSeason(winter, 3)).toBe(false);
    const p = seasonProfile([all, winter]);
    expect(p).toHaveLength(12);
    expect(p[0]).toEqual({ calendarMonth: 1, inSeason: ['l0', 'l1'], outOfSeason: [] });
    expect(p[5]).toEqual({ calendarMonth: 6, inSeason: ['l0'], outOfSeason: ['l1'] });
    expect(p[11].inSeason).toEqual(['l0', 'l1']);
  });

  it('is empty but still twelve months with no links', () => {
    const p = seasonProfile([]);
    expect(p.map((m) => m.calendarMonth)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(p.every((m) => m.inSeason.length === 0 && m.outOfSeason.length === 0)).toBe(true);
  });
});

describe('linksInPlay', () => {
  it('includes applied and pending links, not the other phase', () => {
    const g = graphWith([
      { season: [] },                          // l0 applied every month
      { season: [1], lag_months: [0, 0] },     // l1 pending most of the year, applied in January
      { when: 'cool' },                        // l2 the other phase: never reached
      { to: 'b', lag_months: [20, 24] },       // l3 never past its lag within the horizon
    ]);
    const ids = linksInPlay(g, propagate(g, base)).map((l) => l.id);
    expect(ids).toEqual(['l0', 'l1']);
  });

  it('leaves out ghosts below the confidence filter', () => {
    const g = graphWith([{ confidence: 'contested' }, { confidence: 'established', to: 'b' }]);
    const t = propagate(g, { ...base, minConfidence: 'probable' });
    expect(t.months[0].links.l0.status).toBe('ghost');
    expect(linksInPlay(g, t).map((l) => l.id)).toEqual(['l1']);
  });

  it('includes a second driver’s links once its own start month comes, and a pushed driver’s links with the chain on', () => {
    const g = graphWith([
      { to: 'a' },
      { from: 'd2', when: 'up', to: 'b', season: [] },
      { to: 'd2', effect: 1, lag_months: [2, 2] },
      { from: 'd2', when: 'up', to: 'a', effect: -1 },
    ]);
    // Second driver chosen by hand from January (month 7): its links are in play.
    const two = propagate(g, { ...base, secondary: { driverId: 'd2', phaseId: 'up', startMonth: 1 } });
    expect(linksInPlay(g, two).map((l) => l.id)).toEqual(['l0', 'l1', 'l3']);
    // Chain off, no second driver: only the first driver's links to outcomes and to d2.
    const one = propagate(g, { ...base, maxDepth: 1 });
    expect(linksInPlay(g, one).map((l) => l.id)).toEqual(['l0', 'l2']);
    // Chain on: d2 is pushed at month 2 and its links join.
    const chain = propagate(g, { ...base, maxDepth: 2 });
    expect(linksInPlay(g, chain).map((l) => l.id)).toEqual(['l0', 'l1', 'l2', 'l3']);
  });
});

describe('season profile of the shipped data', () => {
  const graph = graphJson as unknown as Graph;

  it('El Niño from June: the monsoon link is a summer link and the Gulf Coast a winter one; every month has something in season', () => {
    const t = propagate(graph, { driverId: 'enso', phaseId: 'el_nino', startMonth: 6, horizonMonths: 12, maxDepth: 3 });
    const links = linksInPlay(graph, t);
    expect(links.length).toBeGreaterThan(10);
    const p = seasonProfile(links);
    const monsoon = links.find((l) => l.to === 'indian_summer_monsoon')!;
    const gulf = links.find((l) => l.to === 'us_gulf_coast_winter')!;
    expect(p[6].inSeason).toContain(monsoon.id);      // July
    expect(p[0].outOfSeason).toContain(monsoon.id);   // January
    expect(p[0].inSeason).toContain(gulf.id);
    expect(p[6].outOfSeason).toContain(gulf.id);
    for (const m of p) {
      expect(m.inSeason.length + m.outOfSeason.length).toBe(links.length);
      expect(m.inSeason.length).toBeGreaterThan(0);
    }
  });

  it('a link applied in a month is in season in that calendar month, and a pending one is not', () => {
    const t = propagate(graph, { driverId: 'enso', phaseId: 'la_nina', startMonth: 6, horizonMonths: 12, maxDepth: 3 });
    const byId = new Map(graph.links.map((l) => [l.id, l]));
    for (const m of t.months) {
      for (const [id, ls] of Object.entries(m.links)) {
        if (ls.status === 'applied') expect(inSeason(byId.get(id)!, m.calendarMonth)).toBe(true);
        if (ls.status === 'pending') expect(inSeason(byId.get(id)!, m.calendarMonth)).toBe(false);
      }
    }
  });
});
