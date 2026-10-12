import {
  formatDate,
  formatNumber,
  formatPhone,
  formatPrice,
  jeribToSqm,
  parseNumberInput,
  sqmToJerib,
  toPersianDigits,
} from '../src/i18n/format';

describe('number formatting', () => {
  it('writes Persian digits', () => {
    expect(toPersianDigits('0123456789')).toBe('۰۱۲۳۴۵۶۷۸۹');
  });

  it('groups thousands and trims decimals', () => {
    expect(formatNumber(1234567.5)).toBe('۱٬۲۳۴٬۵۶۷٫۵');
    expect(formatNumber(1000)).toBe('۱٬۰۰۰');
    expect(formatNumber(999)).toBe('۹۹۹');
    expect(formatNumber(0.125)).toBe('۰٫۱۳');
    expect(formatNumber(2, 0)).toBe('۲');
    expect(formatNumber(Number.NaN)).toBe('');
  });

  it('formats a price with its currency word', () => {
    expect(formatPrice(12500000, 'افغانی')).toBe('۱۲٬۵۰۰٬۰۰۰ افغانی');
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
    expect(formatPhone('+93701234567')).toBe('+۹۳ ۷۰ ۱۲۳ ۴۵۶۷');
    expect(formatPhone('weird')).toBe('weird');
  });
});
