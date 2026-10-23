import type {
  AgencyVerificationStatus,
  Currency,
  DealType,
  PriceTerms,
  PropertyStatus,
  PropertyType,
  SubscriptionPackage,
  TransactionPurpose,
  TransactionStatus,
} from '@bongah/shared-types';

export const TYPE_LABEL: Record<PropertyType, string> = {
  HOUSE_HAWILI: 'خانه / حویلی',
  APARTMENT: 'آپارتمان',
  SHOP: 'دکان',
  OFFICE: 'دفتر',
  LAND: 'زمین',
  GARDEN: 'باغ',
  VILLA: 'ویلا',
  GARAGE: 'گاراژ',
  OTHER: 'دیگر',
};

export const DEAL_LABEL: Record<DealType, string> = {
  SALE: 'فروشی',
  RENT: 'کرایی',
  MORTGAGE_GROWI: 'گروی',
};

export const STATUS_LABEL: Record<PropertyStatus, string> = {
  ACTIVE: 'فعال',
  SOLD: 'معامله شد',
  ARCHIVED: 'غیرفعال',
};

export const TERMS_LABEL: Record<PriceTerms, string> = { FIXED: 'مقطوع', NEGOTIABLE: 'جورآمد' };

export const PLAN_LABEL: Record<SubscriptionPackage, string> = {
  MONTHLY: 'ماهانه',
  QUARTERLY: 'سه‌ماهه',
  SEMIANNUAL: 'شش‌ماهه',
  YEARLY: 'سالانه',
};

export const PURPOSE_LABEL: Record<TransactionPurpose, string> = {
  SUBSCRIPTION: 'اشتراک',
  LADDER: 'نردبان آگهی',
  FEATURED_AD: 'کادر ویژه',
  MAP_LOCATION: 'موقعیت دقیق نقشه',
  CONTACT_CREDITS: 'اعتبار تماس',
  FEATURED_CREDITS: 'بسته کادر ویژه',
};

export const TX_STATUS_LABEL: Record<TransactionStatus, string> = {
  PENDING: 'در انتظار',
  SUCCESS: 'موفق',
  FAILED: 'ناموفق',
};

export const VERIFICATION_LABEL: Record<AgencyVerificationStatus, string> = {
  PENDING: 'در انتظار تأیید',
  VERIFIED: 'تأیید شده',
  REJECTED: 'رد شده',
};

export const CURRENCY_NAME: Record<Currency, string> = { AFGHANI: 'افغانی', USD: 'دالر' };

/** Marker and badge colours per deal, as in the mobile app: emerald sale, blue rent, gold mortgage. */
export const DEAL_COLOR: Record<DealType, { main: string; on: string }> = {
  SALE: { main: '#047857', on: '#FFFFFF' },
  RENT: { main: '#2563EB', on: '#FFFFFF' },
  MORTGAGE_GROWI: { main: '#D97706', on: '#111827' },
};

/** Types that have no bedrooms or bathrooms to count (same rule as the mobile form). */
export const NO_ROOMS: readonly PropertyType[] = ['LAND', 'GARDEN', 'GARAGE', 'SHOP', 'OFFICE', 'OTHER'];
export const hasRoomsFor = (type: PropertyType) => !NO_ROOMS.includes(type);
