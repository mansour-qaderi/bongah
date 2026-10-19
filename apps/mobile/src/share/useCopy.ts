import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from './clipboard';

/** How long "copied" stays on the button before it goes back to its normal words. */
export const COPIED_MS = 2000;

/**
 * Copying with feedback: `copy(text)` puts the text on the clipboard, `copied` is true for a couple of seconds
 * afterwards (the button says "کپی شد"), and `failed` is true if the clipboard refused (it clears on the next try).
 * The timer is cleared when the screen goes away.
 */
export function useCopy() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    const ok = await copyText(text);
    setState(ok ? 'copied' : 'failed');
    if (ok) {
      timer.current = setTimeout(() => setState('idle'), COPIED_MS);
    }
    return ok;
  }, []);

  return {
    copy,
    copied: state === 'copied',
    failed: state === 'failed',
  };
}
