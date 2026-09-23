import { describe, it, expect } from 'vitest';
import { geoOrthographic } from 'd3-geo';
import { PACIFIC, degreesFromCentre, globeSide, normalise, turnTo, dragTurn, keyTurn, keepInView, type Rotation } from './globe';

describe('globe view (M39): what the far side hides', () => {
  it('opens on the Pacific: the dateline on the equator is the middle', () => {
    expect(degreesFromCentre(PACIFIC, 180, 0)).toBeCloseTo(0, 6);
    // the middle of the projection is the same point d3 draws at the centre
    const p = geoOrthographic().rotate(PACIFIC).translate([0, 0]);
    const xy = p([180, 0])!;
    expect(Math.abs(xy[0]) + Math.abs(xy[1])).toBeLessThan(1e-9);
  });

  it('opens with ENSO and Indonesia inside the rim and the Atlantic behind', () => {
    expect(globeSide(PACIFIC, -125, -2)).toBe('near'); // ENSO's marker
    expect(globeSide(PACIFIC, 118, -2)).toBe('near'); // Indonesia
    expect(globeSide(PACIFIC, -23, 52)).toBe('far'); // the NAO
  });

  it('the far side is more than 90° away, the rim between 70° and 90°', () => {
    expect(globeSide(PACIFIC, 0, 0)).toBe('far'); // the Atlantic, opposite
    expect(globeSide(PACIFIC, 180 + 80, 0)).toBe('rim');
    expect(globeSide(PACIFIC, 180 - 69, 0)).toBe('near');
    expect(globeSide(PACIFIC, 180 + 89, 0)).toBe('rim');
    expect(globeSide(PACIFIC, 180 + 91, 0)).toBe('far');
    expect(globeSide(PACIFIC, 180, 89)).toBe('rim'); // near a pole: on the rim, drawn
  });

  it('agrees with d3: a far point is exactly one the projection clips', () => {
    const rot: Rotation = [-30, -40];
    const p = geoOrthographic().rotate(rot).clipAngle(90);
    const stream = (lon: number, lat: number) => {
      let seen = false;
      const s = p.stream({ point: () => { seen = true; }, lineStart() {}, lineEnd() {}, polygonStart() {}, polygonEnd() {}, sphere() {} });
      s.point(lon, lat);
      return seen;
    };
    for (let lon = -180; lon < 180; lon += 15) {
      for (let lat = -75; lat <= 75; lat += 15) {
        const d = degreesFromCentre(rot, lon, lat);
        if (Math.abs(d - 90) < 0.5) continue; // the rim itself is a rounding question
        expect(globeSide(rot, lon, lat) === 'far').toBe(!stream(lon, lat));
      }
    }
  });
});

describe('globe view (M39): turning', () => {
  it('normalise keeps λ in (−180, 180] and φ between the poles', () => {
    expect(normalise([190, 0])).toEqual([-170, 0]);
    expect(normalise([-190, 0])).toEqual([170, 0]);
    expect(normalise([-180, 0])).toEqual([180, 0]);
    expect(normalise([540, 0])).toEqual([180, 0]);
    expect(normalise([0, 120])).toEqual([0, 90]);
    expect(normalise([0, -95])).toEqual([0, -90]);
  });

  it('turnTo puts the place at the middle', () => {
    for (const [lon, lat] of [[-20, 15], [77, 20], [-100, 40], [150, -30], [180, 0]] as const) {
      expect(degreesFromCentre(turnTo(lon, lat), lon, lat)).toBeCloseTo(0, 6);
    }
  });

  it('a drag right shows more of the west, a drag down more of the north', () => {
    const right = dragTurn(PACIFIC, 50, 0, 240);
    expect(degreesFromCentre(right, 170, 0)).toBeLessThan(degreesFromCentre(right, -170, 0)); // the middle moved west of the dateline
    const down = dragTurn(PACIFIC, 0, 50, 240);
    expect(-down[1]).toBeGreaterThan(0); // the middle moved north
    // the point under the pointer follows it: a drag of r·π/2 turns 90°
    expect(dragTurn(PACIFIC, (240 * Math.PI) / 2, 0, 240)[0]).toBeCloseTo(-90, 6);
  });

  it('a drag never tips the globe past a pole', () => {
    expect(dragTurn(PACIFIC, 0, 10000, 240)[1]).toBe(-90);
    expect(dragTurn(PACIFIC, 0, -10000, 240)[1]).toBe(90);
  });

  it('the arrow keys turn it 10° a press, other keys do nothing', () => {
    expect(keyTurn(PACIFIC, 'ArrowLeft')).toEqual([-170, 0]);
    expect(keyTurn(PACIFIC, 'ArrowRight')).toEqual([170, 0]);
    expect(keyTurn(PACIFIC, 'ArrowUp')).toEqual([180, -10]);
    expect(keyTurn(PACIFIC, 'ArrowDown')).toEqual([180, 10]);
    expect(keyTurn(PACIFIC, 'Enter')).toBeNull();
    // thirty-six presses one way go all the way round
    let r: Rotation = PACIFIC;
    for (let i = 0; i < 36; i++) r = keyTurn(r, 'ArrowLeft')!;
    expect(degreesFromCentre(r, 180, 0)).toBeCloseTo(0, 6);
  });

  it('keepInView leaves a place within the rim alone and brings any other to the middle', () => {
    expect(keepInView(PACIFIC, 150, -25)).toBe(PACIFIC);
    const sahel = keepInView(PACIFIC, 0, 14);
    expect(degreesFromCentre(sahel, 0, 14)).toBeCloseTo(0, 6);
    const rim = keepInView(PACIFIC, 180 + 80, 0);
    expect(globeSide(rim, 260, 0)).toBe('near');
  });
});
