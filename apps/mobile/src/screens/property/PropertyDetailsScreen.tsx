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
import Button from '../../components/Button';
import Badge, { badgeTones, dealTone } from '../../components/Badge';
import BookmarkButton from '../../components/BookmarkButton';
import ContactActionBar from '../../components/ContactActionBar';
import ContactLockSheet from '../../components/ContactLockSheet';
import Icon, { type IconName } from '../../components/Icon';
import JeribInfoButton from '../../components/JeribInfo';
import Price from '../../components/Price';
import PromotionSheet from '../../components/PromotionSheet';
import { propertyPlace } from '../../components/PropertyFacts';
import PropertyLocationMap from '../../components/PropertyLocationMap';
import { Screen } from '../../components/Screen';
import { ErrorView, LoadingView } from '../../components/States';
import { formatNumber, formatPhone } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import { PROPERTY_LINE_ICONS } from '../../map/markers';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing, surfaces } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PropertyDetails'>;

export default function PropertyDetailsScreen({ route }: Props) {
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
  return <PropertyBody property={query.data} />;
}

/** The loaded listing, its contact details and the Call / WhatsApp / Chat bar pinned below. */
function PropertyBody({ property }: { property: Property }) {
  const { t } = useTranslation();
  const format = useFormat();
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

  /** One figure of the listing: its icon in a soft tile, the name above and the value below. */
  const spec = (
    key: string,
    icon: IconName,
    label: string,
    value: string,
    extra?: React.ReactNode,
  ) => (
    <View style={styles.spec} key={key}>
      <View style={styles.specIcon}>
        <Icon name={icon} size={20} color={colors.textSecondary} weight={1.8} />
      </View>
      <View style={styles.specText}>
        <View style={styles.specLabel}>
          <AppText variant="caption" color={colors.textMuted}>
            {label}
          </AppText>
          {extra}
        </View>
        <AppText variant="label" numberOfLines={1}>
          {value}
        </AppText>
      </View>
    </View>
  );

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
              <Badge
                label={t(`propertyType.${property.type}`)}
                tone="neutral"
              />
              <Badge
                label={t(`dealType.${property.deal_type}`)}
                tone={dealTone(property.deal_type)}
              />
              {property.is_featured ? (
                <Badge
                  label={t('property.featured')}
                  tone={badgeTones.warning}
                />
              ) : null}
            </View>
            <BookmarkButton propertyId={property.id} title={property.title} />
          </View>
          <AppText variant="title">{property.title}</AppText>
          {place ? (
            <View style={styles.place}>
              <Icon
                name="pin"
                size={16}
                color={colors.textSecondary}
                weight={1.9}
              />
              <AppText
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
              variant="title"
              color={colors.primary}
            />
          </View>
        </View>

        <View style={[styles.section, styles.card]}>
          <AppText variant="heading">{t('property.specs')}</AppText>
          <View style={styles.specGrid}>
            {spec(
              'area',
              'area',
              t('property.area'),
              format.area(property.area_sqm),
              <JeribInfoButton areaSqm={property.area_sqm} />,
            )}
            {property.bedrooms !== null
              ? spec(
                  'bedrooms',
                  'bed',
                  t('property.bedrooms'),
                  formatNumber(property.bedrooms, 0),
                )
              : null}
            {property.bathrooms !== null
              ? spec(
                  'bathrooms',
                  'shower',
                  t('property.bathrooms'),
                  formatNumber(property.bathrooms, 0),
                )
              : null}
            {spec(
              'type',
              PROPERTY_LINE_ICONS[property.type],
              t('add.type'),
              t(`propertyType.${property.type}`),
            )}
          </View>
          {property.type === 'GARDEN_VILLA' ? (
            <AppText variant="caption" color={colors.primaryDark}>
              {t('property.gardenVillaNote')}
            </AppText>
          ) : null}
        </View>

        <View style={[styles.section, styles.card]}>
          <AppText variant="heading">{t('property.description')}</AppText>
          <AppText>{property.description}</AppText>
        </View>

        <View style={[styles.section, styles.card]}>
          <AppText variant="heading">{t('property.location')}</AppText>
          <AppText>
            {[
              format.province(property.province),
              property.district,
              property.neighborhood,
            ]
              .filter(Boolean)
              .join('، ')}
          </AppText>
          <AppText color={colors.textMuted}>{property.address}</AppText>
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
            <AppText variant="heading">{t('property.contact')}</AppText>
            {revealed.agency_name ? (
              <AppText>
                {t('property.agency')}: {revealed.agency_name}
              </AppText>
            ) : null}
            {revealed.full_name ? (
              <AppText>
                {t('property.owner')}: {revealed.full_name}
              </AppText>
            ) : null}
            <AppText variant="label" style={styles.phone}>
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
  specGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
  // Two to a row.
  spec: {
    flexBasis: '50%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  specIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutralSoft,
  },
  specText: { flexShrink: 1, gap: 2 },
  specLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  phone: { fontSize: 18 },
});
