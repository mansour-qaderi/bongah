import React from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../api/errors';
import { getAuthToken } from '../api/client';
import { API_BASE_URL } from '../config';
import { formatTime } from '../i18n/format';
import type { ChatItem } from '../chat/outbox';
import { mapsUrl } from '../chat/mapLinks';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import PropertyLocationMap from './PropertyLocationMap';

interface Props {
  item: ChatItem;
  mine: boolean;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
}

/**
 * One chat message. Mine sit on the start side (the right, in this right-to-left app), theirs on
 * the other. A message that is still sending or failed shows that instead of a read tick.
 */
export default function MessageBubble({
  item,
  mine,
  onRetry,
  onDiscard,
}: Props) {
  const { t } = useTranslation();

  // Normalise the two kinds of row into what is drawn.
  const view =
    item.kind === 'sent'
      ? {
          type: item.message.type,
          body: item.message.body,
          lat: item.message.lat,
          lng: item.message.lng,
          imageUri: item.message.image_url
            ? `${API_BASE_URL}${item.message.image_url}`
            : null,
          auth: true,
          time: item.message.created_at,
          autoReply: item.message.is_auto_reply,
          seen: item.message.read_at !== null,
        }
      : {
          type: item.out.type,
          body: item.out.body,
          lat: item.out.lat,
          lng: item.out.lng,
          imageUri: item.out.localUri,
          auth: false,
          time: item.out.createdAt,
          autoReply: false,
          seen: false,
        };
  const out = item.kind === 'outgoing' ? item.out : null;
  const token = getAuthToken();

  return (
    <View style={[styles.row, mine ? styles.mineRow : styles.theirsRow]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        {view.autoReply ? (
          <AppText variant="caption" color={colors.accentText}>
            {t('chat.autoReply')}
          </AppText>
        ) : null}

        {view.type === 'IMAGE' && view.imageUri ? (
          <Image
            accessibilityLabel={t('chat.imageSent')}
            source={
              view.auth && token
                ? {
                    uri: view.imageUri,
                    headers: { Authorization: `Bearer ${token}` },
                  }
                : { uri: view.imageUri }
            }
            style={styles.image}
            resizeMode="cover"
          />
        ) : null}

        {view.type === 'LOCATION' && view.lat !== null && view.lng !== null ? (
          <View style={styles.location}>
            <PropertyLocationMap
              at={{ latitude: view.lat, longitude: view.lng }}
            />
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                Linking.openURL(
                  mapsUrl(view.lat as number, view.lng as number),
                ).catch(() => undefined)
              }
            >
              <AppText variant="label" color={colors.primary}>
                {t('chat.openInMaps')}
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {view.body ? <AppText>{view.body}</AppText> : null}

        <View style={styles.meta}>
          <AppText variant="caption" color={colors.textMuted}>
            {formatTime(view.time)}
          </AppText>
          {mine && !out ? (
            <AppText
              variant="caption"
              color={view.seen ? colors.primary : colors.textMuted}
              accessibilityLabel={
                view.seen ? t('chat.seen') : t('chat.delivered')
              }
            >
              {view.seen ? '✓✓' : '✓'}
            </AppText>
          ) : null}
          {out?.status === 'sending' ? (
            <AppText variant="caption" color={colors.textMuted}>
              {t('chat.sending')}
            </AppText>
          ) : null}
        </View>

        {out?.status === 'failed' ? (
          <View style={styles.failed}>
            <AppText variant="caption" color={colors.danger}>
              {t('chat.failed')} · {errorMessage(out.error, t)}
            </AppText>
            <View style={styles.failedActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => onRetry(out.clientId)}
              >
                <AppText variant="label" color={colors.primary}>
                  {t('chat.tapToRetry')}
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onDiscard(out.clientId)}
              >
                <AppText variant="label" color={colors.danger}>
                  {t('common.delete')}
                </AppText>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.md, paddingVertical: 3 },
  // "start" is the right edge in this right-to-left app.
  mineRow: { alignItems: 'flex-start' },
  theirsRow: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  // Flat chat bubbles: mine is white with an emerald edge, theirs is plain grey. Dark ink reads on both.
  mine: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  theirs: {
    backgroundColor: colors.neutralSoft,
    borderWidth: 1,
    borderColor: colors.neutralSoft,
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  location: { width: 220, gap: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  failed: { gap: spacing.xs },
  failedActions: { flexDirection: 'row', gap: spacing.lg },
});
