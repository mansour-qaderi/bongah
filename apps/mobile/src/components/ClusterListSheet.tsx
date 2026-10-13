import React from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatNumber } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import type { MapItem } from '../map/items';
import { PROPERTY_ICONS, useSellerLabel } from '../map/markers';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';

interface Props {
  /** The things found in one spot; null keeps the sheet closed. */
  items: MapItem[] | null;
  onPick: (item: MapItem) => void;
  onClose: () => void;
}

const Separator = () => <View style={styles.separator} />;

/**
 * Opens when a counted cluster is tapped: everything in that spot as a list, listings first and then offices.
 * Picking one closes the sheet and shows its card on the map.
 */
export default function ClusterListSheet({ items, onPick, onClose }: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const sellerOf = useSellerLabel();

  const ordered = React.useMemo(
    () => [
      ...(items ?? []).filter(i => i.kind === 'property'),
      ...(items ?? []).filter(i => i.kind === 'agency'),
    ],
    [items],
  );

  return (
    <Modal
      visible={items !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel={t('common.close')}
        style={styles.backdrop}
        onPress={onClose}
      />
      <SafeAreaView
        edges={['bottom']}
        style={styles.sheet}
        testID="cluster-list"
      >
        <View style={styles.header}>
          <AppText variant="heading">
            {t('home.clusterTitle', {
              count: formatNumber(ordered.length, 0),
            })}
          </AppText>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
            <AppText variant="label" color={colors.primary}>
              {t('common.close')}
            </AppText>
          </Pressable>
        </View>
        <FlatList
          data={ordered}
          keyExtractor={item => item.key}
          renderItem={({ item }) =>
            item.kind === 'property' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onPick(item)}
                style={styles.row}
              >
                <View style={styles.thumb}>
                  {item.property.images[0] ? (
                    <Image
                      source={{ uri: item.property.images[0] }}
                      style={styles.thumbImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <AppText variant="heading">
                      {PROPERTY_ICONS[item.property.type]}
                    </AppText>
                  )}
                </View>
                <View style={styles.text}>
                  <AppText variant="label" color={colors.primaryDark}>
                    {format.price(item.property.price, item.property.currency)}
                  </AppText>
                  <AppText variant="caption" numberOfLines={1}>
                    {item.property.title}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    {t(`propertyType.${item.property.type}`)} ·{' '}
                    {sellerOf(item.property)}
                  </AppText>
                </View>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => onPick(item)}
                style={styles.row}
              >
                <View style={[styles.thumb, styles.agencyThumb]}>
                  <AppText variant="heading">🏛️</AppText>
                </View>
                <View style={styles.text}>
                  <AppText variant="label" color={colors.primaryDark}>
                    {item.agency.agency_name}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    ✓ {t('home.agencyVerified')}
                  </AppText>
                </View>
              </Pressable>
            )
          }
          ItemSeparatorComponent={Separator}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    maxHeight: '65%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  agencyThumb: { borderRadius: 28 },
  thumbImage: { width: '100%', height: '100%' },
  text: { flex: 1, gap: 2 },
  separator: { height: 1, backgroundColor: colors.border, marginStart: 80 },
});
