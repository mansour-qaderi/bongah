import { Share } from 'react-native';
import type { TFunction } from 'i18next';
import type { ReferralSummary } from '@bongah/shared-types';
import { LISTING_WEB_HOST } from './listingLink';

/** The invitation address when the server does not send its own: `https://bongah.app/invite/{code}`. */
export const REFERRAL_LINK_BASE = `https://${LISTING_WEB_HOST}/invite/`;

/**
 * The link a person sends to invite a friend. The server's `share_url` (set with `REFERRAL_LINK_TEMPLATE`) wins when
 * there is one, so the address can change without a new app; otherwise it is built from the code, which is unique to
 * the person. The code is always in the shared message as well (see `referralShareMessage`), so an invitation still
 * works for a friend whose phone does not open the link.
 */
export function referralLink(
  summary: Pick<ReferralSummary, 'referral_code' | 'share_url'>,
): string {
  return (
    summary.share_url ||
    `${REFERRAL_LINK_BASE}${encodeURIComponent(summary.referral_code)}`
  );
}

/** The text that goes out with an invitation: a sentence, the link and the code. */
export function referralShareMessage(
  summary: Pick<ReferralSummary, 'referral_code' | 'share_url'>,
  t: TFunction,
): string {
  return t('referral.shareMessageWithLink', {
    url: referralLink(summary),
    code: summary.referral_code,
  });
}

/**
 * Opens the phone's share sheet with the invitation. Resolves to false only when the sheet could not be opened;
 * closing it without choosing anything is a normal outcome, not an error.
 */
export async function shareReferral(
  summary: Pick<ReferralSummary, 'referral_code' | 'share_url'>,
  t: TFunction,
): Promise<boolean> {
  try {
    await Share.share({ message: referralShareMessage(summary, t) });
    return true;
  } catch {
    return false;
  }
}
