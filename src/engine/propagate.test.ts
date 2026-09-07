import { describe, expect, it } from 'vitest';
import { arrivalMonth, calendarMonth, propagate } from './propagate';
import type { Graph, Link, Scenario } from '../types';

function graphWith(links: Partial<Link>[]): Graph {
  return {
    nodes: [
      {
        id: 'drv', name: 'Driver', kind: 'driver', onset_hint: 'Events usually begin around mid-year.', default_start_month: 6, lat: 0, lon: 0, region: '', timescale: '', summary: '', sources: [],
        phases: [{ id: 'warm', label: 'Warm', color: '#000000', summary: '' }, { id: 'cool', label: 'Cool', color: '#000000', summary: '' }],
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

describe('calendarMonth', () => {
  it('wraps the year', () => {
    expect(calendarMonth(6, 0)).toBe(6);
    expect(calendarMonth(6, 6)).toBe(12);
    expect(calendarMonth(6, 7)).toBe(1);
    expect(calendarMonth(12, 13)).toBe(1);
  });
});

describe('propagate', () => {
  it('produces horizon+1 months with every node present', () => {
    const t = propagate(graphWith([]), base);
    expect(t.months).toHaveLength(13);
    expect(Object.keys(t.months[0].nodes).sort()).toEqual(['a', 'b', 'drv']);
    expect(t.months[3].nodes.a.value).toBe(0);
    expect(t.months[3].nodes.a.confidence).toBeNull();
  });

  it('gates on minimum lag', () => {
    const t = propagate(graphWith([{ lag_months: [4, 8] }]), base);
    expect(t.months[3].nodes.a.value).toBe(0);
    expect(t.months[3].nodes.a.viaLinkIds).toEqual([]);
    expect(t.months[4].nodes.a.value).toBe(1);
    expect(t.months[12].nodes.a.value).toBe(1);
    expect(arrivalMonth(t, 'l0', 'a')).toBe(4);
  });

  it('gates on season, including the year wrap', () => {
    // October start, season Dec–Feb: months 2,3,4 in season; 0,1 and 5+ out.
    const t = propagate(graphWith([{ season: [12, 1, 2] }]), { ...base, startMonth: 10 });
    expect(t.months[0].nodes.a.value).toBe(0);
    expect(t.months[0].nodes.a.pendingLinkIds).toEqual(['l0']);
    expect(t.months[0].nodes.a.inSeason).toBe(false);
    expect(t.months[2].nodes.a.value).toBe(1);
    expect(t.months[2].nodes.a.inSeason).toBe(true);
    expect(t.months[4].nodes.a.value).toBe(1);
    expect(t.months[5].nodes.a.value).toBe(0);
    expect(t.months[5].nodes.a.pendingLinkIds).toEqual(['l0']);
  });

  it('ignores links for other phases', () => {
    const t = propagate(graphWith([{ when: 'cool' }]), base);
    expect(t.months[12].nodes.a.value).toBe(0);
    expect(t.months[12].nodes.a.pendingLinkIds).toEqual([]);
  });

  it('clamps the sum to [-1, 1]', () => {
    const t = propagate(graphWith([{ effect: 1 }, { effect: 1 }, { effect: 1 }]), base);
    expect(t.months[0].nodes.a.value).toBe(1);
    expect(t.months[0].nodes.a.viaLinkIds).toEqual(['l0', 'l1', 'l2']);
  });

  it('flags conflicting influences and nets them out', () => {
    const t = propagate(graphWith([{ effect: 1 }, { effect: -1 }]), base);
    expect(t.months[0].nodes.a.value).toBe(0);
    expect(t.months[0].nodes.a.conflicting).toBe(true);
    const t2 = propagate(graphWith([{ effect: 1 }, { effect: -1 }, { effect: -1 }]), base);
    expect(t2.months[0].nodes.a.value).toBe(-1);
    expect(t2.months[0].nodes.a.conflicting).toBe(true);
  });

  it('reports the lowest confidence among applied links', () => {
    const t = propagate(graphWith([
      { confidence: 'established' }, { confidence: 'contested' }, { confidence: 'probable' },
    ]), base);
    expect(t.months[0].nodes.a.confidence).toBe('contested');
    // An out-of-season contested link must not drag the confidence down.
    const t2 = propagate(graphWith([
      { confidence: 'established' }, { confidence: 'contested', season: [1] },
    ]), base);
    expect(t2.months[0].nodes.a.confidence).toBe('established');
  });
});
