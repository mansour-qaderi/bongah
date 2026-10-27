import { z } from 'zod';
import { cleanText, httpUrl } from './common';
import { latitude, longitude } from './property.schema';

/**
 * Creating the profile of an account (name and address). The agency starts unverified. The licence photo is optional:
 * the web panel does not ask for one; the phone app may still send it, and an admin can still review it.
 */
export const registerAgencySchema = z.strictObject({
  agency_name: cleanText(2, 120),
  license_photo: httpUrl.optional(),
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

/**
 * PUT /agencies/me/license: send a new license photo after a rejection (or to replace an old one).
 * The review starts over: the agency goes back to PENDING.
 */
export const resubmitLicenseSchema = z.strictObject({ license_photo: httpUrl });
export type ResubmitLicenseInput = z.output<typeof resubmitLicenseSchema>;
