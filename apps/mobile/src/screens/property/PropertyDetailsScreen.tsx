import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
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
import Badge, { badgeTones, DealBadge } from '../../components/Badge';
import BookmarkButton from '../../components/BookmarkButton';
import CircleIconButton from '../../components/CircleIconButton';
import ContactActionBar from '../../components/ContactActionBar';
import ContactLockSheet from '../../components/ContactLockSheet';
import FeaturedFrameButton from '../../components/FeaturedFrameButton';
import Icon from '../../components/Icon';
import LocationPermissionModal from '../../components/LocationPermissionModal';
import NavigationModal from '../../components/NavigationModal';
import Price from '../../components/Price';
import PropertyFacts, { propertyPlace } from '../../components/PropertyFacts';
import PropertyLocationMap from '../../components/PropertyLocationMap';
import ShareLocationSheet from '../../components/ShareLocationSheet';
import { Screen } from '../../components/Screen';
import MapLoader from '../../components/MapLoader';
import { Reveal, useReveal } from '../../components/Reveal';
import { DETAILS_GALLERY_HEIGHT } from '../../components/layoutSizes';
import { PropertyDetailsSkeleton } from '../../components/SkeletonLoader';
import { ErrorView } from '../../components/States';
import { formatPhone } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import { useSellerLabel } from '../../map/markers';
import { useApproxLocation } from '../../map/useApproxLocation';
import { useInlineRoute } from '../../map/useInlineRoute';
import { useNavigationStart } from '../../map/useNavigationStart';
import { useShareListing } from '../../share/listingShare';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing, surfaces } from '../../theme';
import { durationLabel } from './mortgage';

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

  const reveal = useReveal(query.isPending);

  if (query.isPending) {
    return (
      <Screen edges={['left', 'right']}>
        <PropertyDetailsSkeleton />
      </Screen>
    );
  }
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
  return (
    <Reveal {...reveal} loader={<PropertyDetailsSkeleton />}>
      <PropertyBody property={query.data} navigation={navigation} />
    </Reveal>
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
  const share = useShareListing();
  const [navigating, setNavigating] = useState(false);
  // «اشتراک موقعیت ملک»: the sheet that sends the exact place to a client.
  const [sharingLocation, setSharingLocation] = useState(false);
  // «مسیریابی» is the fullscreen button on the map card: it finds the phone first (permission, a phone abroad, a switched-off
  // GPS are all answered there), then opens the big map with the route, the distance, the time and the speed.
  const nav = useNavigationStart(() => setNavigating(true));

  const actions = useContactActions({
    id: property.id,
    title: property.title,
    user_id: property.user_id,
  });
  const isOwner = actions.isOwner;
  const revealed = actions.contact;

  const place = propertyPlace(property, format.province);
  // Who is selling, said under the price: the agency's name, else the owner's own name (the listing carries it; the
  // contact, once opened, says it too), and only "owner" for someone who never gave a name.
  const sellerOf = useSellerLabel();
  const seller =
    revealed?.agency_name ?? revealed?.full_name ?? sellerOf(property);
  // Where the map shows the listing: its pin, or (when it was posted with a written address only) the place that
  // address comes to.
  const where = useApproxLocation(property);
  // The route from the phone, drawn on the small map when the phone's position is already known (no prompt is shown
  // for it; the fullscreen button is what asks).
  const inline = useInlineRoute(where.status === 'pinned' ? where.coordinate : null);
  // The location card says what the line under the title does not: the neighbourhood, the district and the written
  // address, each only when that line has not said it already.
  const addressLine = [
    property.neighborhood,
    property.district,
    property.address,
  ]
    .map(part => part?.trim() ?? '')
    .filter(
      (part, index, all) =>
        part && !place.includes(part) && all.indexOf(part) === index,
    )
    .join('، ');

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

        {/* The header, in this order: the title, the price (the deal's badge at the far end of it, as on a card in
            "آگهی‌های من"), the seller directly under the price. Then the specs card, and the Call / Chat bar below. */}
        <View style={[styles.section, styles.header]}>
          <View style={styles.row}>
            <AppText variant="pageTitle" style={styles.title}>
              {property.title}
            </AppText>
            {/* Share and Bookmark side by side, and for the owner Edit first: all three are the same round button. */}
            <View style={styles.actions} testID="header-actions">
              {isOwner ? (
                <CircleIconButton
                  testID="edit-listing"
                  icon="edit"
                  label={t('property.editListing')}
                  onPress={() =>
                    navigation.navigate('AddProperty', {
                      propertyId: property.id,
                    })
                  }
                />
              ) : null}
              <CircleIconButton
                testID="share-listing"
                icon="share"
                label={`${t('property.share')}: ${property.title}`}
                onPress={() => share(property)}
              />
              <BookmarkButton propertyId={property.id} title={property.title} />
            </View>
          </View>
          <View style={styles.priceBox} testID="price-box">
            <View style={styles.priceMain}>
              {/* What the price is for: the monthly rent, the sale price, the amount of a mortgage. */}
              <AppText variant="caption" color={colors.textMuted}>
                {t(`dealPrice.${property.deal_type}`)}
              </AppText>
              {/* The price with its terms («مقطوع» / «جورآمد») beside it on the same line, sat on the same baseline. */}
              <View style={styles.priceLine} testID="price-line">
                <Price
                  amount={property.price}
                  currency={property.currency}
                  variant="pageTitle"
                  color={colors.primary}
                  testID="price"
                />
                {property.price_terms ? (
                  <Badge
                    label={t(`priceTerms.${property.price_terms}`)}
                    tone={badgeTones.neutral}
                  />
                ) : null}
              </View>
              {property.mortgage_months ? (
                <AppText
                  variant="bodySm"
                  color={colors.textSecondary}
                  testID="mortgage-duration"
                >
                  {`${t('mortgage.forDuration')}: ${durationLabel(
                    property.mortgage_months,
                    t,
                  )}`}
                </AppText>
              ) : null}
              {/* The seller, directly under the price. */}
              <View style={styles.seller} testID="seller">
                <Icon
                  name={property.agency_name ? 'dashboard' : 'user'}
                  size={16}
                  color={colors.accentText}
                  weight={1.9}
                />
                <AppText
                  variant="label"
                  color={colors.accentText}
                  numberOfLines={1}
                  style={styles.placeText}
                >
                  {seller}
                </AppText>
              </View>
            </View>
            {/* The deal's tag at the far end (the left, in Dari and Pashto), the "featured" badge under it. */}
            <View style={styles.tags} testID="deal-tags">
              <DealBadge deal={property.deal_type} />
              {property.is_featured ? (
                <Badge
                  label={t('property.featured')}
                  tone={badgeTones.warning}
                />
              ) : null}
            </View>
          </View>
        </View>

        <View style={[styles.section, styles.card]}>
          <AppText variant="section">{t('property.specs')}</AppText>
          {/* The same icon grid as the Home list and My Listings. */}
          <PropertyFacts
            property={property}
            withType
            withUnit
            layout="grid"
            divider={false}
          />
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
          {property.type === 'GARDEN' || property.type === 'VILLA' ? (
            <AppText variant="caption" color={colors.primaryDark}>
              {t('property.gardenVillaNote')}
            </AppText>
          ) : null}
        </View>

        {/* The page's order: header, specs, where it is (the map), then for its owner the frame, then the description. */}
        <View style={[styles.section, styles.card]}>
          <AppText variant="section">{t('property.location')}</AppText>
          {/* The province and district are already under the title; here only the address the owner wrote. */}
          {addressLine ? (
            <AppText variant="bodySm" testID="address">
              {addressLine}
            </AppText>
          ) : null}
          {where.status === 'pinned' ? (
            <>
              <PropertyLocationMap
                at={where.coordinate}
                boundary={property.boundary}
                deal={property.deal_type}
                type={property.type}
                from={inline.here}
                route={inline.route}
                onFullscreen={nav.start}
                fullscreenBusy={nav.finding}
                onShare={() => setSharingLocation(true)}
              />
            </>
          ) : where.status === 'approximate' ? (
            <>
              <PropertyLocationMap at={where.coordinate} zoom={where.zoom} />
              <AppText
                variant="caption"
                color={colors.textMuted}
                testID="approx-note"
              >
                {t('property.approxLocation')}
              </AppText>
            </>
          ) : where.status === 'finding' ? (
            <View style={styles.finding}>
              <View style={styles.finderSlot}>
                <MapLoader size={28} />
              </View>
              <AppText variant="caption" color={colors.textMuted}>
                {t('property.finding')}
              </AppText>
            </View>
          ) : (
            <AppText variant="caption" color={colors.textMuted}>
              {t('map.noExact')}
            </AppText>
          )}
        </View>

        {/* For its owner, the featured frame, as a gold-edged row like the one at the foot of the listing form. (Directions
            are the fullscreen button on the map card.) */}
        {isOwner ? (
          <View style={[styles.section, styles.actionsBlock]} testID="listing-actions">
            <AppText variant="caption" color={colors.textMuted}>
              {t('property.yourListing')}
            </AppText>
            <FeaturedFrameButton property={property} />
          </View>
        ) : null}

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

      </ScrollView>

      <LocationPermissionModal
        problem={nav.problem}
        onOpenSettings={nav.openSettings}
        onClose={nav.closeProblem}
      />
      {where.status === 'pinned' ? (
        <ShareLocationSheet
          visible={sharingLocation}
          onClose={() => setSharingLocation(false)}
          place={{
            latitude: where.coordinate.latitude,
            longitude: where.coordinate.longitude,
            title: property.title,
            address: [place, addressLine].filter(Boolean).join('، '),
            listingId: property.id,
          }}
        />
      ) : null}
      {where.status === 'pinned' ? (
        <NavigationModal
          visible={navigating}
          destination={where.coordinate}
          title={property.title}
          deal={property.deal_type}
          type={property.type}
          onClose={() => setNavigating(false)}
        />
      ) : null}
      {isOwner ? null : (
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
  galleryImage: { height: DETAILS_GALLERY_HEIGHT },
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
  title: { flex: 1 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  // The deal's tag, with the "featured" badge under it.
  tags: { alignItems: 'center', gap: spacing.xs },
  priceMain: { flex: 1, gap: 2 },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  placeText: { flexShrink: 1 },
  priceBox: {
    ...surfaces.tile,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  // The price and its terms badge: one line, one baseline.
  priceLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: spacing.sm,
    rowGap: spacing.xs,
  },
  finding: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // The map loader's pin hops above its box: the slot keeps the line as tall as the words.
  finderSlot: {
    width: 28,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsBlock: { gap: spacing.md },
  card: {
    ...surfaces.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
