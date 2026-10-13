import { ConfigService } from '@nestjs/config';
import { DEFAULT_DAILY_FREE_LIMIT, readContactSettings } from './contact.config.js';

const read = (env: Record<string, string>) => readContactSettings(new ConfigService(env));

describe('readContactSettings', () => {
  it('defaults to 3 free reveals a day', () => {
    expect(read({})).toEqual({ dailyFreeLimit: 3 });
    expect(read({ CONTACT_DAILY_FREE_LIMIT: ' ' })).toEqual({ dailyFreeLimit: DEFAULT_DAILY_FREE_LIMIT });
  });

  it('reads the limit, including 0 (every reveal needs a credit)', () => {
    expect(read({ CONTACT_DAILY_FREE_LIMIT: '5' }).dailyFreeLimit).toBe(5);
    expect(read({ CONTACT_DAILY_FREE_LIMIT: '0' }).dailyFreeLimit).toBe(0);
  });

  it.each(['-1', '2.5', 'three', '99999'])('refuses %j at startup', (value) => {
    expect(() => read({ CONTACT_DAILY_FREE_LIMIT: value })).toThrow(/CONTACT_DAILY_FREE_LIMIT/);
  });
});
