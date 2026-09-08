// Map view: Pacific-centered projection, base map, node markers, link arrows.

import { geoNaturalEarth1, geoPath, geoGraticule10, geoInterpolate, geoArea, geoDistance } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { select } from 'd3-selection';
import type { Selection } from 'd3-selection';
import 'd3-transition';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { Graph, GraphNode, Link, LinkStatus, MonthState, Confidence, Axis, Value } from '../types';
import { phaseForValue } from '../engine/propagate';

export const AXIS_COLORS: Record<Axis, { plus: string; minus: string }> = {
  wet_dry: { plus: '#2166ac', minus: '#b35806' },
  warm_cool: { plus: '#d6604d', minus: '#4393c3' },
  active_quiet: { plus: '#e08214', minus: '#5c5c5c' },
  high_low: { plus: '#762a83', minus: '#1b7837' },
};
const NEUTRAL = '#9a9a9a';
/** marker colour for a driver that is not part of the current scenario */
const INACTIVE_DRIVER = '#c7c9cf';

/** Colour for a node pushed to `value`: the axis colour for an outcome, the
 *  phase colour for a driver (M10), grey for 0. */
export function stateColor(node: GraphNode, value: Value): string {
  if (value === 0) return NEUTRAL;
  if (node.kind === 'driver') return phaseForValue(node, value)?.color ?? NEUTRAL;
  return value > 0 ? AXIS_COLORS[node.axis].plus : AXIS_COLORS[node.axis].minus;
}

export interface RenderOptions {
  /** the drivers whose phases were chosen by hand (one, or two since M11),
   *  each with its phase colour. Other drivers are drawn in their phase
   *  colour when a link has pushed them there, grey otherwise. */
  chosen: Map<string, string>;
  /** link ids that first became applied this month (animate) */
  arrivals: Set<string>;
  selectedNodeId: string | null;
  /** node a playing story is pointing at (pulsing ring) */
  focusNodeId: string | null;
  /** draw each node's rough affected area under the arrows */
  showAreas: boolean;
  /** name every marker; off, only markers the scenario affects this month
   *  (applied: filled or hatched, not merely expected), chosen or pushed
   *  drivers, the selected node, the story's focus and compare-mode
   *  differences carry their name */
  showAllLabels: boolean;
  /** compare mode (M14): nodes the other scenario treats differently this
   *  month; each gets a dark outer ring */
  differs?: Set<string>;
}

/**
 * Turn a list of [lon, lat] corners into a spherical polygon. Edges are
 * densified in lon/lat space (so a constant-latitude edge follows the
 * parallel), longitudes take the shorter way round, and the ring is wound so
 * that d3 treats the small side as the interior.
 */
export function areaPolygon(ring: [number, number][]): GeoJSON.Polygon {
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i++) {
    const [lon0, lat0] = ring[i];
    const [lon1, lat1] = ring[(i + 1) % ring.length];
    let dlon = lon1 - lon0;
    if (dlon > 180) dlon -= 360;
    if (dlon < -180) dlon += 360;
    const dlat = lat1 - lat0;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dlon), Math.abs(dlat)) / 2));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      let lon = lon0 + dlon * t;
      if (lon > 180) lon -= 360;
      if (lon < -180) lon += 360;
      out.push([lon, lat0 + dlat * t]);
    }
  }
  out.push(out[0]);
  const poly: GeoJSON.Polygon = { type: 'Polygon', coordinates: [out] };
  if (geoArea(poly) > 2 * Math.PI) poly.coordinates[0].reverse();
  return poly;
}

interface ArrowDatum {
  link: Link;
  from: GraphNode;
  target: GraphNode;
  kind: LinkStatus;
  /** confidence after the per-hop downgrade: the line style */
  confidence: Confidence;
  color: string;
}

export class MapView {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private gBase: Selection<SVGGElement, unknown, null, undefined>;
  private gAreas: Selection<SVGGElement, unknown, null, undefined>;
  private gLinks: Selection<SVGGElement, unknown, null, undefined>;
  private areas: Map<string, GeoJSON.Polygon>;
  private gNodes: Selection<SVGGElement, unknown, null, undefined>;
  private projection = geoNaturalEarth1().rotate([-160, 0]);
  private path = geoPath(this.projection);
  private width = 0;
  private height = 0;
  private nodeById: Map<string, GraphNode>;
  private linkById: Map<string, Link>;
  onNodeClick: (id: string) => void = () => {};

  /** `idPrefix` keeps the SVG ids (arrowheads, the conflict hatch) apart
   *  when two maps share a page (M14). */
  constructor(container: HTMLElement, private graph: Graph, private idPrefix = '') {
    this.nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    this.linkById = new Map(graph.links.map((l) => [l.id, l]));
    this.areas = new Map(graph.nodes.filter((n) => n.area).map((n) => [n.id, areaPolygon(n.area!)]));
    this.svg = select(container).append('svg').attr('role', 'img').attr('aria-label', 'World map of climate connections');
    const defs = this.svg.append('defs');
    // Hatch for a marker whose opposite pushes cancel out (conflicting at 0),
    // so a tie is not mistaken for "near normal".
    const hatch = defs.append('pattern').attr('id', `${idPrefix}conflict-hatch`)
      .attr('width', 4).attr('height', 4).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)');
    hatch.append('rect').attr('width', 4).attr('height', 4).attr('fill', '#ffffff');
    hatch.append('rect').attr('width', 2).attr('height', 4).attr('fill', NEUTRAL);
    for (const [id, color] of this.markerColors()) {
      defs.append('marker')
        .attr('id', `${idPrefix}arrow-${id}`).attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5)
        .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto-start-reverse')
        .append('path').attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', color);
    }
    this.gBase = this.svg.append('g').attr('class', 'base');
    this.gAreas = this.svg.append('g').attr('class', 'areas');
    this.gLinks = this.svg.append('g').attr('class', 'links');
    this.gNodes = this.svg.append('g').attr('class', 'nodes');
    this.drawBase();
    this.fit();
  }

  private markerColors(): Array<[string, string]> {
    const out: Array<[string, string]> = [['neutral', NEUTRAL], ['ghost', '#c7c9cf']];
    for (const [axis, c] of Object.entries(AXIS_COLORS)) out.push([`${axis}-plus`, c.plus], [`${axis}-minus`, c.minus]);
    // Arrows into a driver take the colour of the phase they push it into.
    for (const n of this.graph.nodes) {
      if (n.kind !== 'driver') continue;
      for (const p of n.phases) out.push([`phase-${n.id}-${p.id}`, p.color]);
    }
    return out;
  }

  private markerId(node: GraphNode, value: Value, kind: ArrowDatum['kind']): string {
    if (kind === 'ghost') return 'ghost';
    if (value === 0) return 'neutral';
    if (node.kind === 'driver') {
      const phase = phaseForValue(node, value);
      return phase ? `phase-${node.id}-${phase.id}` : 'neutral';
    }
    return `${node.axis}-${value > 0 ? 'plus' : 'minus'}`;
  }

  private drawBase(): void {
    const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
    const countries = feature(topo, topo.objects.countries);
    this.gBase.append('path').attr('class', 'sphere').datum({ type: 'Sphere' } as GeoPermissibleObjects);
    this.gBase.append('path').attr('class', 'graticule').datum(geoGraticule10());
    this.gBase.append('path').attr('class', 'land').datum(countries);
  }

  /**
   * The drawing box has the globe's own proportions and a fixed width; the
   * SVG scales it to whatever box the container gives it (screen, projector
   * or a printed page), so markers and labels stay proportional to the map.
   */
  private fit(): void {
    const pad = 8;
    this.width = 960;
    this.projection.fitWidth(this.width - 2 * pad, { type: 'Sphere' });
    const [[x0, y0], [, y1]] = this.path.bounds({ type: 'Sphere' } as GeoPermissibleObjects);
    this.height = Math.ceil(y1 - y0 + 2 * pad);
    const [tx, ty] = this.projection.translate();
    this.projection.translate([tx + pad - x0, ty + pad - y0]);
    this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`).attr('preserveAspectRatio', 'xMidYMid meet');
    this.gBase.selectAll<SVGPathElement, GeoPermissibleObjects>('path').attr('d', (d) => this.path(d));
  }

  /**
   * Arrow path from driver to target. Great circle by default; if the great
   * circle would cross the projection seam (and so wrap around the map edge),
   * fall back to a gently bowed curve in screen space so the arrow stays
   * inside the map. Exception: a short hop across the seam (under a quarter
   * of the globe, e.g. from the North Atlantic to Europe) is drawn as the
   * seam splits it, leaving one edge and re-entering at the other, because
   * a bowed curve would sweep across the whole map. See docs/PLAN.md §5.3.
   */
  private arcPath(from: GraphNode, to: GraphNode): string {
    const interp = geoInterpolate([from.lon, from.lat], [to.lon, to.lat]);
    const n = 48;
    const coords: [number, number][] = [];
    let prev: [number, number] | null = null;
    let crossesSeam = false;
    for (let i = 0; i <= n; i++) {
      const c = interp(i / n);
      coords.push(c);
      const p = this.projection(c);
      if (p && prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > this.width / 4) crossesSeam = true;
      if (p) prev = p;
    }
    const shortHop = geoDistance([from.lon, from.lat], [to.lon, to.lat]) < Math.PI / 4;
    if (!crossesSeam || shortHop) {
      return this.path({ type: 'LineString', coordinates: coords } as GeoPermissibleObjects) ?? '';
    }
    const a = this.projection([from.lon, from.lat]);
    const b = this.projection([to.lon, to.lat]);
    if (!a || !b) return '';
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    // Bow away from the equator so the curve does not pile onto the driver's row.
    const sign = my < this.height / 2 ? -1 : 1;
    const bow = 0.18 * len * sign;
    const cx = mx + (-dy / len) * bow * (dx < 0 ? -1 : 1);
    const cy = my + (dx / len) * bow * (dx < 0 ? -1 : 1);
    return `M${a[0]},${a[1]} Q${cx},${cy} ${b[0]},${b[1]}`;
  }

  render(month: MonthState, opts: RenderOptions): void {
    for (const id of opts.chosen.keys()) if (!this.nodeById.has(id)) return;

    // ---- affected areas (under the arrows, same colour/state as the marker)
    const areaNodes = opts.showAreas ? this.graph.nodes.filter((n) => this.areas.has(n.id)) : [];
    const areaSel = this.gAreas.selectAll<SVGPathElement, GraphNode>('path.area').data(areaNodes, (d) => d.id);
    areaSel.exit().remove();
    areaSel.enter().append('path')
      .on('click', (_e, d) => this.onNodeClick(d.id))
      .merge(areaSel)
      .attr('class', (d) => {
        const st = month.nodes[d.id];
        const cls = ['area'];
        if (d.kind === 'outcome' || !opts.chosen.has(d.id)) {
          if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length === 0) cls.push('inactive');
          else if (st.viaLinkIds.length === 0) cls.push('pending');
          if (st.conflicting) cls.push('conflicting');
        }
        if (opts.selectedNodeId === d.id) cls.push('selected');
        return cls.join(' ');
      })
      .attr('fill', (d) => this.nodeFill(d, month, opts))
      .attr('stroke', (d) => this.nodeColor(d, month, opts))
      .attr('d', (d) => this.path(this.areas.get(d.id)!));
    // Global outcomes (no area) tint the edge of the whole map instead.
    const globalNode = this.graph.nodes.find((n) => n.kind === 'outcome' && n.global);
    const globalState = globalNode ? month.nodes[globalNode.id] : null;
    this.gBase.select('path.sphere')
      .attr('stroke', globalNode && globalState && opts.showAreas && globalState.value !== 0 ? stateColor(globalNode, globalState.value) : null)
      .attr('stroke-width', globalNode && globalState && opts.showAreas && globalState.value !== 0 ? 4 : null);

    // ---- arrows: one per link the engine reports this month, drawn from the
    // driver that fires it (the scenario driver, or a driver it has pushed).
    const arrows: ArrowDatum[] = [];
    for (const [lid, ls] of Object.entries(month.links)) {
      const link = this.linkById.get(lid);
      if (!link) continue;
      const from = this.nodeById.get(link.from);
      const target = this.nodeById.get(link.to);
      if (!from || !target) continue;
      const color = ls.status === 'ghost' ? '#c7c9cf' : stateColor(target, link.effect);
      arrows.push({ link, from, target, kind: ls.status, confidence: ls.confidence, color });
    }

    const sel = this.gLinks.selectAll<SVGPathElement, ArrowDatum>('path.link').data(arrows, (d) => d.link.id);
    sel.exit().remove();
    const enter = sel.enter().append('path');
    const merged = enter.merge(sel)
      .attr('class', (d) => `link ${d.confidence} ${d.kind}${d.target.kind === 'driver' ? ' to-driver' : ''}`)
      .attr('stroke', (d) => d.color)
      .attr('marker-end', (d) => `url(#${this.idPrefix}arrow-${this.markerId(d.target, d.link.effect, d.kind)})`)
      .attr('d', (d) => this.arcPath(d.from, d.target));

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
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (d) => d.name)
      .on('click', (_e, d) => this.onNodeClick(d.id))
      .on('keydown', (e: KeyboardEvent, d) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.onNodeClick(d.id); }
      });
    nEnter.append('circle');
    nEnter.append('text').attr('dy', '0.35em');
    // Outer ring shown only on nodes the other scenario treats differently (M14).
    nEnter.append('circle').attr('class', 'diff').attr('r', (d) => (d.kind === 'driver' ? 17 : 12));
    const nMerged = nEnter.merge(nodes);
    nMerged
      .attr('class', (d) => {
        const st = month.nodes[d.id];
        const cls = ['node', d.kind];
        if (d.kind === 'outcome') {
          if (st.value === 0 && st.viaLinkIds.length === 0) cls.push('hollow');
          if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length > 0) cls.push('pending');
          if (st.conflicting) cls.push('conflicting');
        } else if (!opts.chosen.has(d.id)) {
          // A driver not chosen by hand: pushed into a phase by a link (M10),
          // expected but out of season, or not in play at all.
          if (st.viaLinkIds.length > 0) cls.push('induced');
          else if (st.pendingLinkIds.length > 0) cls.push('pending');
          else cls.push('inactive');
          if (st.conflicting) cls.push('conflicting');
        }
        if (opts.selectedNodeId === d.id) cls.push('selected');
        if (opts.focusNodeId === d.id) cls.push('focus');
        if (opts.differs?.has(d.id)) cls.push('differs');
        const reached = st.viaLinkIds.length > 0 || (d.kind === 'driver' && opts.chosen.has(d.id));
        const labelled = opts.showAllLabels || reached || opts.selectedNodeId === d.id || opts.focusNodeId === d.id || !!opts.differs?.has(d.id);
        if (!labelled) cls.push('unlabelled');
        return cls.join(' ');
      })
      .attr('transform', (d) => {
        const p = this.projection([d.lon, d.lat]);
        return p ? `translate(${p[0]},${p[1]})` : 'translate(-100,-100)';
      });
    nMerged.select('circle')
      .attr('fill', (d) => this.nodeFill(d, month, opts))
      .attr('stroke', (d) => {
        const st = month.nodes[d.id];
        if (d.kind === 'driver') return !opts.chosen.has(d.id) && st.viaLinkIds.length ? '#1f2328' : '#ffffff';
        if (st.conflicting && st.value === 0) return '#1f2328';
        if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length === 0) return stateColor(d, 1); // hollow: the axis colour as a ring
        return this.nodeColor(d, month, opts); // pending: the expected colour; applied: the state colour
      })
      .attr('stroke-opacity', (d) => (d.kind === 'driver' || month.nodes[d.id].viaLinkIds.length ? 1 : 0.6));
    nMerged.select('text')
      .attr('x', (d) => (d.kind === 'driver' ? 0 : 10))
      .attr('y', (d) => (d.kind === 'driver' ? 24 : 0))
      .attr('text-anchor', (d) => (d.kind === 'driver' ? 'middle' : 'start'))
      .text((d) => d.label ?? d.name);
  }

  /** Fill for a marker or area: the node colour, or the grey hatch when
   *  opposite pushes cancel out (conflicting at 0). */
  private nodeFill(d: GraphNode, month: MonthState, opts: RenderOptions): string {
    const st = month.nodes[d.id];
    if (st.conflicting && st.value === 0 && !opts.chosen.has(d.id)) return `url(#${this.idPrefix}conflict-hatch)`;
    return this.nodeColor(d, month, opts);
  }

  /** Marker/area colour for a node in a month: phase colour for a chosen
   *  driver, phase colour for a driver pushed there by a link (grey when
   *  nothing pushes it), state colour for outcomes, and the expected colour
   *  for pending ones. */
  private nodeColor(d: GraphNode, month: MonthState, opts: RenderOptions): string {
    const chosenColor = opts.chosen.get(d.id);
    if (d.kind === 'driver' && chosenColor) return chosenColor;
    const st = month.nodes[d.id];
    if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length > 0) {
      const pendingLink = this.linkById.get(st.pendingLinkIds[0])!;
      return stateColor(d, pendingLink.effect);
    }
    if (d.kind === 'driver' && st.viaLinkIds.length === 0) return INACTIVE_DRIVER;
    return stateColor(d, st.value);
  }
}
