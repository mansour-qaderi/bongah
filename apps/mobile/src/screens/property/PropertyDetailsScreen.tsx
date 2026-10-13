import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Linking,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { errorMessage } from '../../api/errors';
import { getPropertyContact, recordPropertyView } from '../../api/endpoints';
import { usePropertyDetail } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import { Chip } from '../../components/Chip';
import PromotionSheet from '../../components/PromotionSheet';
import PropertyLocationMap from '../../components/PropertyLocationMap';
import { ScrollScreen } from '../../components/Screen';
import { ErrorView, LoadingView } from '../../components/States';
import { formatNumber, formatPhone, sqmToJerib } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import type { RootStackParamList } from '../../navigation/types';
import { useRequireAuth } from '../../navigation/useRequireAuth';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PropertyDetails'>;

export default function PropertyDetailsScreen({ route }: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const { user, status } = useAuth();
  const requireAuth = useRequireAuth();
  const { width } = useWindowDimensions();
  const { id } = route.params;

  const query = usePropertyDetail(id);
  const contact = useMutation({ mutationFn: () => getPropertyContact(id) });
  const [promoting, setPromoting] = useState(false);

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

  const property = query.data;
  const isOwner = user?.id === property.user_id;

  const callOwner = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => undefined);
  };

  const spec = (label: string, value: string) => (
    <View style={styles.spec} key={label}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="label">{value}</AppText>
    </View>
  );

  return (
    <ScrollScreen edges={['left', 'right', 'bottom']} style={styles.content}>
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

      <View style={styles.section}>
        <View style={styles.row}>
          <AppText variant="title" color={colors.primaryDark}>
            {format.price(property.price, property.currency)}
          </AppText>
          {property.is_featured ? (
            <Chip
              label={t('property.featured')}
              selected
              onPress={() => undefined}
            />
          ) : null}
        </View>
        <AppText variant="heading">{property.title}</AppText>
        <AppText color={colors.textMuted}>
          {t(`propertyType.${property.type}`)} ·{' '}
          {t(`dealType.${property.deal_type}`)}
        </AppText>
      </View>

      <View style={[styles.section, styles.card]}>
        <AppText variant="heading">{t('property.specs')}</AppText>
        <View style={styles.specGrid}>
          {spec(
            t('property.area'),
            `${format.area(property.area_sqm)}\n${t('property.areaInJerib', {
              value: formatNumber(sqmToJerib(property.area_sqm)),
            })}`,
          )}
          {property.bedrooms !== null
            ? spec(t('property.bedrooms'), formatNumber(property.bedrooms, 0))
            : null}
          {property.bathrooms !== null
            ? spec(t('property.bathrooms'), formatNumber(property.bathrooms, 0))
            : null}
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

      {contact.isError ? (
        <Banner kind="error" message={errorMessage(contact.error, t)} />
      ) : null}

      {contact.data ? (
        <View style={[styles.section, styles.card]}>
          <AppText variant="heading">{t('property.contact')}</AppText>
          {contact.data.agency_name ? (
            <AppText>
              {t('property.agency')}: {contact.data.agency_name}
            </AppText>
          ) : null}
          {contact.data.full_name ? (
            <AppText>
              {t('property.owner')}: {contact.data.full_name}
            </AppText>
          ) : null}
          <AppText variant="label" style={styles.phone}>
            {formatPhone(contact.data.phone_number)}
          </AppText>
          <Button
            title={t('property.call', {
              name:
                contact.data.agency_name ??
                contact.data.full_name ??
                formatPhone(contact.data.phone_number),
            })}
            onPress={() => callOwner(contact.data.phone_number)}
          />
        </View>
      ) : !isOwner ? (
        <View style={styles.section}>
          {user ? null : (
            <AppText variant="caption" color={colors.textMuted}>
              {t('property.contactSignIn')}
            </AppText>
          )}
          <Button
            title={t('property.contact')}
            loading={contact.isPending}
            onPress={() => requireAuth(() => contact.mutate())}
          />
        </View>
      ) : null}

      {isOwner ? (
        <View style={styles.section}>
          <Button
            title={t('property.promote')}
            variant="secondary"
            onPress={() => setPromoting(true)}
          />
        </View>
      ) : null}
      {isOwner ? (
        <PromotionSheet
          property={promoting ? property : null}
          onClose={() => setPromoting(false)}
        />
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 0, paddingBottom: spacing.xxl },
  gallery: { backgroundColor: colors.primarySoft },
  galleryImage: { height: 240 },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  specGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  spec: { minWidth: '40%' },
  phone: { fontSize: 18 },
});
