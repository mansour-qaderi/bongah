import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CURRENCIES, type Currency, type Property } from '@bongah/shared-types';
import AppText from '../../components/AppText';
import { formatCurrency, formatNumber } from '../../i18n/format';
import { colors, spacing, surfaces } from '../../theme';

/**
 * What the person's sale listings are worth, per currency. Only listings for sale count: a monthly rent or a pledge
 * is not a price of the property, so adding it to one would make a number that means nothing. There is no exchange
 * rate in the app, so AFN and USD are never added together either.
 */
export function saleValue(
  properties: readonly Property[],
  status: Property['status'],
): Partial<Record<Currency, number>> {
  const total: Partial<Record<Currency, number>> = {};
  for (const property of properties) {
    if (property.status !== status || property.deal_type !== 'SALE') continue;
    total[property.currency] = (total[property.currency] ?? 0) + property.price;
  }
  return total;
}

interface BlockProps {
  testID: string;
  dotColor: string;
  label: string;
  count: number;
  caption: string;
  value: Partial<Record<Currency, number>>;
}

function Block({ testID, dotColor, label, count, caption, value }: BlockProps) {
  const { t } = useTranslation();
  const currencies = CURRENCIES.filter(
    currency => value[currency] !== undefined,
  );
  return (
    <View style={styles.block} testID={testID}>
      <View style={styles.heading}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <AppText variant="label">{label}</AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {t('my.count', { count: formatNumber(count, 0) })}
        </AppText>
      </View>
      <AppText variant="caption" color={colors.textMuted}>
        {caption}
      </AppText>
      {currencies.length === 0 ? (
        <AppText variant="heading" color={colors.textMuted}>
          —
        </AppText>
      ) : (
        currencies.map(currency => (
          <AppText key={currency} variant="heading" color={colors.primaryDark}>
            {formatCurrency(value[currency] ?? 0, currency)}
          </AppText>
        ))
      )}
    </View>
  );
}

/**
 * The top of My Listings: two flat blocks side by side, the live listings and the closed deals, each with how many
 * there are and what the sale listings among them add up to, and one line saying what is (and is not) in the sums.
 */
export default function ListingsSummary({
  properties,
}: {
  properties: readonly Property[];
}) {
  const { t } = useTranslation();
  const count = (status: Property['status']) =>
    properties.filter(property => property.status === status).length;
  return (
    <View style={styles.card} testID="listings-summary">
      <View style={styles.columns}>
        <Block
          testID="summary-active"
          dotColor={colors.primary}
          label={t('status.ACTIVE')}
          count={count('ACTIVE')}
          caption={t('my.valueActive')}
          value={saleValue(properties, 'ACTIVE')}
        />
        <View style={styles.divider} />
        <Block
          testID="summary-sold"
          dotColor={colors.ink}
          label={t('status.SOLD')}
          count={count('SOLD')}
          caption={t('my.valueSold')}
          value={saleValue(properties, 'SOLD')}
        />
      </View>
      <AppText variant="caption" color={colors.textMuted}>
        {t('my.valueNote')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...surfaces.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  columns: { flexDirection: 'row', gap: spacing.md },
  block: { flex: 1, gap: spacing.xs },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  divider: { width: 1, backgroundColor: colors.border },
});
