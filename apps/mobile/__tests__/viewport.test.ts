import {
  AREA_MARGIN,
  MAX_OVERFETCH_COMPLETE,
  areaContains,
  areaFor,
  boundsFromCamera,
  nextArea,
} from '../src/map/viewport';
import type { Bounds } from '../src/map/cluster';

/** Kabul at city zoom, on a phone-sized screen. */
const kabul: Bounds = [69.1, 34.5, 69.25, 34.62];

describe('areaFor', () => {
  it('covers the whole screen, with room to spare on every side', () => {
    const area = areaFor(kabul);
    expect(areaContains(area, kabul)).toBe(true);
    expect(area.min_lat).toBeLessThan(kabul[1]);
    expect(area.max_lat).toBeGreaterThan(kabul[3]);
    expect(area.min_lng).toBeLessThan(kabul[0]);
    expect(area.max_lng).toBeGreaterThan(kabul[2]);
  });

  it('is not enormous: a few times the screen at most', () => {
    const area = areaFor(kabul);
    const ratio =
      ((area.max_lat - area.min_lat) * (area.max_lng - area.min_lng)) /
      ((kabul[3] - kabul[1]) * (kabul[2] - kabul[0]));
    expect(ratio).toBeLessThan(((1 + AREA_MARGIN * 2) * 2) ** 2);
  });

  it('gives a different area after a real move', () => {
    const herat: Bounds = [62.1, 34.3, 62.25, 34.42];
    expect(areaFor(herat)).not.toEqual(areaFor(kabul));
  });

  it('writes numbers the API accepts: at most 6 decimals, never an exponent', () => {
    for (const bounds of [
      kabul,
      [69.17, 34.55, 69.1702, 34.5502] as Bounds,
      [60, 29, 75, 39] as Bounds,
    ]) {
      const area = areaFor(bounds);
      for (const value of Object.values(area)) {
        expect(String(value)).toMatch(/^-?\d{1,3}(\.\d{1,6})?$/);
      }
    }
  });

  it('never leaves the valid range, even for a view bigger than the world', () => {
    const area = areaFor([-400, -100, 400, 100]);
    expect(area.min_lat).toBeGreaterThanOrEqual(-90);
    expect(area.max_lat).toBeLessThanOrEqual(90);
    expect(area.min_lng).toBeGreaterThanOrEqual(-180);
    expect(area.max_lng).toBeLessThanOrEqual(180);
    expect(area.min_lat).toBeLessThan(area.max_lat);
  });
});

describe('nextArea', () => {
  it('keeps the loaded area, as the same object, while it still covers the screen', () => {
    const current = areaFor(kabul);
    const nudged: Bounds = [69.11, 34.51, 69.26, 34.63];
    expect(nextArea(current, nudged)).toBe(current);
  });

  it('keeps it through any small pan, so panning about does not reload', () => {
    const current = areaFor(kabul);
    for (let i = -10; i <= 10; i += 1) {
      const shift = i * 0.002; // up to ~0.02 degrees: well inside the margin
      const nudged: Bounds = [
        kabul[0] + shift,
        kabul[1] + shift,
        kabul[2] + shift,
        kabul[3] + shift,
      ];
      expect(nextArea(current, nudged)).toBe(current);
    }
  });

  it('keeps it through a small zoom in, so zooming does not reload', () => {
    const current = areaFor(kabul);
    const closer: Bounds = [69.12, 34.52, 69.235, 34.6];
    expect(areaContains(current, closer)).toBe(true);
    expect(nextArea(current, closer)).toBe(current);
  });

  it('keeps it through a bigger zoom in once everything in it has arrived', () => {
    const current = areaFor(kabul);
    const closer: Bounds = [69.14, 34.54, 69.2, 34.58];
    expect(nextArea(current, closer, false)).not.toBe(current); // may have been cut short: look again
    expect(nextArea(current, closer, true)).toBe(current); // nothing more to find
  });

  it('hands back the old object when the new area comes out the same', () => {
    const current = areaFor(kabul);
    const wider: Bounds = [
      kabul[0] - 0.1,
      kabul[1] - 0.1,
      kabul[2] + 0.1,
      kabul[3] + 0.1,
    ];
    const next = nextArea(current, wider);
    expect(areaContains(next, wider)).toBe(true);
    expect(nextArea(next, wider)).toBe(next);
  });

  it('works out a new one once the screen leaves the area', () => {
    const current = areaFor(kabul);
    const east: Bounds = [69.4, 34.5, 69.55, 34.62];
    const next = nextArea(current, east);
    expect(next).not.toBe(current);
    expect(areaContains(next, east)).toBe(true);
  });

  it('works out a new, tighter one after zooming far in', () => {
    const current = areaFor(kabul);
    const street: Bounds = [69.17, 34.55, 69.172, 34.552];
    expect(areaContains(current, street)).toBe(true);
    const next = nextArea(current, street, true);
    expect(next).not.toBe(current);
    expect(
      ((current.max_lat - current.min_lat) *
        (current.max_lng - current.min_lng)) /
        ((next.max_lat - next.min_lat) * (next.max_lng - next.min_lng)),
    ).toBeGreaterThan(MAX_OVERFETCH_COMPLETE);
  });

  it('starts from nothing', () => {
    expect(areaContains(nextArea(null, kabul), kabul)).toBe(true);
  });
});

describe('boundsFromCamera', () => {
  it('is centred on the camera', () => {
    const [west, south, east, north] = boundsFromCamera(
      [69.17, 34.55],
      11,
      400,
      800,
    );
    expect((west + east) / 2).toBeCloseTo(69.17, 5);
    expect((south + north) / 2).toBeCloseTo(34.55, 1);
  });

  it('is taller than wide on a tall screen, and shrinks as the zoom grows', () => {
    const wide = boundsFromCamera([69.17, 34.55], 10, 400, 800);
    const near = boundsFromCamera([69.17, 34.55], 13, 400, 800);
    expect(wide[3] - wide[1]).toBeGreaterThan(wide[2] - wide[0]);
    expect(near[2] - near[0]).toBeCloseTo((wide[2] - wide[0]) / 8, 4);
  });

  it('puts Kabul on screen at the home view, and not Herat', () => {
    const view = boundsFromCamera([69.1721, 34.5553], 11, 400, 800);
    expect(areaContains(areaFor(view), view)).toBe(true);
    expect(62.2).toBeLessThan(view[0]);
  });
});
