import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LADDERS_PER_FRAME } from '@bongah/shared-types';
import { errorMessage } from '../api/errors';
import { useWallet } from '../api/hooks';
import { useSafeAuth } from '../auth/useSafeAuth';
import { formatNumber } from '../i18n/format';
import { useLadderSpend } from '../payments/useLadderSpend';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import Button from './Button';
import { showToast } from './Toast';
import { useErrorToast } from './useErrorToast';

/**
 * "Use seven ladders (نردبان) instead of paying": a featured frame («کادر ویژه») on this listing. Drawn only when the
 * person holds seven or more, next to the other ways to pay for the same frame (a frame in stock, the HesabPay payment).
 * Called when the frame is on.
 */
export default function LadderFrameOption({
  propertyId,
  onDone,
}: {
  propertyId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const signedIn = useSafeAuth()?.status === 'signedIn';
  const wallet = useWallet(signedIn);
  const spend = useLadderSpend();
  useErrorToast(spend.error ? errorMessage(spend.error, t) : null, spend.error);

  const ladders = wallet.data?.ladder_tokens ?? 0;
  if (ladders < LADDERS_PER_FRAME) return null;
  const total = formatNumber(LADDERS_PER_FRAME, 0);
  return (
    <View style={styles.box} testID="ladder-frame-option">
      <AppText variant="label" color={colors.primaryDark}>
        {t('ladder.frameOffer', { count: formatNumber(ladders, 0), total })}
      </AppText>
      <Button
        icon="check"
        title={t('ladder.useForFrame', { total })}
        loading={spend.isPending}
        onPress={() =>
          spend.mutate(
            { purpose: 'FEATURED_FRAME', property_id: propertyId },
            {
              onSuccess: done => {
                showToast(
                  t('ladder.frameDone', {
                    count: formatNumber(done.ladders_available, 0),
                  }),
                  'success',
                );
                onDone();
              },
            },
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: spacing.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
});
