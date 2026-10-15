import type { TFunction } from 'i18next';
import type { ContactLimitReachedBody } from '@bongah/shared-types';
import { formatDate, formatNumber } from '../i18n/format';
import { ApiError } from './client';

interface Options {
  /** What a 401 means on this screen. Default: the session ended. On the OTP screen: wrong code. */
  unauthorized?: 'sessionExpired' | 'invalidCode';
}

/**
 * Turns anything thrown by the API layer into a sentence in the user's language.
 * The server's English `message` is never shown. The 502/503 mappings are specific to this
 * API: 503 is "SMS could not be sent" (send-otp) and 502 is "payment provider down" (HesabPay).
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
        date: error.body.resets_at ? formatDate(error.body.resets_at) : '',
      });
    case 'SUBSCRIPTION_REQUIRED':
      return t('add.subscriptionRequired');
    case 'AGENCY_PROFILE_REQUIRED':
      return t('add.agencyProfileRequired');
    case 'INVALID_REFERRAL_CODE':
      return t('auth.referralInvalid');
    case 'NO_LADDER_TOKEN':
      return t('referral.noToken');
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
    case 429:
      return t('errors.rateLimited', {
        seconds: formatNumber(Math.ceil(error.body.retry_after ?? 60), 0),
      });
    case 502:
      return t('errors.paymentProvider');
    case 503:
      return t('errors.smsFailed');
    default:
      return t('errors.unknown');
  }
}

/** Sign-up was refused only because the referral code does not exist (the OTP is still usable). */
export const isInvalidReferralCode = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'INVALID_REFERRAL_CODE';

/** The quota/subscription failures that have a clear next step (buy a subscription). */
export const isSubscriptionRequired = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'SUBSCRIPTION_REQUIRED';

/** Today's free reveals are used up and the request did not (or could not) pay with a credit. */
export const isContactLimitReached = (
  error: unknown,
): error is ApiError & { body: ContactLimitReachedBody } =>
  error instanceof ApiError && error.code === 'CONTACT_LIMIT_REACHED';
