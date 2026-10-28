import { useLocalStorage, readStored, writeStored } from '@/hooks/use-local-storage';
import { api } from '@/lib/api';

/**
 * The listings this browser deleted from "My listings".
 *
 * The API has no "deleted" state: `DELETE /properties/:id` only archives the listing (the row is kept, because it still
 * counts toward the monthly free quota and payment history points at it), and `GET /properties/mine` returns archived
 * listings like any other. So after a delete the server still lists it, as "inactive". This list keeps a deleted
 * listing out of the table in this browser; the server call is what takes it out of the search for everyone. It
 * mirrors the mobile app (listings/deleted.ts), and only this file has to change when the API grows a real state.
 */
export const DELETED_LISTINGS_KEY = 'bongah.deleted-listings';
const MAX_KEPT = 500;

function clean(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

export function useDeletedListings(): readonly string[] {
  const [ids] = useLocalStorage<string[]>(DELETED_LISTINGS_KEY, []);
  return clean(ids);
}

/** Deletes on the server first; only once it accepted does the listing leave the table. */
export async function deleteListing(id: string): Promise<void> {
  await api.delete(`properties/${id}`);
  const ids = clean(readStored<string[]>(DELETED_LISTINGS_KEY));
  writeStored(DELETED_LISTINGS_KEY, [...new Set([...ids, id])].slice(-MAX_KEPT));
}
