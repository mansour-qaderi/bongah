import React, { useEffect, useState } from 'react';
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

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Opens the sign-in screen: the sheet closes itself first. The owner knows its navigation; the sheet does not. */
  onSignIn: () => void;
}

/**
 * "نظرات و پیشنهادات": a sheet with what the message is about (a suggestion, a problem, thanks, anything else) and the
 * message itself. It goes to the Bongah team through `POST /feedback` and needs a signed-in account, so a visitor sees
 * the sign-in prompt instead. After sending, the sheet says thank you and the form starts empty the next time.
 */
export default function FeedbackSheet({ visible, onClose, onSignIn }: Props) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory>('SUGGESTION');
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const mutation = useMutation({ mutationFn: sendFeedback });
  useErrorToast(
    mutation.error ? errorMessage(mutation.error, t) : null,
    mutation.error,
  );

  // Each time the sheet opens it starts clean (a sent message must not come back).
  useEffect(() => {
    if (!visible) return;
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
  const sent = mutation.isSuccess;

  let body: React.ReactNode;
  let footer: React.ReactNode;
  if (!signedIn) {
    body = (
      <EmptyView message={t('auth.signInRequired')}>
        <Button
          title={t('auth.signIn')}
          onPress={() => {
            onClose();
            onSignIn();
          }}
        />
      </EmptyView>
    );
  } else if (sent) {
    body = <EmptyView message={t('feedback.success')} />;
    footer = (
      <Button title={t('common.close')} onPress={onClose} style={styles.main} />
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
