import { ConfigService } from '@nestjs/config';

export const AGENCY_TRIAL_SETTINGS = Symbol('AGENCY_TRIAL_SETTINGS');

/**
 * The free period a new agency starts with. During it the agency can publish listings (and bulk upload them) without a
 * subscription. Everything else a subscription brings (unlimited contact reveals, the chat tools, an exact office pin)
 * still needs the subscription: the trial is for getting the first listings up, not for the whole plan.
 */
export interface AgencyTrialSettings {
  /** How long the trial lasts from the moment the agency registers; 0 = no trial. AGENCY_TRIAL_DAYS. */
  days: number;
  /** How many listings an agency can publish during its trial. AGENCY_TRIAL_LISTINGS. */
  listings: number;
}

export const DEFAULT_TRIAL_DAYS = 30;
// A starting figure, not a business decision: the cheapest plan (monthly) includes 8 listings, and the trial should
// not make that plan pointless. Set AGENCY_TRIAL_LISTINGS to what the business wants.
export const DEFAULT_TRIAL_LISTINGS = 10;

function wholeNumber(config: ConfigService, name: string, fallback: number, min: number, max: number): number {
  const raw = config.get<string>(name)?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < min || value > max) {
    throw new Error(`${name} must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

/** Reads and validates the trial settings once, so a typo fails at startup rather than at the first registration. */
export function readAgencyTrialSettings(config: ConfigService): AgencyTrialSettings {
  return {
    days: wholeNumber(config, 'AGENCY_TRIAL_DAYS', DEFAULT_TRIAL_DAYS, 0, 365),
    listings: wholeNumber(config, 'AGENCY_TRIAL_LISTINGS', DEFAULT_TRIAL_LISTINGS, 1, 1000),
  };
}
