'use client';

import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Used when localStorage is unavailable (private window, blocked site data): the value lasts for this visit only. */
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {
    /* fall through to memory */
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    if (value === null) memory.delete(key);
    else memory.set(key, value);
  }
  emit();
}

/** Reads a saved JSON value outside React (null when absent or unreadable). */
export function readStored<T>(key: string): T | null {
  const raw = read(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStored<T>(key: string, value: T | null) {
  write(key, value === null ? null : JSON.stringify(value));
}

/**
 * A value kept in localStorage, shared by every component that uses the key. The server render (and the first client
 * render) uses `initial`, so there is no mismatch; the saved value appears right after. Reads and writes never throw.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (next: T) => void] {
  const raw = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key || e.key === null) listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
    () => read(key),
    () => null,
  );

  let value = initial;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = initial;
    }
  }

  const set = useCallback((next: T) => writeStored(key, next), [key]);
  return [value, set];
}
