// Map view: Pacific-centered projection, base map, node markers, link arrows.

import { geoNaturalEarth1, geoPath, geoGraticule10, geoInterpolate, geoArea, geoDistance } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { select } from 'd3-selection';
import type { Selection } from 'd3-selection';
import 'd3-transition';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { FeatureNode, Graph, GraphNode, Link, LinkStatus, MonthState, Confidence, Axis, Value } from '../types';
import { phaseForValue } from '../engine/propagate';
import type { DriverInfluences } from '../engine/inverse';
import { featureDrawn, featuresThisMonth } from '../engine/features';

export const AXIS_COLORS: Record<Axis, { plus: string; minus: string }> = {
  wet_dry: { plus: '#2166ac', minus: '#b35806' },
  warm_cool: { plus: '#d6604d', minus: '#4393c3' },
  active_quiet: { plus: '#e08214', minus: '#5c5c5c' },
  high_low: { plus: '#762a83', minus: '#1b7837' },
  /** impacts on people (M37): more / less, on a square marker */
  more_less: { plus: '#c2185b', minus: '#00897b' },
};
const NEUTRAL = '#9a9a9a';
/** marker colour for a driver that is not part of the current scenario */
const INACTIVE_DRIVER = '#c7c9cf';

/** Colour for a node pushed to `value`: the axis colour for an outcome, the
 *  phase colour for a driver (M10), grey for 0. */
export function stateColor(node: GraphNode, value: Value): string {
  if (value === 0) return NEUTRAL;
  if (node.kind === 'driver') return phaseForValue(node, value)?.color ?? NEUTRAL;
  if (node.kind === 'feature') return NEUTRAL; // never a state colour (M41, rule 13)
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
  /** draw the impacts on people (M37, rule 12): the squares near their
   *  outcomes and the arrows into them. Off, they are not drawn at all
   *  (the engine reports none either, so the month has no impact links). */
  showImpacts?: boolean;
  /** the arrival window (M30, rule 3): draw an applied arrow that is not
   *  yet `settled` faint, with an outlined arrowhead. Off, every arrow is
   *  drawn as before. */
  showWindow?: boolean;
  /** seasonal features (M41, rule 13): draw the fixtures of the year's
   *  weather in their months, filled while an applied arrow works through
   *  them, and dim the other arrows while one is selected. Off, nothing of
   *  them is drawn. */
  showFeatures?: boolean;
}

/** One seasonal feature as the map draws it this month (M41). */
interface FeatureDatum {
  node: FeatureNode;
  /** in its months (all year when empty) */
  present: boolean;
  /** an applied link works through it: filled */
  active: boolean;
  /** only pending links do: faintly filled */
  pending: boolean;
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
  /** arrowhead marker id (without the map's prefix) */
  marker: string;
  /** region mode (M28): sideways offset in drawing units so links from the
   *  same driver do not lie on top of one another; 0 = the plain path */
  spread: number;
  /** the arrival window (M30): an applied link not yet settled, drawn
   *  faint with an outlined head while the window layer is on */
  unsettled: boolean;
  /** a seasonal feature is selected (M41) and this link does not work
   *  through it: drawn very faint so the ones that do stand out */
  dimmed: boolean;
}

/** Region mode (M28): what the map draws for a place instead of a scenario.
 *  Every driver that reaches the place, its incoming links coloured by the
 *  phase that fires them, no month, no state. */
export interface RegionRender {
  nodeId: string;
  groups: DriverInfluences[];
  showAreas: boolean;
  showAllLabels: boolean;
  /** draw the seasonal features the listed links work through (M41), filled, no month */
  showFeatures?: boolean;
}

/** Sideways offsets for `n` arrows sharing a path: 0 for one, ±7 for two, ... */
export function spreads(n: number): number[] {
  const step = 7;
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step);
}

export class MapView {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private gBase: Selection<SVGGElement, unknown, null, undefined>;
  private gAreas: Selection<SVGGElement, unknown, null, undefined>;
  private gLinks: Selection<SVGGElement, unknown, null, undefined>;
  /** seasonal features (M41): between the arrows and the markers */
  private gFeatures: Selection<SVGGElement, unknown, null, undefined>;
  private areas: Map<string, GeoJSON.Polygon>;
  /** the outlines of the seasonal features that carry an `area` (M41) */
  private featureAreas: Map<string, GeoJSON.Polygon>;
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
    // A feature's area belongs to the features layer, never to the areas layer (M41).
    this.areas = new Map(graph.nodes.filter((n) => n.area && n.kind !== 'feature').map((n) => [n.id, areaPolygon(n.area!)]));
    this.featureAreas = new Map(graph.nodes.filter((n) => n.kind === 'feature' && n.area).map((n) => [n.id, areaPolygon(n.area!)]));
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
      // The outlined head of an arrow within its arrival window (M30):
      // white, with the arrow's colour as its edge.
      defs.append('marker')
        .attr('id', `${idPrefix}arrow-${id}-open`).attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5)
        .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto-start-reverse').attr('overflow', 'visible')
        .append('path').attr('d', 'M 1 1 L 9 5 L 1 9 z').attr('fill', '#ffffff').attr('stroke', color).attr('stroke-width', 1.4).attr('stroke-linejoin', 'round');
    }
    this.gBase = this.svg.append('g').attr('class', 'base');
    this.gAreas = this.svg.append('g').attr('class', 'areas');
    this.gLinks = this.svg.append('g').attr('class', 'links');
    this.gFeatures = this.svg.append('g').attr('class', 'features');
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
    if (kind === 'faded' || value === 0 || node.kind === 'feature') return 'neutral';
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
  private arcPath(from: GraphNode, to: GraphNode, spread = 0): string {
    const interp = geoInterpolate([from.lon, from.lat], [to.lon, to.lat]);
    const n = 48;
    const coords: [number, number][] = [];
    const pts: ([number, number] | null)[] = [];
    let prev: [number, number] | null = null;
    let crossesSeam = false;
    for (let i = 0; i <= n; i++) {
      const c = interp(i / n);
      coords.push(c);
      const p = this.projection(c);
      if (p && prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > this.width / 4) crossesSeam = true;
      if (p) prev = p;
      pts.push(p ?? null);
    }
    const shortHop = geoDistance([from.lon, from.lat], [to.lon, to.lat]) < Math.PI / 4;
    if (!crossesSeam || shortHop) {
      if (spread === 0) return this.path({ type: 'LineString', coordinates: coords } as GeoPermissibleObjects) ?? '';
      return this.offsetPath(pts, spread);
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
    // A sideways offset of the control point moves the curve's middle by half of it.
    const cx = mx + (-dy / len) * (bow * (dx < 0 ? -1 : 1) + 2 * spread);
    const cy = my + (dx / len) * (bow * (dx < 0 ? -1 : 1) + 2 * spread);
    return `M${a[0]},${a[1]} Q${cx},${cy} ${b[0]},${b[1]}`;
  }

  /**
   * A great-circle path pushed sideways by `spread` drawing units (region
   * mode, M28): the offset fans out over the first third of the way and then
   * runs parallel to the true path into the target, so two arrowheads from
   * one driver land side by side on the marker. Built in screen space; a
   * jump wider than a quarter of the map (the projection seam) breaks the
   * line as the projected path would.
   */
  private offsetPath(pts: ([number, number] | null)[], spread: number): string {
    const n = pts.length - 1;
    const near = (p: [number, number], q: [number, number] | null | undefined): q is [number, number] =>
      !!q && Math.hypot(q[0] - p[0], q[1] - p[1]) < this.width / 4;
    let d = '';
    let prev: [number, number] | null = null;
    for (let i = 0; i <= n; i++) {
      const p = pts[i];
      if (!p) { prev = null; continue; }
      const before = pts[i - 1];
      const after = pts[i + 1];
      let tx = 1;
      let ty = 0;
      if (near(p, after)) { tx = after[0] - p[0]; ty = after[1] - p[1]; }
      else if (near(p, before)) { tx = p[0] - before[0]; ty = p[1] - before[1]; }
      const tl = Math.hypot(tx, ty) || 1;
      const t = i / n;
      const profile = t < 0.3 ? t / 0.3 : 1;
      const x = p[0] + (-ty / tl) * spread * profile;
      const y = p[1] + (tx / tl) * spread * profile;
      const jump = prev && Math.hypot(x - prev[0], y - prev[1]) > this.width / 4;
      d += !prev || jump ? `M${x},${y}` : `L${x},${y}`;
      prev = [x, y];
    }
    return d;
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
    // A faded link (M32: the event has ended) is drawn like a pending one
    // but grey, with a grey arrowhead. While a seasonal feature is selected
    // (M41) the arrows that do not work through it are dimmed.
    const selectedFeature = opts.showFeatures && opts.selectedNodeId && this.nodeById.get(opts.selectedNodeId)?.kind === 'feature' ? opts.selectedNodeId : null;
    const arrows: ArrowDatum[] = [];
    for (const [lid, ls] of Object.entries(month.links)) {
      const link = this.linkById.get(lid);
      if (!link) continue;
      const from = this.nodeById.get(link.from);
      const target = this.nodeById.get(link.to);
      if (!from || !target) continue;
      const color = ls.status === 'ghost' ? '#c7c9cf' : ls.status === 'faded' ? NEUTRAL : stateColor(target, link.effect);
      // The arrival window (M30): only an applied arrow is drawn faint, and only with the layer on.
      const unsettled = !!opts.showWindow && ls.status === 'applied' && !ls.settled;
      const dimmed = selectedFeature !== null && !(link.via ?? []).includes(selectedFeature);
      arrows.push({ link, from, target, kind: ls.status, confidence: ls.confidence, color, marker: this.markerId(target, link.effect, ls.status), spread: 0, unsettled, dimmed });
    }
    const merged = this.drawArrows(arrows, '');

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

    // ---- seasonal features (M41, rule 13): only with their layer on, in
    // their months or while an applied arrow works through them
    this.drawFeatures(opts.showFeatures
      ? featuresThisMonth(this.graph, month).filter(featureDrawn).map((f) => ({ node: f.feature, present: f.present, active: f.applied.length > 0, pending: f.pending.length > 0 }))
      : [], selectedFeature);

    // ---- nodes (impacts, M37, only with their layer on; never the features, which have their own layer)
    this.drawNodes(this.graph.nodes.filter((n) => n.kind !== 'feature' && (n.kind !== 'impact' || !!opts.showImpacts)), {
      cls: (d) => {
        const st = month.nodes[d.id];
        const cls = ['node', d.kind];
        if (d.kind !== 'driver') {
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
        // Only faded links reach it (M32): drawn as if nothing did, the class
        // is for the card and for checks.
        if (st.fadedLinkIds.length > 0 && st.viaLinkIds.length === 0 && st.pendingLinkIds.length === 0) cls.push('faded');
        if (opts.selectedNodeId === d.id) cls.push('selected');
        if (opts.focusNodeId === d.id) cls.push('focus');
        if (opts.differs?.has(d.id)) cls.push('differs');
        const reached = st.viaLinkIds.length > 0 || (d.kind === 'driver' && opts.chosen.has(d.id));
        const labelled = opts.showAllLabels || reached || opts.selectedNodeId === d.id || opts.focusNodeId === d.id || !!opts.differs?.has(d.id);
        if (!labelled) cls.push('unlabelled');
        return cls.join(' ');
      },
      fill: (d) => this.nodeFill(d, month, opts),
      stroke: (d) => {
        const st = month.nodes[d.id];
        if (d.kind === 'driver') return !opts.chosen.has(d.id) && st.viaLinkIds.length ? '#1f2328' : '#ffffff';
        if (st.conflicting && st.value === 0) return '#1f2328';
        if (st.viaLinkIds.length === 0 && st.pendingLinkIds.length === 0) return stateColor(d, 1); // hollow: the axis colour as a ring
        return this.nodeColor(d, month, opts); // pending: the expected colour; applied: the state colour
      },
      strokeOpacity: (d) => (d.kind === 'driver' || month.nodes[d.id].viaLinkIds.length ? 1 : 0.6),
    });
  }

  /**
   * Region mode (M28): the place, every driver that reaches it, and each
   * incoming link as an arrow in its own tier's line style coloured by the
   * phase that fires it. No month and no state: outcomes are hollow, the
   * reaching drivers wear a plain dark ring ("can reach", no phase), the
   * others are grey. Arrows from one driver are spread sideways so two
   * phases (El Niño and La Niña) both show.
   */
  renderRegion(r: RegionRender): void {
    const target = this.nodeById.get(r.nodeId);
    if (!target) return;
    const reaching = new Set(r.groups.map((g) => g.driver.id));

    // ---- areas: only the place's own outline
    const areaNodes = r.showAreas && this.areas.has(target.id) ? [target] : [];
    const areaSel = this.gAreas.selectAll<SVGPathElement, GraphNode>('path.area').data(areaNodes, (d) => d.id);
    areaSel.exit().remove();
    areaSel.enter().append('path')
      .on('click', (_e, d) => this.onNodeClick(d.id))
      .merge(areaSel)
      .attr('class', 'area selected region')
      .attr('fill', '#1f2328')
      .attr('stroke', '#1f2328')
      .attr('d', (d) => this.path(this.areas.get(d.id)!));
    this.gBase.select('path.sphere').attr('stroke', null).attr('stroke-width', null);

    // ---- arrows: one per incoming link, driver by driver
    const arrows: ArrowDatum[] = [];
    for (const g of r.groups) {
      const links = g.phases.flatMap((p) => p.links.map((l) => ({ link: l.link, phase: p.phase })));
      const offsets = spreads(links.length);
      links.forEach(({ link, phase }, i) => {
        arrows.push({ link, from: g.driver, target, kind: 'applied', confidence: link.confidence, color: phase.color, marker: `phase-${g.driver.id}-${phase.id}`, spread: offsets[i], unsettled: false, dimmed: false });
      });
    }
    this.drawArrows(arrows, ' region');

    // ---- seasonal features (M41): the ones the listed links work through, filled, no month
    const through = new Set(arrows.flatMap((a) => a.link.via ?? []));
    this.drawFeatures(r.showFeatures
      ? this.graph.nodes.filter((n): n is FeatureNode => n.kind === 'feature' && through.has(n.id)).map((node) => ({ node, present: true, active: true, pending: false }))
      : [], null);

    // ---- nodes (never the impacts, M37: region mode reads links from drivers only; never the features, M41)
    this.drawNodes(this.graph.nodes.filter((n) => n.kind !== 'impact' && n.kind !== 'feature'), {
      cls: (d) => {
        const cls = ['node', d.kind];
        let labelled = r.showAllLabels;
        if (d.id === target.id) { cls.push('hollow', 'selected', 'region-target'); labelled = true; }
        else if (d.kind === 'driver' && reaching.has(d.id)) { cls.push('reach'); labelled = true; }
        else if (d.kind === 'driver') cls.push('inactive');
        else cls.push('hollow');
        if (!labelled) cls.push('unlabelled');
        return cls.join(' ');
      },
      fill: (d) => (d.kind === 'driver' && !reaching.has(d.id) ? INACTIVE_DRIVER : '#ffffff'),
      stroke: (d) => (d.kind === 'driver' ? (reaching.has(d.id) ? '#1f2328' : '#ffffff') : stateColor(d, 1)),
      strokeOpacity: (d) => (d.kind === 'driver' || d.id === target.id ? 1 : 0.6),
    });
  }

  /** Join the arrows onto the link layer; returns the merged selection. */
  private drawArrows(arrows: ArrowDatum[], extraClass: string): Selection<SVGPathElement, ArrowDatum, SVGGElement, unknown> {
    const sel = this.gLinks.selectAll<SVGPathElement, ArrowDatum>('path.link').data(arrows, (d) => d.link.id);
    sel.exit().remove();
    const enter = sel.enter().append('path');
    return enter.merge(sel)
      .attr('class', (d) => `link ${d.confidence} ${d.kind}${d.target.kind === 'driver' ? ' to-driver' : d.target.kind === 'impact' ? ' to-impact' : ''}${d.unsettled ? ' unsettled' : ''}${d.dimmed ? ' dimmed' : ''}${extraClass}`)
      .attr('stroke', (d) => d.color)
      .attr('marker-end', (d) => `url(#${this.idPrefix}arrow-${d.marker}${d.unsettled ? '-open' : ''})`)
      .attr('d', (d) => this.arcPath(d.from, d.target, d.spread));
  }

  /** Join the given nodes onto the marker layer with the given styling; a
   *  node left out of the list (an impact with its layer off, M37) is
   *  removed from the map. Drivers and outcomes are circles, impacts
   *  squares; the shape carries the class `mark`. */
  private drawNodes(list: GraphNode[], style: { cls: (d: GraphNode) => string; fill: (d: GraphNode) => string; stroke: (d: GraphNode) => string; strokeOpacity: (d: GraphNode) => number }): void {
    const nodes = this.gNodes.selectAll<SVGGElement, GraphNode>('g.node').data(list, (d) => d.id);
    nodes.exit().remove();
    const nEnter = nodes.enter().append('g')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (d) => d.name)
      .on('click', (_e, d) => this.onNodeClick(d.id))
      .on('keydown', (e: KeyboardEvent, d) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.onNodeClick(d.id); }
      });
    nEnter.each(function (d) {
      const g = select(this);
      if (d.kind === 'impact') g.append('rect').attr('class', 'mark').attr('x', -6).attr('y', -6).attr('width', 12).attr('height', 12).attr('rx', 1.5);
      else g.append('circle').attr('class', 'mark');
    });
    nEnter.append('text').attr('dy', '0.35em');
    // Outer ring shown only on nodes the other scenario treats differently (M14).
    nEnter.append('circle').attr('class', 'diff').attr('r', (d) => (d.kind === 'driver' ? 17 : 12));
    const nMerged = nEnter.merge(nodes);
    nMerged
      .attr('class', style.cls)
      .attr('transform', (d) => {
        const p = this.projection([d.lon, d.lat]);
        return p ? `translate(${p[0]},${p[1]})` : 'translate(-100,-100)';
      });
    nMerged.select('.mark')
      .attr('fill', style.fill)
      .attr('stroke', style.stroke)
      .attr('stroke-opacity', style.strokeOpacity);
    nMerged.select('text')
      .attr('x', (d) => (d.kind === 'driver' ? 0 : 10))
      .attr('y', (d) => (d.kind === 'driver' ? 24 : 0))
      .attr('text-anchor', (d) => (d.kind === 'driver' ? 'middle' : 'start'))
      .text((d) => d.label ?? d.name);
  }

  /**
   * Seasonal features (M41, rule 13): one marker per feature in `list`, its
   * symbol (an H or L in a circle, as on a weather chart; a ring for the
   * vortex) with its name, and its area, if any, as a dotted outline under
   * it. Filled while `active` (an applied arrow works through it), faintly
   * while only `pending` ones do, hollow otherwise; never a state colour.
   * A feature left out of the list is removed. Clickable and focusable
   * like a node.
   */
  private drawFeatures(list: FeatureDatum[], selectedId: string | null): void {
    const outlines = this.gFeatures.selectAll<SVGPathElement, FeatureDatum>('path.feature-area').data(list.filter((d) => this.featureAreas.has(d.node.id)), (d) => d.node.id);
    outlines.exit().remove();
    outlines.enter().append('path').merge(outlines)
      .attr('class', (d) => `feature-area${d.active ? ' active' : ''}`)
      .attr('d', (d) => this.path(this.featureAreas.get(d.node.id)!));
    const marks = this.gFeatures.selectAll<SVGGElement, FeatureDatum>('g.feature').data(list, (d) => d.node.id);
    marks.exit().remove();
    const enter = marks.enter().append('g')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (d) => d.node.name)
      .on('click', (_e, d) => this.onNodeClick(d.node.id))
      .on('keydown', (e: KeyboardEvent, d) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.onNodeClick(d.node.id); }
      });
    enter.append('circle').attr('class', 'mark').attr('r', 10);
    enter.filter((d) => d.node.symbol === 'vortex').append('circle').attr('class', 'ring').attr('r', 4.5);
    enter.append('text').attr('class', 'glyph').attr('dy', '0.36em').text((d) => (d.node.symbol === 'high' ? 'H' : d.node.symbol === 'low' ? 'L' : ''));
    enter.append('text').attr('class', 'name').attr('dy', '0.35em').text((d) => d.node.label);
    const merged = enter.merge(marks)
      .attr('class', (d) => `feature ${d.node.symbol}${d.active ? ' active' : d.pending ? ' pending' : ' idle'}${d.present ? '' : ' offseason'}${selectedId === d.node.id ? ' selected' : ''}`)
      .attr('transform', (d) => {
        const p = this.projection([d.node.lon, d.node.lat]);
        return p ? `translate(${p[0]},${p[1]})` : 'translate(-100,-100)';
      });
    // The name sits to the right of the symbol, or to its left near the
    // map's right edge (the Azores High, beside the Atlantic seam).
    merged.select('text.name')
      .attr('x', (d) => ((this.projection([d.node.lon, d.node.lat])?.[0] ?? 0) > this.width - 90 ? -14 : 14))
      .attr('text-anchor', (d) => ((this.projection([d.node.lon, d.node.lat])?.[0] ?? 0) > this.width - 90 ? 'end' : 'start'));
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
