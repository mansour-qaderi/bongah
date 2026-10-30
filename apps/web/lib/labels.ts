import type {
  Currency,
  DeedType,
  Market,
  DealType,
  PriceTerms,
  PropertyFeature,
  PropertyStatus,
  PropertyType,
  SubscriptionPackage,
  TransactionPurpose,
  TransactionStatus,
} from '@bongah/shared-types';
import { activeLanguage } from '@/i18n/active';
import { activeMarket } from './market';
import type { Language } from '@/i18n/config';
import { translate, type MessageKey } from '@/i18n/translate';

/** The names of the property types, deals, statuses and so on, in one language. Build it with `useLabels()` in a component. */
export interface Labels {
  type: Record<PropertyType, string>;
  deal: Record<DealType, string>;
  /** The tags of an Iranian listing (elevator, parking…). */
  feature: Record<PropertyFeature, string>;
  /** The ownership paper of an Afghan property (قباله شرعی / عرفی). */
  deed: Record<DeedType, string>;
  status: Record<PropertyStatus, string>;
  terms: Record<PriceTerms, string>;
  plan: Record<SubscriptionPackage, string>;
  purpose: Record<TransactionPurpose, string>;
  txStatus: Record<TransactionStatus, string>;
  currency: Record<Currency, string>;
}

const PROPERTY_TYPES: readonly PropertyType[] = [
  'HOUSE_HAWILI', 'APARTMENT', 'SHOP', 'OFFICE', 'LAND', 'GARDEN', 'VILLA', 'GARAGE', 'OTHER', 'DUPLEX', 'COMMERCIAL', 'WAREHOUSE', 'LAND_OLD', 'VILLA_GARDEN',
];
const DEAL_TYPES: readonly DealType[] = ['SALE', 'RENT', 'MORTGAGE_GROWI', 'MORTGAGE_RENT', 'DAILY_RENT'];
const FEATURES: readonly PropertyFeature[] = ['DUPLEX', 'PENTHOUSE', 'SINGLE_DEED', 'MASTER_ROOM', 'ELEVATOR', 'PARKING', 'STORAGE'];
const DEEDS: readonly DeedType[] = ['SHARI', 'ORFI'];
const STATUSES: readonly PropertyStatus[] = ['ACTIVE', 'SOLD', 'ARCHIVED'];
const TERMS: readonly PriceTerms[] = ['FIXED', 'NEGOTIABLE'];
const PLANS: readonly SubscriptionPackage[] = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY'];
const PURPOSES: readonly TransactionPurpose[] = ['SUBSCRIPTION', 'LADDER', 'FEATURED_AD', 'MAP_LOCATION', 'CONTACT_CREDITS', 'FEATURED_CREDITS'];
const TX_STATUSES: readonly TransactionStatus[] = ['PENDING', 'SUCCESS', 'FAILED'];
const CURRENCIES: readonly Currency[] = ['AFGHANI', 'USD', 'TOMAN', 'RIAL'];

/** The types Iran words in its own way (see MARKET_CONFIG.IR.propertyTypes); any other type reads as it does everywhere. */
const IR_TYPE_KEYS = {
  APARTMENT: 'label.type.IR.APARTMENT',
  HOUSE_HAWILI: 'label.type.IR.HOUSE_HAWILI',
  VILLA_GARDEN: 'label.type.IR.VILLA_GARDEN',
  LAND: 'label.type.IR.LAND',
  LAND_OLD: 'label.type.IR.LAND_OLD',
  COMMERCIAL: 'label.type.IR.COMMERCIAL',
} as const satisfies Partial<Record<PropertyType, MessageKey>>;

function pick<K extends string>(language: Language, keys: readonly K[], key: (k: K) => MessageKey): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = translate(language, key(k));
  return out;
}

const cache = new Map<string, Labels>();

/**
 * Every name, in one language and for one market. The market changes the words of the deals and of some types: Iranians
 * say «فروش», «اجاره» and «رهن کامل» where Afghans say «فروشی», «کرایی» and «گروی», «قابل توافق» where Afghans say
 * «جورآمد», and «خانه / ویلایی», «زمین», «خانه کلنگی» and «تجاری و اداری» for their kinds of property.
 */
export function labelsFor(language: Language, market: Market = 'AF'): Labels {
  const cacheKey = `${language}:${market}`;
  let hit = cache.get(cacheKey);
  if (!hit) {
    hit = {
      type: pick(language, PROPERTY_TYPES, (k) =>
        market === 'IR' && k in IR_TYPE_KEYS ? IR_TYPE_KEYS[k as keyof typeof IR_TYPE_KEYS] : `label.type.${k}`,
      ),
      deal: pick(language, DEAL_TYPES, (k) => (market === 'IR' ? `label.deal.IR.${k}` : `label.deal.${k}`)),
      feature: pick(language, FEATURES, (k) => `label.feature.${k}`),
      deed: pick(language, DEEDS, (k) => `label.deed.${k}`),
      status: pick(language, STATUSES, (k) => `label.status.${k}`),
      terms: pick(language, TERMS, (k) => (market === 'IR' ? `label.terms.IR.${k}` : `label.terms.${k}`)),
      plan: pick(language, PLANS, (k) => `label.plan.${k}`),
      purpose: pick(language, PURPOSES, (k) => `label.purpose.${k}`),
      txStatus: pick(language, TX_STATUSES, (k) => `label.tx.${k}`),
      currency: pick(language, CURRENCIES, (k) => `label.currency.${k}`),
    };
    cache.set(cacheKey, hit);
  }
  return hit;
}

/** For code that is not a component (parsers, validators, toasts): the labels of the language shown right now. */
export const labelsNow = (): Labels => labelsFor(activeLanguage(), activeMarket());

/** Marker and badge colours per deal, as in the mobile app: emerald sale, blue rent, gold mortgage. */
export const DEAL_COLOR: Record<DealType, { main: string; on: string }> = {
  SALE: { main: '#047857', on: '#FFFFFF' },
  RENT: { main: '#2563EB', on: '#FFFFFF' },
  MORTGAGE_GROWI: { main: '#D97706', on: '#111827' },
  MORTGAGE_RENT: { main: '#0891B2', on: '#FFFFFF' },
  DAILY_RENT: { main: '#7C3AED', on: '#FFFFFF' },
};

/** Types that have no bedrooms or bathrooms to count (same rule as the mobile form). */
export const NO_ROOMS: readonly PropertyType[] = ['LAND', 'LAND_OLD', 'GARDEN', 'GARAGE', 'SHOP', 'OFFICE', 'COMMERCIAL', 'WAREHOUSE', 'OTHER'];
export const hasRoomsFor = (type: PropertyType) => !NO_ROOMS.includes(type);
