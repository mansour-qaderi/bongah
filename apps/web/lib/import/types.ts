import type { Currency, DealType, DeedType, Market, PriceTerms, PropertyFeature, PropertyType } from '@bongah/shared-types';

/**
 * A listing being prepared: every field is the text as it sits in the table cell, so half-typed values survive.
 * Drafts are checked (draft-validation.ts) and sent to the API only when the agent presses publish.
 */
export interface DraftRow {
  key: string;
  /**
   * The market (Afghanistan or Iran) the listing is for. Absent from drafts saved before markets existed, and for rows
   * that never chose one: those take the account's market when they are checked and sent.
   */
  market?: Market;
  title: string;
  description: string;
  type: PropertyType | '';
  deal_type: DealType | '';
  /** The price; for a mortgage-and-rent (رهن و اجاره) it is the deposit. */
  price: string;
  /** The rent every month, only for a mortgage-and-rent. Optional because drafts saved before it existed do not have it. */
  monthly_rent?: string;
  currency: Currency | '';
  price_terms: PriceTerms | '';
  area_sqm: string;
  bedrooms: string;
  bathrooms: string;
  /**
   * How many storeys the house has ("2"), when the text said so. The API has no field for it, so it is not sent as one: it
   * goes into the generated title and description. Optional because drafts saved before it existed do not have it.
   */
  floors?: string;
  /** The tags ticked (Iran: elevator, parking…). Optional because drafts saved before they existed do not have them. */
  features?: PropertyFeature[];
  /** Afghan ownership paper: قباله شرعی / عرفی. */
  deed_type?: DeedType | '';
  /** The contact number the text carried, as +93XXXXXXXXX. Kept for the agent to see; the API gets no phone (callers go through the app). */
  phone?: string;
  province: string;
  district: string;
  neighborhood: string;
  address: string;
  /** "34.5281" – both or neither. */
  lat: string;
  lng: string;
  images: string[];
  /** What the importer guessed or could not read, for the agent to look at. */
  notes: string[];
  source: 'form' | 'text' | 'file';
}

/** Values the agent keeps pinned while entering many listings: they fill whatever an import could not read. */
export interface PinnedDefaults {
  /** The market the listings are for. Left out: the account's market. */
  market?: Market;
  province: string;
  district: string;
  deal_type: DealType | '';
  currency: Currency | '';
}

export const NO_PIN: PinnedDefaults = { province: '', district: '', deal_type: '', currency: '' };

let counter = 0;
export function newKey(): string {
  counter += 1;
  return `d${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyDraft(source: DraftRow['source'], defaults: Partial<DraftRow> = {}): DraftRow {
  return {
    key: newKey(),
    title: '',
    description: '',
    type: '',
    deal_type: '',
    price: '',
    monthly_rent: '',
    currency: '',
    price_terms: '',
    area_sqm: '',
    bedrooms: '',
    bathrooms: '',
    floors: '',
    features: [],
    deed_type: '',
    phone: '',
    province: '',
    district: '',
    neighborhood: '',
    address: '',
    lat: '',
    lng: '',
    images: [],
    notes: [],
    source,
    ...defaults,
  };
}
