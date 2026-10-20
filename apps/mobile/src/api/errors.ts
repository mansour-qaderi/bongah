import type { TFunction } from 'i18next';
import {
  LADDERS_PER_FRAME,
  type ContactLimitReachedBody,
} from '@bongah/shared-types';
import { formatNumber } from '../i18n/format';
import { formatSolarDate } from '../i18n/solarHijri';
import { ApiError } from './client';

interface Options {
  /** What a 401 means on this screen. Default: the session ended. On the OTP screen: wrong code. */
  unauthorized?: 'sessionExpired' | 'invalidCode';
  /** The request was asking the server to send a verification code: a 429 then has its own, more specific sentence. */
  sendingCode?: boolean;
}

/**
 * Turns anything thrown by the API layer into a sentence in the user's language.
 * The server's English `message` is never shown. The 502/503 mappings are specific to this
 * API: 503 is "the verification code could not be sent to WhatsApp" (send-otp) and 502 is "payment provider down" (HesabPay).
 */
export function errorMessage(
  error: unknown,
  t: TFunction,
  options: Options = {},
): string {
  if (!(error instanceof ApiError)) return t('errors.unknown');
  if (error.kind === 'network') return t('errors.network');
  if (error.kind === 'timeout') return t('errors.timeout');

  switch (error.code) {
    case 'FREE_LISTING_LIMIT_REACHED':
      return t('add.limitReached', {
        date: error.body.resets_at
          ? formatSolarDate(error.body.resets_at, t)
          : '',
      });
    case 'AGENCY_LISTING_LIMIT_REACHED':
      // The plan's own listings are used up (there is no "next month": a new plan brings new ones). An older API
      // still counts per month and says when that month ends.
      return error.body.resets_at
        ? t('add.agencyLimitReached', {
            limit: formatNumber(error.body.limit ?? 0, 0),
            date: formatSolarDate(error.body.resets_at, t),
          })
        : t('add.agencyQuotaReached', {
            limit: formatNumber(error.body.limit ?? 0, 0),
          });
    case 'NO_FEATURED_CREDITS':
      return t('frame.noCredits');
    case 'NOT_ENOUGH_LADDERS':
      return t('ladder.notEnough', {
        total: formatNumber(error.body.needed ?? LADDERS_PER_FRAME, 0),
      });
    case 'LISTING_QUOTA_NOT_EXHAUSTED':
      return t('ladder.notExhausted');
    case 'SUBSCRIPTION_REQUIRED':
      return t('add.subscriptionRequired');
    case 'AGENCY_PROFILE_REQUIRED':
      return t('add.agencyProfileRequired');
    case 'INVALID_REFERRAL_CODE':
      return t('auth.referralInvalid');
    case 'CONTACT_LIMIT_REACHED':
      return t('contact.limitReached');
    case 'CONTACT_ALREADY_UNLIMITED':
      return t('contact.alreadyUnlimited');
    case 'PERKS_REQUIRED':
      return t('chat.perksRequired');
    case 'CANNOT_CHAT_WITH_SELF':
      return t('chat.ownListing');
    case 'LISTING_NOT_ACTIVE':
      return t('chat.listingClosed');
    case 'CHAT_RATE_LIMITED':
      return t('chat.slowDown');
    case 'IMAGE_TOO_LARGE':
      return t('chat.imageTooLarge');
    case 'UNSUPPORTED_IMAGE_TYPE':
    case 'EMPTY_IMAGE':
    case 'IMAGE_UNREADABLE':
      return t('chat.imageUnsupported');
    case 'LOCATION_OUT_OF_BOUNDS':
      return t('chat.locationOutside');
    case 'TEMPLATE_LIMIT_REACHED':
      return t('chat.templateLimit');
  }

  switch (error.status) {
    case 400:
    case 422:
      return t('errors.validation');
    case 401:
      return options.unauthorized === 'invalidCode'
        ? t('errors.invalidCode')
        : t('errors.sessionExpired');
    case 403:
      return t('errors.forbidden');
    case 404:
      return t('errors.notFound');
    case 429: {
      const seconds = formatNumber(Math.ceil(error.body.retry_after ?? 60), 0);
      return t(
        options.sendingCode ? 'errors.otpRateLimited' : 'errors.rateLimited',
        { seconds },
      );
    }
    case 502:
      return t('errors.paymentProvider');
    case 503:
      return t('errors.otpSendFailed');
    default:
      return t('errors.unknown');
  }
}

/** Sign-up was refused only because the referral code does not exist (the OTP is still usable). */
export const isInvalidReferralCode = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'INVALID_REFERRAL_CODE';

/**
 * This month's free listing is used up. The post form answers it with an invitation to upgrade (see
 * `listingLimitMessage`), not with a red error.
 */
export const isListingLimitReached = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.code === 'FREE_LISTING_LIMIT_REACHED';

/**
 * "This month's free listings are used up (next one possible: ۱۰ عقرب)." The date is when the server says the
 * allowance renews, as a Solar Hijri date; without one the sentence simply stops before the brackets.
 */
export function listingLimitMessage(error: ApiError, t: TFunction): string {
  const resets = error.body.resets_at;
  return resets
    ? t('add.limitBanner', { date: formatSolarDate(resets, t) })
    : t('add.limitBannerNoDate');
}

/** The quota/subscription failures that have a clear next step (buy a subscription). */
export const isSubscriptionRequired = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'SUBSCRIPTION_REQUIRED';

/**
 * The listing allowance is used up, whichever kind of account hit it: a regular user's free listing of the month or an
 * office's plan. Both can be topped up with seven ladders.
 */
export const isAnyListingLimit = (error: unknown): boolean =>
  error instanceof ApiError &&
  (error.code === 'FREE_LISTING_LIMIT_REACHED' ||
    error.code === 'AGENCY_LISTING_LIMIT_REACHED');

/** Today's free reveals are used up and the request did not (or could not) pay with a credit. */
export const isContactLimitReached = (
  error: unknown,
): error is ApiError & { body: ContactLimitReachedBody } =>
  error instanceof ApiError && error.code === 'CONTACT_LIMIT_REACHED';
