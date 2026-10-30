import {
  DEFAULT_MARKET,
  FALLBACK_MARKET,
  MARKET_CONFIG,
  marketMismatch,
  marketOf,
  marketOfPoint,
  type Currency,
  type DealType,
  type DeedType,
  type Market,
  type MarketConfig,
  type MarketMismatch,
  type PropertyFeature,
  type PropertyType,
} from '@bongah/shared-types';
import { DAILY_RENT_TYPES } from '@bongah/shared-types';
import { tNow } from '@/i18n/active';
import { MARKET_COOKIE } from '@/i18n/config';
import type { DraftRow } from './import/types';
import { marketOfProvince } from './provinces';
import { parseLatLng } from './coords';
import type { MessageKey } from '@/i18n/translate';

/**
 * The market (Afghanistan or Iran) the signed-in person works in, for code that has no React hook, and the single place
 * the hooks read from. The account's own market (from /users/me) is the truth; this copy is only so the first paint
 * after a reload already has the right words, so it is kept in the browser and replaced as soon as the account answers.
 */
const STORAGE_KEY = 'bongah.market';

let active: Market = DEFAULT_MARKET;
let restored = false;
const listeners = new Set<() => void>();

export const activeMarket = (): Market => active;

export function subscribeMarket(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reads the last market from the browser once (never on the server, where one process serves many people). */
export function restoreMarket(): void {
  if (restored || typeof window === 'undefined') return;
  restored = true;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setActiveMarket(marketOf(saved));
  } catch {
    /* blocked storage: the account's answer sets it a moment later */
  }
}

/** Left over from versions that let the person pick a country in the account menu; removed on sight (see settleMarket). */
const LEGACY_MANUAL_KEY = 'bongah.market.manual';
const ASKED_KEY = 'bongah.market.asked';
let settled = false;
let settling = false;

/** True once the country has been looked for (and found, or fallen back to Iran): the pages may then show country-specific choices. */
export const marketSettled = (): boolean => settled;

const readSaved = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * The country the browser is in, from its position: null when that cannot be told (refused, unavailable, no support, or a
 * position in neither country). The browser's prompt is shown once (or again only when the permission was already given):
 * a person who dismissed it is not asked on every page load.
 */
export async function detectBrowserMarket(): Promise<Market | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  let permission: PermissionState | null = null;
  try {
    permission = (await navigator.permissions?.query({ name: 'geolocation' as PermissionName }))?.state ?? null;
  } catch {
    permission = null;
  }
  if (permission === 'denied') return null;
  if (permission !== 'granted' && readSaved(ASKED_KEY) === '1') return null;
  try {
    window.localStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* asked again next time */
  }
  return new Promise<Market | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(marketOfPoint(position.coords.latitude, position.coords.longitude)),
      () => resolve(null),
      { timeout: 8000, maximumAge: 24 * 60 * 60 * 1000, enableHighAccuracy: false },
    );
  });
}

/**
 * Finds the person's country once per page load. Nobody chooses it (there is no setting): it is the browser's country;
 * when that cannot be told, the last one found stays, and on a first visit it is Iran.
 */
export async function settleMarket(): Promise<void> {
  if (settling || typeof window === 'undefined') return;
  settling = true;
  const hadSaved = readSaved(STORAGE_KEY) !== null;
  restoreMarket();
  // A country picked by hand in an older version would pin the site to it with no way left to change it: forget the pin.
  try {
    window.localStorage.removeItem(LEGACY_MANUAL_KEY);
  } catch {
    /* blocked storage: nothing was pinned */
  }
  const found = await detectBrowserMarket();
  if (found) setActiveMarket(found);
  else if (!hadSaved) setActiveMarket(FALLBACK_MARKET);
  rememberMarket(active);
  settled = true;
  listeners.forEach((l) => l());
}

/** Leaves the country in a cookie for the server-rendered parts of the page (title, description, `lang`). */
function rememberMarket(market: Market): void {
  try {
    document.cookie = `${MARKET_COOKIE}=${market}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {
    /* cookies blocked: the page's own text is worded for the country in the browser */
  }
}

export function setActiveMarket(next: Market): void {
  if (typeof window === 'undefined' || next === active) return;
  active = next;
  rememberMarket(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* the market lasts for this visit only */
  }
  listeners.forEach((l) => l());
}

export const configFor = (market: Market): MarketConfig => MARKET_CONFIG[market];

/** The name of a market in the language shown now. */
export const marketName = (market: Market): string => tNow(`market.${market}` as MessageKey);

/** The Toman/Rial pair is priced in IRR; this is the currency a market's form starts with. */
export const startCurrency = (market: Market): Currency => MARKET_CONFIG[market].currencies[0]!;

export const dealsFor = (market: Market): readonly DealType[] => MARKET_CONFIG[market].dealTypes;
export const typesFor = (market: Market): readonly PropertyType[] => MARKET_CONFIG[market].propertyTypes;
export const currenciesFor = (market: Market): readonly Currency[] => MARKET_CONFIG[market].currencies;
/** The tags a market's form offers (Iran: duplex, penthouse, elevator…; Afghanistan has none). */
export const featuresFor = (market: Market): readonly PropertyFeature[] => MARKET_CONFIG[market].features;
/** The ownership papers a market's form offers (Afghanistan: شرعی, عرفی; Iran has none). */
export const deedsFor = (market: Market): readonly DeedType[] => MARKET_CONFIG[market].deedTypes;

/** Whether a point is inside the box a market's pins must be in. */
export function inMarket(market: Market, lat: number, lng: number): boolean {
  return marketMismatch(market, { lat, lng }) === null;
}

/** The wording for why a listing does not fit its market, in the language shown. */
export const mismatchText = (reason: MarketMismatch, market: Market): string =>
  tNow(`market.mismatch.${reason}` as MessageKey, { market: marketName(market) });

/** The first field of a draft that does not fit the market, or null. */
export function draftMismatch(
  market: Market,
  draft: {
    currency?: Currency | '';
    deal_type?: DealType | '';
    type?: PropertyType | '';
    features?: readonly PropertyFeature[];
    deed_type?: DeedType | '';
  },
): { reason: MarketMismatch; field: 'currency' | 'deal_type' | 'type' | 'features' | 'deed_type' } | null {
  const reason = marketMismatch(market, {
    currency: draft.currency || undefined,
    deal_type: draft.deal_type || undefined,
    type: draft.type || undefined,
    features: draft.features,
    deed_type: draft.deed_type || undefined,
  });
  if (!reason) return null;
  const field =
    reason === 'CURRENCY_NOT_IN_MARKET'
      ? 'currency'
      : reason === 'TYPE_NOT_IN_MARKET'
        ? 'type'
        : reason === 'FEATURE_NOT_IN_MARKET'
          ? 'features'
          : reason === 'DEED_NOT_IN_MARKET'
            ? 'deed_type'
            : 'deal_type';
  // A daily rental of the wrong kind of property is the property's fault from the person's side (they pick the deal first).
  return { reason, field: reason === 'DAILY_RENT_TYPE' ? 'type' : field };
}

/** The property types a deal can be made on in a market: a daily rental is only for a villa or a garden. */
export function typesForDeal(market: Market, deal: DealType | ''): readonly PropertyType[] {
  const all = typesFor(market);
  return deal === 'DAILY_RENT' ? all.filter((t) => (DAILY_RENT_TYPES as readonly string[]).includes(t)) : all;
}

/**
 * What to change in a draft so it fits `market`, when its country is switched: a currency, deal or type the market does
 * not have is cleared (the currency starts again at the market's own), a province of the other country and a pin outside
 * this one are cleared. Everything else the person typed stays.
 */
export function reconcileDraft(
  row: Pick<DraftRow, 'currency' | 'deal_type' | 'type' | 'province' | 'lat' | 'lng' | 'price'> & Partial<Pick<DraftRow, 'features' | 'deed_type' | 'monthly_rent'>>,
  market: Market,
): Partial<DraftRow> {
  const patch: Partial<DraftRow> = {};
  if (row.currency && !currenciesFor(market).includes(row.currency)) patch.currency = startCurrency(market);
  if (row.deal_type && !dealsFor(market).includes(row.deal_type)) patch.deal_type = '';
  const deal = patch.deal_type ?? row.deal_type;
  if (row.type && !typesForDeal(market, deal).includes(row.type)) patch.type = '';
  // The tags and the deed belong to one country (elevator and penthouse to Iran, شرعی and عرفی to Afghanistan).
  if (row.features?.some((feature) => !featuresFor(market).includes(feature))) {
    patch.features = row.features.filter((feature) => featuresFor(market).includes(feature));
  }
  if (row.deed_type && !deedsFor(market).includes(row.deed_type)) patch.deed_type = '';
  // The monthly rent goes with the deal that has one.
  if (row.monthly_rent && (patch.deal_type ?? row.deal_type) !== 'MORTGAGE_RENT') patch.monthly_rent = '';
  const owner = row.province ? marketOfProvince(row.province.trim()) : null;
  if (owner && owner !== market) patch.province = '';
  const la = parseLatLng(row.lat);
  const ln = parseLatLng(row.lng);
  if (la !== null && ln !== null && !inMarket(market, la, ln)) {
    patch.lat = '';
    patch.lng = '';
  }
  return patch;
}
