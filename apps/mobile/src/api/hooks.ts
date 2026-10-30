import {
  QueryClient,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from '@tanstack/react-query';
import type { Language, Market, Paginated, Property } from '@bongah/shared-types';
import type { Area } from '../map/viewport';
import { useActiveMarket } from '../market/marketStore';
import { ApiError } from './client';
import {
  getAgencyDashboard,
  listAgencyMapPins,
  getChatCapabilities,
  getContactAccess,
  getPricing,
  getWallet,
  getProperty,
  getReferralSummary,
  getWelcomeQuote,
  listConversations,
  listMyProperties,
  listProperties,
  listTemplates,
  type PropertyFilters,
} from './endpoints';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry only when the request never reached the server (flaky mobile network).
      retry: (failureCount, error) =>
        error instanceof ApiError && error.kind !== 'http' && failureCount < 2,
    },
  },
});

/** Query keys in one place so a mutation can invalidate exactly what it changed. */
export const queryKeys = {
  properties: ['properties'] as const,
  list: (filters: PropertyFilters) => ['properties', 'list', filters] as const,
  /** The home map: the listings inside one area. Under `properties`, so a new listing refreshes it too. */
  map: (filters: PropertyFilters, area: Area) =>
    ['properties', 'map', filters, area] as const,
  mine: ['properties', 'mine'] as const,
  /**
   * Sits under `properties` on purpose: everything on the dashboard (counts, subscription days,
   * promotions) is derived from listings and payments, so the invalidations that already follow
   * adding, archiving or paying refresh it too.
   */
  agencyDashboard: ['properties', 'agency-dashboard'] as const,
  property: (id: string) => ['properties', 'detail', id] as const,
  pricing: ['pricing'] as const,
  pricingFor: (market: Market) => ['pricing', market] as const,
  /**
   * Under `properties` on purpose, like the agency dashboard: the listings I can still publish change when I add one or
   * pay for a plan, and those already refresh everything under `properties`.
   */
  wallet: ['properties', 'wallet'] as const,
  referral: ['referral'] as const,
  /** Everything about a listing's owner number: the allowance and who has been revealed. A payment or a reveal refreshes it all. */
  contact: ['contact'] as const,
  contactFor: (propertyId: string) => ['contact', propertyId] as const,
  /** Everything chat. Signing out removes it all. */
  chat: ['chat'] as const,
  conversations: ['chat', 'conversations'] as const,
  messages: (conversationId: string) =>
    ['chat', 'messages', conversationId] as const,
  chatCapabilities: ['chat', 'capabilities'] as const,
  templates: ['chat', 'templates'] as const,
  agencyPins: ['agency-map-pins'] as const,
  myFeedback: ['feedback', 'mine'] as const,
  welcomeQuote: (language: string) => ['welcome-quote', language] as const,
};

const nextPage = (last: Paginated<Property>) =>
  last.meta.page < last.meta.total_pages ? last.meta.page + 1 : undefined;

export const flattenPages = (
  data: InfiniteData<Paginated<Property>> | undefined,
): Property[] => data?.pages.flatMap(page => page.data) ?? [];

export function usePropertyList(filters: PropertyFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.list(filters),
    queryFn: ({ pageParam }) => listProperties(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled,
  });
}

/** The API's largest page: the map wants listings quickly, and each page is one more round trip. */
export const MAP_PAGE_SIZE = 50;

/**
 * The listings inside one area of the map (and matching the other filters), 50 to a page.
 *
 * While the next area loads, the previous one stays on screen (so panning never blanks the map). That only
 * holds for the same filters: a changed filter must not show the old filter's pins as if they matched.
 */
export function useMapProperties(
  filters: PropertyFilters,
  area: Area,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.map(filters, area),
    queryFn: ({ pageParam }) =>
      listProperties({ ...filters, ...area }, pageParam, MAP_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled,
    placeholderData: (previous, previousQuery) => {
      const before = previousQuery?.queryKey[2];
      return before !== undefined &&
        JSON.stringify(before) === JSON.stringify(filters)
        ? previous
        : undefined;
    },
  });
}

export function useMyProperties(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.mine,
    queryFn: ({ pageParam }) => listMyProperties(pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled,
  });
}

export function usePropertyDetail(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.property(id),
    queryFn: () => getProperty(id),
    enabled,
  });
}

/** What I have left to publish with (the wallet: listing quota, plan). Never trusted when old: it moves as I publish. */
export function useWallet(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.wallet,
    queryFn: getWallet,
    enabled,
    staleTime: 0,
  });
}

export function usePricing(enabled = true) {
  // The price list is in the money of the country the person works in (a card-to-card payment in toman for Iran).
  const market = useActiveMarket();
  return useQuery({
    queryKey: queryKeys.pricingFor(market),
    queryFn: () => getPricing(market),
    staleTime: 5 * 60_000,
    enabled,
  });
}

/**
 * Offices for the home map. They change rarely (an office verifies or places its pin once), so a few minutes
 * old is fine; the server also lets proxies cache for a minute. A failure is not worth an error screen: the
 * map just shows the listings without offices.
 */
export function useAgencyMapPins(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.agencyPins,
    queryFn: listAgencyMapPins,
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** The agency CRM home: listing counts, views, subscription days left, top listings. */
export function useAgencyDashboard(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.agencyDashboard,
    queryFn: getAgencyDashboard,
    enabled,
    // Views and subscription days move on their own, so never trust an old answer.
    staleTime: 0,
  });
}

/**
 * The text of the first-launch welcome card. "Nothing to show" (404) is an answer, not a failure, so it is not
 * retried; the card then uses the app's built-in text.
 */
export function useWelcomeQuote(language: Language, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.welcomeQuote(language),
    queryFn: () => getWelcomeQuote(language),
    enabled,
    retry: (count, error) =>
      count < 1 && !(error instanceof ApiError && error.status === 404),
    // The card is shown once per account, and re-reading it would only change the text under the reader.
    staleTime: Infinity,
    gcTime: 0,
  });
}

/** My referral code and who joined with it. */
export function useReferralSummary(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.referral,
    queryFn: getReferralSummary,
    enabled,
    // Friends join and tokens get spent without this screen knowing, so never trust an old answer.
    staleTime: 0,
  });
}

/** Whether I can already see this listing's number and what is left of today's free reveals. */
export function useContactAccess(propertyId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.contactFor(propertyId),
    queryFn: () => getContactAccess(propertyId),
    enabled,
    // The allowance changes whenever I reveal anything, anywhere, and refills at midnight.
    staleTime: 0,
  });
}

/** My conversations that have at least one message. The chat socket keeps it fresh. */
export function useConversations(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: listConversations,
    enabled,
    staleTime: 0,
  });
}

/** What my chat may do (agency perks) and its size limits. */
export function useChatCapabilities(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.chatCapabilities,
    queryFn: getChatCapabilities,
    enabled,
    // Subscribing (or the subscription ending) changes this.
    staleTime: 60_000,
  });
}

/** My saved replies. Agencies with a subscription only. */
export function useTemplates(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: listTemplates,
    enabled,
    staleTime: 0,
  });
}
