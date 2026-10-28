import type { Currency, DealType, PriceTerms, PropertyType } from '@bongah/shared-types';

/**
 * A listing being prepared: every field is the text as it sits in the table cell, so half-typed values survive.
 * Drafts are checked (draft-validation.ts) and sent to the API only when the agent presses publish.
 */
export interface DraftRow {
  key: string;
  title: string;
  description: string;
  type: PropertyType | '';
  deal_type: DealType | '';
  price: string;
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
    currency: '',
    price_terms: '',
    area_sqm: '',
    bedrooms: '',
    bathrooms: '',
    floors: '',
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
