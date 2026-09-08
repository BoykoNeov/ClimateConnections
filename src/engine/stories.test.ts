// Every story step must point at a node that is genuinely affected in that
// month of the story's scenario, as computed by the real engine at the depth
// the app uses (M10: links are followed through pushed drivers; M11: a story
// may fix a second driver by hand; M33: any number of them). The data
// validator does the same check with its own copy of the rule; this test is
// the one that uses the engine itself.

import { describe, expect, it } from 'vitest';
import { chosenOnset, propagate } from './propagate';
import type { Graph, Scenario, ScenarioDriver, Story, StoryDriver } from '../types';
import graphJson from '../../public/data/graph.json';

const graph = graphJson as unknown as Graph;

/** One of a story's other drivers as the engine takes it (M12 start month,
 *  M15 before, M32 hold unless `holds` is false). */
function scenarioDriver(d: StoryDriver, story: Story, holds: boolean): ScenarioDriver {
  const out: ScenarioDriver = { driverId: d.driver, phaseId: d.phase, startMonth: d.start_month ?? story.start_month, startsBefore: !!d.starts_before };
  if (holds && d.hold_months !== undefined) out.holdMonths = d.hold_months;
  return out;
}

/** The scenario a story sets, as the app builds it (M11 second driver, M12
 *  start month, M15 before, M32 holds, M33 any number of drivers). `holds`
 *  false leaves the M32 hold fields out. */
function storyScenario(story: Story, holds = true): Scenario {
  const s: Scenario = { driverId: story.driver, phaseId: story.phase, startMonth: story.start_month, horizonMonths: 12, maxDepth: 3 };
  if (holds && story.hold_months !== undefined) s.holdMonths = story.hold_months;
  if (story.drivers && story.drivers.length > 0) s.others = story.drivers.map((d) => scenarioDriver(d, story, holds));
  return s;
}

/** [driverId, phaseId] of every driver a story chooses by hand. */
function chosenPairs(story: Story): [string, string][] {
  return [[story.driver, story.phase], ...(story.drivers ?? []).map((d): [string, string] => [d.driver, d.phase])];
}

// M33 regression: the data build writes the pre-M33 second_* fields into a
// one-element `drivers` list, and the engine reads the old `secondary` as a
// one-element `others`, so every shipped story with one other driver gives
// the same timeline either way. No shipped story names a driver twice.
describe('any number of chosen drivers (M33) and the shipped stories', () => {
  it('graph.json carries only the drivers list, never the old second_* fields', () => {
    for (const story of graph.stories) {
      for (const k of ['second_driver', 'second_phase', 'second_start_month', 'second_starts_before', 'second_hold_months']) expect(k in story, `${story.id}.${k}`).toBe(false);
    }
    expect(graph.stories.filter((s) => s.drivers && s.drivers.length > 0).map((s) => s.id)).toEqual([
      'la_nina_negative_iod_2010_11', 'negative_iod_then_la_nina_2016', 'negative_sam_2019_black_summer', 'positive_pdo_2014_15',
      'positive_amo_1995', 'atlantic_nino_1984', 'pinatubo_1991', 'easterly_qbo_2009_10',
    ]);
  });
  for (const story of graph.stories) {
    if (!story.drivers || story.drivers.length !== 1) continue;
    it(`${story.title}: the same timeline under others as under secondary`, () => {
      const now = propagate(graph, storyScenario(story));
      const scenario = storyScenario(story);
      const old: Scenario = { ...scenario, secondary: scenario.others![0] };
      delete old.others;
      expect(propagate(graph, old).months).toEqual(now.months);
    });
  }
  it('no shipped story chooses a driver twice', () => {
    for (const story of graph.stories) {
      const ids = chosenPairs(story).map(([d]) => d);
      expect(new Set(ids).size, story.id).toBe(ids.length);
    }
  });
});

// M32 regression: without a hold every chosen driver keeps its phase from
// its onset through the last month shown and no link is ever faded, which
// is the pre-M32 timeline exactly. A story that sets a hold fades there.
describe('phase duration (M32) and the shipped stories', () => {
  for (const story of graph.stories) {
    it(`${story.title}: no hold means today's timeline, no faded link`, () => {
      const scenario = storyScenario(story, false);
      const tl = propagate(graph, scenario);
      for (const m of tl.months) {
        for (const ls of Object.values(m.links)) expect(ls.status, `month ${m.index}`).not.toBe('faded');
        for (const st of Object.values(m.nodes)) expect(st.fadedLinkIds).toEqual([]);
        for (const [driverId, phaseId] of chosenPairs(story)) {
          const node = graph.nodes.find((n) => n.id === driverId)!;
          const value = node.kind === 'driver' ? node.phases.find((p) => p.id === phaseId)!.value : 0;
          if (m.index >= chosenOnset(scenario, driverId)) expect(m.nodes[driverId].value, `${driverId} month ${m.index}`).toBe(value);
        }
      }
    });
  }
  it('the 1998 Yangtze story holds the basin eight months, so it fades in October and its arrows with it', () => {
    const story = graph.stories.find((s) => s.id === 'warm_basin_1998_yangtze')!;
    expect(story.hold_months).toBe(8);
    const tl = propagate(graph, storyScenario(story));
    for (const m of tl.months.slice(0, 8)) expect(m.nodes.indian_ocean_basin.value, `month ${m.index}`).toBe(1);
    for (const m of tl.months.slice(8)) {
      expect(m.calendarMonth >= 10 || m.calendarMonth <= 2).toBe(true);
      expect(m.nodes.indian_ocean_basin.value, `month ${m.index}`).toBe(0);
      expect(m.links.warm_basin_yangtze?.status).toBe('faded');
      expect(m.links.warm_basin_la_nina?.status).toBe('faded');
      // The pushed La Niña is cut with it: no phase, its own links gone.
      expect(m.nodes.enso.value).toBe(0);
      expect(m.links.la_nina_west_pacific_typhoons).toBeUndefined();
    }
    // Before the fade the story's chain stands: the typhoons under both arrows in August.
    expect([...tl.months[6].nodes.west_pacific_typhoons.viaLinkIds].sort()).toEqual(['la_nina_west_pacific_typhoons', 'warm_basin_west_pacific_typhoons']);
  });
  it('only that story sets a hold so far', () => {
    expect(graph.stories.filter((s) => s.hold_months !== undefined || (s.drivers ?? []).some((d) => d.hold_months !== undefined)).map((s) => s.id)).toEqual(['warm_basin_1998_yangtze']);
  });
});

describe('stories', () => {
  it('ships at least two stories', () => {
    expect(graph.stories.length).toBeGreaterThanOrEqual(2);
  });

  for (const story of graph.stories) {
    describe(story.title, () => {
      const timeline = propagate(graph, storyScenario(story));
      const chosen = new Set(chosenPairs(story).map(([d]) => d));
      story.steps.forEach((step, i) => {
        it(`step ${i + 1} (month ${step.month}) focuses an affected node: ${step.focus}`, () => {
          const node = graph.nodes.find((n) => n.id === step.focus);
          expect(node).toBeDefined();
          if (chosen.has(node!.id)) return;
          const st = timeline.months[step.month].nodes[step.focus];
          // Applied by at least one link; a conflicting node (pushes cancel
          // to 0) still counts, because its marker is drawn, not hollow.
          expect(st.viaLinkIds.length).toBeGreaterThan(0);
          if (!st.conflicting) expect(st.value).not.toBe(0);
        });
      });
      it('steps never go backwards in time', () => {
        for (let i = 1; i < story.steps.length; i++) expect(story.steps[i].month).toBeGreaterThanOrEqual(story.steps[i - 1].month);
      });
    });
  }
});
