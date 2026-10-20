import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { Currency, SubscriptionPackage } from '@bongah/shared-types';
import { errorMessage } from '../../api/errors';
import { usePricing } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Badge, { badgeTones } from '../../components/Badge';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import PaymentProgress from '../../components/PaymentProgress';
import { ScrollScreen } from '../../components/Screen';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { showToast } from '../../components/Toast';
import { useErrorToast } from '../../components/useErrorToast';
import { formatNumber } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import type { RootStackParamList } from '../../navigation/types';
import { planOffers, type PlanOffer } from '../../payments/plans';
import { usePaymentFlow } from '../../payments/usePaymentFlow';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Upgrade'>;

/**
 * "ارتقای حساب و خرید اشتراک": the subscription plans for real estate agencies, each with its discount, what it
 * includes and the way to pay; above them the launch-gifts banner (while the gifts are still on offer); below them, the featured frame («کادر ویژه برای آگهی», in its gold frame) with the way to its packs. Reached from the Account tab and from the banners that say a free listing is used up. Only an
 * agency can buy a plan; anyone else who taps the button is told so in a toast.
 */
export default function UpgradeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const { user, status } = useAuth();
  const pricing = usePricing();
  const flow = usePaymentFlow();
  const [selected, setSelected] = useState<SubscriptionPackage>('YEARLY');
  useErrorToast(
    flow.startError ? errorMessage(flow.startError, t) : null,
    flow.startError,
  );

  if (status !== 'signedIn') {
    return (
      <EmptyView message={t('auth.signInRequired')}>
        <Button
          icon="login"
          title={t('auth.signIn')}
          onPress={() => navigation.navigate('Auth')}
        />
      </EmptyView>
    );
  }
  if (pricing.isPending) return <LoadingView />;
  if (pricing.isError) {
    return (
      <ErrorView
        message={t('checkout.pricesFailed')}
        onRetry={() => pricing.refetch()}
      />
    );
  }

  if (flow.payment) {
    return (
      <ScrollScreen>
        <PaymentProgress flow={flow} onDone={() => navigation.goBack()} />
      </ScrollScreen>
    );
  }

  const prices = pricing.data;
  const offers = planOffers(prices);
  // If the chosen plan is not on offer (the server sent no price for it), the best of those that are.
  const chosen =
    offers.find(o => o.pkg === selected) ??
    offers.find(o => o.best) ??
    offers[offers.length - 1];
  const isAgency = user?.role === 'AGENCY';
  // The launch gifts are on offer until the account has had them. Only a server that sends the plan contents (and so
  // gives those gifts) may say so: an older one would be promised something it will not deliver.
  const giftsOpen =
    prices.plans !== undefined &&
    user?.first_subscription_bonus_available !== false;

  const buy = () => {
    if (!chosen) return;
    if (!isAgency) {
      showToast(t('upgrade.agenciesOnly'), 'info');
      return;
    }
    flow.begin({ purpose: 'SUBSCRIPTION', package_type: chosen.pkg });
  };

  return (
    <ScrollScreen>
      {giftsOpen ? (
        <View testID="launch-gifts-banner" style={styles.launch}>
          <Icon name="gift" size={24} color={colors.accentText} />
          <AppText
            variant="label"
            color={colors.accentText}
            style={styles.launchText}
          >
            {t('upgrade.launchBanner')}
          </AppText>
        </View>
      ) : null}

      <AppText color={colors.textMuted} style={styles.intro}>
        {t('upgrade.personalFree')}
      </AppText>

      <View accessibilityRole="radiogroup" style={styles.plans}>
        {offers.map(offer => (
          <PlanCard
            key={offer.pkg}
            offer={offer}
            currency={prices.currency}
            gifts={giftsOpen}
            selected={offer.pkg === chosen?.pkg}
            onPress={() => setSelected(offer.pkg)}
          />
        ))}
      </View>

      {chosen ? (
        <Button
          icon="card"
          title={t('upgrade.pay', {
            price: format.price(chosen.price, prices.currency),
          })}
          loading={flow.starting}
          onPress={buy}
        />
      ) : null}

      <View style={styles.promotions}>
        <Pressable
          testID="promo-featured"
          accessibilityRole="button"
          accessibilityLabel={t('frame.title')}
          onPress={() => navigation.navigate('Checkout')}
          style={styles.featured}
        >
          <View style={styles.featuredTop}>
            <AppText variant="label" color={colors.accentText}>
              {t('frame.title')}
            </AppText>
            <Badge
              label={t('upgrade.featuredBadge')}
              tone={badgeTones.warning}
            />
          </View>
          <AppText variant="caption" color={colors.textMuted}>
            {t('frame.topOfList', {
              days: formatNumber(prices.featured_ad_days, 0),
            })}
          </AppText>
          <AppText variant="label" color={colors.accentText}>
            {format.price(prices.featured_ad, prices.currency)}
          </AppText>
        </Pressable>
      </View>
    </ScrollScreen>
  );
}

function PlanCard({
  offer,
  currency,
  gifts,
  selected,
  onPress,
}: {
  offer: PlanOffer;
  currency: Currency;
  /** Whether the launch gifts are still on offer to this account. */
  gifts: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const percent = formatNumber(offer.discountPercent, 0);
  return (
    <Pressable
      testID={`plan-${offer.pkg}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={t(`upgrade.plan.${offer.pkg}`, { percent })}
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <View style={styles.cardText}>
        <AppText
          variant="label"
          color={selected ? colors.primaryDark : colors.text}
        >
          {t(`upgrade.plan.${offer.pkg}`, { percent })}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {t('upgrade.perMonth', {
            price: format.price(Math.round(offer.perMonth), currency),
          })}
        </AppText>
        {offer.benefits ? (
          <View testID={`plan-${offer.pkg}-features`} style={styles.features}>
            <Feature
              text={t('upgrade.feature.listings', {
                count: formatNumber(offer.benefits.listings, 0),
              })}
            />
            {gifts ? (
              <>
                <Feature
                  gift
                  text={t('upgrade.feature.giftListings', {
                    count: formatNumber(offer.benefits.gift_listings, 0),
                  })}
                />
                <Feature
                  gift
                  text={t('frame.giftCount', {
                    count: formatNumber(offer.benefits.gift_featured, 0),
                  })}
                />
              </>
            ) : null}
            {offer.benefits.business_accounting ? (
              <Feature text={t('upgrade.feature.accounting')} />
            ) : null}
            {offer.benefits.public_portfolio ? (
              <Feature text={t('upgrade.feature.portfolio')} />
            ) : null}
          </View>
        ) : null}
        {offer.best ? (
          <View style={styles.badge}>
            <Badge label={t('upgrade.best')} tone={badgeTones.warning} />
          </View>
        ) : null}
      </View>
      <View style={styles.cardPrice}>
        {offer.discountPercent > 0 ? (
          <AppText
            variant="caption"
            color={colors.textMuted}
            style={styles.struck}
          >
            {format.price(offer.listPrice, currency)}
          </AppText>
        ) : null}
        <AppText variant="label" color={colors.primaryDark}>
          {format.price(offer.price, currency)}
        </AppText>
      </View>
    </Pressable>
  );
}

/** One line of what a plan includes: a tick, or a gift for what is given only at launch. */
function Feature({ text, gift = false }: { text: string; gift?: boolean }) {
  return (
    <View style={styles.feature}>
      <Icon
        name={gift ? 'gift' : 'check'}
        size={14}
        color={gift ? colors.accentText : colors.primary}
      />
      <AppText
        variant="caption"
        color={gift ? colors.accentText : colors.textSecondary}
        style={styles.featureText}
      >
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  launch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.accentBright,
    backgroundColor: colors.surface,
  },
  launchText: { flex: 1 },
  features: { gap: spacing.xs, marginTop: spacing.xs },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  featureText: { flex: 1 },
  intro: { marginBottom: spacing.lg },
  plans: { marginBottom: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardSelected: { borderColor: colors.primary },
  cardText: { flex: 1, gap: spacing.xs },
  cardPrice: { alignItems: 'flex-end', gap: spacing.xs },
  badge: { alignSelf: 'flex-start', marginTop: spacing.xs },
  struck: { textDecorationLine: 'line-through' },
  promotions: { marginTop: spacing.xl, gap: spacing.md },
  // The featured listing is the premium offer: a gold frame, thicker than any other card, and its badge.
  featured: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 2.5,
    borderColor: colors.accentBright,
    backgroundColor: colors.surface,
  },
  featuredTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});
