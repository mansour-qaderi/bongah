import { ConfigService } from '@nestjs/config';
import { buildShareUrl, DEFAULT_MAX_REWARDED_INVITES, readReferralSettings } from './referral.config.js';

const read = (env: Record<string, string>) => readReferralSettings(new ConfigService(env));

describe('readReferralSettings', () => {
  it('defaults to a cap of 20 and no invite link', () => {
    expect(read({})).toEqual({ maxRewardedInvites: DEFAULT_MAX_REWARDED_INVITES, contactCredits: 0, linkTemplate: null });
    expect(DEFAULT_MAX_REWARDED_INVITES).toBe(20);
  });

  it('treats blank values as unset', () => {
    expect(read({ REFERRAL_MAX_REWARDED_INVITES: '  ', REFERRAL_LINK_TEMPLATE: '' })).toEqual({
      maxRewardedInvites: 20,
      contactCredits: 0,
      linkTemplate: null,
    });
  });

  it('reads the contact credits each side earns, 0 meaning off', () => {
    expect(read({ REFERRAL_CONTACT_CREDITS: '5' }).contactCredits).toBe(5);
    expect(read({ REFERRAL_CONTACT_CREDITS: '0' }).contactCredits).toBe(0);
    for (const value of ['-1', '2.5', 'many', '1000']) {
      expect(() => read({ REFERRAL_CONTACT_CREDITS: value })).toThrow(/REFERRAL_CONTACT_CREDITS/);
    }
  });

  it('reads the cap, including 0 (inviter rewards off)', () => {
    expect(read({ REFERRAL_MAX_REWARDED_INVITES: '5' }).maxRewardedInvites).toBe(5);
    expect(read({ REFERRAL_MAX_REWARDED_INVITES: '0' }).maxRewardedInvites).toBe(0);
  });

  it.each(['-1', '2.5', 'ten', '1e3'])('refuses the cap %j at startup', (value) => {
    expect(() => read({ REFERRAL_MAX_REWARDED_INVITES: value })).toThrow(/REFERRAL_MAX_REWARDED_INVITES/);
  });

  it('accepts an http(s) link template with {code}', () => {
    expect(read({ REFERRAL_LINK_TEMPLATE: 'https://bongah.example/invite/{code}' }).linkTemplate).toBe(
      'https://bongah.example/invite/{code}',
    );
    expect(read({ REFERRAL_LINK_TEMPLATE: 'https://bongah.example/r?c={code}' }).linkTemplate).toBeTruthy();
  });

  it.each(['https://bongah.example/invite', 'not a url {code}', 'javascript:alert({code})', 'ftp://x.example/{code}'])(
    'refuses the link template %j at startup',
    (value) => {
      expect(() => read({ REFERRAL_LINK_TEMPLATE: value })).toThrow(/REFERRAL_LINK_TEMPLATE/);
    },
  );
});

describe('buildShareUrl', () => {
  it('puts the code in the template', () => {
    expect(buildShareUrl('https://b.example/i/{code}', 'ABCD2345')).toBe('https://b.example/i/ABCD2345');
  });

  it('is null without a template', () => {
    expect(buildShareUrl(null, 'ABCD2345')).toBeNull();
  });
});
