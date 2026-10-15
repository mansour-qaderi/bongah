/**
 * The line icons, as data: a few rectangles, circles and rounded outlines on a 24 x 24 grid.
 *
 * The app has no icon font or SVG library on purpose (each needs native linking, and the tab bar used plain
 * emoji to avoid that). Drawing the icons from plain views keeps it that way while looking like one family:
 * the same thin stroke, round ends and the same 24-unit grid. Because the shapes are data with no React in
 * them, the same list can be drawn by anything (the app draws them as views).
 */

/** One rounded rectangle. A circle is a square whose radius is half its side. Units are grid units. */
export interface Shape {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius: one number, or [top-left, top-right, bottom-right, bottom-left] (physical corners; Icon draws them in a left-to-right subtree so they do not mirror in right-to-left). Default 0. */
  r?: number | [number, number, number, number];
  /**
   * Which sides draw the outline, as [top, right, bottom, left] multipliers of the stroke width (0 hides a
   * side). `true` = all four sides, no entry = no outline.
   */
  stroke?: true | [number, number, number, number];
  /** 'color': solid in the icon colour. 'bg': in the surface behind the icon (to hide what is under it). */
  fill?: 'color' | 'bg';
  dashed?: boolean;
  /** Degrees, around the shape's own centre. */
  rotate?: number;
}

/** A bar of the icon colour (a straight line segment, horizontal or vertical). */
const bar = (x: number, y: number, w: number, h: number): Shape => ({
  x,
  y,
  w,
  h,
  r: Math.min(w, h) / 2,
  fill: 'color',
});
/** A filled dot centred on (cx, cy). */
const dot = (cx: number, cy: number, d: number): Shape => ({
  x: cx - d / 2,
  y: cy - d / 2,
  w: d,
  h: d,
  r: d / 2,
  fill: 'color',
});
/** An outlined circle centred on (cx, cy). */
const ring = (cx: number, cy: number, d: number, fill?: 'bg'): Shape => ({
  x: cx - d / 2,
  y: cy - d / 2,
  w: d,
  h: d,
  r: d / 2,
  stroke: true,
  fill,
});
/** An outlined rounded rectangle. */
const frame = (
  x: number,
  y: number,
  w: number,
  h: number,
  r = 0,
  sides: Shape['stroke'] = true,
): Shape => ({ x, y, w, h, r, stroke: sides });
/**
 * A roof: the top-left corner of a turned square, so it reads as a "^". `span` is the width it covers, and the
 * ridge sits at (cx, top).
 */
const roof = (cx: number, top: number, span: number): Shape => {
  const side = span / Math.SQRT2;
  const centreY = top + span / 2;
  return {
    x: cx - side / 2,
    y: centreY - side / 2,
    w: side,
    h: side,
    r: 1,
    stroke: [1, 0, 0, 1],
    rotate: 45,
  };
};

export type IconName =
  // Kinds of property
  | 'land'
  | 'apartment'
  | 'house'
  | 'villa'
  | 'shop'
  | 'garage'
  | 'office'
  // The app
  | 'pin'
  | 'chat'
  | 'listings'
  | 'dashboard'
  | 'user'
  | 'filter'
  | 'locate'
  | 'plus'
  | 'close'
  | 'list'
  | 'info';

export const ICON_GRID = 24;

export const ICON_SHAPES: Record<IconName, Shape[]> = {
  // A plot: its boundary dashed, with a marker in the middle.
  land: [
    { x: 3.5, y: 3.5, w: 17, h: 17, r: 2.5, stroke: true, dashed: true },
    dot(12, 12, 4.5),
  ],
  // A block of flats: windows in two columns, a door at the foot.
  apartment: [
    frame(5.5, 2.5, 13, 19, 2),
    dot(9.5, 7, 2),
    dot(14.5, 7, 2),
    dot(9.5, 11.5, 2),
    dot(14.5, 11.5, 2),
    bar(10.5, 16.5, 3, 5),
  ],
  // A house with a pitched roof and a door.
  house: [
    frame(5, 11, 14, 10, 1.5, [0, 1, 1, 1]),
    roof(12, 3, 18),
    frame(10, 14.5, 4, 6.5, 1),
  ],
  // A garden villa: a smaller house beside a tree.
  villa: [
    frame(3, 12, 11, 9, 1.5, [0, 1, 1, 1]),
    roof(8.5, 5, 13),
    ring(18.5, 11, 7),
    bar(18, 14, 1.4, 7),
  ],
  // A shop front: an awning over a window and a door.
  shop: [
    frame(3, 3.5, 18, 5.5, 2),
    bar(9, 3.8, 1.2, 5),
    bar(14, 3.8, 1.2, 5),
    frame(4.5, 9, 15, 12, 0, [0, 1, 1, 1]),
    frame(9.5, 13, 5, 8, 0),
  ],
  // A garage: a pitched roof over a wide up-and-over door (two slats).
  garage: [
    frame(4, 11, 16, 10, 1.5, [0, 1, 1, 1]),
    roof(12, 3, 19),
    bar(8, 14.5, 8, 1.4),
    bar(8, 18, 8, 1.4),
  ],
  // An office tower: a tall block with floors (the marker of a real-estate office).
  office: [
    frame(6, 2.5, 12, 19, 1.5),
    bar(9, 6.5, 6, 1.4),
    bar(9, 10.5, 6, 1.4),
    bar(9, 14.5, 6, 1.4),
    bar(10.5, 18, 3, 3.5),
  ],

  // A map pin: a teardrop (a square with three round corners, turned) with a dot.
  pin: [
    {
      x: 5.5,
      y: 3.5,
      w: 13,
      h: 13,
      r: [6.5, 6.5, 6.5, 0],
      stroke: true,
      rotate: -45,
    },
    dot(12, 10, 4),
    bar(8, 21, 8, 1.6),
  ],
  // A speech bubble with three dots.
  chat: [
    frame(3, 4, 18, 13, 5),
    { x: 6.5, y: 14, w: 5, h: 5, r: 0.8, stroke: [0, 1, 1, 0], rotate: 45 },
    dot(8.2, 10.5, 2),
    dot(12, 10.5, 2),
    dot(15.8, 10.5, 2),
  ],
  // A page with lines.
  listings: [
    frame(4.5, 3, 15, 18, 3),
    bar(8.5, 8, 7, 1.4),
    bar(8.5, 12, 7, 1.4),
    bar(8.5, 16, 4.5, 1.4),
  ],
  // Four tiles.
  dashboard: [
    frame(3.5, 3.5, 7.5, 7.5, 2),
    frame(13, 3.5, 7.5, 7.5, 2),
    frame(3.5, 13, 7.5, 7.5, 2),
    frame(13, 13, 7.5, 7.5, 2),
  ],
  // A head and shoulders.
  user: [
    ring(12, 8, 7),
    { x: 4.5, y: 14.5, w: 15, h: 7, r: [7.5, 7.5, 0, 0], stroke: [1, 1, 0, 1] },
  ],
  // Sliders: three tracks, each with a knob.
  filter: [
    bar(3.5, 6, 17, 1.4),
    bar(3.5, 11.3, 17, 1.4),
    bar(3.5, 16.6, 17, 1.4),
    ring(15.5, 6.7, 4.6, 'bg'),
    ring(8.5, 12, 4.6, 'bg'),
    ring(14, 17.3, 4.6, 'bg'),
  ],
  // A crosshair: a ring, a centre dot and four ticks.
  locate: [
    ring(12, 12, 11),
    dot(12, 12, 3.6),
    bar(11.3, 1.5, 1.4, 4),
    bar(11.3, 18.5, 1.4, 4),
    bar(1.5, 11.3, 4, 1.4),
    bar(18.5, 11.3, 4, 1.4),
  ],
  plus: [bar(4.5, 11.1, 15, 1.8), bar(11.1, 4.5, 1.8, 15)],
  close: [
    { x: 4, y: 11.1, w: 16, h: 1.8, r: 0.9, fill: 'color', rotate: 45 },
    { x: 4, y: 11.1, w: 16, h: 1.8, r: 0.9, fill: 'color', rotate: -45 },
  ],
  // Three rows, each with a bullet.
  list: [
    dot(4.8, 6.5, 2.2),
    bar(9, 5.8, 11.5, 1.5),
    dot(4.8, 12, 2.2),
    bar(9, 11.3, 11.5, 1.5),
    dot(4.8, 17.5, 2.2),
    bar(9, 16.8, 11.5, 1.5),
  ],
  // The letter "i" in a circle.
  info: [ring(12, 12, 19), dot(12, 7.6, 1.9), bar(11.2, 10.8, 1.6, 6.4)],
};
