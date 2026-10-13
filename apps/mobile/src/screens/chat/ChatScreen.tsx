import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { launchImageLibrary } from 'react-native-image-picker';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CHAT_IMAGE_TYPES,
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatMessagesPage,
} from '@bongah/shared-types';
import {
  getMessages,
  markConversationRead,
  uploadChatImage,
} from '../../api/endpoints';
import { errorMessage } from '../../api/errors';
import {
  queryKeys,
  useChatCapabilities,
  useConversations,
  useTemplates,
} from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import {
  markReadBy,
  allMessages,
  type MessagesData,
} from '../../chat/messageCache';
import { useChat } from '../../chat/ChatProvider';
import {
  chatItems,
  imageOutgoing,
  locationOutgoing,
  textOutgoing,
  toSendInput,
  type Outgoing,
} from '../../chat/outbox';
import { newClientId } from '../../chat/uuid';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import { Chip, ChipRow } from '../../components/Chip';
import LocationPicker from '../../components/LocationPicker';
import MessageBubble from '../../components/MessageBubble';
import { Screen } from '../../components/Screen';
import { ErrorView, LoadingView } from '../../components/States';
import { TYPING_IDLE_MS } from '../../config';
import { AFGHANISTAN_CAMERA, type Coordinate } from '../../map/geo';
import { useFormat } from '../../i18n/useFormat';
import type { RootStackParamList } from '../../navigation/types';
import { colors, fonts, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

/** A quick reply is shown on a chip trimmed to this many characters; tapping it puts the whole text in the box. */
const CHIP_PREVIEW_LENGTH = 28;

export default function ChatScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { typing, send, setTyping } = useChat();
  const myId = user?.id;

  // The snapshot from the previous screen, kept fresh by the conversation list (the listing may
  // have been closed since).
  const snapshot = route.params.conversation;
  const conversations = useConversations(true);
  const conversation =
    conversations.data?.find(c => c.id === snapshot.id) ?? snapshot;
  const conversationId = snapshot.id;
  const { property } = conversation;

  const capabilities = useChatCapabilities(true);
  const advanced = capabilities.data?.advanced === true;
  const templates = useTemplates(advanced);

  const history = useInfiniteQuery<
    ChatMessagesPage,
    Error,
    InfiniteData<ChatMessagesPage, string | undefined>,
    ReturnType<typeof queryKeys.messages>,
    string | undefined
  >({
    queryKey: queryKeys.messages(conversationId),
    queryFn: ({ pageParam }) => getMessages(conversationId, pageParam),
    initialPageParam: undefined,
    getNextPageParam: last => last.next_cursor ?? undefined,
  });
  const messages = useMemo(() => allMessages(history.data), [history.data]);

  const [outbox, setOutbox] = useState<Outgoing[]>([]);
  const [text, setText] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [notice, setNotice] = useState<unknown>(null);

  // ── sending ──────────────────────────────────────────────────────────────
  const patch = useCallback(
    (clientId: string, change: Partial<Outgoing>) =>
      setOutbox(list =>
        list.map(o => (o.clientId === clientId ? { ...o, ...change } : o)),
      ),
    [],
  );

  const submit = useCallback(
    async (out: Outgoing) => {
      patch(out.clientId, { status: 'sending', error: null });
      try {
        let imageId = out.imageId;
        if (out.type === 'IMAGE' && !imageId) {
          const uploaded = await uploadChatImage(
            out.localUri as string,
            out.contentType as string,
          );
          imageId = uploaded.id;
          patch(out.clientId, { imageId });
        }
        await send(conversationId, toSendInput(out, imageId));
        setOutbox(list => list.filter(o => o.clientId !== out.clientId));
      } catch (error) {
        patch(out.clientId, { status: 'failed', error });
      }
    },
    [conversationId, patch, send],
  );

  const enqueue = useCallback(
    (out: Outgoing) => {
      setOutbox(list => [...list, out]);
      submit(out);
    },
    [submit],
  );

  const retry = (clientId: string) => {
    const out = outbox.find(o => o.clientId === clientId);
    if (out) submit(out);
  };
  const discard = (clientId: string) =>
    setOutbox(list => list.filter(o => o.clientId !== clientId));

  // ── typing signal ────────────────────────────────────────────────────────
  const typingNow = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTyping = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    if (typingNow.current) {
      typingNow.current = false;
      setTyping(conversationId, false);
    }
  }, [conversationId, setTyping]);
  useEffect(() => stopTyping, [stopTyping]);

  const onChangeText = (value: string) => {
    setText(value);
    if (value.trim() === '') {
      stopTyping();
      return;
    }
    if (!typingNow.current) {
      typingNow.current = true;
      setTyping(conversationId, true);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const sendText = () => {
    const body = text.trim();
    if (body === '') return;
    stopTyping();
    setText('');
    enqueue(textOutgoing(newClientId(), body));
  };

  // ── read receipts ────────────────────────────────────────────────────────
  const [focused, setFocused] = useState(() => navigation.isFocused());
  useEffect(() => {
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  const hasUnreadIncoming = messages.some(
    m => m.sender_id !== myId && m.read_at === null,
  );
  const markedFor = useRef<string | null>(null);
  const newestIncoming = messages.find(m => m.sender_id !== myId)?.id ?? null;
  useEffect(() => {
    // Tell the server once per newest incoming message, only while this screen is the one on top
    // and the history is in (before that, "newest" is not known and we would ask twice). The
    // conversation list's unread count covers a history whose own copies look read.
    const unreadInList = conversation.unread_count > 0;
    if (!focused || !history.isSuccess) return;
    if (!(hasUnreadIncoming || unreadInList)) return;
    const key = newestIncoming ?? 'none';
    if (markedFor.current === key) return;
    markedFor.current = key;
    markConversationRead(conversationId)
      .then(() => {
        const now = new Date().toISOString();
        if (myId) {
          queryClient.setQueryData<MessagesData>(
            queryKeys.messages(conversationId),
            old => markReadBy(old, myId, now),
          );
        }
        return queryClient.invalidateQueries({
          queryKey: queryKeys.conversations,
        });
      })
      .catch(() => {
        // Not worth a banner; it is retried when the next message arrives or the screen is reopened.
        markedFor.current = null;
      });
  }, [
    focused,
    history.isSuccess,
    hasUnreadIncoming,
    newestIncoming,
    conversation.unread_count,
    conversationId,
    myId,
    queryClient,
  ]);

  // ── attachments ──────────────────────────────────────────────────────────
  const pickPhoto = async () => {
    setAttachOpen(false);
    setNotice(null);
    // The photo is shrunk on the phone before it is sent. Subscribed agencies get a larger,
    // sharper picture; the server enforces the byte limit either way.
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      includeBase64: false,
      maxWidth: advanced ? 2560 : 1280,
      maxHeight: advanced ? 2560 : 1280,
      quality: advanced ? 0.9 : 0.7,
    });
    if (result.didCancel) return;
    const asset = result.assets?.[0];
    if (result.errorCode || !asset?.uri) {
      setNotice(new Error('picker'));
      return;
    }
    const contentType = asset.type ?? '';
    if (!(CHAT_IMAGE_TYPES as readonly string[]).includes(contentType)) {
      setNotice('unsupported');
      return;
    }
    const limit = capabilities.data?.limits.image_max_bytes;
    if (limit !== undefined && (asset.fileSize ?? 0) > limit) {
      setNotice('tooLarge');
      return;
    }
    enqueue(imageOutgoing(newClientId(), asset.uri, contentType));
  };

  const [pin, setPin] = useState<Coordinate | null>(null);
  const [pinOutside, setPinOutside] = useState(false);
  const closePicker = () => {
    setPickingLocation(false);
    setPin(null);
    setPinOutside(false);
  };
  const sendPin = () => {
    if (!pin) return;
    enqueue(locationOutgoing(newClientId(), pin.latitude, pin.longitude));
    closePicker();
  };

  // ── drawing ──────────────────────────────────────────────────────────────
  if (history.isPending) return <LoadingView />;
  if (history.isError)
    return (
      <ErrorView
        message={errorMessage(history.error, t)}
        onRetry={() => history.refetch()}
      />
    );

  const items = chatItems(messages, outbox, myId);
  const closed = property.status !== 'ACTIVE';
  const someoneTyping = typing[conversationId] === true;
  const noticeText =
    notice === 'unsupported'
      ? t('chat.imageUnsupported')
      : notice === 'tooLarge'
      ? t('chat.imageTooLarge')
      : notice
      ? errorMessage(notice, t)
      : null;

  return (
    <Screen edges={['left', 'right']}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.viewListing')}
        onPress={() =>
          navigation.navigate('PropertyDetails', { id: property.id })
        }
        style={styles.property}
      >
        {property.cover_image ? (
          <Image source={{ uri: property.cover_image }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.noCover]} />
        )}
        <View style={styles.propertyText}>
          <AppText variant="label" numberOfLines={1}>
            {property.title}
          </AppText>
          <AppText variant="caption" color={colors.primaryDark}>
            {format.price(property.price, property.currency)}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
            {[format.province(property.province), property.district]
              .filter(Boolean)
              .join('، ')}
          </AppText>
        </View>
        <AppText variant="caption" color={colors.primary}>
          {t('chat.viewListing')}
        </AppText>
      </Pressable>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          inverted
          data={items}
          keyExtractor={item => item.key}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <MessageBubble
              item={item}
              mine={item.kind === 'outgoing' || item.message.sender_id === myId}
              onRetry={retry}
              onDiscard={discard}
            />
          )}
          onEndReached={() => {
            if (history.hasNextPage && !history.isFetchingNextPage)
              history.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            history.isFetchingNextPage ? (
              <ActivityIndicator color={colors.primary} />
            ) : undefined
          }
        />

        {someoneTyping ? (
          <AppText
            variant="caption"
            color={colors.textMuted}
            style={styles.typing}
          >
            {t('chat.typing')}
          </AppText>
        ) : null}

        {noticeText ? (
          <View style={styles.notice}>
            <Banner kind="error" message={noticeText} />
          </View>
        ) : null}

        {closed ? (
          <View style={styles.notice}>
            <Banner kind="info" message={t('chat.listingClosed')} />
          </View>
        ) : (
          <SafeAreaView edges={['bottom']} style={styles.composer}>
            {advanced && (templates.data?.length ?? 0) > 0 ? (
              <View>
                <ChipRow>
                  {templates.data?.map(template => (
                    <Chip
                      key={template.id}
                      label={
                        template.body.length > CHIP_PREVIEW_LENGTH
                          ? `${template.body.slice(0, CHIP_PREVIEW_LENGTH)}…`
                          : template.body
                      }
                      onPress={() => onChangeText(template.body)}
                    />
                  ))}
                  <Chip
                    label={t('chat.manageReplies')}
                    selected
                    onPress={() => navigation.navigate('Templates')}
                  />
                </ChipRow>
              </View>
            ) : null}

            {attachOpen ? (
              <View style={styles.attach}>
                <Button
                  title={t('chat.attachPhoto')}
                  variant="secondary"
                  style={styles.attachButton}
                  onPress={pickPhoto}
                />
                <View style={styles.attachButton}>
                  <Button
                    title={t('chat.attachLocation')}
                    variant="secondary"
                    disabled={!advanced}
                    onPress={() => {
                      setAttachOpen(false);
                      setPickingLocation(true);
                    }}
                  />
                  {!advanced ? (
                    <AppText variant="caption" color={colors.textMuted}>
                      {t('chat.agencyOnly')}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={styles.inputRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('chat.attach')}
                onPress={() => setAttachOpen(open => !open)}
                style={styles.plus}
              >
                <AppText variant="heading" color={colors.primary}>
                  {attachOpen ? '×' : '+'}
                </AppText>
              </Pressable>
              <TextInput
                accessibilityLabel={t('chat.inputLabel')}
                placeholder={t('chat.inputPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={text}
                onChangeText={onChangeText}
                multiline
                maxLength={
                  capabilities.data?.limits.text_max_length ??
                  CHAT_MESSAGE_MAX_LENGTH
                }
                style={styles.input}
              />
              <Button
                title={t('chat.send')}
                disabled={text.trim() === ''}
                onPress={sendText}
                style={styles.send}
              />
            </View>
          </SafeAreaView>
        )}
      </KeyboardAvoidingView>

      <Modal
        visible={pickingLocation}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel={t('common.close')}
            style={styles.backdrop}
            onPress={closePicker}
          />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <AppText variant="heading">{t('chat.locationTitle')}</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {t('chat.locationHint')}
            </AppText>
            {pinOutside ? (
              <Banner kind="error" message={t('chat.locationOutside')} />
            ) : null}
            <LocationPicker
              value={pin}
              camera={AFGHANISTAN_CAMERA}
              onChange={coordinate => {
                setPinOutside(false);
                setPin(coordinate);
              }}
              onOutside={() => setPinOutside(true)}
            />
            <View style={styles.sheetButtons}>
              <Button
                title={t('common.cancel')}
                variant="outline"
                onPress={closePicker}
                style={styles.attachButton}
              />
              <Button
                title={t('chat.locationSend')}
                disabled={!pin}
                onPress={sendPin}
                style={styles.attachButton}
              />
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  property: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cover: { width: 48, height: 48, borderRadius: radius.md },
  noCover: { backgroundColor: colors.primarySoft },
  propertyText: { flex: 1 },
  messages: { paddingVertical: spacing.md },
  typing: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  notice: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  composer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  attach: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  attachButton: { flex: 1 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  plus: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.text,
    textAlignVertical: 'top',
  },
  send: { paddingHorizontal: spacing.md },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetButtons: { flexDirection: 'row', gap: spacing.md },
});
