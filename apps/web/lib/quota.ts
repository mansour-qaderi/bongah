import type { Wallet } from '@bongah/shared-types';

export interface QuotaSummary {
  /** null: no limit (admin). */
  remaining: number | null;
  limit: number | null;
  used: number;
  extra: number;
  ladders: number;
}

/** Listings the account can still publish (its period's allowance left plus unspent gifts) and its ladders. */
export function summarizeQuota(wallet: Wallet | undefined): QuotaSummary | null {
  if (!wallet) return null;
  const q = wallet.listing_quota;
  if (!q) return { remaining: null, limit: null, used: 0, extra: 0, ladders: wallet.ladder_tokens };
  return {
    remaining: q.limit === null ? null : Math.max(0, q.limit - q.used) + q.extra,
    limit: q.limit,
    used: q.used,
    extra: q.extra,
    ladders: wallet.ladder_tokens,
  };
}
