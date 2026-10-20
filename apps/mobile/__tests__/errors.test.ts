import i18n from 'i18next';
import { ApiError } from '../src/api/client';
import { errorMessage } from '../src/api/errors';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';

beforeAll(async () => {
  await initI18n();
});

const http = (status: number, body = {}) => new ApiError('http', status, body);

describe('errorMessage', () => {
  it('never shows the server English text', () => {
    const message = errorMessage(
      http(500, { message: 'Internal server error' }),
      i18n.t,
    );
    expect(message).toBe(prs.errors.unknown);
    expect(message).not.toMatch(/[A-Za-z]/);
  });

  it('explains network problems', () => {
    expect(errorMessage(new ApiError('network', 0), i18n.t)).toBe(
      prs.errors.network,
    );
    expect(errorMessage(new ApiError('timeout', 0), i18n.t)).toBe(
      prs.errors.timeout,
    );
    expect(errorMessage(new Error('boom'), i18n.t)).toBe(prs.errors.unknown);
  });

  it('maps business codes to their own messages', () => {
    expect(
      errorMessage(http(403, { code: 'SUBSCRIPTION_REQUIRED' }), i18n.t),
    ).toBe(prs.add.subscriptionRequired);
    expect(
      errorMessage(http(403, { code: 'AGENCY_PROFILE_REQUIRED' }), i18n.t),
    ).toBe(prs.add.agencyProfileRequired);
    expect(
      errorMessage(http(400, { code: 'INVALID_REFERRAL_CODE' }), i18n.t),
    ).toBe(prs.auth.referralInvalid);
    // The free ladder is gone from the app, so its code has no message of its own any more.
    expect(errorMessage(http(409, { code: 'NO_LADDER_TOKEN' }), i18n.t)).toBe(
      prs.errors.unknown,
    );
    const limit = errorMessage(
      http(403, {
        code: 'FREE_LISTING_LIMIT_REACHED',
        resets_at: '2026-10-31T19:30:00Z',
      }),
      i18n.t,
    );
    // 19:30 UTC on 31 Oct is 00:00 on 1 Nov in Kabul: 10 Aqrab in the Solar Hijri calendar. (No Gregorian date.)
    expect(limit).toContain('۱۰ عقرب');
    expect(limit).not.toMatch(/۲۰۲۶|۱۱\/۰۱/);
  });

  it('tells a wrong code apart from an expired session', () => {
    expect(
      errorMessage(http(401), i18n.t, { unauthorized: 'invalidCode' }),
    ).toBe(prs.errors.invalidCode);
    expect(errorMessage(http(401), i18n.t)).toBe(prs.errors.sessionExpired);
  });

  it('shows how long to wait when rate limited', () => {
    expect(errorMessage(http(429, { retry_after: 45 }), i18n.t)).toContain(
      '۴۵',
    );
    expect(errorMessage(http(429), i18n.t)).toContain('۶۰');
  });

  it('answers in the selected language', async () => {
    await i18n.changeLanguage('ps');
    expect(errorMessage(new ApiError('network', 0), i18n.t)).toBe(
      ps.errors.network,
    );
    await i18n.changeLanguage('prs');
  });
});
