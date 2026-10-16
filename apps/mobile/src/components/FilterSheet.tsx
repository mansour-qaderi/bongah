import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  CURRENCIES,
  DEAL_TYPES,
  PROPERTY_TYPES,
  PROPERTY_UNITS,
  type Currency,
  type DealType,
  type PropertyType,
  type PropertyUnitType,
} from '@bongah/shared-types';
import type { PropertyFilters } from '../api/endpoints';
import {
  findProvince,
  provinceValue,
  type Province,
} from '../constants/provinces';
import { formatCurrency, formatNumber, parseNumberInput } from '../i18n/format';
import { priceStops } from '../constants/priceStops';
import { useFormat } from '../i18n/useFormat';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import Button from './Button';
import BottomSheet from './BottomSheet';
import Card from './Card';
import { Chip } from './Chip';
import { KeyboardAwareScrollView } from './KeyboardAware';
import ProvincePicker from './ProvincePicker';
import RangeSlider from './RangeSlider';
import SegmentedControl from './SegmentedControl';
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

/** The amount typed so far, written as money ("۱,۲۰۰,۰۰۰ ؋"), or nothing while the box is empty or unreadable. */
function priceHelper(text: string, currency: Currency): string | undefined {
  const amount = readPrice(text);
  return typeof amount === 'number'
    ? formatCurrency(amount, currency)
    : undefined;
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
  const [unit, setUnit] = useState<PropertyUnitType | undefined>();
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
    setUnit(value.unit_type);
    setDeal(value.deal_type);
    setCurrency(value.currency ?? 'AFGHANI');
    setMinText(
      value.min_price !== undefined ? formatNumber(value.min_price) : '',
    );
    setMaxText(
      value.max_price !== undefined ? formatNumber(value.max_price) : '',
    );
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
      // A unit only means something within its type.
      unit_type: type ? unit : undefined,
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
    setUnit(undefined);
    setDeal(undefined);
    setMinText('');
    setMaxText('');
    setError(false);
  };

  // The slider speaks in stops; the boxes below it hold the exact numbers and stay in step with it.
  const minValue = readPrice(minText) ?? undefined;
  const maxValue = readPrice(maxText) ?? undefined;
  const stops = priceStops(deal, currency);
  const describeStop = (amount: number | undefined) =>
    amount === undefined ? t('home.noLimit') : formatCurrency(amount, currency);
  // Said in words only for the ends that are set: "from X", "up to Y" or "from X to Y". With neither set the slider
  // is open at both ends and there is nothing to say (the old "from no limit to no limit" only confused people).
  const summary =
    minValue !== undefined && maxValue !== undefined
      ? t('home.priceFromTo', {
          from: describeStop(minValue),
          to: describeStop(maxValue),
        })
      : minValue !== undefined
      ? t('home.priceFrom', { amount: describeStop(minValue) })
      : maxValue !== undefined
      ? t('home.priceUpTo', { amount: describeStop(maxValue) })
      : null;
  // What the empty boxes hint at: clean round figures, plain digits, never a bare zero. The lighter placeholder colour
  // (not a "for example" word) is what tells them from a typed amount.
  const examples =
    currency === 'USD'
      ? { min: 1_000, max: 100_000 }
      : { min: 1_000, max: 1_000_000 };
  const example = (amount: number) => String(amount);

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title={t('home.filters')}
        footer={
          <>
            <Button
              title={t('home.clearFilters')}
              variant="outline"
              onPress={clear}
              style={styles.footerSmall}
            />
            <Button
              title={t('home.applyFilters')}
              onPress={apply}
              style={styles.footerMain}
            />
          </>
        }
      >
        <KeyboardAwareScrollView contentContainerStyle={styles.content}>
          <Card>
            <AppText variant="label">{t('home.province')}</AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickerOpen(true)}
              style={styles.select}
            >
              <AppText color={province ? colors.text : colors.placeholder}>
                {province ? province.name[language] : t('home.allProvinces')}
              </AppText>
            </Pressable>
            <TextField
              label={t('home.district')}
              value={district}
              onChangeText={setDistrict}
              placeholder={t('home.districtPlaceholder')}
              style={styles.field}
            />
          </Card>

          <Card>
            <AppText variant="label">{t('home.type')}</AppText>
            <View style={styles.wrap}>
              <Chip
                compact
                label={t('home.allTypes')}
                selected={!type}
                onPress={() => {
                  setType(undefined);
                  setUnit(undefined);
                }}
              />
              {PROPERTY_TYPES.map(p => (
                <Chip
                  compact
                  key={p}
                  label={t(`propertyType.${p}`)}
                  selected={type === p}
                  onPress={() => {
                    setType(p);
                    // A unit belongs to one type: changing the type drops one that no longer fits.
                    if (unit && !PROPERTY_UNITS[p].includes(unit))
                      setUnit(undefined);
                  }}
                />
              ))}
            </View>

            {type ? (
              <>
                <AppText variant="label">{t('home.unit')}</AppText>
                <View style={styles.wrap} testID="unit-chips">
                  <Chip
                    compact
                    label={t('common.all')}
                    selected={!unit}
                    onPress={() => setUnit(undefined)}
                  />
                  {PROPERTY_UNITS[type].map(u => (
                    <Chip
                      compact
                      key={u}
                      label={t(`unitType.${u}`)}
                      selected={unit === u}
                      onPress={() => setUnit(u)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <AppText variant="label">{t('home.dealType')}</AppText>
            <View style={styles.wrap}>
              <Chip
                compact
                label={t('home.allDeals')}
                selected={!deal}
                onPress={() => setDeal(undefined)}
              />
              {DEAL_TYPES.map(d => (
                <Chip
                  compact
                  key={d}
                  label={t(`dealType.${d}`)}
                  selected={deal === d}
                  onPress={() => setDeal(d)}
                />
              ))}
            </View>
          </Card>

          <Card>
            <View style={styles.priceHead}>
              <AppText variant="label">{t('home.priceRange')}</AppText>
              <SegmentedControl
                options={CURRENCIES.map(c => ({
                  value: c,
                  label: t(`currency.${c}`),
                }))}
                value={currency}
                onChange={setCurrency}
              />
            </View>
            {summary ? (
              <AppText variant="label" color={colors.primaryDark}>
                {summary}
              </AppText>
            ) : null}
            <RangeSlider
              stops={stops}
              low={minValue}
              high={maxValue}
              onChange={(low, high) => {
                setMinText(low === undefined ? '' : String(low));
                setMaxText(high === undefined ? '' : String(high));
                setError(false);
              }}
              describe={describeStop}
              lowLabel={t('home.minPrice')}
              highLabel={t('home.maxPrice')}
            />
            <AppText variant="caption" color={colors.textMuted}>
              {t('home.priceSliderHint')}
            </AppText>
            <View style={styles.priceRow}>
              <View style={styles.priceBox}>
                <TextField
                  label={t('home.minPrice')}
                  value={minText}
                  onChangeText={setMinText}
                  keyboardType="decimal-pad"
                  ltr
                  placeholder={example(examples.min)}
                  helper={priceHelper(minText, currency)}
                  style={styles.field}
                />
              </View>
              <View style={styles.priceBox}>
                <TextField
                  label={t('home.maxPrice')}
                  value={maxText}
                  onChangeText={setMaxText}
                  keyboardType="decimal-pad"
                  ltr
                  placeholder={example(examples.max)}
                  helper={priceHelper(maxText, currency)}
                  style={styles.field}
                />
              </View>
            </View>
            {error ? (
              <AppText variant="caption" color={colors.danger}>
                {t('errors.validation')}
              </AppText>
            ) : null}
          </Card>
        </KeyboardAwareScrollView>
      </BottomSheet>

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
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  select: {
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  // The cards already space their content; a field needs no margin of its own inside one.
  field: { marginBottom: 0 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  priceHead: {
    gap: spacing.md,
  },
  priceRow: { flexDirection: 'row', gap: spacing.md },
  priceBox: { flex: 1 },
  footerSmall: { flex: 1 },
  footerMain: { flex: 2 },
});
