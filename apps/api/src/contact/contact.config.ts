import { ConfigService } from '@nestjs/config';

export const CONTACT_SETTINGS = Symbol('CONTACT_SETTINGS');

export interface ContactSettings {
  /** Phone numbers a regular account may reveal per Kabul day without paying (CONTACT_DAILY_FREE_LIMIT). */
  dailyFreeLimit: number;
}

export const DEFAULT_DAILY_FREE_LIMIT = 3;

/** Reads and validates the contact settings once, so a typo fails at startup rather than at the first reveal. */
export function readContactSettings(config: ConfigService): ContactSettings {
  const raw = config.get<string>('CONTACT_DAILY_FREE_LIMIT')?.trim();
  if (!raw) return { dailyFreeLimit: DEFAULT_DAILY_FREE_LIMIT };
  if (!/^\d{1,4}$/.test(raw)) {
    throw new Error('CONTACT_DAILY_FREE_LIMIT must be a whole number (0 means every reveal needs a credit).');
  }
  return { dailyFreeLimit: Number(raw) };
}
