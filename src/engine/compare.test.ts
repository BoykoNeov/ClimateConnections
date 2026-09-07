import { describe, expect, it } from 'vitest';
import { propagate } from './propagate';
import { acts, compareMonth, compareNode, differing } from './compare';
import type { Graph, NodeState, Scenario } from '../types';
import graphJson from '../../public/data/graph.json';

const graph = graphJson as unknown as Graph;

function st(patch: Partial<NodeState>): NodeState {
  return { value: 0, confidence: null, viaLinkIds: [], pendingLinkIds: [], inSeason: true, conflicting: false, ...patch };
}

describe('compareNode', () => {
  const wet = st({ value: 1, viaLinkIds: ['l1'], confidence: 'established' });
  const dry = st({ value: -1, viaLinkIds: ['l2'], confidence: 'established' });
  const waiting = st({ pendingLinkIds: ['l1'] });
  const cancelled = st({ value: 0, viaLinkIds: ['l1', 'l2'], conflicting: true, confidence: 'established' });
  const nothing = st({});

  it('acts: a state, an applied link or a pending one; nothing otherwise', () => {
    expect(acts(wet)).toBe(true);
    expect(acts(waiting)).toBe(true);
    expect(acts(cancelled)).toBe(true);
    expect(acts(nothing)).toBe(false);
  });

  it('none when neither scenario acts, only_a / only_b when one does', () => {
    expect(compareNode(nothing, nothing)).toBe('none');
    expect(compareNode(wet, nothing)).toBe('only_a');
    expect(compareNode(nothing, wet)).toBe('only_b');
    expect(compareNode(nothing, waiting)).toBe('only_b');
  });

  it('same for the same value and conflict flag, whatever links produced it', () => {
    expect(compareNode(wet, st({ value: 1, viaLinkIds: ['other'] }))).toBe('same');
    expect(compareNode(waiting, st({ pendingLinkIds: ['x', 'y'] }))).toBe('same');
    expect(compareNode(cancelled, st({ viaLinkIds: ['a', 'b'], conflicting: true }))).toBe('same');
  });

  it('opposite for nonzero values of opposite sign', () => {
    expect(compareNode(wet, dry)).toBe('opposite');
    expect(compareNode(dry, wet)).toBe('opposite');
  });

  it('differ for every other disagreement: applied against pending, a push against a cancelled tie', () => {
    expect(compareNode(wet, waiting)).toBe('differ');
    expect(compareNode(wet, cancelled)).toBe('differ');
    expect(compareNode(cancelled, waiting)).toBe('differ');
  });
});

describe('compareMonth and differing on the shipped data', () => {
  const run = (s: Partial<Scenario>) => propagate(graph, { driverId: 'enso', phaseId: 'el_nino', startMonth: 6, horizonMonths: 12, maxDepth: 3, ...s });

  it('a scenario against itself: nothing differs', () => {
    const a = run({});
    const b = run({});
    for (let i = 0; i <= 12; i++) {
      expect(differing(a.months[i], b.months[i])).toEqual([]);
      for (const v of Object.values(compareMonth(a.months[i], b.months[i]))) expect(['none', 'same']).toContain(v);
    }
  });

  it('El Niño against La Niña in August: the driver and Indonesia are opposite, a place with no link either way is none', () => {
    const a = run({});
    const b = run({ phaseId: 'la_nina' });
    const v = compareMonth(a.months[2], b.months[2]);
    expect(v.enso).toBe('opposite');
    expect(v.indonesia_rainfall).toBe('opposite');
    // With the chain on, El Niño's monsoon is a cancelled tie (dry from El
    // Niño, wet from the pushed positive dipole) against La Niña's wet: differ.
    // Direct links only, the two are plainly opposite.
    expect(v.indian_summer_monsoon).toBe('differ');
    expect(compareMonth(run({ maxDepth: 1 }).months[2], run({ phaseId: 'la_nina', maxDepth: 1 }).months[2]).indian_summer_monsoon).toBe('opposite');
    // The North Atlantic Oscillation is only pushed in late winter; in August neither scenario reaches it.
    expect(v.nao).toBe('none');
    expect(v.northern_europe_winter).toBe('none');
    expect(differing(a.months[2], b.months[2])).toContain('enso');
  });

  it('El Niño against a neutral ENSO: only scenario A acts anywhere', () => {
    const a = run({});
    const b = run({ phaseId: 'neutral' });
    const v = compareMonth(a.months[8], b.months[8]);
    expect(Object.values(v).every((x) => x === 'only_a' || x === 'none')).toBe(true);
    expect(v.enso).toBe('only_a');
    expect(v.peru_coast_rainfall).toBe('only_a');
  });

  it('El Niño alone against El Niño with a negative dipole from September', () => {
    const a = run({});
    const b = run({ secondary: { driverId: 'iod', phaseId: 'negative', startMonth: 9 } });
    // July: the dipole is still pinned in B, so its links are absent there,
    // while in A El Niño has already pushed it positive and southeast
    // Australia dries out: only A acts on it.
    const jul = compareMonth(a.months[1], b.months[1]);
    expect(jul.southeast_australia_rainfall).toBe('only_a');
    expect(jul.iod).toBe('only_a');
    // October: the dipole is negative in B, positive (pushed) in A: opposite,
    // and so is southeast Australia (dry in A, wet in B). Indonesia is dry in
    // A but a cancelled tie in B: differ.
    const oct = compareMonth(a.months[4], b.months[4]);
    expect(oct.iod).toBe('opposite');
    expect(oct.southeast_australia_rainfall).toBe('opposite');
    expect(oct.indonesia_rainfall).toBe('differ');
    expect(b.months[4].nodes.indonesia_rainfall.conflicting).toBe(true);
    // December: East Africa is wet in A and a cancelled tie in B.
    const dec = compareMonth(a.months[6], b.months[6]);
    expect(dec.east_africa_short_rains).toBe('differ');
    expect(a.months[6].nodes.east_africa_short_rains.value).toBe(1);
    expect(b.months[6].nodes.east_africa_short_rains.value).toBe(0);
    // Places the dipole never touches agree all year.
    for (let i = 0; i <= 12; i++) expect(compareMonth(a.months[i], b.months[i]).us_gulf_coast_winter).not.toBe('differ');
    expect(differing(a.months[6], b.months[6])).toContain('east_africa_short_rains');
    expect(differing(a.months[6], b.months[6])).not.toContain('us_gulf_coast_winter');
  });

  it('the chain on against off: the dipole is pushed in both, its own effects are only in A', () => {
    const a = run({});
    const b = run({ maxDepth: 1 });
    const v = compareMonth(a.months[3], b.months[3]);
    expect(v.iod).toBe('same');
    expect(v.southeast_australia_rainfall).toBe('only_a');
    expect(v.indonesia_rainfall).toBe('same');
  });
});
