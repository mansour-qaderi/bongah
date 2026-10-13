import type {
  CreatePropertyInput,
  InitiatePaymentInput,
  UpdatePropertyInput,
} from '@bongah/validation';
import type {
  AgencyDashboard,
  Currency,
  DealType,
  MapLocationStatus,
  Paginated,
  PaymentInitiated,
  Pricing,
  Property,
  PropertyContact,
  PropertyType,
  RedeemLadderTokenResponse,
  ReferralSummary,
  SendOtpResponse,
  Transaction,
  User,
  VerifyOtpResponse,
} from '@bongah/shared-types';
import { request } from './client';

export const PAGE_SIZE = 20;

// ───────────── Auth ─────────────

export const sendOtp = (phoneNumber: string) =>
  request<SendOtpResponse>('POST', '/auth/send-otp', {
    body: { phone_number: phoneNumber },
  });

export const verifyOtp = (
  phoneNumber: string,
  otpCode: string,
  referralCode?: string,
) =>
  request<VerifyOtpResponse>('POST', '/auth/verify-otp', {
    body: {
      phone_number: phoneNumber,
      otp_code: otpCode,
      // Only sent when there is one: the server ignores it for returning users anyway.
      ...(referralCode ? { referral_code: referralCode } : {}),
    },
  });

// ───────────── Users ─────────────

export const getMe = () => request<User>('GET', '/users/me', { auth: true });

export const registerUser = (fullName: string) =>
  request<User>('POST', '/users/register', {
    auth: true,
    body: { full_name: fullName },
  });

// ───────────── Properties ─────────────

export interface PropertyFilters {
  province?: string;
  district?: string;
  type?: PropertyType;
  deal_type?: DealType;
  min_price?: number;
  max_price?: number;
  /** Required by the API whenever min_price/max_price is set. */
  currency?: Currency;
  /** true: only listings with an exact map pin (what the map can draw). */
  has_location?: boolean;
}

export const listProperties = (filters: PropertyFilters, page: number) =>
  request<Paginated<Property>>('GET', '/properties', {
    query: { ...filters, page, limit: PAGE_SIZE },
  });

export const listMyProperties = (page: number) =>
  request<Paginated<Property>>('GET', '/properties/mine', {
    auth: true,
    query: { page, limit: PAGE_SIZE },
  });

export const getProperty = (id: string) =>
  request<Property>('GET', `/properties/${id}`);

export const getPropertyContact = (id: string) =>
  request<PropertyContact>('GET', `/properties/${id}/contact`, { auth: true });

export const createProperty = (input: CreatePropertyInput) =>
  request<Property>('POST', '/properties', { auth: true, body: input });

export const updateProperty = (id: string, input: UpdatePropertyInput) =>
  request<Property>('PATCH', `/properties/${id}`, { auth: true, body: input });

/**
 * Counts one view of a listing for the owner's dashboard. Fire-and-forget: callers ignore
 * failures, a missed view is not worth an error message.
 */
export const recordPropertyView = (id: string) =>
  request<void>('POST', `/properties/${id}/view`);

/** DELETE archives the listing (it is not erased). */
export const archiveProperty = (id: string) =>
  request<void>('DELETE', `/properties/${id}`, { auth: true });

// ───────────── Agency ─────────────

export const getAgencyDashboard = () =>
  request<AgencyDashboard>('GET', '/agencies/me/dashboard', { auth: true });

// ───────────── Referrals & rewards ─────────────

export const getReferralSummary = () =>
  request<ReferralSummary>('GET', '/referrals/me', { auth: true });

/** Spends one free ladder token to move one of my listings to the top of search. */
export const redeemLadderToken = (propertyId: string) =>
  request<RedeemLadderTokenResponse>('POST', '/rewards/ladder-tokens/redeem', {
    auth: true,
    body: { property_id: propertyId },
  });

// ───────────── Map location ─────────────

export const getMapLocationStatus = () =>
  request<MapLocationStatus>('GET', '/map-location/status', { auth: true });

// ───────────── Payments ─────────────

export const getPricing = () => request<Pricing>('GET', '/hesabpay/pricing');

export const initiatePayment = (input: InitiatePaymentInput) =>
  request<PaymentInitiated>('POST', '/hesabpay/payments', {
    auth: true,
    body: input,
  });

export const getPayment = (id: string) =>
  request<Transaction>('GET', `/hesabpay/payments/${id}`, { auth: true });
