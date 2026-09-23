// Globe view (M39, docs/PLAN.md §5.1): the arithmetic of turning the globe
// and of what its far side hides. Pure, no DOM; the map reads it.

import { geoDistance } from 'd3-geo';

/** A turn of the globe as `d3.geoProjection.rotate` takes it: [λ, φ] in
 *  degrees. The point at the middle of the globe is (lon −λ, lat −φ). */
export type Rotation = [number, number];

/** The dateline on the equator, so the globe opens on the Pacific (rule 8
 *  of docs/PLAN.md §0) with ENSO's marker (125°W) and Indonesia both well
 *  inside the rim; the flat map's own centre, 160°E, would put ENSO on it. */
export const PACIFIC: Rotation = [180, 0];

/** Beyond this many degrees from the middle a point is behind the globe. */
export const FAR_DEG = 90;
/** Beyond this many degrees a marker keeps its circle but not its name. */
export const RIM_DEG = 70;
/** How far one arrow-key press turns the globe. */
export const KEY_STEP_DEG = 10;

/** Where a point sits on the globe: in view, near the rim (drawn, unnamed),
 *  or behind it (not drawn). */
export type GlobeSide = 'near' | 'rim' | 'far';

/** Degrees between the middle of the globe and the point (lon, lat). */
export function degreesFromCentre(rot: Rotation, lon: number, lat: number): number {
  return (geoDistance([-rot[0], -rot[1]], [lon, lat]) * 180) / Math.PI;
}

export function globeSide(rot: Rotation, lon: number, lat: number): GlobeSide {
  const d = degreesFromCentre(rot, lon, lat);
  return d > FAR_DEG ? 'far' : d > RIM_DEG ? 'rim' : 'near';
}

/** λ into (−180, 180], φ held between the poles. */
export function normalise([lambda, phi]: Rotation): Rotation {
  let l = ((lambda + 180) % 360 + 360) % 360 - 180;
  if (l === -180) l = 180;
  return [l, Math.max(-90, Math.min(90, phi))];
}

/** The turn that puts (lon, lat) at the middle of the globe. */
export function turnTo(lon: number, lat: number): Rotation {
  return normalise([-lon, -lat]);
}

/** A drag of (dx, dy) drawing units on a globe of `radius` units: the
 *  point under the pointer roughly follows it. Dragging right shows more
 *  of the west, dragging down more of the north. */
export function dragTurn(rot: Rotation, dx: number, dy: number, radius: number): Rotation {
  const k = 180 / (Math.PI * radius);
  return normalise([rot[0] + dx * k, rot[1] - dy * k]);
}

/** An arrow key: Left and Right look further west and east, Up and Down
 *  further north and south. Any other key: null. */
export function keyTurn(rot: Rotation, key: string): Rotation | null {
  switch (key) {
    case 'ArrowLeft': return normalise([rot[0] + KEY_STEP_DEG, rot[1]]);
    case 'ArrowRight': return normalise([rot[0] - KEY_STEP_DEG, rot[1]]);
    case 'ArrowUp': return normalise([rot[0], rot[1] - KEY_STEP_DEG]);
    case 'ArrowDown': return normalise([rot[0], rot[1] + KEY_STEP_DEG]);
    default: return null;
  }
}

/** The turn that keeps a place a story or region mode points at in view:
 *  unchanged while it is within the rim, else the place at the middle. */
export function keepInView(rot: Rotation, lon: number, lat: number): Rotation {
  return globeSide(rot, lon, lat) === 'near' ? rot : turnTo(lon, lat);
}
