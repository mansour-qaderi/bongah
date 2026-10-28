/** How far the map tilts when 3D is on (degrees), and the closest-in zoom it comes to so the buildings are in view. */
export const TILT_PITCH = 55;
export const TILT_ZOOM = 16;

/** The part of a Mapbox GL map the 3D view needs, so it can be tested without a browser. */
export interface TiltMap {
  getPitch(): number;
  getZoom(): number;
  easeTo(options: { pitch: number; zoom?: number; duration: number }): unknown;
}

/** The map is tilted (looking at the buildings from the side). */
export const isTilted = (map: Pick<TiltMap, 'getPitch'>): boolean => map.getPitch() > 1;

/**
 * The «3D» button's action: tilts the map so buildings stand up as blocks (see map-detail.ts), or back to the flat map.
 * Buildings only rise from zoom 14, so from further out the tilt alone would show nothing: it comes closer too, never
 * further. Returns whether the map is going to be tilted.
 */
export function toggleTilt(map: TiltMap): boolean {
  if (isTilted(map)) {
    map.easeTo({ pitch: 0, duration: 700 });
    return false;
  }
  map.easeTo({ pitch: TILT_PITCH, zoom: Math.max(map.getZoom(), TILT_ZOOM), duration: 900 });
  return true;
}
