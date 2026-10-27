/** The picture types the API accepts (it checks the bytes, not only the header). */
import { tNow } from '@/i18n/active';
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',');

/** A regular account may upload a picture up to 3 MB; a phone photo is often twice that, so it is shrunk first. */
export const TARGET_BYTES = 2_600_000;
const MAX_SIDE = 2400;

export function isAcceptedImage(file: File): boolean {
  return (IMAGE_TYPES as readonly string[]).includes(file.type);
}

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(tNow('image.readFailed')));
    };
    img.src = url;
  });
}

/**
 * Makes sure a picture fits the upload limit. A file already under `maxBytes` goes as it is; a larger one is redrawn
 * smaller (longest side at most 2400 px) as a JPEG, with the quality lowered step by step until it fits.
 */
export async function fitImage(file: File, maxBytes = TARGET_BYTES): Promise<File> {
  if (file.size <= maxBytes) return file;
  const img = await load(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(tNow('image.cannotResize'));
  ctx.fillStyle = '#ffffff'; // a PNG with transparency has no black background as a JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.88, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= maxBytes) {
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
        type: 'image/jpeg',
      });
    }
  }
  throw new Error(tNow('image.tooLarge'));
}
