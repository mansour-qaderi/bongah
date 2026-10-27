import { describe, expect, it } from 'vitest';
import { normalizeAfghanMobile, toAsciiDigits } from '@bongah/validation';
import {
  maskPersianDigits,
  maskPersianPhone,
  PERSIAN_DIGITS_PATTERN,
  PERSIAN_PHONE_PATTERN,
  PHONE_MAX_DIGITS,
  toPersianDigits,
} from '../lib/persian-input';

describe('toPersianDigits', () => {
  it('turns Latin and Arabic-Indic digits into Persian ones and leaves the rest', () => {
    expect(toPersianDigits('0790049201')).toBe('۰۷۹۰۰۴۹۲۰۱');
    expect(toPersianDigits('٠٧٩١٢٣٤٥٦٧٨')).toBe('۰۷۹۱۲۳۴۵۶۷۸');
    expect(toPersianDigits('۰۷۹')).toBe('۰۷۹');
    expect(toPersianDigits('a+b-0')).toBe('a+b-۰');
  });
});

describe('maskPersianPhone', () => {
  it('writes what was typed on an English keyboard in Persian digits (the case from the screenshot)', () => {
    expect(maskPersianPhone('0790049201')).toBe('۰۷۹۰۰۴۹۲۰۱');
  });
  it('drops letters of any alphabet, spaces, dashes and punctuation', () => {
    expect(maskPersianPhone('abc')).toBe('');
    expect(maskPersianPhone('موبایل')).toBe('');
    expect(maskPersianPhone('۰۷۹۱ ۲۳۴-۵۶۷۸')).toBe('۰۷۹۱۲۳۴۵۶۷۸');
    expect(maskPersianPhone('(079)1.23٫4')).toBe('۰۷۹۱۲۳۴');
  });
  it('keeps one "+" in the first place only', () => {
    expect(maskPersianPhone('+93 79 123 4567')).toBe('+۹۳۷۹۱۲۳۴۵۶۷');
    expect(maskPersianPhone('079+12')).toBe('۰۷۹۱۲');
    expect(maskPersianPhone('++93')).toBe('+۹۳');
  });
  it('stops at the longest number there can be', () => {
    expect(maskPersianPhone('0'.repeat(30))).toBe('۰'.repeat(PHONE_MAX_DIGITS));
  });
  it('is idempotent, so feeding its own output back changes nothing', () => {
    for (const raw of ['0791234567', '+93 (79) x', 'a۰b٧9', '']) {
      const once = maskPersianPhone(raw);
      expect(maskPersianPhone(once)).toBe(once);
    }
  });
  it('only ever produces values the pattern accepts', () => {
    for (const raw of ['0791234567', '+93 79 123 4567', 'abc۱۲۳', '٠٧٩ x', '​۰۷۹', '+']) {
      expect(PERSIAN_PHONE_PATTERN.test(maskPersianPhone(raw))).toBe(true);
    }
    expect(PERSIAN_PHONE_PATTERN.test('0791234567')).toBe(false);
    expect(PERSIAN_PHONE_PATTERN.test('۰۷۹a')).toBe(false);
  });
  it('still gives the API its number: the masked text normalises to the same +93 form', () => {
    for (const raw of ['0791234567', '+93791234567', '0093791234567', '791234567']) {
      expect(normalizeAfghanMobile(maskPersianPhone(raw))).toBe('+93791234567');
    }
    expect(toAsciiDigits(maskPersianPhone('0791234567'))).toBe('0791234567');
  });
});

describe('maskPersianDigits (the code)', () => {
  it('keeps Persian digits only and caps the length', () => {
    expect(maskPersianDigits('12 34-56x78', 6)).toBe('۱۲۳۴۵۶');
    expect(maskPersianDigits('+12', 6)).toBe('۱۲');
    expect(PERSIAN_DIGITS_PATTERN.test(maskPersianDigits('a1b2c3', 6))).toBe(true);
  });
  it('converts back to the ASCII code the API expects', () => {
    expect(toAsciiDigits(maskPersianDigits('483 920', 6))).toBe('483920');
  });
});
