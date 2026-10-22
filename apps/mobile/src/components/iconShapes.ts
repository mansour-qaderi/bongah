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
/** A straight stroke from (x1, y1) to (x2, y2), any angle: a bar of the icon colour, turned to lie along it. */
const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t = 1.5,
): Shape => {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return {
    x: Math.round((cx - length / 2) * 100) / 100,
    y: Math.round((cy - t / 2) * 100) / 100,
    w: Math.round(length * 100) / 100,
    h: t,
    r: t / 2,
    fill: 'color',
    rotate:
      Math.round(((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI) * 10) / 10,
  };
};
/** The five points of a star centred on (cx, cy), the first straight up. */
const starPoints = (cx: number, cy: number, radius: number) =>
  [0, 1, 2, 3, 4].map(i => {
    const angle = ((-90 + i * 72) * Math.PI) / 180;
    return [
      cx + radius * Math.cos(angle),
      cy + radius * Math.sin(angle),
    ] as const;
  });
/** A five-pointed star drawn as its outline's five long strokes (each corner joined to the second one after it). */
const star = (cx: number, cy: number, radius: number, t = 1.5): Shape[] => {
  const pts = starPoints(cx, cy, radius);
  return pts.map((from, i) => {
    const to = pts[(i + 2) % 5];
    return line(from[0], from[1], to[0], to[1], t);
  });
};
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

/**
 * Turns a shape by `deg` degrees (clockwise) around the point (cx, cy) of the grid, so a drawing made upright
 * (a pencil) can be tilted as a whole. A shape rotates about its own centre, so the centre is moved round the
 * pivot and the shape is rotated by the same angle.
 */
const turn = (shape: Shape, deg: number, cx: number, cy: number): Shape => {
  const rad = (deg * Math.PI) / 180;
  const dx = shape.x + shape.w / 2 - cx;
  const dy = shape.y + shape.h / 2 - cy;
  const centreX = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
  const centreY = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  return {
    ...shape,
    x: Math.round((centreX - shape.w / 2) * 100) / 100,
    y: Math.round((centreY - shape.h / 2) * 100) / 100,
    rotate: (shape.rotate ?? 0) + deg,
  };
};

export type IconName =
  // Kinds of property
  | 'land'
  | 'apartment'
  | 'house'
  | 'villa'
  | 'garden'
  | 'shop'
  | 'garage'
  | 'office'
  | 'map-pin'
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
  | 'info'
  | 'share'
  | 'camera'
  | 'search'
  | 'bookmark'
  | 'bookmarkFilled'
  // The account menu
  | 'gift'
  | 'globe'
  | 'bell'
  | 'logout'
  | 'chevronRight'
  | 'chevronLeft'
  | 'chevronDown'
  // Three dots in a row: "more actions"
  | 'more'
  // What an owner does to a listing
  | 'edit'
  | 'check'
  | 'trash'
  | 'toggleOn'
  | 'toggleOff'
  | 'arrowUp'
  // Details of a listing
  | 'bed'
  | 'bath'
  | 'shower'
  | 'area'
  | 'coin'
  // A featured frame (کادر ویژه): a rounded frame with a star in it
  | 'frameStar'
  // The balance: a wallet
  | 'wallet'
  // The listing form's map: fullscreen and back, undo a corner, draw a plot
  | 'expand'
  | 'collapse'
  | 'undo'
  | 'draw'
  // The map's style switch: stacked layers
  | 'layers'
  // The map's satellite switch: a satellite sending a signal
  | 'satellite'
  // Directions to a listing
  | 'navigate';

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
  // A garden: a tree with a round crown, on a line of ground.
  garden: [ring(12, 9, 12), bar(11.1, 14.5, 1.8, 6), bar(6.5, 20.4, 11, 1.6)],
  // A villa: a smaller house beside a tree.
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

  'map-pin': [
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
  // A map pin: a teardrop (a square with three round corners, turned so its point is down) with a ring in its head.
  pin: [
    {
      x: 5,
      y: 3.5,
      w: 14,
      h: 14,
      r: [7, 7, 7, 0],
      stroke: true,
      rotate: -45,
    },
    ring(12, 10.5, 5.4),
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
  // The share glyph: three connected circles (the left one joined to the two on the right), the node-connection mark
  // every phone shows for "share".
  share: [
    ring(17.5, 5.5, 7),
    ring(6.5, 12, 7),
    ring(17.5, 18.5, 7),
    { x: 8.6, y: 7.9, w: 6.8, h: 1.7, r: 0.85, fill: 'color', rotate: -30.6 },
    { x: 8.6, y: 14.4, w: 6.8, h: 1.7, r: 0.85, fill: 'color', rotate: 30.6 },
  ],
  // A camera: a body with a lens and a small bump on top.
  camera: [
    frame(8.5, 4, 7, 4, 1.5, [1, 1, 0, 1]),
    frame(3, 7, 18, 13.5, 3),
    ring(12, 13.7, 6.4),
  ],
  // A magnifying glass: a lens and a short handle.
  search: [
    ring(10.5, 10.5, 13),
    { x: 14, y: 19.1, w: 8, h: 1.8, r: 0.9, fill: 'color', rotate: 45 },
  ],
  // A ribbon (a saved listing): an open frame whose foot is cut by an upward "^" notch, like the ribbon in a book.
  bookmark: [frame(6, 3, 12, 17.5, 2, [1, 1, 0, 1]), roof(12, 16.5, 8)],
  // The same ribbon filled in: saved. A solid block with the notch stepped out of its foot, one grid unit at a time.
  bookmarkFilled: [
    { x: 6, y: 3, w: 12, h: 13.5, r: [2, 2, 0, 0], fill: 'color' },
    ...[0, 1, 2, 3].flatMap((step): Shape[] => {
      const width = 6 - step - 0.5;
      const y = 16.5 + step;
      return [
        { x: 6, y, w: width, h: 1.01, fill: 'color' },
        { x: 12 + step + 0.5, y, w: width, h: 1.01, fill: 'color' },
      ];
    }),
  ],
  // A gift: a lid over a box, a ribbon down the middle and a bow.
  gift: [
    frame(4, 10.5, 16, 10.5, 2),
    frame(3, 7.5, 18, 3.5, 1.5),
    bar(11.1, 7.5, 1.8, 13.5),
    ring(9, 5, 4.4),
    ring(15, 5, 4.4),
  ],
  // A globe: a circle, a meridian and the equator.
  globe: [ring(12, 12, 19), frame(8, 2.5, 8, 19, 4), bar(2.5, 11.2, 19, 1.6)],
  // A bell: a dome over a rim, with a clapper.
  bell: [
    bar(11.2, 2.2, 1.6, 2.4),
    { x: 5, y: 4.5, w: 14, h: 12, r: [7, 7, 1.5, 1.5], stroke: true },
    bar(3.5, 16.5, 17, 1.7),
    dot(12, 20.2, 3),
  ],
  // Leaving: a door open on one side and an arrow going out through it.
  logout: [
    frame(3.5, 3.5, 9, 17, 2, [1, 0, 1, 1]),
    bar(9, 11.1, 11.5, 1.8),
    { x: 15.4, y: 8.7, w: 5.2, h: 1.8, r: 0.9, fill: 'color', rotate: 45 },
    { x: 15.4, y: 13.5, w: 5.2, h: 1.8, r: 0.9, fill: 'color', rotate: -45 },
  ],
  // ">" and "<": the two edges of a turned square that meet at its right / left corner.
  chevronRight: [
    {
      x: 7.3,
      y: 8.8,
      w: 6.4,
      h: 6.4,
      r: 0.6,
      stroke: [1, 1, 0, 0],
      rotate: 45,
    },
  ],
  chevronLeft: [
    {
      x: 10.3,
      y: 8.8,
      w: 6.4,
      h: 6.4,
      r: 0.6,
      stroke: [0, 0, 1, 1],
      rotate: 45,
    },
  ],
  // "v": the two lower edges of a turned square meet at its bottom corner (an expandable section).
  chevronDown: [
    {
      x: 8.8,
      y: 6.55,
      w: 6.4,
      h: 6.4,
      r: 0.6,
      stroke: [0, 1, 1, 0],
      rotate: 45,
    },
  ],
  more: [dot(5, 12, 3.2), dot(12, 12, 3.2), dot(19, 12, 3.2)],
  // A pencil lying at 45 degrees: a body, a pointed tip (the lower edges of a turned square) and a line to write on.
  edit: [
    ...[
      {
        x: 9.6,
        y: 2.5,
        w: 4.8,
        h: 12.5,
        r: [1.4, 1.4, 0, 0],
        stroke: [1, 1, 0, 1],
      },
      {
        x: 10.3,
        y: 13.3,
        w: 3.4,
        h: 3.4,
        r: 0.3,
        stroke: [0, 1, 1, 0],
        rotate: 45,
      },
    ].map((shape): Shape => turn(shape as Shape, 45, 12, 10.5)),
    bar(4.5, 19.6, 15, 1.7),
  ],
  // A tick: a short stroke down to the right and a long one up to the right.
  check: [
    { x: 4.05, y: 13.85, w: 6.4, h: 1.8, r: 0.9, fill: 'color', rotate: 45 },
    { x: 7.55, y: 11.35, w: 13.4, h: 1.8, r: 0.9, fill: 'color', rotate: -45 },
  ],
  // A bin: a lid with a handle over a tub with two slots.
  trash: [
    bar(4, 6.2, 16, 1.7),
    frame(9, 3, 6, 3.2, 1.2, [1, 1, 0, 1]),
    frame(6, 8.6, 12, 12.4, 2.4, [0, 1, 1, 1]),
    bar(10.1, 11.8, 1.5, 6.2),
    bar(12.4, 11.8, 1.5, 6.2),
  ],
  // A switch: off is an outlined track with the knob on the left, on is a solid track with a white knob on the
  // right (a listing switched off / on).
  toggleOff: [frame(2, 6.5, 20, 11, 5.5), dot(8, 12, 5)],
  toggleOn: [
    { x: 2, y: 6.5, w: 20, h: 11, r: 5.5, fill: 'color' },
    { x: 13.5, y: 9.5, w: 5, h: 5, r: 2.5, fill: 'bg' },
  ],
  // An arrow pointing up from a base line: lifting a listing higher.
  arrowUp: [
    bar(11.1, 3.4, 1.8, 14),
    { x: 7.8, y: 4.9, w: 5.2, h: 1.8, r: 0.9, fill: 'color', rotate: -45 },
    { x: 11, y: 4.9, w: 5.2, h: 1.8, r: 0.9, fill: 'color', rotate: 45 },
    bar(5.5, 20, 13, 1.8),
  ],
  // A bed seen from the side: headboard, mattress, a pillow and a foot post.
  bed: [
    bar(3, 5.5, 1.7, 14),
    frame(4.7, 11.5, 16.3, 5, 1.5),
    bar(6.8, 8.4, 5, 2.4),
    bar(19.3, 16.5, 1.7, 3),
  ],
  // A bath: a tap over a tub on two feet.
  bath: [
    bar(5, 3.5, 1.7, 6),
    bar(5, 3.5, 5, 1.7),
    bar(2.5, 10, 19, 1.7),
    { x: 4, y: 11.7, w: 16, h: 6, r: [0, 0, 5, 5], stroke: [0, 1, 1, 1] },
    bar(6.5, 17.7, 1.7, 2.6),
    bar(15.8, 17.7, 1.7, 2.6),
  ],
  // A shower: a rose over a pipe with five drops falling from it.
  shower: [
    bar(11.2, 1.8, 1.6, 3),
    { x: 4.5, y: 4.5, w: 15, h: 8, r: [7.5, 7.5, 1, 1], stroke: true },
    bar(7.2, 15, 1.5, 3),
    bar(11.25, 15, 1.5, 3),
    bar(15.3, 15, 1.5, 3),
    bar(9.2, 19.2, 1.5, 2.6),
    bar(13.3, 19.2, 1.5, 2.6),
  ],
  // A ruler: the size of a property.
  area: [
    frame(2.5, 7.5, 19, 9, 2),
    bar(6.4, 9.2, 1.2, 3.6),
    bar(10.4, 9.2, 1.2, 2.2),
    bar(14.4, 9.2, 1.2, 3.6),
    bar(18, 9.2, 1.2, 2.2),
  ],
  // A coin: a ring within a ring.
  coin: [ring(12, 12, 19), ring(12, 12, 10)],
  // A featured frame: the rounded frame of the listing card with a five-pointed star in it.
  frameStar: [frame(2.5, 2.5, 19, 19, 4.5), ...star(12, 12.8, 6.2, 1.5)],
  // A wallet: its body, the flap's clasp at one end and the button on it.
  wallet: [
    frame(2.5, 6, 19, 14, 3.5),
    bar(5.5, 3.5, 11, 1.6),
    frame(14, 10.5, 7.5, 5, 2.5),
    dot(17.2, 13, 1.8),
  ],
  // Fullscreen: four corners pointing out.
  expand: [
    line(4, 9.5, 4, 4),
    line(4, 4, 9.5, 4),
    line(14.5, 4, 20, 4),
    line(20, 4, 20, 9.5),
    line(20, 14.5, 20, 20),
    line(20, 20, 14.5, 20),
    line(9.5, 20, 4, 20),
    line(4, 20, 4, 14.5),
  ],
  // Leave fullscreen: the same four corners pointing in.
  collapse: [
    line(9.5, 4, 9.5, 9.5),
    line(9.5, 9.5, 4, 9.5),
    line(14.5, 4, 14.5, 9.5),
    line(14.5, 9.5, 20, 9.5),
    line(14.5, 20, 14.5, 14.5),
    line(14.5, 14.5, 20, 14.5),
    line(9.5, 20, 9.5, 14.5),
    line(9.5, 14.5, 4, 14.5),
  ],
  // Undo: an arrow back to the left that turns round on the right.
  undo: [
    frame(8, 8.25, 11.5, 10.5, 5.25, [1, 1, 1, 0]),
    bar(4.5, 8.25, 5, 1.5),
    line(4.6, 9, 8.3, 5.4),
    line(4.6, 9, 8.3, 12.6),
  ],
  // Map layers: a diamond with two "V" edges stacked under it.
  layers: [
    { x: 8, y: 3.5, w: 8, h: 8, r: 1.2, stroke: true, rotate: 45 },
    { x: 8, y: 7, w: 8, h: 8, r: 1.2, stroke: [0, 1, 1, 0], rotate: 45 },
    { x: 8, y: 10.5, w: 8, h: 8, r: 1.2, stroke: [0, 1, 1, 0], rotate: 45 },
  ],
  // A satellite: a body with a panel on each side and a dish, the whole turned 45 degrees, and a signal's two arcs.
  satellite: [
    ...(
      [
        frame(9.5, 9.5, 5, 5, 1.2),
        // The panels, each with a line across it, and what joins them to the body.
        frame(2, 8, 5.5, 8, 0.9),
        frame(16.5, 8, 5.5, 8, 0.9),
        bar(2.4, 11.45, 4.7, 1.1),
        bar(16.9, 11.45, 4.7, 1.1),
        bar(7.5, 11.2, 2, 1.6),
        bar(14.5, 11.2, 2, 1.6),
        // The dish, on its stem.
        {
          x: 9.5,
          y: 5.2,
          w: 5,
          h: 3,
          r: [2.5, 2.5, 0, 0],
          stroke: [1, 1, 0, 1],
        },
        bar(11.2, 8.2, 1.6, 1.4),
      ] as Shape[]
    ).map(shape => turn(shape, 45, 12, 12)),
    { x: 2.6, y: 16.6, w: 4.8, h: 4.8, r: 2.4, stroke: [1, 1, 0, 0] },
    { x: 0.4, y: 14.4, w: 9.2, h: 9.2, r: 4.6, stroke: [1, 1, 0, 0] },
  ],
  // Drawing a plot: four corners joined into an outline.
  draw: [
    line(5, 6.5, 18, 4.5),
    line(18, 4.5, 19.5, 17.5),
    line(19.5, 17.5, 6.5, 19.5),
    line(6.5, 19.5, 5, 6.5),
    dot(5, 6.5, 3.6),
    dot(18, 4.5, 3.6),
    dot(19.5, 17.5, 3.6),
    dot(6.5, 19.5, 3.6),
  ],
  // Directions: the arrowhead a navigation app points with.
  navigate: [
    line(4, 11, 20, 4),
    line(20, 4, 13, 20),
    line(13, 20, 11, 13),
    line(11, 13, 4, 11),
  ],
};
