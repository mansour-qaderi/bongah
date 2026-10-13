import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeReferralCode,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  verifyOtpSchema,
} from '@bongah/validation';
import { maskPhone } from './referral.service.js';

describe('normalizeReferralCode', () => {
  it('accepts a canonical code', () => {
    expect(normalizeReferralCode('ABCD2345')).toBe('ABCD2345');
  });

  it('forgives case, spaces, hyphens and invisible direction marks', () => {
    expect(normalizeReferralCode('abcd2345')).toBe('ABCD2345');
    expect(normalizeReferralCode('  abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeReferralCode('AB CD 23 45')).toBe('ABCD2345');
    expect(normalizeReferralCode('‏ABCD2345‎')).toBe('ABCD2345');
  });

  it('reads Persian and Arabic-Indic digits', () => {
    expect(normalizeReferralCode('ABCD۲۳۴۵')).toBe('ABCD2345');
    expect(normalizeReferralCode('ABCD٢٣٤٥')).toBe('ABCD2345');
  });

  it.each([
    ['too short', 'ABCD234'],
    ['too long', 'ABCD23456'],
    ['empty', ''],
    ['a letter not in the alphabet (O)', 'ABCDO345'],
    ['a letter not in the alphabet (I)', 'ABCDI345'],
    ['a digit not in the alphabet (0)', 'ABCD0345'],
    ['a digit not in the alphabet (1)', 'ABCD1345'],
    ['punctuation', 'ABCD_345'],
  ])('rejects %s', (_label, input) => {
    expect(normalizeReferralCode(input)).toBeNull();
  });
});

describe('verifyOtpSchema referral_code', () => {
  const base = { phone_number: '0701234567', otp_code: '123456' };

  it('is optional', () => {
    const parsed = verifyOtpSchema.parse(base);
    expect(parsed.referral_code).toBeUndefined();
  });

  it('treats an empty or blank code as no code', () => {
    expect(verifyOtpSchema.parse({ ...base, referral_code: '' }).referral_code).toBeUndefined();
    expect(verifyOtpSchema.parse({ ...base, referral_code: '  - ' }).referral_code).toBeUndefined();
  });

  it('outputs the canonical code', () => {
    expect(verifyOtpSchema.parse({ ...base, referral_code: ' abcd-2345 ' }).referral_code).toBe('ABCD2345');
  });

  it('rejects something that cannot be a code, naming the field', () => {
    const result = verifyOtpSchema.safeParse({ ...base, referral_code: 'nope' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['referral_code']);
  });

  it('rejects a non-string code', () => {
    expect(verifyOtpSchema.safeParse({ ...base, referral_code: 12345678 }).success).toBe(false);
  });
});

describe('generate_referral_code() in the migration', () => {
  // The database and the apps each carry the alphabet; if they drift, the database would hand out codes
  // that the app refuses to accept.
  const sql = readFileSync(
    join(__dirname, '../../prisma/migrations/20261013120000_referrals/migration.sql'),
    'utf8',
  );

  it('uses the same alphabet as the validation package', () => {
    expect(sql).toContain(`alphabet CONSTANT text := '${REFERRAL_CODE_ALPHABET}'`);
    expect(sql).toContain(`'^[${REFERRAL_CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$'`);
  });

  it('uses the same length', () => {
    expect(sql).toContain(`FOR i IN 1..${REFERRAL_CODE_LENGTH} LOOP`);
    expect(sql).toContain(`floor(random() * ${REFERRAL_CODE_ALPHABET.length})`);
  });
});

describe('maskPhone', () => {
  it('keeps the first five and the last three characters', () => {
    expect(maskPhone('+93701234567')).toBe('+9370••••567');
  });
});
