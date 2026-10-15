import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { DealType, Property, PropertyStatus } from '@bongah/shared-types';
import { formatDate, formatNumber } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { PROPERTY_LINE_ICONS } from '../map/markers';
import { colors, dealColors, radius, spacing, surfaces } from '../theme';
import AppText from './AppText';
import Badge, { type BadgeTone, type BadgeToneName } from './Badge';
import Icon from './Icon';

/** What a listing's status looks like: the tone of its badge. */
const STATUS_TONE: Record<PropertyStatus, BadgeToneName> = {
  ACTIVE: 'success',
  SOLD: 'info',
  ARCHIVED: 'neutral',
};

/**
 * The deal badge: the deal's own tint behind a darker ink of the same hue. The map's strong deal colours are for
 * fills and icons; as text on their tint two of the three fall short of 4.5:1.
 */
const DEAL_TONE: Record<DealType, BadgeTone> = {
  SALE: { soft: dealColors.SALE.soft, strong: colors.primaryDark },
  RENT: { soft: dealColors.RENT.soft, strong: colors.infoText },
  MORTGAGE_GROWI: {
    soft: dealColors.MORTGAGE_GROWI.soft,
    strong: colors.accentText,
  },
};

export interface ListingAction {
  label: string;
  onPress: () => void;
  /** 'brand' is the useful thing to do next (promote), 'danger' is the one to be careful with (archive). */
  tone?: 'brand' | 'neutral' | 'danger';
  loading?: boolean;
}

interface Props {
  property: Property;
  onPress: () => void;
  actions?: ListingAction[];
}

const THUMB = 104;

/**
 * One of the person's own listings, as a horizontal card: the picture beside what it is and what it costs, a row
 * of badges (kind, deal, whether it is live) and, under a hairline, the few things they can do with it. The top
 * part opens the listing; the buttons act on it. A listing with no picture gets a quiet grey tile with the kind's
 * line icon, not a loud block of colour.
 */
export default function ListingCard({ property, onPress, actions }: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const image = property.images[0];
  const facts = [
    format.area(property.area_sqm),
    property.bedrooms !== null
      ? `${formatNumber(property.bedrooms, 0)} ${t('property.bedrooms')}`
      : null,
  ].filter(Boolean);
  const place = [format.province(property.province), property.district]
    .filter(Boolean)
    .join('، ');

  return (
    <View style={[styles.card, property.is_featured ? styles.featured : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={property.title}
        onPress={onPress}
        style={({ pressed }) => [styles.top, pressed ? styles.pressed : null]}
      >
        {image ? (
          <Image source={{ uri: image }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.placeholder]}>
            <Icon
              name={PROPERTY_LINE_ICONS[property.type]}
              size={36}
              color={colors.textMuted}
              weight={1.4}
            />
          </View>
        )}
        <View style={styles.main}>
          <AppText variant="label" numberOfLines={2}>
            {property.title}
          </AppText>
          <AppText variant="heading" color={colors.primaryDark}>
            {format.price(property.price, property.currency)}
          </AppText>
          {facts.length > 0 ? (
            <AppText
              variant="caption"
              color={colors.textMuted}
              numberOfLines={1}
            >
              {facts.join(' · ')}
            </AppText>
          ) : null}
          {place ? (
            <AppText
              variant="caption"
              color={colors.textMuted}
              numberOfLines={1}
            >
              {place}
            </AppText>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.badges}>
        <Badge label={t(`propertyType.${property.type}`)} tone="neutral" />
        <Badge
          label={t(`dealType.${property.deal_type}`)}
          tone={DEAL_TONE[property.deal_type]}
        />
        <Badge
          dot
          label={t(`status.${property.status}`)}
          tone={STATUS_TONE[property.status]}
        />
        {property.is_featured ? (
          <Badge label={t('property.featured')} tone="warning" />
        ) : null}
      </View>
      {property.is_featured && property.featured_until ? (
        <AppText variant="caption" color={colors.accentText}>
          {t('my.featuredUntil', { date: formatDate(property.featured_until) })}
        </AppText>
      ) : null}

      {actions && actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map(action => (
            <ActionButton key={action.label} {...action} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Each tone: the fill, the edge and the words. */
const TONES = {
  brand: {
    bg: colors.primary,
    border: colors.primary,
    fg: colors.textOnPrimary,
  },
  neutral: { bg: colors.surface, border: colors.border, fg: colors.text },
  danger: {
    bg: colors.dangerSoft,
    border: colors.dangerSoft,
    fg: colors.danger,
  },
} as const;

function ActionButton({
  label,
  onPress,
  tone = 'neutral',
  loading = false,
}: ListingAction) {
  const { bg, border, fg } = TONES[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: pressed || loading ? 0.75 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <AppText variant="label" color={fg}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    ...surfaces.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  featured: { borderColor: colors.accentBright, borderWidth: 1.5 },
  top: { flexDirection: 'row', gap: spacing.md },
  pressed: { opacity: 0.85 },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md },
  placeholder: {
    backgroundColor: colors.neutralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, gap: 2, justifyContent: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
