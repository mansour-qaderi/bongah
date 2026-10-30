import { toAsciiDigits } from '@bongah/validation';

/** "34.5281", "۳۴٫۵۲۸۱", "34,5281" (one comma = decimal mark when there is nothing else). */
export function parseLatLng(text: string): number | null {
  const t = toAsciiDigits(text).replace(/٫/g, '.').trim();
  if (!/^-?\d{1,3}([.,]\d+)?$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** "34.5281, 69.1761" pasted from a map app → the two numbers as text. */
export function splitLatLng(text: string): { lat: string; lng: string } | null {
  const t = toAsciiDigits(text).replace(/٫/g, '.').trim();
  const m = /^(-?\d{1,3}(?:\.\d+)?)\s*[,;،\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(t);
  return m ? { lat: m[1]!, lng: m[2]! } : null;
}

