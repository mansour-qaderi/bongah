import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { updatePreferences } from '../api/endpoints';
import { useWelcomeQuote } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { useFormat } from '../i18n/useFormat';
import { enablePush } from '../push/registration';
import { KV_KEYS, kv } from '../storage/kv';
import WelcomeModal from './WelcomeModal';

/** If the quote has not arrived by then, the card opens with the built-in text rather than keep the person waiting. */
const QUOTE_WAIT_MS = 1500;

/**
 * Decides when the first-time card appears, and what closing it does.
 *
 * Shown when all of these hold: someone is signed in, the server says they have not seen it
 * (`has_seen_welcome === false`; a saved session from before the flag existed has no value and never shows it),
 * this phone has no record of showing it, and the main screens are in front (not the sign-in sheet that may still be
 * closing, which would stack two sheets).
 *
 * Closing marks it seen at once on this phone, then tells the server; if the server cannot be reached the flag is
 * sent on a later launch, and in between the card does not come back.
 */
export default function WelcomeGate() {
  const { t } = useTranslation();
  const { user, status, updateUser } = useAuth();
  const { language } = useFormat();
  const focused = useIsFocused();

  const userId = user?.id ?? null;
  const unseenOnServer = status === 'signedIn' && user?.has_seen_welcome === false;

  // What this phone remembers, per account: undefined until it has been read.
  const [seenLocally, setSeenLocally] = useState<{ userId: string; seen: boolean } | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);
  // The text is fixed the moment the card opens: a quote arriving late must not change it under the reader.
  const [shownQuote, setShownQuote] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !unseenOnServer) return;
    let cancelled = false;
    kv.get(KV_KEYS.welcomeSeen(userId)).then(value => {
      if (!cancelled) setSeenLocally({ userId, seen: value === '1' });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, unseenOnServer]);

  const localKnown = seenLocally?.userId === userId ? seenLocally.seen : null;
  const eligible =
    unseenOnServer && localKnown === false && dismissedFor !== userId && focused;

  const quote = useWelcomeQuote(language, eligible);
  const settled = quote.isSuccess || quote.isError;

  useEffect(() => {
    if (!eligible) {
      setWaited(false);
      return;
    }
    const timer = setTimeout(() => setWaited(true), QUOTE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [eligible]);

  const ready = eligible && (settled || waited);
  useEffect(() => {
    if (ready && shownQuote === null) {
      setShownQuote(quote.data?.text ?? t('welcome.fallbackQuote'));
    }
    if (!eligible && shownQuote !== null) setShownQuote(null);
  }, [ready, eligible, shownQuote, quote.data, t]);

  // The server never got the flag last time (we were offline): send it now, quietly.
  const retried = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || !unseenOnServer || localKnown !== true || retried.current === userId) {
      return;
    }
    retried.current = userId;
    updatePreferences({ has_seen_welcome: true })
      .then(updateUser)
      .catch(() => undefined);
  }, [userId, unseenOnServer, localKnown, updateUser]);

  const close = useCallback(
    async (askForNotifications: boolean) => {
      if (!userId || !user) return;
      setDismissedFor(userId);
      await kv.set(KV_KEYS.welcomeSeen(userId), '1');
      try {
        await updateUser(await updatePreferences({ has_seen_welcome: true }));
      } catch {
        // Kept on this phone; sent again on the next launch (see above).
      }
      // After the card is gone, so the system prompt is not fighting it for the screen.
      if (askForNotifications && user.enable_daily_motivation !== false) {
        await enablePush(language);
      }
    },
    [userId, user, updateUser, language],
  );

  return (
    <WelcomeModal
      visible={ready && shownQuote !== null && dismissedFor !== userId}
      quote={shownQuote ?? ''}
      onStart={() => close(true)}
      onClose={() => close(false)}
    />
  );
}
