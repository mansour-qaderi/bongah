'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { DraftRow } from './types';

export const MAX_DRAFTS = 500;
const KEY = 'bongah.drafts.v1';

const EMPTY: DraftRow[] = [];
let state: DraftRow[] = EMPTY;
let hydrated = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastSaveFailed = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed)) state = parsed.filter((r): r is DraftRow => typeof r === 'object' && r !== null && typeof (r as DraftRow).key === 'string').slice(0, MAX_DRAFTS);
  } catch {
    state = EMPTY;
  }
}

function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (state.length === 0) window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, JSON.stringify(state));
      lastSaveFailed = false;
    } catch {
      lastSaveFailed = true; // storage blocked or full: the drafts stay in this tab only
    }
    emit();
  }, 500);
}

function set(next: DraftRow[]) {
  state = next.length === 0 ? EMPTY : next;
  persistSoon();
  emit();
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  queueMicrotask(listener); // the hydrated rows reach components that rendered with the empty server snapshot
  return () => listeners.delete(listener);
}

export interface DraftActions {
  /** Adds rows; returns how many did not fit under the limit. */
  add: (rows: DraftRow[]) => number;
  update: (key: string, patch: Partial<DraftRow>) => void;
  updateMany: (keys: ReadonlySet<string> | null, patch: Partial<DraftRow>) => void;
  remove: (keys: ReadonlySet<string>) => void;
  clear: () => void;
}

const actions: DraftActions = {
  add(rows) {
    const room = Math.max(0, MAX_DRAFTS - state.length);
    set([...state, ...rows.slice(0, room)]);
    return rows.length - Math.min(rows.length, room);
  },
  update(key, patch) {
    set(state.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  },
  updateMany(keys, patch) {
    set(state.map((r) => (keys === null || keys.has(r.key) ? { ...r, ...patch } : r)));
  },
  remove(keys) {
    set(state.filter((r) => !keys.has(r.key)));
  },
  clear() {
    set([]);
  },
};

/** The listings being prepared, shared by the three entry tabs and kept in the browser between visits. */
export function useDrafts(): { drafts: DraftRow[]; actions: DraftActions; saveFailed: boolean } {
  const drafts = useSyncExternalStore(subscribe, () => (hydrated ? state : EMPTY), () => EMPTY);
  const saveFailed = useSyncExternalStore(subscribe, () => lastSaveFailed, () => false);
  const stable = useCallback(() => actions, []);
  return { drafts, actions: stable(), saveFailed };
}
