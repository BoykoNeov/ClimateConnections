// Region-first navigation (M28). Pure: no DOM. The inverse of a scenario:
// not "what does this driver do" but "what reaches this place". Everything
// here is read straight from the graph; no scenario is run, no state is
// computed, and nothing is added up. A link is listed as the data rates it
// (its own confidence tier, its own season and lag), which is what it would
// be in a scenario that chose its driver directly.

import type { Confidence, DriverNode, Graph, GraphNode, Link, OutcomeNode, Phase } from '../types';
import { inSeason } from './season';

/** One link into the place, with the twelve calendar months it is in season. */
export interface Influence {
  link: Link;
  /** the link's own confidence tier, as the data rates it */
  confidence: Confidence;
  /** January first: true when the link passes the season gate that month */
  months: boolean[];
}

/** One phase of a driver and the links it fires into the place. For a
 *  variant phase (M36, rule 11) `links` are the variant's own links only
 *  (the parent's links it inherits are listed under the parent, not
 *  twice), and `except` the parent's links into the place that do not
 *  hold for it. */
export interface PhaseInfluences {
  phase: Phase;
  links: Influence[];
  except: Link[];
}

/** One driver that reaches the place, with its phases that do, in the
 *  driver's own phase order. Phases that fire nothing into the place are
 *  left out. */
export interface DriverInfluences {
  driver: DriverNode;
  phases: PhaseInfluences[];
}

/** The twelve-month season strip of a link, January first. */
export function seasonStrip(link: Link): boolean[] {
  const out: boolean[] = [];
  for (let cal = 1; cal <= 12; cal++) out.push(inSeason(link, cal));
  return out;
}

/**
 * Every link into a node, grouped by the driver that fires it and then by
 * that driver's phase. Drivers come in graph order, phases in the driver's
 * own order, links in graph order. A link whose source is not a driver
 * node, or names a phase the driver does not have, is skipped (the data
 * build rejects both, so this is belt and braces).
 */
export function influencesOn(graph: Graph, nodeId: string): DriverInfluences[] {
  const nodeById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]));
  const incoming = graph.links.filter((l) => l.to === nodeId);
  const out: DriverInfluences[] = [];
  for (const n of graph.nodes) {
    if (n.kind !== 'driver') continue;
    const phases: PhaseInfluences[] = [];
    for (const phase of n.phases) {
      const links = incoming
        .filter((l) => l.from === n.id && l.when === phase.id && nodeById.get(l.from)?.kind === 'driver')
        .map((link) => ({ link, confidence: link.confidence, months: seasonStrip(link) }));
      // A variant (rule 11): the parent's links into the place that do not hold for it.
      const except = phase.variant_of === undefined ? []
        : incoming.filter((l) => l.from === n.id && l.when === phase.variant_of && (l.except ?? []).includes(phase.id));
      if (links.length > 0 || except.length > 0) phases.push({ phase, links, except });
    }
    if (phases.length > 0) out.push({ driver: n, phases });
  }
  return out;
}

/** The outcome nodes a student can pick as "where I live", by name. */
export function regionNodes(graph: Graph): OutcomeNode[] {
  return graph.nodes
    .filter((n): n is OutcomeNode => n.kind === 'outcome')
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** How many links reach the node, over every driver and phase. */
export function countInfluences(groups: DriverInfluences[]): number {
  return groups.reduce((n, g) => n + g.phases.reduce((m, p) => m + p.links.length, 0), 0);
}
