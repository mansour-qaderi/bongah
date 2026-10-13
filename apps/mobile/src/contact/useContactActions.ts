import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ContactAccess, PropertyContact } from '@bongah/shared-types';
import { isContactLimitReached } from '../api/errors';
import { openConversation, unlockContact } from '../api/endpoints';
import { queryKeys, useContactAccess } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { useRequireAuth } from '../navigation/useRequireAuth';
import {
  propertyRef,
  telUrl,
  whatsappUrl,
  type ContactAction,
} from './contactLinks';

interface Listing {
  id: string;
  title: string;
  /** The owner's user id. */
  user_id: string;
}

/**
 * Everything the "Call / WhatsApp / Chat in App" bar does for one listing.
 *
 * Call and WhatsApp need the owner's number, which is metered:
 *   already revealed today -> use it;
 *   otherwise ask the server to reveal it (free reveals / agency perks) -> use it;
 *   free reveals used up (403) -> open the lock sheet, remember what the person wanted, and do it
 *   once they have paid with a credit.
 * Chat in App never costs a reveal.
 *
 * The answer to "what is left today" lives in one place, the React Query cache for this listing's
 * contact, and is also refreshed from the 403 body, so the bar and the sheet always agree.
 */
export function useContactActions(listing: Listing) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const isOwner = user?.id === listing.user_id;
  const access = useContactAccess(listing.id, user !== null && !isOwner);
  const cacheKey = queryKeys.contactFor(listing.id);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [wanted, setWanted] = useState<ContactAction | null>(null);
  const [openFailed, setOpenFailed] = useState(false);

  const unlock = useMutation({
    mutationFn: () => unlockContact(listing.id, false),
  });
  const open = useMutation({
    mutationFn: () => openConversation(listing.id),
    onSuccess: conversation => navigation.navigate('Chat', { conversation }),
  });

  const run = useCallback(
    (action: ContactAction, contact: PropertyContact) => {
      const url =
        action === 'call'
          ? telUrl(contact.phone_number)
          : whatsappUrl(
              contact.phone_number,
              t('contact.whatsappText', {
                title: listing.title,
                ref: propertyRef(listing.id),
              }),
            );
      Linking.openURL(url).catch(() => setOpenFailed(true));
    },
    [listing.id, listing.title, t],
  );

  const remember = useCallback(
    (result: ContactAccess) => queryClient.setQueryData(cacheKey, result),
    [queryClient, cacheKey],
  );

  const act = useCallback(
    (action: ContactAction) =>
      requireAuth(async () => {
        setOpenFailed(false);
        unlock.reset();
        const known = access.data?.contact;
        if (known) {
          run(action, known);
          return;
        }
        try {
          const result = await unlock.mutateAsync();
          remember(result);
          if (result.contact) run(action, result.contact);
        } catch (error) {
          if (isContactLimitReached(error)) {
            // The 403 carries the up-to-date allowance: store it, and offer credits.
            remember({
              unlocked: false,
              is_owner: false,
              contact: null,
              paid_with: null,
              quota: error.body.quota,
            });
            setWanted(action);
            setSheetOpen(true);
          }
          // Any other failure stays on `unlock.error` for the bar to show.
        }
      }),
    [access.data?.contact, remember, requireAuth, run, unlock],
  );

  return {
    isOwner,
    /** The owner's details once revealed, else null. */
    contact: access.data?.contact ?? null,
    quota: access.data?.quota ?? null,
    call: () => act('call'),
    whatsapp: () => act('whatsapp'),
    chat: () => requireAuth(() => open.mutate()),
    revealing: unlock.isPending,
    openingChat: open.isPending,
    /** Why the last tap failed (show with errorMessage()), unless it was just the limit (the sheet handles that). */
    error:
      (unlock.isError && !isContactLimitReached(unlock.error)
        ? unlock.error
        : null) ?? (open.isError ? open.error : null),
    /** The phone/WhatsApp link could not be opened. */
    openFailed,
    sheetOpen,
    closeSheet: () => {
      setSheetOpen(false);
      setWanted(null);
    },
    /** The sheet revealed the number (with a credit): do what the person originally tapped. */
    finishWanted: (contact: PropertyContact) => {
      const action = wanted;
      setSheetOpen(false);
      setWanted(null);
      if (action) run(action, contact);
    },
    /** Called by the sheet with the result of its own reveal so the cache stays truthful. */
    remember,
  };
}
