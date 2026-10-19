import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Property } from '@bongah/shared-types';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { errorMessage } from '../../api/errors';
import { recordPropertyView } from '../../api/endpoints';
import { usePropertyDetail } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import { useContactActions } from '../../contact/useContactActions';
import AppText from '../../components/AppText';
import Button from '../../components/Button';
import Badge, { badgeTones, DealBadge } from '../../components/Badge';
import BookmarkButton from '../../components/BookmarkButton';
import ContactActionBar from '../../components/ContactActionBar';
import ContactLockSheet from '../../components/ContactLockSheet';
import Icon from '../../components/Icon';
import { JeribConversion } from '../../components/JeribInfo';
import Price from '../../components/Price';
import PromotionSheet from '../../components/PromotionSheet';
import PropertyFacts, { propertyPlace } from '../../components/PropertyFacts';
import PropertyLocationMap from '../../components/PropertyLocationMap';
import { Screen } from '../../components/Screen';
import { ErrorView, LoadingView } from '../../components/States';
import { formatPhone } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import type { RootStackParamList } from '../../navigation/types';
import { colors, fonts, spacing, surfaces } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PropertyDetails'>;

export default function PropertyDetailsScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { user, status } = useAuth();
  const { id } = route.params;

  const query = usePropertyDetail(id);

  // Count one view per opening of this screen, for the agency dashboard. The owner looking at
  // their own listing is not a view. Waits until the session is known, otherwise the owner would
  // be counted while the app is still restoring their sign-in. A failure is not worth showing.
  const ownerId = query.data?.user_id;
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current || ownerId === undefined || status === 'loading')
      return;
    counted.current = true;
    if (user?.id !== ownerId) recordPropertyView(id).catch(() => undefined);
  }, [id, ownerId, status, user?.id]);

  if (query.isPending) return <LoadingView />;
  if (query.isError) {
    const missing =
      query.error instanceof ApiError && query.error.status === 404;
    return (
      <ErrorView
        message={
          missing ? t('property.notFound') : errorMessage(query.error, t)
        }
        onRetry={missing ? undefined : () => query.refetch()}
      />
    );
  }
  return <PropertyBody property={query.data} navigation={navigation} />;
}

/**
 * The owner's way to edit the listing: a pencil with its name beside it, in the same row and the same white, edged
 * style as the bookmark. (A phone has no hover, so the name is written out where a tooltip would have been.)
 */
function EditListingButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID="edit-listing"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
    >
      <Icon name="edit" size={18} color={colors.primary} weight={1.9} />
      <AppText variant="bodySm" color={colors.primary} style={styles.editLabel}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** The loaded listing, its contact details and the Call / WhatsApp / Chat bar pinned below. */
function PropertyBody({
  property,
  navigation,
}: {
  property: Property;
  navigation: Props['navigation'];
}) {
  const { t } = useTranslation();
  const format = useFormat();
  // null, '' and a few spaces all mean the owner wrote nothing.
  const hasDescription = (property.description ?? '').trim().length > 0;
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [promoting, setPromoting] = useState(false);

  const actions = useContactActions({
    id: property.id,
    title: property.title,
    user_id: property.user_id,
  });
  const isOwner = actions.isOwner;
  const revealed = actions.contact;

  const place = propertyPlace(property, format.province);

  return (
    <Screen edges={isOwner ? ['left', 'right', 'bottom'] : ['left', 'right']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {property.images.length > 0 ? (
          <FlatList
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={property.images}
            keyExtractor={(uri, index) => `${index}-${uri}`}
            renderItem={({ item }) => (
              <Image
                source={{ uri: item }}
                style={[styles.galleryImage, { width }]}
                resizeMode="cover"
              />
            )}
            style={styles.gallery}
          />
        ) : null}

        <View style={[styles.section, styles.header]}>
          <View style={styles.row}>
            <View style={styles.badges}>
              <DealBadge deal={property.deal_type} />
              {property.is_featured ? (
                <Badge
                  label={t('property.featured')}
                  tone={badgeTones.warning}
                />
              ) : null}
            </View>
            {/* The owner's Edit sits with the bookmark, as a small icon button, not as a button in the page. */}
            <View style={styles.actions}>
              {isOwner ? (
                <EditListingButton
                  label={t('my.edit')}
                  accessibilityLabel={t('property.editListing')}
                  onPress={() =>
                    navigation.navigate('AddProperty', {
                      propertyId: property.id,
                    })
                  }
                />
              ) : null}
              <BookmarkButton propertyId={property.id} title={property.title} />
            </View>
          </View>
          <AppText variant="pageTitle">{property.title}</AppText>
          {place ? (
            <View style={styles.place}>
              <Icon
                name="pin"
                size={16}
                color={colors.textSecondary}
                weight={1.9}
              />
              <AppText
                variant="bodySm"
                color={colors.textSecondary}
                numberOfLines={2}
                style={styles.placeText}
              >
                {place}
              </AppText>
            </View>
          ) : null}
          <View style={styles.priceBox}>
            <AppText variant="caption" color={colors.textMuted}>
              {t('add.price')}
            </AppText>
            <Price
              amount={property.price}
              currency={property.currency}
              variant="pageTitle"
              color={colors.primary}
            />
          </View>
        </View>

        <View style={[styles.section, styles.card]}>
          <AppText variant="section">{t('property.specs')}</AppText>
          {/* The same icon grid as the Home list and My Listings. */}
          <PropertyFacts
            property={property}
            withType
            layout="grid"
            divider={false}
          />
          {property.type === 'GARDEN' || property.type === 'VILLA' ? (
            <AppText variant="caption" color={colors.primaryDark}>
              {t('property.gardenVillaNote')}
            </AppText>
          ) : null}
        </View>

        {/* What a jerib is and what this area comes to in jerib: folded away, one tap to read. */}
        <JeribConversion areaSqm={property.area_sqm} style={styles.fold} />

        <View style={[styles.section, styles.card]}>
          <AppText variant="section">{t('property.description')}</AppText>
          {/* An owner may leave the description out (it is stored as ''): say so politely instead of an empty card. */}
          {hasDescription ? (
            <AppText variant="bodySm">{property.description}</AppText>
          ) : (
            <AppText
              variant="bodySm"
              color={colors.textMuted}
              testID="no-description"
            >
              {t('property.noDescription')}
            </AppText>
          )}
        </View>

        <View style={[styles.section, styles.card]}>
          <AppText variant="section">{t('property.location')}</AppText>
          <AppText variant="bodySm">
            {[
              format.province(property.province),
              property.district,
              property.neighborhood,
            ]
              .filter(Boolean)
              .join('، ')}
          </AppText>
          <AppText variant="bodySm" color={colors.textMuted}>
            {property.address}
          </AppText>
          {property.lat !== null && property.lng !== null ? (
            <PropertyLocationMap
              at={{ latitude: property.lat, longitude: property.lng }}
            />
          ) : (
            <AppText variant="caption" color={colors.textMuted}>
              {t('map.noExact')}
            </AppText>
          )}
        </View>

        {revealed ? (
          <View style={[styles.section, styles.card]}>
            <AppText variant="section">{t('property.contact')}</AppText>
            {revealed.agency_name ? (
              <AppText variant="bodySm">
                {t('property.agency')}: {revealed.agency_name}
              </AppText>
            ) : null}
            {revealed.full_name ? (
              <AppText variant="bodySm">
                {t('property.owner')}: {revealed.full_name}
              </AppText>
            ) : null}
            <AppText variant="section">
              {formatPhone(revealed.phone_number)}
            </AppText>
          </View>
        ) : null}

        {isOwner ? (
          <View style={styles.section}>
            <AppText variant="caption" color={colors.textMuted}>
              {t('property.yourListing')}
            </AppText>
            <Button
              title={t('property.promote')}
              variant="secondary"
              onPress={() => setPromoting(true)}
            />
          </View>
        ) : null}
      </ScrollView>

      {isOwner ? (
        <PromotionSheet
          property={promoting ? property : null}
          onClose={() => setPromoting(false)}
        />
      ) : (
        <>
          <ContactActionBar actions={actions} signedIn={user !== null} />
          <ContactLockSheet
            propertyId={property.id}
            visible={actions.sheetOpen}
            quota={actions.quota}
            onClose={actions.closeSheet}
            onUnlocked={actions.finishWanted}
            onResult={actions.remember}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 0, paddingBottom: spacing.xxl },
  gallery: { backgroundColor: colors.neutralSoft },
  galleryImage: { height: 260 },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  header: { gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  badges: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  placeText: { flexShrink: 1 },
  priceBox: {
    ...surfaces.tile,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  card: {
    ...surfaces.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.8 },
  editLabel: { fontFamily: fonts.semibold },
  fold: { marginHorizontal: spacing.lg, marginTop: spacing.md },
});
