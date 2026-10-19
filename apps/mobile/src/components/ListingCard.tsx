import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Property, PropertyStatus } from '@bongah/shared-types';
import { formatDate } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { PROPERTY_LINE_ICONS } from '../map/markers';
import { colors, radius, spacing, surfaces } from '../theme';
import ActionMenuSheet from './ActionMenuSheet';
import AppText from './AppText';
import Badge, { badgeTones, DealBadge } from './Badge';
import Icon, { type IconName } from './Icon';
import Price from './Price';
import PropertyFacts, { propertyKind, propertyPlace } from './PropertyFacts';

/**
 * The little dot before a status word: emerald while the listing is live, near-black once the deal is done, grey
 * when it is switched off. The badge itself is always the same quiet white pill, so the only solid-coloured badge
 * on the card is the one that says what kind of deal it is.
 */
const STATUS_DOT: Record<PropertyStatus, string> = {
  ACTIVE: colors.primary,
  SOLD: colors.ink,
  ARCHIVED: colors.textMuted,
};

export interface ListingAction {
  label: string;
  /** A small line icon before the label, so the action reads at a glance. */
  icon?: IconName;
  onPress: () => void;
  /** 'brand' is the useful thing to do next (promote), 'danger' is the one to be careful with (archive). */
  tone?: 'brand' | 'neutral' | 'danger';
  loading?: boolean;
  /** Not pressable right now, for example while another action on the same listing is running. */
  disabled?: boolean;
}

interface Props {
  property: Property;
  onPress: () => void;
  /** The buttons shown on the card: the few things done most often. */
  actions?: ListingAction[];
  /** The rest, behind a "more" button that opens a menu sheet, so the card stays quiet. */
  menu?: ListingAction[];
}

const THUMB = 104;

/**
 * One of the person's own listings, as a flat horizontal card (white, 1 px border, no shadow): the picture beside
 * the title, a row of badges right under it (the kind of property, the deal as a solid pill, and whether it is live as
 * a quiet white pill) and then the price and the place; across the card's width, the kind, area, bedrooms and bathrooms
 * as the same icon grid every listing card uses; under a divider, the things they can do with it (the screen decides
 * which): the main ones as white buttons with an edge, and a "more" button that opens a sheet with the rest.
 * Nothing is drawn over the picture. The top part opens the listing; the buttons act on it. A listing with no
 * picture gets a grey tile with the kind's line icon.
 */
export default function ListingCard({
  property,
  onPress,
  actions,
  menu,
}: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBusy = menu?.some(action => action.loading) ?? false;
  const menuLocked = menu?.some(action => action.disabled) ?? false;
  const image = property.images[0];
  const place = propertyPlace(property, format.province);

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
          <View style={styles.badges} testID="listing-badges">
            <Badge label={propertyKind(property, t)} tone="neutral" />
            <DealBadge deal={property.deal_type} />
            <Badge
              dot
              dotColor={STATUS_DOT[property.status]}
              label={t(`status.${property.status}`)}
              tone="neutral"
            />
            {property.is_featured ? (
              <Badge label={t('property.featured')} tone={badgeTones.warning} />
            ) : null}
          </View>
          <Price
            amount={property.price}
            currency={property.currency}
            variant="title"
            color={colors.primary}
          />
          {place ? (
            <View style={styles.place}>
              <Icon
                name="pin"
                size={14}
                color={colors.textMuted}
                weight={1.9}
              />
              <AppText
                variant="caption"
                color={colors.textMuted}
                numberOfLines={1}
                style={styles.placeText}
              >
                {place}
              </AppText>
            </View>
          ) : null}
        </View>
      </Pressable>

      {/* The same four facts, in the same icon grid, as the Home list and the details page. */}
      <PropertyFacts property={property} withType layout="grid" />

      {property.is_featured && property.featured_until ? (
        <AppText variant="caption" color={colors.accentText}>
          {t('my.featuredUntil', { date: formatDate(property.featured_until) })}
        </AppText>
      ) : null}

      {(actions && actions.length > 0) || (menu && menu.length > 0) ? (
        <View style={styles.actions}>
          {actions?.map(action => (
            <ActionButton key={action.label} {...action} />
          ))}
          {menu && menu.length > 0 ? (
            <Pressable
              testID="listing-more"
              accessibilityRole="button"
              accessibilityLabel={t('my.moreActions')}
              accessibilityState={{ busy: menuBusy, disabled: menuLocked }}
              disabled={menuBusy || menuLocked}
              onPress={() => setMenuOpen(true)}
              style={({ pressed }) => [
                styles.more,
                {
                  opacity: menuBusy
                    ? 0.75
                    : menuLocked
                    ? 0.5
                    : pressed
                    ? 0.75
                    : 1,
                },
              ]}
            >
              {menuBusy ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Icon name="more" size={22} color={colors.text} />
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {menu && menu.length > 0 ? (
        <ActionMenuSheet
          visible={menuOpen}
          title={property.title}
          actions={menu}
          onClose={() => setMenuOpen(false)}
        />
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
  danger: { bg: colors.surface, border: colors.danger, fg: colors.danger },
} as const;

function ActionButton({
  label,
  icon,
  onPress,
  tone = 'neutral',
  loading = false,
  disabled = false,
}: ListingAction) {
  const { bg, border, fg } = TONES[tone];
  const inactive = loading || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: loading ? 0.75 : disabled ? 0.5 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <View style={styles.actionContent}>
          {icon ? <Icon name={icon} size={18} color={fg} weight={1.9} /> : null}
          <AppText variant="label" color={fg} numberOfLines={1}>
            {label}
          </AppText>
        </View>
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
  featured: { borderColor: colors.accentBright },
  top: { flexDirection: 'row', gap: spacing.md },
  pressed: { opacity: 0.85 },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md },
  placeholder: {
    backgroundColor: colors.neutralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, gap: spacing.xs, justifyContent: 'center' },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  placeText: { flexShrink: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Two buttons that share the width, and the "more" button at the end.
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  more: {
    width: 48,
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
  },
  action: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
