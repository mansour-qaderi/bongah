'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import type {
  AdminTransactionItem,
  AgencyMapPin,
  AgencyAnalytics,
  AgencyDashboard,
  AgencyMapListings,
  ChatConversation,
  ChatMessagesPage,
  Paginated,
  Pricing,
  ReferralSummary,
  PaymentSummary,
  Property,
  User,
  Wallet,
} from '@bongah/shared-types';
import { fetcher } from '@/lib/api';
import { useActiveMarket } from './use-active-market';

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
/** The prices of the account's market (Iran's are in tomans and paid by card-to-card / Sheba; Afghanistan's in afghanis through HesabPay). */
export const usePricing = () => {
  const market = useActiveMarket();
  return useSWR<Pricing>(`hesabpay/pricing?market=${market}`, fetcher, { ...live, refreshInterval: 0 });
};
export const useDashboard = () => useSWR<AgencyDashboard>('agencies/me/dashboard', fetcher, live);
export const useAnalytics = (days: 7 | 30 | 90) =>
  useSWR<AgencyAnalytics>(`agencies/me/analytics?days=${days}`, fetcher, live);
export const useReferrals = () => useSWR<ReferralSummary>('referrals/me', fetcher, { ...live, refreshInterval: 5 * 60_000 });
export const usePayments = (page = 1) =>
  useSWR<Paginated<PaymentSummary>>(`hesabpay/payments?page=${page}&limit=10`, fetcher, live);
/** The admin's payment log; `waiting` is the queue of manual payments to look at. Only an admin account gets an answer. */
export const useAdminPayments = (opts: { waiting: boolean; q: string; page: number }) => {
  const params = new URLSearchParams({ page: String(opts.page), limit: '20' });
  if (opts.waiting) params.set('awaiting_review', 'true');
  else params.set('method', 'MANUAL');
  if (opts.q) params.set('q', opts.q);
  return useSWR<Paginated<AdminTransactionItem>>(`admin/transactions?${params}`, fetcher, { ...live, refreshInterval: 30_000 });
};
/** The chat inbox. It is polled faster than the rest: someone waiting for an answer is looking at it. */
export const useConversations = () =>
  useSWR<ChatConversation[]>('chat/conversations', fetcher, { ...live, refreshInterval: 10_000, dedupingInterval: 2_000 });
/** The newest messages of one conversation (older ones are loaded on request). Only polls while it is on screen. */
export const useThread = (id: string | null) =>
  useSWR<ChatMessagesPage>(id ? `chat/conversations/${id}/messages?limit=30` : null, fetcher, {
    ...live,
    refreshInterval: 4_000,
    dedupingInterval: 1_000,
  });
export const useMapListings = () => useSWR<AgencyMapListings>('agencies/me/properties/map', fetcher, live);
export const useOfficePin = (agencyId: string | undefined) =>
  useSWR<AgencyMapPin[]>(agencyId ? 'agencies/map' : null, fetcher, { ...live, refreshInterval: 0 });

export type ListingsPage = Paginated<Property>;
