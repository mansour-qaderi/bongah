import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
import { formatCurrency, formatNumber, parseNumberInput } from '../i18n/format';
import { priceStops } from '../constants/priceStops';
import { useFormat } from '../i18n/useFormat';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import { propertyTypeLabel } from '../i18n/propertyType';
import { propertyLineIcon } from '../map/markers';
import Button from './Button';
import BottomSheet from './BottomSheet';
import Card from './Card';
import { Chip } from './Chip';
import { KeyboardAwareScrollView } from './KeyboardAware';
import ProvincePicker from './ProvincePicker';
import RangeSlider from './RangeSlider';
import { MultiSelectField } from './SelectField';
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
  // Any number of kinds at once; none means all of them.
  const [types, setTypes] = useState<PropertyType[]>([]);
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
    setTypes(value.types ?? []);
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
      types: types.length > 0 ? types : undefined,
      deal_type: deal,
      min_price: min,
      max_price: max,
      currency: hasPrice ? currency : undefined,
    });
  };

  const clear = () => {
    setProvince(null);
    setDistrict('');
    setTypes([]);
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
  // What the empty boxes hint at: a clean round figure said the way a person would type it («حداقل ۱,۰۰۰»,
  // «حداکثر ۱۰,۰۰۰»). Never a bare zero; the lighter placeholder colour (not a "for example" word) is what tells it
  // from a typed amount. The currency is not in the hint: it is written inside the box (`unit`), so it stays in
  // sight once an amount is typed or the slider has filled the box.
  const examples =
    currency === 'USD'
      ? { min: 1_000, max: 10_000 }
      : { min: 1_000, max: 1_000_000 };
  const hint = (word: string, amount: number) =>
    `${word} ${formatNumber(amount, 0)}`;
  const unit = t(`currency.${currency}`);

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title={t('home.filters')}
        footer={
          <>
            <Button
              icon="close"
              title={t('home.clearFilters')}
              variant="outline"
              onPress={clear}
              style={styles.footerSmall}
            />
            <Button
              icon="check"
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
            {/* The same box and sheet as the kind of property in the listing form, for a choice of several. */}
            <MultiSelectField
              testID="filter-type-select"
              label={t('home.type')}
              title={t('home.type')}
              searchPlaceholder={t('add.typeSearch')}
              allLabel={t('home.allTypes')}
              values={types}
              onChange={setTypes}
              options={PROPERTY_TYPES.map(p => ({
                value: p,
                label: propertyTypeLabel(p, t),
                icon: propertyLineIcon(p),
              }))}
              flush
            />

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
              {/* The same pills as under the price in the listing form. */}
              <View style={styles.wrap} testID="filter-currency">
                {CURRENCIES.map(c => (
                  <Chip
                    compact
                    key={c}
                    label={t(`currency.${c}`)}
                    selected={currency === c}
                    onPress={() => setCurrency(c)}
                  />
                ))}
              </View>
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
                  placeholder={hint(t('home.minPrice'), examples.min)}
                  thousands
                  unit={unit}
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
                  placeholder={hint(t('home.maxPrice'), examples.max)}
                  thousands
                  unit={unit}
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
