import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  type FeedbackCategory,
} from '@bongah/shared-types';
import { createFeedbackSchema } from '@bongah/validation';
import { sendFeedback } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { APP_VERSION } from '../appInfo';
import { useAuth } from '../auth/AuthContext';
import { formatNumber } from '../i18n/format';
import { colors, spacing } from '../theme';
import AppText from './AppText';
import BottomSheet from './BottomSheet';
import Button from './Button';
import { Chip } from './Chip';
import { KeyboardAwareScrollView } from './KeyboardAware';
import { EmptyView } from './States';
import TextField from './TextField';
import { showToast } from './Toast';
import { useErrorToast } from './useErrorToast';

/** How long the thank-you stays on screen. */
export const THANKS_TOAST_MS = 4000;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Opens the sign-in screen: the sheet closes itself first. The owner knows its navigation; the sheet does not. */
  onSignIn: () => void;
}

/**
 * "نظرات و پیشنهادات": a sheet with what the message is about (a suggestion, a problem, thanks, anything else) and the
 * message itself. It goes to the Bongah team through `POST /feedback` and needs a signed-in account, so a visitor sees
 * the sign-in prompt instead.
 *
 * When the server has taken the message the sheet closes at once and a thank-you toast stays for `THANKS_TOAST_MS`.
 * The toast is shown once the sheet has slid away, not before: a sheet is a native modal with a toast host of its own,
 * and a toast shown while it is still on its way out would be drawn there and vanish with it. A message the server
 * refuses keeps the sheet open, with what was typed still in it, and says why in a toast.
 */
export default function FeedbackSheet({ visible, onClose, onSignIn }: Props) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory>('SUGGESTION');
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  // The thank-you waits for the sheet to be gone (see above); `open` is read from the mutation's callback.
  const thanksPending = useRef(false);
  const open = useRef(visible);
  open.current = visible;
  const thank = () =>
    showToast(t('feedback.thanks'), 'success', THANKS_TOAST_MS);

  const mutation = useMutation({
    mutationFn: sendFeedback,
    onSuccess: () => {
      if (open.current) {
        thanksPending.current = true;
        onClose();
      } else {
        // Closed by hand while the message was on its way: nothing is sliding away any more.
        thank();
      }
    },
  });
  useErrorToast(
    mutation.error ? errorMessage(mutation.error, t) : null,
    mutation.error,
  );

  // Each time the sheet opens it starts clean (a sent message must not come back).
  useEffect(() => {
    if (!visible) return;
    thanksPending.current = false;
    setCategory('SUGGESTION');
    setMessage('');
    setProblem(null);
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = () => {
    const parsed = createFeedbackSchema.safeParse({
      category,
      message,
      app_version: APP_VERSION,
    });
    if (!parsed.success) {
      const tooShort = t('feedback.tooShort', {
        min: formatNumber(FEEDBACK_MIN_LENGTH, 0),
      });
      setProblem(tooShort);
      showToast(tooShort);
      return;
    }
    setProblem(null);
    mutation.mutate(parsed.data);
  };

  const signedIn = status === 'signedIn';

  let body: React.ReactNode;
  let footer: React.ReactNode;
  if (!signedIn) {
    body = (
      <EmptyView message={t('auth.signInRequired')}>
        <Button
          icon="login"
          title={t('auth.signIn')}
          onPress={() => {
            onClose();
            onSignIn();
          }}
        />
      </EmptyView>
    );
  } else {
    body = (
      <KeyboardAwareScrollView contentContainerStyle={styles.content}>
        <AppText color={colors.textMuted}>{t('feedback.intro')}</AppText>

        <AppText variant="label" color={colors.textSecondary}>
          {t('feedback.categoryLabel')}
        </AppText>
        <View style={styles.wrap} testID="feedback-categories">
          {FEEDBACK_CATEGORIES.map(c => (
            <Chip
              compact
              key={c}
              label={t(`feedback.category.${c}`)}
              selected={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </View>

        <TextField
          label={t('feedback.messageLabel')}
          value={message}
          onChangeText={v => {
            setMessage(v);
            setProblem(null);
          }}
          placeholder={t('feedback.messagePlaceholder')}
          multiline
          maxLength={FEEDBACK_MAX_LENGTH}
          invalid={problem !== null}
          helper={t('feedback.counter', {
            count: formatNumber(message.length, 0),
            max: formatNumber(FEEDBACK_MAX_LENGTH, 0),
          })}
          style={styles.message}
        />
      </KeyboardAwareScrollView>
    );
    footer = (
      <Button
        icon="send"
        title={t('feedback.send')}
        onPress={submit}
        loading={mutation.isPending}
        style={styles.main}
      />
    );
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('feedback.title')}
      heightRatio={0.8}
      footer={footer}
      onDismissed={() => {
        if (!thanksPending.current) return;
        thanksPending.current = false;
        thank();
      }}
    >
      {body}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  message: { minHeight: 140 },
  main: { flex: 1 },
});
