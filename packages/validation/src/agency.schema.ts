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
  lat: latitude,
  lng: longitude,
  description: cleanText(1, 2000).nullish(),
});
export type RegisterAgencyInput = z.output<typeof registerAgencySchema>;
