// Every story step must point at a node that is genuinely affected in that
// month of the story's scenario, as computed by the real engine at the depth
// the app uses (M10: links are followed through pushed drivers). The data
// validator does the same check with its own copy of the rule; this test is
// the one that uses the engine itself.

import { describe, expect, it } from 'vitest';
import { propagate } from './propagate';
import type { Graph } from '../types';
import graphJson from '../../public/data/graph.json';

const graph = graphJson as unknown as Graph;

describe('stories', () => {
  it('ships at least two stories', () => {
    expect(graph.stories.length).toBeGreaterThanOrEqual(2);
  });

  for (const story of graph.stories) {
    describe(story.title, () => {
      const timeline = propagate(graph, {
        driverId: story.driver, phaseId: story.phase, startMonth: story.start_month, horizonMonths: 12, maxDepth: 3,
      });
      story.steps.forEach((step, i) => {
        it(`step ${i + 1} (month ${step.month}) focuses an affected node: ${step.focus}`, () => {
          const node = graph.nodes.find((n) => n.id === step.focus);
          expect(node).toBeDefined();
          if (node!.id === story.driver) return;
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
