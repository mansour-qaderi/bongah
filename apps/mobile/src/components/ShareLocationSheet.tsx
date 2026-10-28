import React, { useMemo } from 'react';
import { Linking, Share } from 'react-native';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { copyText } from '../share/clipboard';
import {
  buildLocationShare,
  shareWordsFrom,
  telegramShareUrl,
  whatsappShareUrl,
  type SharedPlace,
} from '../share/locationShare';
import ActionMenuSheet from './ActionMenuSheet';
import type { ListingAction } from './ListingCard';
import { showToast } from './Toast';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** What to send; null while there is no position (the sheet then offers nothing). */
  place: SharedPlace | null;
}

/**
 * «Share the property's location»: a sheet to send the exact place to a client in WhatsApp or Telegram (each opens the
 * app's own "send to…" with the message filled in), copy it, or hand it to the phone's share sheet for any other app.
 * The message has the map link, the coordinates as plain text and, for a saved listing, its link.
 */
export default function ShareLocationSheet({ visible, onClose, place }: Props) {
  const { t } = useTranslation();
  const content = useMemo(
    () => (place ? buildLocationShare(place, shareWordsFrom(t as TFunction)) : null),
    [place, t],
  );

  const actions = useMemo<ListingAction[]>(() => {
    if (!content) return [];
    const open = (url: string) => {
      Linking.openURL(url).catch(() =>
        showToast(t('shareLocation.openFailed'), 'error'),
      );
    };
    return [
      {
        label: t('shareLocation.whatsapp'),
        icon: 'chat',
        onPress: () => open(whatsappShareUrl(content.text)),
      },
      {
        label: t('shareLocation.telegram'),
        icon: 'share',
        onPress: () => open(telegramShareUrl(content.link, content.textWithoutLink)),
      },
      {
        label: t('shareLocation.copy'),
        icon: 'copy',
        onPress: () => {
          copyText(content.text).then(done =>
            done
              ? showToast(t('shareLocation.copied'), 'success')
              : showToast(t('shareLocation.copyFailed'), 'error'),
          );
        },
      },
      {
        label: t('shareLocation.more'),
        icon: 'more',
        onPress: () => {
          // Closing the phone's sheet without choosing is not a failure.
          Share.share(
            { message: content.text },
            { dialogTitle: t('shareLocation.title') },
          ).catch(() => undefined);
        },
      },
    ];
  }, [content, t]);

  return (
    <ActionMenuSheet
      visible={visible && actions.length > 0}
      title={t('shareLocation.title')}
      actions={actions}
      onClose={onClose}
    />
  );
}
