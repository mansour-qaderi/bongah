'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import type {
  AgencyMapPin,
  AgencyAnalytics,
  AgencyDashboard,
  AgencyMapListings,
  Paginated,
  Pricing,
  ReferralSummary,
  PaymentSummary,
  Property,
  User,
  Wallet,
} from '@bongah/shared-types';
import { fetcher } from '@/lib/api';

/**
 * How the panel stays in step with the phone app: both read and write the same API (and so the same database). The
 * panel re-reads when the tab regains focus, when the network returns, and on a timer while the tab is open, so a
 * listing a phone just changed shows up here within a minute, and the reverse is true for the phone.
 */
export const SYNC_INTERVAL_MS = 60_000;

const live: SWRConfiguration = {
  refreshInterval: SYNC_INTERVAL_MS,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 5_000,
  keepPreviousData: true,
};

export const useMe = () => useSWR<User>('users/me', fetcher, { ...live, refreshInterval: 5 * 60_000 });
export const useWallet = () => useSWR<Wallet>('wallet', fetcher, live);
export const usePricing = () => useSWR<Pricing>('hesabpay/pricing', fetcher, { ...live, refreshInterval: 0 });
export const useDashboard = () => useSWR<AgencyDashboard>('agencies/me/dashboard', fetcher, live);
export const useAnalytics = (days: 7 | 30 | 90) =>
  useSWR<AgencyAnalytics>(`agencies/me/analytics?days=${days}`, fetcher, live);
export const useReferrals = () => useSWR<ReferralSummary>('referrals/me', fetcher, { ...live, refreshInterval: 5 * 60_000 });
export const usePayments = (page = 1) =>
  useSWR<Paginated<PaymentSummary>>(`hesabpay/payments?page=${page}&limit=10`, fetcher, live);
export const useMapListings = () => useSWR<AgencyMapListings>('agencies/me/properties/map', fetcher, live);
export const useOfficePin = (agencyId: string | undefined) =>
  useSWR<AgencyMapPin[]>(agencyId ? 'agencies/map' : null, fetcher, { ...live, refreshInterval: 0 });

export type ListingsPage = Paginated<Property>;
