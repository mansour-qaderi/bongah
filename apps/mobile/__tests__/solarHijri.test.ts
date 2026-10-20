import i18next from 'i18next';
import type { TFunction } from 'i18next';
import { ApiError } from '../src/api/client';
import { errorMessage, listingLimitMessage } from '../src/api/errors';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import {
  formatSolarDate,
  gregorianToSolar,
  solarDateOf,
} from '../src/i18n/solarHijri';
import { createPropertySchema, updatePropertySchema } from '@bongah/validation';

const t = ((key: string, options?: object) =>
  i18next.t(key, options as never)) as unknown as TFunction;

beforeAll(async () => {
  await initI18n();
});

describe('Gregorian → Solar Hijri', () => {
  it.each([
    [2026, 11, 1, 1405, 8, 10], // the date in the limit message
    [2026, 3, 21, 1405, 1, 1], // Nowruz 1405
    [2026, 3, 20, 1404, 12, 29], // the day before
    [2024, 3, 20, 1403, 1, 1], // Nowruz 1403
    [2025, 3, 20, 1403, 12, 30], // 1403 was a leap year: Hoot has 30 days
    [2025, 3, 21, 1404, 1, 1],
    [2026, 9, 22, 1405, 6, 31], // the last 31-day month
    [2026, 9, 23, 1405, 7, 1],
    [2026, 10, 22, 1405, 7, 30],
    [2026, 10, 23, 1405, 8, 1],
    [2000, 1, 1, 1378, 10, 11],
    [1991, 3, 21, 1370, 1, 1], // the first day of a cycle once came out a year early
  ])('%i-%i-%i is %i/%i/%i', (gy, gm, gd, year, month, day) => {
    expect(gregorianToSolar(gy, gm, gd)).toEqual({ year, month, day });
  });

  it('agrees with the platform’s own Persian calendar on every day from 1990 to 2070', () => {
    const f = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC',
    });
    let days = 0;
    for (
      let ms = Date.UTC(1990, 0, 1);
      ms < Date.UTC(2070, 0, 1);
      ms += 86_400_000
    ) {
      const d = new Date(ms);
      const part = (type: string) =>
        Number(f.formatToParts(d).find(p => p.type === type)?.value);
      const got = gregorianToSolar(
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
        d.getUTCDate(),
      );
      if (
        got.year !== part('year') ||
        got.month !== part('month') ||
        got.day !== part('day')
      ) {
        throw new Error(`${d.toISOString()}: got ${JSON.stringify(got)}`);
      }
      days += 1;
    }
    expect(days).toBeGreaterThan(29_000);
  });
});

describe('the day is the day in Kabul', () => {
  it('uses UTC+4:30: half past midnight in Kabul is already the next day', () => {
    expect(solarDateOf('2026-10-31T19:00:00Z')).toMatchObject({
      month: 8,
      day: 9,
    });
    expect(solarDateOf('2026-10-31T20:00:00Z')).toMatchObject({
      month: 8,
      day: 10,
    });
    expect(solarDateOf('not a date')).toBeNull();
  });
});

describe('formatSolarDate', () => {
  const NOW = Date.UTC(2026, 9, 19);
  it('writes day and month in Persian digits and the Dari month name', () => {
    expect(formatSolarDate('2026-11-01T00:00:00Z', t, { now: NOW })).toBe(
      '۱۰ عقرب',
    );
  });
  it('writes the year when asked, or when it is not the current one', () => {
    expect(formatSolarDate('2026-11-01T00:00:00Z', t, { year: 'always' })).toBe(
      '۱۰ عقرب ۱۴۰۵',
    );
    expect(
      formatSolarDate('2026-11-01T00:00:00Z', t, {
        year: 'never',
        now: Date.UTC(2030, 0, 1),
      }),
    ).toBe('۱۰ عقرب');
    expect(
      formatSolarDate('2026-11-01T00:00:00Z', t, { now: Date.UTC(2027, 5, 1) }),
    ).toBe('۱۰ عقرب ۱۴۰۵');
  });
  it('is empty for an unreadable date', () => {
    expect(formatSolarDate('', t)).toBe('');
  });
  it('has all twelve month names, in Dari and Pashto, none empty and none repeated', () => {
    for (const months of [prs.date.months, ps.date.months]) {
      const names = Object.values(months);
      expect(names).toHaveLength(12);
      expect(new Set(names).size).toBe(12);
      expect(names.every(n => n.trim().length > 0)).toBe(true);
    }
    expect(Object.keys(prs.date.months)).toEqual(Object.keys(ps.date.months));
  });
  it('uses the Pashto names in Pashto', async () => {
    await i18next.changeLanguage('ps');
    try {
      expect(formatSolarDate('2026-11-01T00:00:00Z', t, { now: NOW })).toBe(
        `۱۰ ${ps.date.months[8]}`,
      );
    } finally {
      await i18next.changeLanguage('prs');
    }
  });
});

describe('the limit sentence', () => {
  const limit = (resets_at?: string) =>
    new ApiError('http', 403, {
      code: 'FREE_LISTING_LIMIT_REACHED',
      resets_at,
    });
  it('is the asked-for sentence', () => {
    const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 19));
    try {
      expect(listingLimitMessage(limit('2026-11-01T00:00:00Z'), t)).toBe(
        'سقف آگهی‌های رایگان این ماه شما به پایان رسیده است (امکان ثبت بعدی: ۱۰ عقرب).',
      );
    } finally {
      spy.mockRestore();
    }
  });
  it('has a version without a date', () => {
    expect(listingLimitMessage(limit(), t)).toBe(prs.add.limitBannerNoDate);
  });
  it('leaves the older sentence in place but gives it the Solar Hijri date too', () => {
    const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 19));
    try {
      const text = errorMessage(limit('2026-11-01T00:00:00Z'), t);
      expect(text).toBe(prs.add.limitReached.replace('{{date}}', '۱۰ عقرب'));
      expect(text).not.toMatch(/۲۰۲۶/);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('a description keeps its line breaks (shared schema)', () => {
  const base = {
    title: 'خانه نمونه',
    type: 'APARTMENT',
    deal_type: 'SALE',
    price: 1000,
    currency: 'AFGHANI',
    area_sqm: 100,
    province: 'کابل',
    address: 'سرک چهارم',
    description: 'خانه نو',
  };
  const described = (description: string) => {
    const r = createPropertySchema.safeParse({ ...base, description });
    return r.success ? r.data.description : r.error.issues[0].message;
  };
  it('keeps single and paragraph breaks, tidies each line', () => {
    expect(described('خط اول\nخط دوم')).toBe('خط اول\nخط دوم');
    expect(described('  خط اول  \r\n\r\n   خط   دوم\t ')).toBe(
      'خط اول\n\nخط دوم',
    );
  });
  it('lets a long gap shrink to one blank line and trims the ends', () => {
    expect(described('\n\nالف\n\n\n\n\nب\n\n')).toBe('الف\n\nب');
  });
  it('keeps the half-space inside Persian words', () => {
    expect(described('خانه‌های نو\nمیز‌ها')).toBe('خانه‌های نو\nمیز‌ها');
  });
  it('no longer accepts nothing at all, and still has its limit', () => {
    expect(described('')).toMatch(/At least 1/);
    expect(described(' \n \t ')).toMatch(/At least 1/);
    expect(described('ا'.repeat(5001))).toMatch(/At most 5000/);
    expect(described('ا'.repeat(5000))).toHaveLength(5000);
  });
  it('is the same for an update, while a title is still one line', () => {
    const u = updatePropertySchema.safeParse({
      description: 'الف\nب',
      title: 'عنوان\nدو خط',
    });
    expect(u.success && u.data.description).toBe('الف\nب');
    expect(u.success && u.data.title).toBe('عنوان دو خط');
  });
});
