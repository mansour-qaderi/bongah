import React from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { ChatConversation } from '@bongah/shared-types';
import { errorMessage } from '../../api/errors';
import { useConversations } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Button from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { messagePreview } from '../../chat/preview';
import { formatNumber, formatTime } from '../../i18n/format';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Messages'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function ChatListScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const query = useConversations(status === 'signedIn');

  if (status !== 'signedIn') {
    return (
      <EmptyView message={t('chat.signInHint')}>
        <Button
          title={t('auth.signIn')}
          onPress={() => navigation.navigate('Auth')}
        />
      </EmptyView>
    );
  }
  if (query.isPending) return <LoadingView />;
  if (query.isError)
    return (
      <ErrorView
        message={errorMessage(query.error, t)}
        onRetry={() => query.refetch()}
      />
    );

  const open = (conversation: ChatConversation) =>
    navigation.navigate('Chat', { conversation });

  return (
    <Screen edges={['left', 'right']}>
      <FlatList
        data={query.data}
        keyExtractor={conversation => conversation.id}
        contentContainerStyle={styles.list}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        ListEmptyComponent={<EmptyView message={t('chat.empty')} />}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            myId={user?.id}
            onPress={() => open(item)}
          />
        )}
      />
    </Screen>
  );
}

function ConversationRow({
  conversation,
  myId,
  onPress,
}: {
  conversation: ChatConversation;
  myId: string | undefined;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const {
    property,
    counterpart,
    last_message: last,
    unread_count,
  } = conversation;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${counterpart.name ?? t('chat.counterpart')} · ${
        property.title
      }`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {property.cover_image ? (
        <Image source={{ uri: property.cover_image }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.noThumb]} />
      )}
      <View style={styles.main}>
        <View style={styles.line}>
          <AppText variant="label" numberOfLines={1} style={styles.name}>
            {counterpart.name ?? t('chat.counterpart')}
          </AppText>
          {conversation.last_message_at ? (
            <AppText variant="caption" color={colors.textMuted}>
              {formatTime(conversation.last_message_at)}
            </AppText>
          ) : null}
        </View>
        <AppText variant="caption" color={colors.primaryDark} numberOfLines={1}>
          {property.title}
        </AppText>
        <View style={styles.line}>
          <AppText
            variant="caption"
            color={unread_count > 0 ? colors.text : colors.textMuted}
            numberOfLines={1}
            style={styles.preview}
          >
            {last ? messagePreview(last, myId, t) : ''}
          </AppText>
          {unread_count > 0 ? (
            <View
              style={styles.badge}
              accessibilityLabel={String(unread_count)}
            >
              <AppText variant="caption" color={colors.textOnPrimary}>
                {formatNumber(unread_count, 0)}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.85 },
  thumb: { width: 56, height: 56, borderRadius: radius.md },
  noThumb: { backgroundColor: colors.primarySoft },
  main: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1 },
  preview: { flex: 1 },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
