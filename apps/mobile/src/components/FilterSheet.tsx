import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CURRENCIES,
  DEAL_TYPES,
  PROPERTY_TYPES,
  type Currency,
  type DealType,
  type PropertyType,
} from '@bongah/shared-types';
import type { PropertyFilters } from '../api/endpoints';
import {
  findProvince,
  provinceValue,
  type Province,
} from '../constants/provinces';
import { formatNumber, parseNumberInput } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { colors, spacing } from '../theme';
import AppText from './AppText';
import Button from './Button';
import { Chip } from './Chip';
import ProvincePicker from './ProvincePicker';
import TextField from './TextField';

interface Props {
  visible: boolean;
  value: PropertyFilters;
  onApply: (filters: PropertyFilters) => void;
  onClose: () => void;
}

const MAX_PRICE_INPUT = 999_999_999_999;

/** Reads a price box: '' → undefined (no limit), unreadable → null (error). */
function readPrice(text: string): number | undefined | null {
  if (!text.trim()) return undefined;
  const n = parseNumberInput(text);
  return n === null || n > MAX_PRICE_INPUT ? null : Math.round(n * 100) / 100;
}

export default function FilterSheet({
  visible,
  value,
  onApply,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { language } = useFormat();

  const [province, setProvince] = useState<Province | null>(null);
  const [district, setDistrict] = useState('');
  const [type, setType] = useState<PropertyType | undefined>();
  const [deal, setDeal] = useState<DealType | undefined>();
  const [currency, setCurrency] = useState<Currency>('AFGHANI');
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState(false);

  // Each time the sheet opens, start from the filters currently applied.
  useEffect(() => {
    if (!visible) return;
    setProvince(findProvince(value.province) ?? null);
    setDistrict(value.district ?? '');
    setType(value.type);
    setDeal(value.deal_type);
    setCurrency(value.currency ?? 'AFGHANI');
    setMinText(value.min_price !== undefined ? String(value.min_price) : '');
    setMaxText(value.max_price !== undefined ? String(value.max_price) : '');
    setError(false);
  }, [visible, value]);

  const apply = () => {
    const min = readPrice(minText);
    const max = readPrice(maxText);
    if (
      min === null ||
      max === null ||
      (min !== undefined && max !== undefined && min > max)
    ) {
      setError(true);
      return;
    }
    const hasPrice = min !== undefined || max !== undefined;
    onApply({
      province: province ? provinceValue(province) : undefined,
      district: district.trim() || undefined,
      type,
      deal_type: deal,
      min_price: min,
      max_price: max,
      currency: hasPrice ? currency : undefined,
    });
  };

  const clear = () => {
    setProvince(null);
    setDistrict('');
    setType(undefined);
    setDeal(undefined);
    setMinText('');
    setMaxText('');
    setError(false);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <AppText variant="heading">{t('home.filters')}</AppText>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
            <AppText variant="label" color={colors.primary}>
              {t('common.close')}
            </AppText>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <AppText variant="label">{t('home.province')}</AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => setPickerOpen(true)}
            style={styles.select}
          >
            <AppText>
              {province ? province.name[language] : t('home.allProvinces')}
            </AppText>
          </Pressable>

          <TextField
            label={t('home.district')}
            value={district}
            onChangeText={setDistrict}
            placeholder={t('home.districtPlaceholder')}
          />

          <AppText variant="label">{t('home.type')}</AppText>
          <View style={styles.wrap}>
            <Chip
              label={t('home.allTypes')}
              selected={!type}
              onPress={() => setType(undefined)}
            />
            {PROPERTY_TYPES.map(p => (
              <Chip
                key={p}
                label={t(`propertyType.${p}`)}
                selected={type === p}
                onPress={() => setType(p)}
              />
            ))}
          </View>

          <AppText variant="label">{t('home.dealType')}</AppText>
          <View style={styles.wrap}>
            <Chip
              label={t('home.allDeals')}
              selected={!deal}
              onPress={() => setDeal(undefined)}
            />
            {DEAL_TYPES.map(d => (
              <Chip
                key={d}
                label={t(`dealType.${d}`)}
                selected={deal === d}
                onPress={() => setDeal(d)}
              />
            ))}
          </View>

          <AppText variant="label">{t('home.currency')}</AppText>
          <View style={styles.wrap}>
            {CURRENCIES.map(c => (
              <Chip
                key={c}
                label={t(`currency.${c}`)}
                selected={currency === c}
                onPress={() => setCurrency(c)}
              />
            ))}
          </View>

          <View style={styles.priceRow}>
            <View style={styles.priceBox}>
              <TextField
                label={t('home.minPrice')}
                value={minText}
                onChangeText={setMinText}
                keyboardType="decimal-pad"
                ltr
                placeholder={formatNumber(0)}
              />
            </View>
            <View style={styles.priceBox}>
              <TextField
                label={t('home.maxPrice')}
                value={maxText}
                onChangeText={setMaxText}
                keyboardType="decimal-pad"
                ltr
              />
            </View>
          </View>
          {error ? (
            <AppText variant="caption" color={colors.danger}>
              {t('errors.validation')}
            </AppText>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title={t('home.clearFilters')}
            variant="outline"
            onPress={clear}
            style={styles.footerButton}
          />
          <Button
            title={t('home.applyFilters')}
            onPress={apply}
            style={styles.footerButton}
          />
        </View>

        <ProvincePicker
          visible={pickerOpen}
          selectedId={province?.id ?? null}
          allowAll
          onClose={() => setPickerOpen(false)}
          onSelect={p => {
            setProvince(p);
            setPickerOpen(false);
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  content: { padding: spacing.lg, gap: spacing.sm },
  select: {
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  priceRow: { flexDirection: 'row', gap: spacing.md },
  priceBox: { flex: 1 },
  footer: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  footerButton: { flex: 1 },
});
