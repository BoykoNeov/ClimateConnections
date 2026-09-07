// Map view: Pacific-centered projection, base map, node markers, link arrows.

import { geoNaturalEarth1, geoPath, geoGraticule10, geoInterpolate } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { select } from 'd3-selection';
import type { Selection } from 'd3-selection';
import 'd3-transition';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { Graph, GraphNode, Link, MonthState, Confidence, Axis, Value } from '../types';

export const AXIS_COLORS: Record<Axis, { plus: string; minus: string }> = {
  wet_dry: { plus: '#2166ac', minus: '#b35806' },
  warm_cool: { plus: '#d6604d', minus: '#4393c3' },
  active_quiet: { plus: '#e08214', minus: '#5c5c5c' },
  high_low: { plus: '#762a83', minus: '#1b7837' },
};
const NEUTRAL = '#9a9a9a';

export function stateColor(node: GraphNode, value: Value): string {
  if (node.kind !== 'outcome' || value === 0) return NEUTRAL;
  return value > 0 ? AXIS_COLORS[node.axis].plus : AXIS_COLORS[node.axis].minus;
}

export interface RenderOptions {
  phaseColor: string;
  /** links for this phase that are hidden by the confidence filter */
  ghostLinks: Link[];
  /** link ids that first became applied this month (animate) */
  arrivals: Set<string>;
  selectedNodeId: string | null;
}

interface ArrowDatum {
  link: Link;
  target: GraphNode;
  kind: 'applied' | 'pending' | 'ghost';
  confidence: Confidence;
  color: string;
}

export class MapView {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private gBase: Selection<SVGGElement, unknown, null, undefined>;
  private gLinks: Selection<SVGGElement, unknown, null, undefined>;
  private gNodes: Selection<SVGGElement, unknown, null, undefined>;
  private projection = geoNaturalEarth1().rotate([-160, 0]);
  private path = geoPath(this.projection);
  private width = 0;
  private height = 0;
  private nodeById: Map<string, GraphNode>;
  private lastState: { month: MonthState; opts: RenderOptions } | null = null;
  onNodeClick: (id: string) => void = () => {};

  constructor(private container: HTMLElement, private graph: Graph) {
    this.nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    this.svg = select(container).append('svg').attr('role', 'img').attr('aria-label', 'World map of climate connections');
    const defs = this.svg.append('defs');
    for (const [id, color] of this.markerColors()) {
      defs.append('marker')
        .attr('id', `arrow-${id}`).attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5)
        .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto-start-reverse')
        .append('path').attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', color);
    }
    this.gBase = this.svg.append('g').attr('class', 'base');
    this.gLinks = this.svg.append('g').attr('class', 'links');
    this.gNodes = this.svg.append('g').attr('class', 'nodes');
    this.drawBase();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  private markerColors(): Array<[string, string]> {
    const out: Array<[string, string]> = [['neutral', NEUTRAL], ['ghost', '#c7c9cf']];
    for (const [axis, c] of Object.entries(AXIS_COLORS)) out.push([`${axis}-plus`, c.plus], [`${axis}-minus`, c.minus]);
    return out;
  }

  private markerId(node: GraphNode, value: Value, kind: ArrowDatum['kind']): string {
    if (kind === 'ghost') return 'ghost';
    if (node.kind !== 'outcome' || value === 0) return 'neutral';
    return `${node.axis}-${value > 0 ? 'plus' : 'minus'}`;
  }

  private drawBase(): void {
    const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
    const countries = feature(topo, topo.objects.countries);
    this.gBase.append('path').attr('class', 'sphere').datum({ type: 'Sphere' } as GeoPermissibleObjects);
    this.gBase.append('path').attr('class', 'graticule').datum(geoGraticule10());
    this.gBase.append('path').attr('class', 'land').datum(countries);
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(320, rect.width);
    this.height = Math.max(240, rect.height);
    this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`);
    this.projection.fitExtent([[8, 8], [this.width - 8, this.height - 8]], { type: 'Sphere' });
    this.gBase.selectAll<SVGPathElement, GeoPermissibleObjects>('path').attr('d', (d) => this.path(d));
    if (this.lastState) this.render(this.lastState.month, { ...this.lastState.opts, arrivals: new Set() });
  }

  private arc(from: GraphNode, to: GraphNode): GeoPermissibleObjects {
    const interp = geoInterpolate([from.lon, from.lat], [to.lon, to.lat]);
    const n = 48;
    const coords: [number, number][] = [];
    for (let i = 0; i <= n; i++) coords.push(interp(i / n));
    return { type: 'LineString', coordinates: coords };
  }

  render(month: MonthState, opts: RenderOptions): void {
    this.lastState = { month, opts };
    const driver = this.graph.nodes.find((n) => n.kind === 'driver');
    if (!driver) return;

    // ---- arrows
    const arrows: ArrowDatum[] = [];
    for (const [id, st] of Object.entries(month.nodes)) {
      const target = this.nodeById.get(id);
      if (!target) continue;
      for (const lid of st.viaLinkIds) {
        const link = this.graph.links.find((l) => l.id === lid)!;
        arrows.push({ link, target, kind: 'applied', confidence: link.confidence, color: stateColor(target, link.effect) });
      }
      for (const lid of st.pendingLinkIds) {
        const link = this.graph.links.find((l) => l.id === lid)!;
        arrows.push({ link, target, kind: 'pending', confidence: link.confidence, color: stateColor(target, link.effect) });
      }
    }
    for (const link of opts.ghostLinks) {
      if (month.index < link.lag_months[0]) continue;
      const target = this.nodeById.get(link.to);
      if (target) arrows.push({ link, target, kind: 'ghost', confidence: link.confidence, color: '#c7c9cf' });
    }

    const sel = this.gLinks.selectAll<SVGPathElement, ArrowDatum>('path.link').data(arrows, (d) => d.link.id);
    sel.exit().remove();
    const enter = sel.enter().append('path');
    const merged = enter.merge(sel)
      .attr('class', (d) => `link ${d.confidence} ${d.kind}`)
      .attr('stroke', (d) => d.color)
      .attr('marker-end', (d) => `url(#arrow-${this.markerId(d.target, d.link.effect, d.kind)})`)
      .attr('d', (d) => this.path(this.arc(driver, d.target)));

    // Arrival animation: fade in, and for solid lines draw along the path.
    merged.filter((d) => opts.arrivals.has(d.link.id) && d.kind === 'applied').each(function (d) {
      const el = select(this);
      if (d.confidence === 'established') {
        const len = (this as SVGPathElement).getTotalLength();
        el.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len)
          .transition().duration(650).attr('stroke-dashoffset', 0)
          .on('end', () => el.attr('stroke-dasharray', null).attr('stroke-dashoffset', null));
      } else {
        el.attr('opacity', 0).transition().duration(650).attr('opacity', null);
      }
    });

    // ---- nodes
    const nodes = this.gNodes.selectAll<SVGGElement, GraphNode>('g.node').data(this.graph.nodes, (d) => d.id);
    const nEnter = nodes.enter().append('g')
      .on('click', (_e, d) => this.onNodeClick(d.id));
    nEnter.append('circle');
    nEnter.append('text').attr('dy', '0.35em');
    const nMerged = nEnter.merge(nodes);
    nMerged
      .attr('class', (d) => {
        const st = month.nodes[d.id];
        const cls = ['node', d.kind];
        if (d.kind === 'outcome') {
          if (st.value === 0 && st.viaLinkIds.length === 0) cls.push('hollow');
          if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length > 0) cls.push('pending');
          if (st.conflicting) cls.push('conflicting');
        }
        if (opts.selectedNodeId === d.id) cls.push('selected');
        return cls.join(' ');
      })
      .attr('transform', (d) => {
        const p = this.projection([d.lon, d.lat]);
        return p ? `translate(${p[0]},${p[1]})` : 'translate(-100,-100)';
      });
    nMerged.select('circle')
      .attr('fill', (d) => {
        if (d.kind === 'driver') return opts.phaseColor;
        const st = month.nodes[d.id];
        if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length > 0) {
          const pendingLink = this.graph.links.find((l) => l.id === st.pendingLinkIds[0])!;
          return stateColor(d, pendingLink.effect);
        }
        return stateColor(d, st.value);
      })
      .attr('stroke', (d) => (d.kind === 'driver' ? '#ffffff' : stateColor(d, month.nodes[d.id].value === 0 ? 1 : month.nodes[d.id].value)))
      .attr('stroke-opacity', (d) => (d.kind === 'driver' || month.nodes[d.id].viaLinkIds.length ? 1 : 0.6));
    nMerged.select('text')
      .attr('x', (d) => (d.kind === 'driver' ? 0 : 10))
      .attr('y', (d) => (d.kind === 'driver' ? 24 : 0))
      .attr('text-anchor', (d) => (d.kind === 'driver' ? 'middle' : 'start'))
      .text((d) => (d.kind === 'driver' ? d.name.replace(/\s*\(.*\)$/, '') : shortName(d)));
  }
}

function shortName(n: GraphNode): string {
  return n.name.length > 26 ? n.name.slice(0, 24).replace(/\s+\S*$/, '') + '…' : n.name;
}
