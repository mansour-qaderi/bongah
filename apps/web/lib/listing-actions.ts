import { mutate } from 'swr';
import type { BulkResponse, Paginated, Property, PropertyStatus } from '@bongah/shared-types';
import { BULK_MAX_ITEMS } from '@bongah/shared-types';
import { ApiError, api, errorMessage } from './api';

/** Cache keys that show listings or numbers computed from them. */
const isListingsKey = (key: unknown): key is string => typeof key === 'string' && key.startsWith('properties/mine');
const isDerivedKey = (key: unknown): key is string =>
  typeof key === 'string' &&
  (key.startsWith('properties/mine') || key.startsWith('agencies/me/') || key === 'wallet' || key === 'users/me');

/** Re-reads every list and number on screen that depends on the agency's listings. */
export function refreshListingData() {
  return mutate(isDerivedKey);
}

/** Shows a change in every cached list at once (before the server has answered), so the table feels instant. */
export function patchCachedListings(ids: ReadonlySet<string>, patch: Partial<Property>) {
  return mutate<Paginated<Property> | undefined>(
    isListingsKey,
    (current) =>
      current
        ? { ...current, data: current.data.map((p) => (ids.has(p.id) ? { ...p, ...patch } : p)) }
        : current,
    { revalidate: false },
  );
}

export type ListingPatch = Partial<
  Pick<Property, 'title' | 'price' | 'currency' | 'status' | 'lat' | 'lng' | 'description' | 'area_sqm'>
>;

export function updateListing(id: string, patch: ListingPatch): Promise<Property> {
  return api.patch<Property>(`properties/${id}`, patch);
}

export interface BulkOutcome {
  succeeded: string[];
  failed: { id: string; message: string }[];
}

/** Runs `worker` over `items` with at most `limit` in flight. */
export async function pooled<T>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
}

/**
 * Applies the same change to many listings. Uses the bulk endpoint (50 per request) when the account has the agency
 * plan, and falls back to one request per listing when it does not, so the table works for every office.
 */
export async function updateMany(
  ids: readonly string[],
  patch: ListingPatch,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkOutcome> {
  const outcome: BulkOutcome = { succeeded: [], failed: [] };
  let done = 0;
  const tick = (n: number) => {
    done += n;
    onProgress?.(done, ids.length);
  };

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += BULK_MAX_ITEMS) chunks.push(ids.slice(i, i + BULK_MAX_ITEMS) as string[]);

  let useBulk = true;
  for (const chunk of chunks) {
    if (useBulk) {
      try {
        const res = await api.patch<BulkResponse<Property>>('agencies/me/properties/bulk', {
          items: chunk.map((id) => ({ id, ...patch })),
        });
        for (const row of res.results) {
          const id = chunk[row.index]!;
          if (row.ok) outcome.succeeded.push(id);
          else outcome.failed.push({ id, message: row.message });
        }
        tick(chunk.length);
        continue;
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 403 && error.code === 'PERKS_REQUIRED')) {
          // Anything else (rate limit, network) stops the run; what was not done yet is reported as failed.
          const message = errorMessage(error);
          for (const rest of chunks.slice(chunks.indexOf(chunk))) for (const id of rest) outcome.failed.push({ id, message });
          return outcome;
        }
        useBulk = false; // no agency plan: one by one below
      }
    }
    await pooled(chunk, 4, async (id) => {
      try {
        await updateListing(id, patch);
        outcome.succeeded.push(id);
      } catch (error) {
        outcome.failed.push({ id, message: errorMessage(error) });
      }
      tick(1);
    });
  }
  return outcome;
}

/** Archive ("delete") many listings. Archived listings leave every list but their views still count. */
export async function archiveMany(ids: readonly string[], onProgress?: (done: number, total: number) => void) {
  return updateMany(ids, { status: 'ARCHIVED' satisfies PropertyStatus }, onProgress);
}

/** Runs a request, waiting out the API's rate limit (429 + Retry-After) a few times before giving up. */
export async function withBackoff<T>(run: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 429 || i >= attempts) throw error;
      const waitSeconds = Math.min(65, Math.max(2, error.retryAfter ?? 10));
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    }
  }
}

export type FeaturedSource = 'credits' | 'ladders';

/**
 * Puts the featured frame (کادر ویژه) on each listing, one after the other (each spends from the same balance, so they
 * must not race). Stops at the first "not enough" answer; what was not done is reported as failed.
 */
export async function applyFeatured(
  ids: readonly string[],
  source: FeaturedSource,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkOutcome> {
  const outcome: BulkOutcome = { succeeded: [], failed: [] };
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    try {
      await withBackoff(() =>
        source === 'credits'
          ? api.post('hesabpay/featured-credits/use', { property_id: id })
          : api.post('rewards/ladders/spend', { purpose: 'FEATURED_FRAME', property_id: id }),
      );
      outcome.succeeded.push(id);
    } catch (error) {
      const message = errorMessage(error);
      outcome.failed.push({ id, message });
      if (error instanceof ApiError && (error.code === 'NO_FEATURED_CREDITS' || error.code === 'NOT_ENOUGH_LADDERS')) {
        for (const rest of ids.slice(i + 1)) outcome.failed.push({ id: rest, message });
        onProgress?.(ids.length, ids.length);
        return outcome;
      }
    }
    onProgress?.(i + 1, ids.length);
  }
  return outcome;
}

/** Every listing matching a list query (all pages, 50 at a time), for «select all results». */
export async function fetchAllListings(query: Record<string, string | number | undefined>, max = 2000): Promise<Property[]> {
  const all: Property[] = [];
  for (let page = 1; all.length < max; page++) {
    const res = await api.get<Paginated<Property>>('properties/mine', { query: { ...query, page, limit: 50 } });
    all.push(...res.data);
    if (page >= res.meta.total_pages) break;
  }
  return all.slice(0, max);
}
