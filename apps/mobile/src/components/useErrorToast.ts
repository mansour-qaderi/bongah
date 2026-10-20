import { useEffect } from 'react';
import { showToast } from './Toast';

/**
 * Shows `message` as a toast whenever it changes to something new, and does nothing while it is empty. A screen keeps
 * the message it would have drawn as a red banner in its state (or derives it from a failed request) and hands it
 * here; the same text twice in a row is shown once unless a new failure arrives (see `occurrence`), because the
 * screen clears the message before the next attempt. `occurrence` is for an error that can repeat with the same text
 * and without being cleared in between: pass the error object itself (a new failure is a new object) and every failure
 * is shown.
 *
 * For what went wrong with an action (a request failed, a code was refused, a payment could not start): it passes by
 * and the page stays as it was. A state the person has to act on, such as "the prices did not load, retry", is not
 * a toast: it stays on the page with its button.
 */
export function useErrorToast(
  message: string | null | undefined,
  occurrence: unknown = message,
): void {
  useEffect(() => {
    if (message) showToast(message, 'error');
  }, [message, occurrence]);
}
