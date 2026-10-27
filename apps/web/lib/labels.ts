import type {
  Currency,
  DealType,
  PriceTerms,
  PropertyStatus,
  PropertyType,
  SubscriptionPackage,
  TransactionPurpose,
  TransactionStatus,
} from '@bongah/shared-types';
import { activeLanguage } from '@/i18n/active';
import type { Language } from '@/i18n/config';
import { translate, type MessageKey } from '@/i18n/translate';

/** The names of the property types, deals, statuses and so on, in one language. Build it with `useLabels()` in a component. */
export interface Labels {
  type: Record<PropertyType, string>;
  deal: Record<DealType, string>;
  status: Record<PropertyStatus, string>;
  terms: Record<PriceTerms, string>;
  plan: Record<SubscriptionPackage, string>;
  purpose: Record<TransactionPurpose, string>;
  txStatus: Record<TransactionStatus, string>;
  currency: Record<Currency, string>;
}

const PROPERTY_TYPES: readonly PropertyType[] = ['HOUSE_HAWILI', 'APARTMENT', 'SHOP', 'OFFICE', 'LAND', 'GARDEN', 'VILLA', 'GARAGE', 'OTHER'];
const DEAL_TYPES: readonly DealType[] = ['SALE', 'RENT', 'MORTGAGE_GROWI'];
const STATUSES: readonly PropertyStatus[] = ['ACTIVE', 'SOLD', 'ARCHIVED'];
const TERMS: readonly PriceTerms[] = ['FIXED', 'NEGOTIABLE'];
const PLANS: readonly SubscriptionPackage[] = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY'];
const PURPOSES: readonly TransactionPurpose[] = ['SUBSCRIPTION', 'LADDER', 'FEATURED_AD', 'MAP_LOCATION', 'CONTACT_CREDITS', 'FEATURED_CREDITS'];
const TX_STATUSES: readonly TransactionStatus[] = ['PENDING', 'SUCCESS', 'FAILED'];
const CURRENCIES: readonly Currency[] = ['AFGHANI', 'USD'];

function pick<K extends string>(language: Language, keys: readonly K[], key: (k: K) => MessageKey): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = translate(language, key(k));
  return out;
}

const cache = new Map<Language, Labels>();

export function labelsFor(language: Language): Labels {
  let hit = cache.get(language);
  if (!hit) {
    hit = {
      type: pick(language, PROPERTY_TYPES, (k) => `label.type.${k}`),
      deal: pick(language, DEAL_TYPES, (k) => `label.deal.${k}`),
      status: pick(language, STATUSES, (k) => `label.status.${k}`),
      terms: pick(language, TERMS, (k) => `label.terms.${k}`),
      plan: pick(language, PLANS, (k) => `label.plan.${k}`),
      purpose: pick(language, PURPOSES, (k) => `label.purpose.${k}`),
      txStatus: pick(language, TX_STATUSES, (k) => `label.tx.${k}`),
      currency: pick(language, CURRENCIES, (k) => `label.currency.${k}`),
    };
    cache.set(language, hit);
  }
  return hit;
}

/** For code that is not a component (parsers, validators, toasts): the labels of the language shown right now. */
export const labelsNow = (): Labels => labelsFor(activeLanguage());

/** Marker and badge colours per deal, as in the mobile app: emerald sale, blue rent, gold mortgage. */
export const DEAL_COLOR: Record<DealType, { main: string; on: string }> = {
  SALE: { main: '#047857', on: '#FFFFFF' },
  RENT: { main: '#2563EB', on: '#FFFFFF' },
  MORTGAGE_GROWI: { main: '#D97706', on: '#111827' },
};

/** Types that have no bedrooms or bathrooms to count (same rule as the mobile form). */
export const NO_ROOMS: readonly PropertyType[] = ['LAND', 'GARDEN', 'GARAGE', 'SHOP', 'OFFICE', 'OTHER'];
export const hasRoomsFor = (type: PropertyType) => !NO_ROOMS.includes(type);
