import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Coordinate, MapCamera } from '../map/geo';
import { colors, spacing } from '../theme';
import AppText from './AppText';
import LocationPicker from './LocationPicker';

interface Props {
  value: Coordinate | null;
  camera: MapCamera;
  onChange: (coordinate: Coordinate) => void;
  error?: string;
  /** Something to say under the map (the address that was found for the spot). */
  children?: React.ReactNode;
}

/**
 * The "where is it on the map" part of a listing form. Free for everyone: an exact pin is no longer something
 * that is bought, so this is only the title, a line of help, the map and what is known about the chosen spot.
 */
export default function PinSection({
  value,
  camera,
  onChange,
  error,
  children,
}: Props) {
  const { t } = useTranslation();
  const [outside, setOutside] = useState(false);

  return (
    <View style={styles.box}>
      <AppText variant="label">{t('add.location')}</AppText>
      <AppText variant="caption" color={colors.textMuted}>
        {t('add.locationHelp')}
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
      <AppText
        variant="caption"
        color={value ? colors.primaryDark : colors.textMuted}
      >
        {value ? t('map.placed') : t('map.tapToPlace')}
      </AppText>
      {outside ? (
        <AppText variant="caption" color={colors.danger}>
          {t('map.outside')}
        </AppText>
      ) : null}
      {children}
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
});
