import React, { useState } from 'react';
import { I18nManager, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useReferralSummary } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Icon from '../../components/Icon';
import { referralLink, shareReferral } from '../../share/referralLink';
import { useCopy } from '../../share/useCopy';
import { colors, radius, spacing } from '../../theme';

/**
 * The invitation banner on the Account tab: "دعوت از دوستان و دریافت نردبان" in solid gold with dark ink (white
 * on gold fails contrast), the person's own invitation link, and two buttons: copy it, or send it through the
 * phone's share sheet. The link is the server's `share_url` when it sends one, otherwise built from the person's
 * unique code (see share/referralLink.ts). Tapping the top of the banner opens the full referral screen (the
 * friends who joined, the rewards earned). While the code is loading, or if it cannot be loaded, only the top
 * shows; the referral screen it opens has the retry.
 */
export default function ReferralBanner({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const query = useReferralSummary(status === 'signedIn');
  const { copy, copied, failed } = useCopy();
  const [shareFailed, setShareFailed] = useState(false);

  const summary = query.data;
  const link = summary ? referralLink(summary) : null;

  const share = async () => {
    if (!summary) return;
    setShareFailed(false);
    setShareFailed(!(await shareReferral(summary, t)));
  };

  return (
    <View style={styles.banner} testID="referral-banner">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('account.inviteLadder')}
        onPress={onOpen}
        style={({ pressed }) => [styles.top, pressed && styles.pressed]}
      >
        <View style={styles.giftDisc}>
          <Icon name="gift" size={24} color={colors.primaryDark} weight={1.8} />
        </View>
        <View style={styles.topText}>
          <AppText variant="section" color={colors.textOnAccent}>
            {t('account.inviteLadder')}
          </AppText>
          <AppText variant="caption" color={colors.textOnAccent}>
            {t('account.inviteLadderHint')}
          </AppText>
        </View>
        <Icon
          name={I18nManager.isRTL ? 'chevronLeft' : 'chevronRight'}
          size={20}
          color={colors.textOnAccent}
          weight={1.8}
        />
      </Pressable>

      {link ? (
        <>
          <View style={styles.linkBox}>
            <AppText variant="caption" color={colors.textMuted}>
              {t('referral.linkLabel')}
            </AppText>
            <AppText
              selectable
              latinDigits
              numberOfLines={1}
              ellipsizeMode="middle"
              testID="referral-link"
              accessibilityLabel={`${t('referral.linkLabel')}: ${link}`}
              style={styles.link}
            >
              {link}
            </AppText>
          </View>
          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('referral.copy')}
              onPress={() => copy(link)}
              style={({ pressed }) => [
                styles.button,
                styles.copyButton,
                pressed && styles.pressed,
              ]}
            >
              <AppText
                variant="label"
                color={colors.textOnAccent}
                accessibilityLiveRegion="polite"
              >
                {copied ? t('referral.copied') : t('referral.copy')}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('referral.share')}
              onPress={share}
              style={({ pressed }) => [
                styles.button,
                styles.shareButton,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                name="share"
                size={18}
                color={colors.textOnPrimary}
                weight={1.9}
              />
              <AppText variant="label" color={colors.textOnPrimary}>
                {t('referral.share')}
              </AppText>
            </Pressable>
          </View>
          {failed || shareFailed ? (
            <AppText
              variant="caption"
              color={colors.textOnAccent}
              accessibilityRole="alert"
            >
              {failed ? t('referral.copyFailed') : t('referral.shareFailed')}
            </AppText>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.accentBright,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  topText: { flex: 1, gap: 2 },
  giftDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  linkBox: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    gap: 2,
  },
  // A web address: Latin letters, so always left-to-right and never converted to Persian digits.
  link: {
    writingDirection: 'ltr',
    textAlign: 'left',
    color: colors.primaryDark,
  },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  button: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  copyButton: { backgroundColor: colors.surface },
  shareButton: { backgroundColor: colors.ink },
  pressed: { opacity: 0.85 },
});
