import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Property, PropertyStatus } from '@bongah/shared-types';
import { formatDate } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { propertyLineIcon } from '../map/markers';
import { colors, radius, spacing, surfaces } from '../theme';
import ActionMenuSheet from './ActionMenuSheet';
import AppText from './AppText';
import Badge, { badgeTones, DealBadge } from './Badge';
import CircleIconButton from './CircleIconButton';
import Icon, { type IconName } from './Icon';
import { LISTING_THUMB } from './layoutSizes';
import Price from './Price';
import PropertyFacts, { propertyPlace } from './PropertyFacts';

/**
 * The little dot before a status word: emerald while the listing is live, near-black once the deal is done, grey
 * when it is switched off. The badge itself is always the same quiet white pill, drawn in the top-left corner of the
 * picture.
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

/**
 * One of the person's own listings, as a flat card (white, 1 px border, no shadow). The top is three parts side by
 * side: the picture (at the start, on the right), the main body (the title, the price and the place), and a narrow column at the far end (the top-left corner, since the app
 * reads right to left): the deal's tag (for sale, rent, mortgage; the "featured" badge under it when the listing is
 * promoted) and, directly under the tag, the things they can do with the listing, stacked one above the other (round
 * white buttons with one line icon each and no words, the same design as the bookmark ribbon on the Home list; the
 * screen decides which: the main ones, and a "more" button that opens a sheet with the rest). Nothing is above the
 * picture, and the picture is a compact fixed square that never stretches with the column beside it. The listing's status (active, traded, switched off) is a quiet white pill on the picture; below come the
 * kind, area, bedrooms and bathrooms, said once, in the icon grid every listing card uses, and at the foot the description
 * (a few lines, collapsed when there is none). No rules between the parts,
 * only space. The picture and the title open the listing; the buttons act on it. A listing with no picture gets a grey
 * tile with the kind's line icon.
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
  const description = property.description?.trim() ?? '';

  return (
    <View style={[styles.card, property.is_featured ? styles.featured : null]}>
      {/* The picture on one side; on the other, the deal's tag, directly under it the things that can be done with
          the listing (nothing sits above the picture), then the title, the price and the place. */}
      <View style={styles.top} testID="listing-top">
        {/* The picture opens the listing for a finger; the title below it is what a screen reader announces. */}
        <Pressable
          accessible={false}
          onPress={onPress}
          style={styles.media}
          testID="listing-media"
        >
          {image ? (
            <Image source={{ uri: image }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.placeholder]}>
              <Icon
                name={propertyLineIcon(property.type)}
                size={36}
                color={colors.textMuted}
                weight={1.4}
              />
            </View>
          )}
          <View
            style={styles.status}
            pointerEvents="none"
            testID="listing-status"
          >
            <Badge
              dot
              dotColor={STATUS_DOT[property.status]}
              label={t(`status.${property.status}`)}
              tone="neutral"
            />
          </View>
        </Pressable>
        <View style={styles.main} testID="listing-main">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={property.title}
            onPress={onPress}
            style={({ pressed }) => [
              styles.text,
              pressed ? styles.pressed : null,
            ]}
          >
            <AppText variant="label" numberOfLines={2}>
              {property.title}
            </AppText>
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
          </Pressable>
        </View>
        {/* The far-end column: the tag at the very top, the buttons stacked directly under it. */}
        <View style={styles.side} testID="listing-side">
          <View style={styles.tags} testID="listing-tags">
            <DealBadge deal={property.deal_type} />
            {property.is_featured ? (
              <Badge label={t('property.featured')} tone={badgeTones.warning} />
            ) : null}
          </View>
          {(actions && actions.length > 0) || (menu && menu.length > 0) ? (
            <View style={styles.actions} testID="listing-actions">
              {actions?.map(action => (
                <ActionButton key={action.label} {...action} />
              ))}
              {menu && menu.length > 0 ? (
                <CircleIconButton
                  testID="listing-more"
                  icon="more"
                  label={t('my.moreActions')}
                  loading={menuBusy}
                  disabled={menuLocked}
                  onPress={() => setMenuOpen(true)}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {/* The same four facts, in the same icon grid, as the Home list and the details page. */}
      <PropertyFacts
        property={property}
        withType
        withPriceTerms
        layout="grid"
        divider={false}
      />

      {property.is_featured && property.featured_until ? (
        <AppText variant="caption" color={colors.accentText}>
          {t('my.featuredUntil', { date: formatDate(property.featured_until) })}
        </AppText>
      ) : null}

      {description ? (
        <AppText
          variant="bodySm"
          color={colors.textSecondary}
          numberOfLines={2}
          ellipsizeMode="tail"
          testID="card-description"
        >
          {description}
        </AppText>
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

/**
 * One action of a listing, drawn as a round icon button (its words are what a screen reader says). An action given
 * without an icon would have nothing to show, so it falls back to a small bordered word.
 */
function ActionButton({
  label,
  icon,
  onPress,
  tone = 'neutral',
  loading = false,
  disabled = false,
}: ListingAction) {
  if (icon) {
    return (
      <CircleIconButton
        icon={icon}
        label={label}
        tone={tone}
        loading={loading}
        disabled={disabled}
        onPress={onPress}
      />
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading || disabled }}
      disabled={loading || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.wordAction,
        { opacity: loading ? 0.75 : disabled ? 0.5 : pressed ? 0.75 : 1 },
      ]}
    >
      <AppText variant="label" numberOfLines={1}>
        {label}
      </AppText>
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
  // A featured listing is framed in gold, thicker than the 1 px edge of the others, so it is found first in the list.
  featured: { borderColor: colors.accentBright, borderWidth: 2.5 },
  // The picture is a compact square of its own, whatever the column beside it holds: it never stretches.
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  pressed: { opacity: 0.85 },
  media: { width: LISTING_THUMB, height: LISTING_THUMB },
  thumb: {
    width: LISTING_THUMB,
    height: LISTING_THUMB,
    borderRadius: radius.md,
  },
  text: { gap: spacing.xs },
  // The status pill, in the picture's own top corner (`end`, because the app reads right to left).
  status: { position: 'absolute', top: spacing.xs, end: spacing.xs },
  // The deal's tag, with the "featured" badge under it.
  tags: { alignItems: 'center', gap: spacing.xs },
  placeholder: {
    backgroundColor: colors.neutralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1 },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  placeText: { flexShrink: 1 },
  // The far-end column: as wide as its widest part (the tag), its parts centred on one another.
  side: { alignItems: 'center', gap: spacing.sm },
  // The round icon buttons, stacked one above the other, directly under the tag.
  actions: { alignItems: 'center', gap: spacing.sm },
  wordAction: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
