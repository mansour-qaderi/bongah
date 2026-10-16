import {
  compactAmount,
  formatAmount,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPhone,
  formatPrice,
  chatStamp,
  jeribToSqm,
  parseNumberInput,
  sqmToJerib,
  toLatinDigits,
  toPersianDigits,
} from '../src/i18n/format';

describe('number formatting', () => {
  it('writes Persian digits', () => {
    expect(toPersianDigits('0123456789')).toBe('۰۱۲۳۴۵۶۷۸۹');
  });

  it('turns numbers and Arabic-Indic digits into Persian ones, and leaves everything else alone', () => {
    expect(toPersianDigits(1200)).toBe('۱۲۰۰');
    expect(toPersianDigits(-7.5)).toBe('-۷.۵');
    expect(toPersianDigits('٠١٢٣٤٥٦٧٨٩')).toBe('۰۱۲۳۴۵۶۷۸۹'); // what an Arabic keyboard types
    expect(toPersianDigits('اتاق 3 و A4')).toBe('اتاق ۳ و A۴');
    expect(toPersianDigits('')).toBe('');
  });

  it('is idempotent, and toLatinDigits undoes it', () => {
    const once = toPersianDigits('تماس 0701234567');
    expect(toPersianDigits(once)).toBe(once);
    expect(toLatinDigits(once)).toBe('تماس 0701234567');
    expect(toLatinDigits('٠١٢')).toBe('012');
  });

  it('groups thousands and trims decimals', () => {
    expect(formatNumber(1234567.5)).toBe('۱,۲۳۴,۵۶۷٫۵');
    expect(formatNumber(1000)).toBe('۱,۰۰۰');
    expect(formatNumber(999)).toBe('۹۹۹');
    expect(formatNumber(0.125)).toBe('۰٫۱۳');
    expect(formatNumber(2, 0)).toBe('۲');
    expect(formatNumber(Number.NaN)).toBe('');
  });

  it('formats a price with its currency word', () => {
    expect(formatPrice(12500000, 'افغانی')).toBe('۱۲,۵۰۰,۰۰۰ افغانی');
  });

  it('formats money with the currency sign: ؋ for Afghani (the default), $ for dollars', () => {
    expect(formatCurrency(1200000)).toBe('۱,۲۰۰,۰۰۰ ؋');
    expect(formatCurrency(1200000, 'AFGHANI')).toBe('۱,۲۰۰,۰۰۰ ؋');
    expect(formatCurrency(85000.5, 'USD')).toBe('۸۵,۰۰۰٫۵ $');
    expect(formatCurrency(0)).toBe('۰ ؋');
    expect(formatCurrency(Number.NaN)).toBe('');
  });

  it('writes the number of a price with plain commas between the thousands', () => {
    expect(formatAmount(1200000)).toBe('۱,۲۰۰,۰۰۰');
    expect(formatAmount(50000)).toBe('۵۰,۰۰۰');
    expect(formatAmount(8500)).toBe('۸,۵۰۰');
    expect(formatAmount(999)).toBe('۹۹۹');
    expect(formatAmount(12500.5)).toBe('۱۲,۵۰۰٫۵');
    expect(formatAmount(1200000)).not.toContain('٬');
    expect(formatAmount(1200000)).not.toContain('\u202F');
    expect(formatAmount(Number.NaN)).toBe('');
  });
});

describe('parseNumberInput', () => {
  it('reads Latin, Persian and Arabic-Indic digits', () => {
    expect(parseNumberInput('1250')).toBe(1250);
    expect(parseNumberInput('۱۲۵۰')).toBe(1250);
    expect(parseNumberInput('١٢٥٠')).toBe(1250);
  });

  it('understands separators', () => {
    expect(parseNumberInput('1,250,000')).toBe(1250000);
    expect(parseNumberInput('۱٬۲۵۰٬۰۰۰')).toBe(1250000);
    expect(parseNumberInput('۲٫۵')).toBe(2.5);
    expect(parseNumberInput('2.5')).toBe(2.5);
  });

  it('rejects anything else', () => {
    for (const bad of [
      '',
      '  ',
      'abc',
      '12abc',
      '1.2.3',
      '-5',
      '0x10',
      '1e5',
    ]) {
      expect({ bad, value: parseNumberInput(bad) }).toEqual({
        bad,
        value: null,
      });
    }
  });
});

describe('land units', () => {
  it('one jerib is 2000 square metres', () => {
    expect(jeribToSqm(1)).toBe(2000);
    expect(sqmToJerib(5000)).toBe(2.5);
    expect(sqmToJerib(jeribToSqm(3.75))).toBeCloseTo(3.75);
  });
});

describe('dates and phones', () => {
  it('shows dates in Kabul time (UTC+4:30)', () => {
    // 20:00 UTC on the 12th is already 00:30 on the 13th in Kabul.
    expect(formatDate('2026-10-12T20:00:00Z')).toBe('۲۰۲۶/۱۰/۱۳');
    expect(formatDate('2026-10-12T12:00:00Z')).toBe('۲۰۲۶/۱۰/۱۲');
    expect(formatDate('not a date')).toBe('');
  });

  it('formats canonical phone numbers', () => {
    // Wrapped in left-to-right marks so the groups keep their order inside a right-to-left line.
    expect(formatPhone('+93701234567')).toBe('\u202A+۹۳ ۷۰ ۱۲۳ ۴۵۶۷\u202C');
    expect(formatPhone('weird')).toBe('\u202Aweird\u202C');
  });
});

describe('compactAmount (short prices for map markers)', () => {
  it.each([
    [0, null, 0],
    [999, null, 999],
    [1000, 'thousand', 1],
    [1500, 'thousand', 1.5],
    [50_000, 'thousand', 50],
    [999_000, 'thousand', 999],
    [1_000_000, 'million', 1],
    [2_500_000, 'million', 2.5],
    [12_340_000, 'million', 12.3],
    [1_200_000_000, 'billion', 1.2],
  ])('%d is %s %d', (amount, unit, value) => {
    expect(compactAmount(amount)).toEqual({ value, unit });
  });

  it('never writes "1000 thousand": rounding up carries into the next unit', () => {
    expect(compactAmount(999_950)).toEqual({ value: 1, unit: 'million' });
    expect(compactAmount(999_950_000)).toEqual({ value: 1, unit: 'billion' });
  });

  it('leaves unreadable numbers alone', () => {
    expect(compactAmount(NaN).unit).toBeNull();
    expect(compactAmount(Infinity).unit).toBeNull();
  });
});

describe('chatStamp', () => {
  // 2026-10-14 10:00 in Kabul (UTC+4:30) is 05:30 UTC.
  const NOW = Date.parse('2026-10-14T05:30:00Z');

  it('is the time of day for today, in Persian digits', () => {
    expect(chatStamp('2026-10-14T04:00:00Z', NOW)).toEqual({
      kind: 'time',
      text: '۰۸:۳۰',
    });
  });

  it('counts Kabul calendar days, not 24-hour spans', () => {
    // 23:00 Kabul the evening before is "yesterday" although it is only 11 hours ago.
    expect(chatStamp('2026-10-13T18:30:00Z', NOW)).toEqual({
      kind: 'yesterday',
    });
    // 00:10 Kabul today is still today although it is in the previous UTC day.
    expect(chatStamp('2026-10-13T19:40:00Z', NOW)?.kind).toBe('time');
  });

  it('is a date from two days back, never with Western digits', () => {
    const stamp = chatStamp('2026-10-10T08:00:00Z', NOW);
    expect(stamp?.kind).toBe('date');
    expect(stamp && 'text' in stamp ? stamp.text : '').not.toMatch(/[0-9]/);
  });

  it('is null for something that is not a date', () => {
    expect(chatStamp('not a date', NOW)).toBeNull();
  });
});
