import { Platform } from 'react-native';

/**
 * A link that opens a pin in the phone's own maps app (no Google SDK): a geo: link on Android,
 * Apple Maps on iOS. Both put a marker on the exact point.
 */
export function mapsUrl(lat: number, lng: number): string {
  return Platform.select({
    android: `geo:${lat},${lng}?q=${lat},${lng}`,
    default: `https://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}`,
  });
}
