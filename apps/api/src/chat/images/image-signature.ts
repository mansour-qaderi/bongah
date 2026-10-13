import type { ChatImageType } from '@bongah/shared-types';

/**
 * What kind of picture these bytes really are, judged by their first bytes, or null.
 * The Content-Type header is only the client's word; a chat must not store (and serve to the other
 * person) an arbitrary file just because it was labelled image/jpeg.
 */
export function sniffImageType(bytes: Buffer): ChatImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}
