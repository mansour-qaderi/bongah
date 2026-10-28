import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TRIAL_DAYS, DEFAULT_TRIAL_LISTINGS, readAgencyTrialSettings } from './trial.config.js';
import { isTrialRunning, trialEndFor } from './trial.js';

const config = (env: Record<string, string>) => new ConfigService(env);
const NOW = new Date('2026-10-28T10:00:00Z');

describe('readAgencyTrialSettings', () => {
  it('defaults to a month and a handful of listings', () => {
    expect(readAgencyTrialSettings(config({}))).toEqual({ days: DEFAULT_TRIAL_DAYS, listings: DEFAULT_TRIAL_LISTINGS });
  });

  it('reads both from the environment, and 0 days switches trials off', () => {
    expect(readAgencyTrialSettings(config({ AGENCY_TRIAL_DAYS: '14', AGENCY_TRIAL_LISTINGS: '25' }))).toEqual({ days: 14, listings: 25 });
    expect(readAgencyTrialSettings(config({ AGENCY_TRIAL_DAYS: '0' })).days).toBe(0);
  });

  it.each([
    ['AGENCY_TRIAL_DAYS', 'soon'],
    ['AGENCY_TRIAL_DAYS', '-1'],
    ['AGENCY_TRIAL_DAYS', '366'],
    ['AGENCY_TRIAL_LISTINGS', '0'],
    ['AGENCY_TRIAL_LISTINGS', '1.5'],
  ])('refuses %s=%s at startup', (name, value) => {
    expect(() => readAgencyTrialSettings(config({ [name]: value }))).toThrow(name);
  });
});

describe('trial dates', () => {
  it('ends the configured number of days after it starts, or never starts when switched off', () => {
    expect(trialEndFor(NOW, { days: 30, listings: 10 })?.toISOString()).toBe('2026-11-27T10:00:00.000Z');
    expect(trialEndFor(NOW, { days: 0, listings: 10 })).toBeNull();
  });

  it('is running strictly before its end, and never without one', () => {
    expect(isTrialRunning(new Date('2026-10-28T10:00:01Z'), NOW)).toBe(true);
    expect(isTrialRunning(NOW, NOW)).toBe(false);
    expect(isTrialRunning(null, NOW)).toBe(false);
  });
});
