import {
  AFGHANISTAN_BOUNDS,
  DAILY_RENT_TYPES,
  DEFAULT_MARKET,
  IRAN_BOUNDS,
  MARKETS,
  type Currency,
  type DealType,
  type DeedType,
  type Market,
  type PropertyFeature,
  type PropertyType,
} from './constants';

/**
 * What differs between the two markets, in one place, so the API, the website and the app agree. The ORDER of every
 * list is the order the pickers show it in, and its first entry is the default.
 */
export interface MarketConfig {
  id: Market;
  /** ISO 3166 country code. */
  country: 'AF' | 'IR';
  /** The currencies a listing may be priced in. The first is the default. */
  currencies: readonly Currency[];
  dealTypes: readonly DealType[];
  propertyTypes: readonly PropertyType[];
  /** The tags (elevator, parking…) an owner may tick. Empty: the market has none. */
  features: readonly PropertyFeature[];
  /** The ownership papers an owner may name. Empty: the market does not ask. */
  deedTypes: readonly DeedType[];
  /** A sanity box for map pins. */
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  /** Where a map of the market opens: [longitude, latitude] and zoom. */
  center: readonly [number, number];
  zoom: number;
  /**
   * How the platform's own fees (plans, ladders, featured listings) are collected: the HesabPay gateway or by hand.
   * Iran has no gateway: the customer pays by card-to-card / Sheba transfer and an admin confirms the receipt.
   */
  payment: 'HESABPAY' | 'CARD_TO_CARD';
}

export const MARKET_CONFIG: Record<Market, MarketConfig> = {
  AF: {
    id: 'AF',
    country: 'AF',
    currencies: ['AFGHANI', 'USD'],
    // A daily rental (a villa or garden by the day) is offered in both markets.
    dealTypes: ['SALE', 'RENT', 'MORTGAGE_GROWI', 'DAILY_RENT'],
    propertyTypes: [
      'HOUSE_HAWILI',
      'APARTMENT',
      'SHOP',
      'OFFICE',
      'WAREHOUSE',
      'LAND',
      'GARDEN',
      'VILLA',
      'GARAGE',
      'OTHER',
    ],
    features: [],
    deedTypes: ['SHARI', 'ORFI'],
    bounds: AFGHANISTAN_BOUNDS,
    center: [66.0, 34.0],
    zoom: 5,
    payment: 'HESABPAY',
  },
  IR: {
    id: 'IR',
    country: 'IR',
    // Iran prices in toman and nothing else: no rial, no dollar. (RIAL and USD stay valid values for listings saved
    // before this, and are still read, but a new or edited Iranian listing cannot carry them.)
    currencies: ['TOMAN'],
    // Plain RENT is not offered: in Iran a let is اجاره (a deposit and a monthly rent: MORTGAGE_RENT) or رهن کامل (deposit only).
    dealTypes: ['SALE', 'MORTGAGE_RENT', 'MORTGAGE_GROWI', 'DAILY_RENT'],
    // آپارتمان, خانه / ویلایی, باغ و ویلا, زمین, خانه کلنگی, تجاری و اداری. Three of them reuse a value Afghanistan also has
    // (HOUSE_HAWILI is the house, LAND the plot, COMMERCIAL covers shops and offices); LAND_OLD is the old building.
    propertyTypes: ['APARTMENT', 'HOUSE_HAWILI', 'VILLA_GARDEN', 'LAND', 'LAND_OLD', 'COMMERCIAL'],
    features: ['DUPLEX', 'PENTHOUSE', 'SINGLE_DEED', 'MASTER_ROOM', 'ELEVATOR', 'PARKING', 'STORAGE'],
    deedTypes: [],
    bounds: IRAN_BOUNDS,
    center: [53.7, 32.4],
    zoom: 4.3,
    payment: 'CARD_TO_CARD',
  },
};

export const isMarket = (value: unknown): value is Market =>
  typeof value === 'string' && (MARKETS as readonly string[]).includes(value);

/** The market a value stands for; anything unknown or missing is the default market. */
export const marketOf = (value: unknown): Market => (isMarket(value) ? value : DEFAULT_MARKET);

/**
 * The Iran–Afghanistan border as latitude / longitude points, south to north, coarse (a few kilometres): Afghanistan is
 * east of it. The two countries' boxes overlap along it, so a point in both boxes is decided by which side it is on.
 */
const BORDER: readonly (readonly [lat: number, lng: number])[] = [
  [29.86, 60.87],
  [31.0, 61.8],
  [31.4, 61.7],
  [32.2, 60.85],
  [33.6, 60.5],
  [34.65, 60.95],
  [35.6, 61.25],
];

/** Where the border is, as a longitude, at a latitude (null: the latitude is beyond the surveyed stretch). */
function borderLongitude(lat: number): number | null {
  for (let i = 1; i < BORDER.length; i += 1) {
    const [lat0, lng0] = BORDER[i - 1]!;
    const [lat1, lng1] = BORDER[i]!;
    if (lat >= lat0 && lat <= lat1) return lng0 + ((lng1 - lng0) * (lat - lat0)) / (lat1 - lat0);
  }
  return null;
}

const inBox = (box: MarketConfig['bounds'], lat: number, lng: number) =>
  lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;

/**
 * The country a position is in, or null when it is in neither (a person in Turkey or the Gulf). Used to start a person in
 * the market of the country their phone or browser is in. Coarse on purpose: the two countries' boxes overlap along the
 * border, and a point there is put on the side of the border it lies on.
 */
export function marketOfPoint(lat: number, lng: number): Market | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const inAf = inBox(MARKET_CONFIG.AF.bounds, lat, lng);
  const inIr = inBox(MARKET_CONFIG.IR.bounds, lat, lng);
  if (inAf && !inIr) return 'AF';
  if (inIr && !inAf) return 'IR';
  if (!inAf && !inIr) return null;
  const border = borderLongitude(lat);
  if (border !== null) return lng > border ? 'AF' : 'IR';
  return lng >= 62 ? 'AF' : 'IR';
}

/** The market a currency belongs to, or null for a currency both markets use (USD). */
export function marketOfCurrency(currency: Currency): Market | null {
  if (currency === 'TOMAN' || currency === 'RIAL') return 'IR';
  if (currency === 'AFGHANI') return 'AF';
  return null;
}

/** The market to start a person in when they have not chosen: from the currency they price in, else the default. */
export const marketFromCurrency = (currency: Currency | null | undefined): Market =>
  (currency ? marketOfCurrency(currency) : null) ?? DEFAULT_MARKET;

/** The currency a new listing starts with in a market. */
export const defaultCurrency = (market: Market): Currency => MARKET_CONFIG[market].currencies[0];

/**
 * Why a listing does not fit its market, or null when it does. Checked by the API on every create and update, and by
 * the forms before they send, so the reasons are the same everywhere.
 */
export type MarketMismatch =
  | 'CURRENCY_NOT_IN_MARKET'
  | 'DEAL_NOT_IN_MARKET'
  | 'TYPE_NOT_IN_MARKET'
  | 'DAILY_RENT_TYPE'
  | 'FEATURE_NOT_IN_MARKET'
  | 'DEED_NOT_IN_MARKET'
  | 'PIN_OUTSIDE_MARKET';

export function marketMismatch(
  market: Market,
  listing: {
    currency?: Currency;
    deal_type?: DealType;
    type?: PropertyType;
    features?: readonly PropertyFeature[] | null;
    deed_type?: DeedType | null;
    lat?: number | null;
    lng?: number | null;
  },
): MarketMismatch | null {
  const config = MARKET_CONFIG[market];
  if (listing.currency !== undefined && !config.currencies.includes(listing.currency)) return 'CURRENCY_NOT_IN_MARKET';
  if (listing.deal_type !== undefined && !config.dealTypes.includes(listing.deal_type)) return 'DEAL_NOT_IN_MARKET';
  if (listing.type !== undefined && !config.propertyTypes.includes(listing.type)) return 'TYPE_NOT_IN_MARKET';
  if (
    listing.deal_type === 'DAILY_RENT' &&
    listing.type !== undefined &&
    !(DAILY_RENT_TYPES as readonly string[]).includes(listing.type)
  ) {
    return 'DAILY_RENT_TYPE';
  }
  if (listing.features && listing.features.some((feature) => !config.features.includes(feature))) {
    return 'FEATURE_NOT_IN_MARKET';
  }
  if (listing.deed_type != null && !config.deedTypes.includes(listing.deed_type)) return 'DEED_NOT_IN_MARKET';
  if (typeof listing.lat === 'number' && typeof listing.lng === 'number') {
    const b = config.bounds;
    if (listing.lat < b.minLat || listing.lat > b.maxLat || listing.lng < b.minLng || listing.lng > b.maxLng) {
      return 'PIN_OUTSIDE_MARKET';
    }
  }
  return null;
}

/** Rials in one toman. Prices in Iran are said in toman; a bank counts in rials. */
export const RIALS_PER_TOMAN = 10;
