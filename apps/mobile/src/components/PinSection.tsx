import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMapLocationStatus, usePricing } from '../api/hooks';
import { formatNumber } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import type { Coordinate, MapCamera } from '../map/geo';
import { colors, spacing } from '../theme';
import AppText from './AppText';
import Banner from './Banner';
import Button from './Button';
import LocationPicker from './LocationPicker';
import { ErrorView, LoadingView } from './States';

interface Props {
  value: Coordinate | null;
  camera: MapCamera;
  onChange: (coordinate: Coordinate) => void;
  /**
   * The listing already has a pin, so moving it costs nothing and needs no entitlement.
   * (Matches the API: only the FIRST pin on a listing is the paid step.)
   */
  alreadyPinned?: boolean;
  /** Opens the purchase screen. */
  onBuy: () => void;
  error?: string;
}

/**
 * The "exact map location" part of a listing form. Shows the picker only to people who may use it
 * (an agency on an active plan, or someone holding a prepaid pin); everyone else sees what it
 * costs and a way to buy it. The server enforces the same rule, so this is guidance, not security.
 */
export default function PinSection({
  value,
  camera,
  onChange,
  alreadyPinned = false,
  onBuy,
  error,
}: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const status = useMapLocationStatus(!alreadyPinned);
  const pricing = usePricing();
  const [outside, setOutside] = useState(false);

  let body: React.ReactNode;
  if (alreadyPinned) {
    body = (
      <>
        <AppText variant="caption" color={colors.textMuted}>
          {t('map.moveFree')}
        </AppText>
        {picker()}
      </>
    );
  } else if (status.isPending) {
    body = <LoadingView />;
  } else if (status.isError) {
    body = (
      <ErrorView
        message={t('map.statusFailed')}
        onRetry={() => status.refetch()}
      />
    );
  } else if (status.data.unlimited || status.data.tokens_available > 0) {
    const { unlimited, tokens_available } = status.data;
    body = (
      <>
        <AppText variant="caption" color={colors.primaryDark}>
          {unlimited
            ? t('map.includedPlan')
            : `${t('map.credits', {
                count: formatNumber(tokens_available, 0),
              })} · ${t('map.usesCredit')}`}
        </AppText>
        {picker()}
      </>
    );
  } else {
    const price = pricing.data
      ? format.price(pricing.data.map_location, pricing.data.currency)
      : '';
    body = (
      <Banner kind="info" message={t('map.needAddon', { price })}>
        <Button
          title={t('map.buy')}
          variant="outline"
          onPress={onBuy}
          style={styles.buy}
        />
      </Banner>
    );
  }

  function picker() {
    return (
      <>
        <AppText variant="caption" color={colors.textMuted}>
          {value ? t('map.placed') : t('map.tapToPlace')}
        </AppText>
        <LocationPicker
          value={value}
          camera={camera}
          onChange={coordinate => {
            setOutside(false);
            onChange(coordinate);
          }}
          onOutside={() => setOutside(true)}
        />
        {outside ? (
          <AppText variant="caption" color={colors.danger}>
            {t('map.outside')}
          </AppText>
        ) : null}
      </>
    );
  }

  return (
    <View style={styles.box}>
      <AppText variant="label">{t('add.location')}</AppText>
      <AppText variant="caption" color={colors.textMuted}>
        {t('add.locationHelp')}
      </AppText>
      {body}
      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm, marginBottom: spacing.lg },
  buy: { marginTop: spacing.sm },
});
