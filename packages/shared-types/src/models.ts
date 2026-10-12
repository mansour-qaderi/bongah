import type {
  Currency, Language, ListingType, PropertyStatus,
  PropertyType, TransactionStatus, UserRole,
} from './constants';

/** Dates are ISO-8601 strings: these are wire types, not DB entities. */
interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export interface User extends Timestamps {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  role: UserRole;
  preferredLanguage: Language;
  agencyId?: string;
}

export interface Agency extends Timestamps {
  id: string;
  name: string;
  ownerId: string;
  phone: string;
  province: string;
  address?: string;
  licenseNumber?: string;
}

export interface Property extends Timestamps {
  id: string;
  agencyId: string;
  title: string;
  description: string;
  listingType: ListingType;
  propertyType: PropertyType;
  status: PropertyStatus;
  price: number;
  currency: Currency;
  areaSqm: number;
  bedrooms?: number;
  bathrooms?: number;
  province: string;
  district?: string;
  address?: string;
  imageUrls: string[];
}

export interface Transaction extends Timestamps {
  id: string;
  userId: string;
  agencyId?: string;
  propertyId?: string;
  amount: number;
  currency: Currency;
  status: TransactionStatus;
  provider: 'hesabpay';
  providerReference?: string;
}
