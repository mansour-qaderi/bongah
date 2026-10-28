import { useSyncExternalStore } from 'react';

/**
 * The manual payment the "pay by hand" dialog is showing, if any: just its id. What the dialog shows (the amount, where
 * to send the money, whether a receipt is already on file) it reads from the API, so it is always the server's word and
 * a customer who comes back to an unpaid payment sees the same thing as one who has just started it.
 */
let openId: string | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export function openManualPayment(id: string): void {
  openId = id;
  emit();
}

export function closeManualPayment(): void {
  openId = null;
  emit();
}

export function useOpenManualPayment(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => openId,
    () => null,
  );
}
