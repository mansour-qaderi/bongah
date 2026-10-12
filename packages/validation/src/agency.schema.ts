import { z } from 'zod';
import { cleanText, httpUrl } from './common';
import { latitude, longitude } from './property.schema';

/**
 * Registering a real-estate office (Rahnamaye Mamelat). The agency starts unverified;
 * an admin reviews the license photo and sets `is_verified`.
 */
export const registerAgencySchema = z.strictObject({
  agency_name: cleanText(2, 120),
  license_photo: httpUrl,
  address: cleanText(3, 300),
  description: cleanText(1, 2000).nullish(),
});
export type RegisterAgencyInput = z.output<typeof registerAgencySchema>;

/**
 * PUT /agencies/me/location: the exact office pin. Kept out of registration on purpose: placing
 * it needs an active subscription, which a brand-new agency cannot have yet.
 */
export const setAgencyLocationSchema = z.strictObject({
  lat: latitude,
  lng: longitude,
});
export type SetAgencyLocationInput = z.output<typeof setAgencyLocationSchema>;
