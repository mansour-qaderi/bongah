import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
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
import Avatar from '../../components/Avatar';
import { Screen } from '../../components/Screen';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { messagePreview } from '../../chat/preview';
import { chatStamp, formatNumber } from '../../i18n/format';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, radius, spacing, surfaces } from '../../theme';

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
          icon="login"
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
  const name = counterpart.name ?? t('chat.counterpart');
  const unread = unread_count > 0;
  const stamp = conversation.last_message_at
    ? chatStamp(conversation.last_message_at)
    : null;
  const stampText =
    stamp === null
      ? ''
      : stamp.kind === 'yesterday'
      ? t('chat.yesterday')
      : stamp.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name} · ${property.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar name={name} seed={counterpart.id} size={52} />
      <View style={styles.main}>
        <View style={styles.line}>
          <AppText
            variant="label"
            numberOfLines={1}
            style={[styles.name, unread ? styles.strong : null]}
          >
            {name}
          </AppText>
          {stampText ? (
            <AppText
              variant="caption"
              color={unread ? colors.primary : colors.textMuted}
            >
              {stampText}
            </AppText>
          ) : null}
        </View>
        <AppText variant="caption" color={colors.primaryDark} numberOfLines={1}>
          {property.title}
        </AppText>
        <View style={styles.line}>
          <AppText
            variant="caption"
            color={unread ? colors.text : colors.textMuted}
            numberOfLines={1}
            style={styles.preview}
          >
            {last ? messagePreview(last, myId, t) : ''}
          </AppText>
          {unread ? (
            <View
              style={styles.badge}
              accessibilityLabel={t('chat.unread', { count: unread_count })}
            >
              <AppText variant="caption" color={colors.textOnPrimary}>
                {formatNumber(Math.min(unread_count, 99), 0)}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, paddingVertical: spacing.md, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm + 2,
    ...surfaces.tile,
  },
  pressed: { opacity: 0.85 },
  main: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1 },
  strong: { fontWeight: '700' },
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
