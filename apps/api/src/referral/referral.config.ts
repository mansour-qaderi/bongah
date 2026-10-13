import { ConfigService } from '@nestjs/config';

export interface ReferralSettings {
  /**
   * How many invited friends can earn one inviter a reward. Further friends still join and still
   * get their own reward; the inviter just earns nothing more. Stops one person farming tokens
   * with throwaway SIMs. The number is a placeholder business decision (REFERRAL_MAX_REWARDED_INVITES).
   */
  maxRewardedInvites: number;
  /** Invite link with a `{code}` placeholder, or null when the product has no link to share yet. */
  linkTemplate: string | null;
}

export const DEFAULT_MAX_REWARDED_INVITES = 20;

/** Reads and validates referral settings once, so a typo fails at startup rather than at the first signup. */
export function readReferralSettings(config: ConfigService): ReferralSettings {
  const rawMax = config.get<string>('REFERRAL_MAX_REWARDED_INVITES')?.trim();
  let maxRewardedInvites = DEFAULT_MAX_REWARDED_INVITES;
  if (rawMax) {
    if (!/^\d{1,6}$/.test(rawMax)) {
      throw new Error('REFERRAL_MAX_REWARDED_INVITES must be a whole number (0 turns inviter rewards off).');
    }
    maxRewardedInvites = Number(rawMax);
  }

  const rawLink = config.get<string>('REFERRAL_LINK_TEMPLATE')?.trim();
  let linkTemplate: string | null = null;
  if (rawLink) {
    // `{code}` is not valid in a host, so check the shape with a stand-in value.
    let url: URL;
    try {
      url = new URL(rawLink.replace('{code}', 'ABCD2345'));
    } catch {
      throw new Error('REFERRAL_LINK_TEMPLATE must be an http(s) URL containing {code}.');
    }
    if (!rawLink.includes('{code}') || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
      throw new Error('REFERRAL_LINK_TEMPLATE must be an http(s) URL containing {code}.');
    }
    linkTemplate = rawLink;
  }

  return { maxRewardedInvites, linkTemplate };
}

export function buildShareUrl(template: string | null, code: string): string | null {
  return template ? template.replaceAll('{code}', code) : null;
}
