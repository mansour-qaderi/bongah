import { useSyncExternalStore } from 'react';
import { KV_KEYS, kv } from '../storage/kv';

/**
 * The listings this person deleted from My Listings, kept on the phone.
 *
 * The API has no "deleted" state: `DELETE /properties/:id` only archives the listing (the row is kept, because it
 * still counts toward the monthly free quota and payment history points at it), and `GET /properties/mine` returns
 * archived listings like any other. So after a delete the server still lists the listing, as "inactive". This list
 * is what keeps a deleted listing out of My Listings on this phone; the server call is what takes it out of
 * the search for everyone. Until the API grows a real deleted state, a deleted listing shows up again as
 * "inactive" if the person signs in on another phone or clears the app's data. It follows the same shape as the
 * saved-listings store (favorites/store.ts), and only this file has to change when the server gets the state.
 */
let deleted: readonly string[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(listener => listener());

/** Reads the ids once; later calls share the first read. A damaged value is treated as "nothing deleted". */
function load(): Promise<void> {
  loading ??= kv.get(KV_KEYS.deletedListings).then(raw => {
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      const ids = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
      // Anything deleted while the read was still running is kept.
      deleted = [...new Set([...deleted, ...ids])];
      emit();
    } catch {
      // Unreadable: start empty.
    }
  });
  return loading;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

const snapshot = () => deleted;

/** Remembers that this listing was deleted. Call it after the server has accepted the delete. */
export async function markDeleted(id: string): Promise<void> {
  await load();
  if (deleted.includes(id)) return;
  deleted = [...deleted, id];
  emit();
  await kv.set(KV_KEYS.deletedListings, JSON.stringify(deleted));
}

/** For tests: forget everything held in memory so the next read starts from the store again. */
export function resetDeletedForTests(): void {
  deleted = [];
  loading = null;
  emit();
}

/** The ids of the listings deleted on this phone. Re-renders when one is added. */
export function useDeletedListings(): readonly string[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
