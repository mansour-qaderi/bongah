import { useCallback, useSyncExternalStore } from 'react';
import { KV_KEYS, kv } from '../storage/kv';
import type { MapStyleKind } from './style';

/**
 * Which base map the person looks at (the street map or the satellite photographs), kept on the phone.
 *
 * One small shared store, like the saved listings: every map in the app (Home, the listing form's, the details page)
 * follows the same choice at once, and it is still there after a restart. A damaged value means the street map.
 */
let current: MapStyleKind = 'street';
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(listener => listener());

const isKind = (value: unknown): value is MapStyleKind =>
  value === 'street' || value === 'satellite';

/** Reads the saved choice once; later calls share the first read. */
function load(): Promise<void> {
  loading ??= kv.get(KV_KEYS.mapStyle).then(raw => {
    if (isKind(raw) && raw !== current) {
      current = raw;
      emit();
    }
  });
  return loading;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

const snapshot = () => current;

/** Chooses the base map. */
export async function setMapStyle(kind: MapStyleKind): Promise<void> {
  await load();
  if (kind === current) return;
  current = kind;
  emit();
  await kv.set(KV_KEYS.mapStyle, kind);
}

/** For tests: forget the choice held in memory so the next read starts from the store again. */
export function resetMapStyleForTests(): void {
  current = 'street';
  loading = null;
  emit();
}

/** The base map in use, and what pressing the style button does. Re-renders when the choice changes. */
export function useMapStyle() {
  const kind = useSyncExternalStore(subscribe, snapshot, snapshot);
  const toggle = useCallback(
    () => setMapStyle(snapshot() === 'street' ? 'satellite' : 'street'),
    [],
  );
  return { kind, toggle };
}
