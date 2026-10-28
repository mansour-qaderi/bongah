import type {
  CreateFeedbackInput,
  CreatePropertyInput,
  SpendLaddersInput,
  CreateTemplateInput,
  InitiatePaymentInput,
  RegisterDeviceInput,
  SendMessageInput,
  UpdatePreferencesInput,
  UpdatePropertyInput,
  UpdateTemplateInput,
} from '@bongah/validation';
import type {
  AgencyDashboard,
  AgencyMapPin,
  ChatCapabilities,
  ChatConversation,
  ChatImageUploaded,
  ChatMessage,
  ChatMessagesPage,
  ChatTemplate,
  ContactAccess,
  Currency,
  DealType,
  FeaturedCreditUsed,
  SpendLaddersResponse,
  FeedbackReceived,
  GeoProvider,
  Language,
  Paginated,
  PaymentInitiated,
  PlaceDetails,
  PlaceSuggestions,
  Pricing,
  Wallet,
  Property,
  PropertyImageUploaded,
  PropertyType,
  ReferralSummary,
  RouteResult,
  SendOtpResponse,
  PaymentStatus,
  User,
  VerifyOtpResponse,
  WelcomeQuote,
} from '@bongah/shared-types';
import { UPLOAD_TIMEOUT_MS } from '../config';
import { ApiError, request } from './client';

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

/**
 * Sets the signed-in user's display name and, optionally, their picture. The same call finishes sign-up and edits
 * the profile later. `avatar`: a picture's URL sets it, `null` removes it, and leaving it out keeps the current one.
 */
export const registerUser = (fullName: string, avatar?: string | null) =>
  request<User>('POST', '/users/register', {
    auth: true,
    body: { full_name: fullName, ...(avatar !== undefined ? { avatar } : {}) },
  });

/**
 * Uploads a profile picture from this phone and returns its public URL (to hand to `registerUser`). The API has one
 * picture store, the listing photos, and a profile picture lives in it too: it counts towards the account's photo
 * allowance like any other photo.
 */
export async function uploadAvatar(
  uri: string,
  contentType: string,
): Promise<PropertyImageUploaded> {
  let data: Blob;
  try {
    data = await (await fetch(uri)).blob();
  } catch {
    throw new ApiError('http', 0, { code: 'IMAGE_UNREADABLE' });
  }
  return request<PropertyImageUploaded>('POST', '/property-images', {
    auth: true,
    file: { data, contentType },
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}

/** The user's own settings: the morning-quote push, and "the welcome card has been shown" (it can only be set to true). */
export const updatePreferences = (preferences: UpdatePreferencesInput) =>
  request<User>('PATCH', '/users/me/preferences', {
    auth: true,
    body: preferences,
  });

// ───────────── Welcome card and push ─────────────

/** The text for the first-launch card. 404 NO_ACTIVE_QUOTE means the admin has none: show the built-in text. */
export const getWelcomeQuote = (language: Language) =>
  request<WelcomeQuote>('GET', '/quotes/welcome', {
    auth: true,
    query: { language },
  });

/** Tells the server this phone can receive the signed-in user's pushes. Safe to repeat. */
export const registerPushDevice = (device: RegisterDeviceInput) =>
  request<void>('PUT', '/notifications/devices', { auth: true, body: device });

/** Sign-out: this phone stops receiving the signed-in user's pushes. */
export const removePushDevice = (token: string) =>
  request<void>('DELETE', '/notifications/devices', {
    auth: true,
    body: { token },
  });

// ───────────── Properties ─────────────

export interface PropertyFilters {
  province?: string;
  district?: string;
  /**
   * Any of these kinds of property (a house or an apartment). Sent as one comma-separated `types` parameter; the
   * API's older single `type` is no longer sent by the app.
   */
  types?: PropertyType[];
  deal_type?: DealType;
  min_price?: number;
  max_price?: number;
  /** Required by the API whenever min_price/max_price is set. */
  currency?: Currency;
  /** true: only listings with an exact map pin (what the map can draw). */
  has_location?: boolean;
  /**
   * The part of the map on screen: only listings whose pin is inside this box. All four or none (the API
   * refuses a partial box), and it already means "has a pin", so it is not sent together with has_location.
   */
  min_lat?: number;
  max_lat?: number;
  min_lng?: number;
  max_lng?: number;
}

/** The API reads degrees as plain decimals ("34.4375"); a bare String() of a tiny number could come out as "1e-7". */
const degrees = (value: number | undefined) =>
  value === undefined ? undefined : value.toFixed(6);

export const listProperties = (
  filters: PropertyFilters,
  page: number,
  limit: number = PAGE_SIZE,
) =>
  request<Paginated<Property>>('GET', '/properties', {
    query: {
      ...filters,
      types: filters.types?.length ? filters.types.join(',') : undefined,
      min_lat: degrees(filters.min_lat),
      max_lat: degrees(filters.max_lat),
      min_lng: degrees(filters.min_lng),
      max_lng: degrees(filters.max_lng),
      page,
      limit,
    },
  });

export const listMyProperties = (page: number) =>
  request<Paginated<Property>>('GET', '/properties/mine', {
    auth: true,
    query: { page, limit: PAGE_SIZE },
  });

export const getProperty = (id: string) =>
  request<Property>('GET', `/properties/${id}`);

// ───────────── Contact reveals ─────────────

/** Whether I can already see the owner's number, and what is left of today's free reveals. Never reveals a new number. */
export const getContactAccess = (propertyId: string) =>
  request<ContactAccess>('GET', `/properties/${propertyId}/contact`, {
    auth: true,
  });

/**
 * Reveals the owner's number. `useCredit` is the person's consent to spend a credit once today's
 * free reveals are used; without it the server answers 403 CONTACT_LIMIT_REACHED instead.
 */
export const unlockContact = (propertyId: string, useCredit = false) =>
  request<ContactAccess>('POST', `/properties/${propertyId}/contact/unlock`, {
    auth: true,
    body: { use_credit: useCredit },
  });

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

/** Verified offices that placed a pin: what the home map draws. Public. */
export const listAgencyMapPins = () =>
  request<AgencyMapPin[]>('GET', '/agencies/map');

export const getAgencyDashboard = () =>
  request<AgencyDashboard>('GET', '/agencies/me/dashboard', { auth: true });

// ───────────── Referrals & rewards ─────────────

export const getReferralSummary = () =>
  request<ReferralSummary>('GET', '/referrals/me', { auth: true });

// ───────────── Wallet ─────────────

/** What I have left: the listings I can still publish, contact credits, plan days. */
export const getWallet = () =>
  request<Wallet>('GET', '/wallet', { auth: true });

// ───────────── Chat ─────────────

export const getChatCapabilities = () =>
  request<ChatCapabilities>('GET', '/chat/capabilities', { auth: true });

export const listConversations = () =>
  request<ChatConversation[]>('GET', '/chat/conversations', { auth: true });

/** Opens (or reopens) my chat about a listing. */
export const openConversation = (propertyId: string) =>
  request<ChatConversation>('POST', '/chat/conversations', {
    auth: true,
    body: { property_id: propertyId },
  });

export const getMessages = (conversationId: string, before?: string) =>
  request<ChatMessagesPage>(
    'GET',
    `/chat/conversations/${conversationId}/messages`,
    { auth: true, query: { before, limit: 30 } },
  );

/** The HTTP way to send; the chat uses the socket and falls back to this. */
export const sendMessageHttp = (
  conversationId: string,
  message: SendMessageInput,
) =>
  request<ChatMessage>(
    'POST',
    `/chat/conversations/${conversationId}/messages`,
    {
      auth: true,
      body: message,
    },
  );

export const markConversationRead = (conversationId: string) =>
  request<{ marked: number }>(
    'POST',
    `/chat/conversations/${conversationId}/read`,
    { auth: true, body: {} },
  );

/** Uploads a picture from this phone; the result's id is then sent as an IMAGE message. */
export async function uploadChatImage(
  uri: string,
  contentType: string,
): Promise<ChatImageUploaded> {
  let data: Blob;
  try {
    data = await (await fetch(uri)).blob();
  } catch {
    throw new ApiError('http', 0, { code: 'IMAGE_UNREADABLE' });
  }
  return request<ChatImageUploaded>('POST', '/chat/images', {
    auth: true,
    file: { data, contentType },
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}

export const listTemplates = () =>
  request<ChatTemplate[]>('GET', '/chat/templates', { auth: true });

export const createTemplate = (input: CreateTemplateInput) =>
  request<ChatTemplate>('POST', '/chat/templates', {
    auth: true,
    body: input,
  });

export const updateTemplate = (id: string, input: UpdateTemplateInput) =>
  request<ChatTemplate>('PATCH', `/chat/templates/${id}`, {
    auth: true,
    body: input,
  });

export const deleteTemplate = (id: string) =>
  request<void>('DELETE', `/chat/templates/${id}`, { auth: true });

// ───────────── Payments ─────────────

export const getPricing = () => request<Pricing>('GET', '/hesabpay/pricing');

export const initiatePayment = (input: InitiatePaymentInput) =>
  request<PaymentInitiated>('POST', '/hesabpay/payments', {
    auth: true,
    body: input,
  });

/** Spends one featured-listing credit on one of my listings (bought in a bundle, or the first-subscription bonus). */
export const spendFeaturedCredit = (propertyId: string) =>
  request<FeaturedCreditUsed>('POST', '/hesabpay/featured-credits/use', {
    auth: true,
    body: { property_id: propertyId },
  });

/**
 * Spends seven ladders (نردبان, earned by inviting friends): on one more listing once the free ones are used up, or
 * on a featured frame for one of my listings.
 */
export const spendLadders = (input: SpendLaddersInput) =>
  request<SpendLaddersResponse>('POST', '/rewards/ladders/spend', {
    auth: true,
    body: input,
  });

export const getPayment = (id: string) =>
  request<PaymentStatus>('GET', `/hesabpay/payments/${id}`, { auth: true });

/**
 * Manual mode: sends the transaction id printed on the transfer receipt, instead of (or besides) the picture. An admin
 * compares it with the account's history and activates the order; nothing is credited by this call.
 */
export const submitPaymentReference = (id: string, reference: string) =>
  request<PaymentStatus>('POST', `/hesabpay/payments/${id}/reference`, {
    auth: true,
    body: { reference },
  });

/**
 * Manual mode: sends the picture of the transfer receipt for a payment the person made by hand. An admin looks at it
 * and activates the order; nothing is credited by this call. Sending again replaces the picture.
 */
export async function uploadPaymentProof(
  id: string,
  uri: string,
  contentType: string,
): Promise<PaymentStatus> {
  let data: Blob;
  try {
    data = await (await fetch(uri)).blob();
  } catch {
    throw new ApiError('http', 0, { code: 'IMAGE_UNREADABLE' });
  }
  return request<PaymentStatus>('POST', `/hesabpay/payments/${id}/proof`, {
    auth: true,
    file: { data, contentType },
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}

// ───────────── Feedback ─────────────

/** A suggestion, a problem or a thank-you for the Bongah team, from the Account tab. Needs a signed-in account. */
export const sendFeedback = (input: CreateFeedbackInput) =>
  request<FeedbackReceived>('POST', '/feedback', { auth: true, body: input });

// ───────────── Places and routes (Google / Mapbox through the server; see map/GeocodingService.ts) ─────────────

/** How long a place question may take before the app asks OpenStreetMap instead: a dropdown that lags is no help. */
const GEO_TIMEOUT_MS = 7_000;

export const geoAutocomplete = (
  params: {
    q: string;
    lat?: number;
    lng?: number;
    session?: string;
    lang?: Language;
  },
  signal?: AbortSignal,
) =>
  request<PlaceSuggestions>('GET', '/geo/autocomplete', {
    auth: true,
    query: params,
    signal,
    timeoutMs: GEO_TIMEOUT_MS,
  });

export const geoPlace = (
  provider: GeoProvider,
  id: string,
  params: { session?: string; lang?: Language },
  signal?: AbortSignal,
) =>
  request<PlaceDetails>(
    'GET',
    `/geo/places/${provider}/${encodeURIComponent(id)}`,
    { auth: true, query: params, signal, timeoutMs: GEO_TIMEOUT_MS },
  );

export const geoReverse = (
  params: { lat: number; lng: number; lang?: Language },
  signal?: AbortSignal,
) =>
  request<PlaceDetails>('GET', '/geo/reverse', {
    auth: true,
    query: params,
    signal,
    timeoutMs: GEO_TIMEOUT_MS,
  });

export const geoRoute = (
  params: { from_lat: number; from_lng: number; to_lat: number; to_lng: number },
  signal?: AbortSignal,
) =>
  request<RouteResult>('GET', '/geo/route', {
    auth: true,
    query: params,
    signal,
    timeoutMs: 12_000,
  });
