import React, { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { updateProperty } from '../../api/endpoints';
import { errorMessage, isMapLocationRequired } from '../../api/errors';
import { queryKeys, usePropertyDetail } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import PinSection from '../../components/PinSection';
import { ScrollScreen } from '../../components/Screen';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { findProvince } from '../../constants/provinces';
import { useFormat } from '../../i18n/useFormat';
import {
  AFGHANISTAN_CAMERA,
  cameraAt,
  provinceCamera,
  type Coordinate,
} from '../../map/geo';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SetLocation'>;

/**
 * Puts (or moves) the exact map pin of one of my listings. The first pin on a listing needs an
 * active agency plan or a prepaid pin; moving a pin that is already there is free.
 */
export default function SetLocationScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const { status } = useAuth();
  const { propertyId } = route.params;
  const queryClient = useQueryClient();
  const query = usePropertyDetail(propertyId);
  const [chosen, setChosen] = useState<Coordinate | null>(null);
  const [showError, setShowError] = useState(false);

  const save = useMutation({
    mutationFn: (at: Coordinate) =>
      updateProperty(propertyId, { lat: at.latitude, lng: at.longitude }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.properties }),
        queryClient.invalidateQueries({ queryKey: queryKeys.mapLocation }),
      ]);
      navigation.goBack();
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mapLocation });
    },
  });

  const property = query.data;
  const lat = property?.lat ?? null;
  const lng = property?.lng ?? null;
  const provinceName = property?.province;
  const existing = useMemo<Coordinate | null>(
    () =>
      lat !== null && lng !== null ? { latitude: lat, longitude: lng } : null,
    [lat, lng],
  );
  const camera = useMemo(() => {
    if (existing) return cameraAt(existing);
    const province = findProvince(provinceName);
    return province ? provinceCamera(province) : AFGHANISTAN_CAMERA;
  }, [existing, provinceName]);

  if (status !== 'signedIn') {
    return (
      <EmptyView message={t('auth.signInRequired')}>
        <Button
          title={t('auth.signIn')}
          onPress={() => navigation.navigate('Auth')}
        />
      </EmptyView>
    );
  }
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

  const listing = query.data;
  const value = chosen ?? existing;

  return (
    <ScrollScreen>
      {save.isError ? (
        <Banner kind="error" message={errorMessage(save.error, t)}>
          {isMapLocationRequired(save.error) ? (
            <Button
              title={t('map.buy')}
              variant="outline"
              onPress={() => navigation.navigate('Checkout', { tab: 'map' })}
            />
          ) : null}
        </Banner>
      ) : null}
      <AppText variant="heading">{listing.title}</AppText>
      <AppText color={colors.textMuted} style={styles.place}>
        {[
          format.province(listing.province),
          listing.district,
          listing.neighborhood,
        ]
          .filter(Boolean)
          .join('، ')}
      </AppText>

      <PinSection
        value={value}
        camera={camera}
        alreadyPinned={existing !== null}
        onBuy={() => navigation.navigate('Checkout', { tab: 'map' })}
        onChange={c => {
          setChosen(c);
          setShowError(false);
        }}
        error={showError ? t('map.pickFirst') : undefined}
      />

      <Button
        title={t('map.save')}
        loading={save.isPending}
        onPress={() => {
          if (!chosen) {
            setShowError(true);
            return;
          }
          save.mutate(chosen);
        }}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  place: { marginBottom: spacing.lg },
});
