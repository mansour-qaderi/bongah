import React from 'react';
import { useTranslation } from 'react-i18next';
import { LADDERS_PER_LISTING } from '@bongah/shared-types';
import { errorMessage } from '../api/errors';
import { useWallet } from '../api/hooks';
import { formatNumber } from '../i18n/format';
import { useLadderSpend } from '../payments/useLadderSpend';
import Banner from './Banner';
import Button from './Button';
import { showToast } from './Toast';
import { useErrorToast } from './useErrorToast';

/**
 * Shown under a "this month's listings are used up" answer: with seven ladders (نردبان) one more listing opens at
 * once and the save runs again (`onUnlocked`); with fewer, the banner says how the ladders are earned and leads to the
 * invitations.
 */
export default function LadderUnlockBanner({
  onUnlocked,
  onInvite,
}: {
  onUnlocked: () => void;
  onInvite: () => void;
}) {
  const { t } = useTranslation();
  const wallet = useWallet(true);
  const spend = useLadderSpend();
  useErrorToast(spend.error ? errorMessage(spend.error, t) : null, spend.error);

  // Until the count is known there is nothing true to say.
  if (!wallet.data) return null;
  const ladders = wallet.data.ladder_tokens;
  const total = formatNumber(LADDERS_PER_LISTING, 0);
  if (ladders >= LADDERS_PER_LISTING) {
    return (
      <Banner kind="promo" message={t('ladder.unlockOffer', { total })}>
        <Button
          icon="check"
          title={t('ladder.unlockQuota', { total })}
          loading={spend.isPending}
          onPress={() =>
            spend.mutate(
              { purpose: 'LISTING_QUOTA' },
              {
                onSuccess: () => {
                  showToast(t('ladder.unlocked'), 'success');
                  onUnlocked();
                },
              },
            )
          }
        />
      </Banner>
    );
  }
  return (
    <Banner
      kind="promo"
      message={t('ladder.unlockInvite', {
        total,
        count: formatNumber(ladders, 0),
      })}
    >
      <Button
        icon="share"
        variant="outline"
        title={t('ladder.inviteFriends')}
        onPress={onInvite}
      />
    </Banner>
  );
}
