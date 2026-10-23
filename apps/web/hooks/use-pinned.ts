'use client';

import { useLocalStorage } from './use-local-storage';
import type { DealType, Currency } from '@bongah/shared-types';
import type { PinnedDefaults } from '@/lib/import/types';

export interface Pinned extends PinnedDefaults {
  /** Keep these values after «ذخیره و ثبت بعدی» (on), or clear them with the rest of the form (off). */
  locked: boolean;
  /** The office's own pin, offered as the starting point for a listing's map position. */
  office_lat: string;
  office_lng: string;
}

export const DEFAULT_PINNED: Pinned = {
  locked: true,
  province: '',
  district: '',
  deal_type: 'SALE' satisfies DealType,
  currency: 'USD' satisfies Currency,
  office_lat: '',
  office_lng: '',
};

/** What the agent keeps fixed while entering many listings. Saved in this browser. */
export function usePinned() {
  const [pinned, set] = useLocalStorage<Pinned>('bongah.pinned.v1', DEFAULT_PINNED);
  const merged = { ...DEFAULT_PINNED, ...pinned };
  return [merged, (patch: Partial<Pinned>) => set({ ...merged, ...patch })] as const;
}
