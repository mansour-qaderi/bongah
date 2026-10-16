import { useCallback, useSyncExternalStore } from 'react';
import { KV_KEYS, kv } from '../storage/kv';

/**
 * The listings this person has saved (bookmarked), kept on the phone.
 *
 * The server has no "saved listings" yet, so the ids live in the phone's key-value store and survive a restart. It is
 * one small shared store rather than state in each card, so every card that shows the same listing (the list, the map's
 * preview, the details page) agrees at once. When the server grows the feature, only this file has to change.
 */
let saved: readonly string[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(listener => listener());

/** Reads the saved ids once; later calls share the first read. A damaged value is treated as "nothing saved". */
function load(): Promise<void> {
  loading ??= kv.get(KV_KEYS.favorites).then(raw => {
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      const ids = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
      // Anything saved while the read was still running is kept.
      saved = [...new Set([...saved, ...ids])];
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

const snapshot = () => saved;

/** Saves the listing, or un-saves it if it already is. */
export async function toggleSaved(id: string): Promise<void> {
  await load();
  saved = saved.includes(id) ? saved.filter(x => x !== id) : [...saved, id];
  emit();
  await kv.set(KV_KEYS.favorites, JSON.stringify(saved));
}

/** For tests: forget everything held in memory so the next read starts from the store again. */
export function resetSavedForTests(): void {
  saved = [];
  loading = null;
  emit();
}

/** Which listings are saved, and a function to save or un-save one. Re-renders when the saved set changes. */
export function useSaved() {
  const ids = useSyncExternalStore(subscribe, snapshot, snapshot);
  const isSaved = useCallback((id: string) => ids.includes(id), [ids]);
  return { ids, isSaved, toggle: toggleSaved };
}
