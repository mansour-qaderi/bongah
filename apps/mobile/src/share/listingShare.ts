import { Share } from 'react-native';
import type { TFunction } from 'i18next';
import type { Property } from '@bongah/shared-types';
import { useTranslation } from 'react-i18next';
import { propertyPlace } from '../components/PropertyFacts';
import { formatCurrency } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { listingLink } from './listingLink';
import { listingPriceText } from '../i18n/rentPrice';

type ShareFields = Pick<
  Property,
  | 'id'
  | 'title'
  | 'price'
  | 'currency'
  | 'deal_type'
  | 'monthly_rent'
  | 'province'
  | 'district'
  | 'neighborhood'
  | 'address'
>;

/**
 * What goes out when a listing is shared: a one-line summary a person can read in a chat without opening anything
 * (the title, the price and the place, each behind a small picture), an invitation to see everything in the app, and
 * the listing's link (`bongah://listing/{id}`). The id in the link is what identifies the listing, so whatever opens
 * it later shows the live listing; the summary is only there to make the message worth tapping.
 *
 *   🏠 خانه سه اتاقه | 💰 ۱,۲۰۰,۰۰۰ ؋ | 📍 هرات، شهر نو
 *   مشاهده کامل مشخصات در اپلیکیشن بنگاه:
 *   bongah://listing/abc
 */
export function listingShareMessage(
  property: ShareFields,
  t: TFunction,
  provinceName: (value: string) => string = value => value,
): string {
  // Plain text: nothing in it may be HTML-escaped.
  const plain = { interpolation: { escapeValue: false } };
  const place = propertyPlace(property, provinceName);
  const summary = [
    t('property.shareTitle', {
      title: property.title.replace(/\s+/g, ' ').trim(),
      ...plain,
    }),
    t('property.sharePrice', {
      price: listingPriceText(property, formatCurrency, t),
      ...plain,
    }),
    // A listing with no place at all simply has no pin in its summary.
    place ? t('property.sharePlace', { place, ...plain }) : '',
  ]
    .filter(Boolean)
    .join(' | ');
  return `${summary}\n${t('property.shareInvite')}\n${listingLink(
    property.id,
  )}`;
}

/**
 * Opens the phone's share sheet (WhatsApp, Telegram, SMS... whatever the person has) with the listing's summary and
 * link. Closing the sheet without choosing anything is not an error; a failure to open it is swallowed too, because
 * there is nothing the person could do about it and the button simply stays where it was.
 */
export function useShareListing() {
  const { t } = useTranslation();
  const { province } = useFormat();
  return async (property: ShareFields): Promise<void> => {
    try {
      await Share.share(
        { message: listingShareMessage(property, t as TFunction, province) },
        { dialogTitle: t('property.shareDialogTitle') },
      );
    } catch {
      // See above.
    }
  };
}
