import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  MARKET_CONFIG,
  defaultCurrency,
  type Currency,
  type DealType,
  type DeedType,
  type PropertyFeature,
  type PropertyType,
} from '@bongah/shared-types';
import type { PropertyFilters } from '../api/endpoints';
import {
  findProvince,
  provinceValue,
  type Province,
} from '../constants/provinces';
import { MAX_MONEY } from '@bongah/validation';
import { formatCurrency, formatNumber, parseNumberInput } from '../i18n/format';
import { dealTypeLabel, placeText } from '../i18n/market';
import { useActiveMarket } from '../market/marketStore';
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

/** The largest amount a listing may be priced at (rials run to trillions). */
const MAX_PRICE_INPUT = MAX_MONEY;

/** What the empty price boxes hint at, per currency: a clean round figure of the size people quote in it. */
const EXAMPLES: Record<Currency, { min: number; max: number }> = {
  AFGHANI: { min: 1_000, max: 1_000_000 },
  USD: { min: 1_000, max: 10_000 },
  TOMAN: { min: 1_000_000, max: 5_000_000_000 },
  RIAL: { min: 10_000_000, max: 50_000_000_000 },
};

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
  const market = useActiveMarket();
  const config = MARKET_CONFIG[market];

  const [province, setProvince] = useState<Province | null>(null);
  const [district, setDistrict] = useState('');
  // Any number of kinds at once; none means all of them.
  const [types, setTypes] = useState<PropertyType[]>([]);
  const [deal, setDeal] = useState<DealType | undefined>();
  // Iran's tags (all must be there) and Afghanistan's deed; the market offers one of them.
  const [features, setFeatures] = useState<PropertyFeature[]>([]);
  const [deed, setDeed] = useState<DeedType | undefined>();
  const [currency, setCurrency] = useState<Currency>(defaultCurrency(market));
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
    setFeatures(
      (value.features ?? []).filter(f => config.features.includes(f)),
    );
    setDeed(
      value.deed_type && config.deedTypes.includes(value.deed_type)
        ? value.deed_type
        : undefined,
    );
    setCurrency(
      value.currency && config.currencies.includes(value.currency)
        ? value.currency
        : defaultCurrency(market),
    );
    setMinText(
      value.min_price !== undefined ? formatNumber(value.min_price) : '',
    );
    setMaxText(
      value.max_price !== undefined ? formatNumber(value.max_price) : '',
    );
    setError(false);
  }, [visible, value, market, config]);

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
      // In the market's own order, so the same choice always makes the same request.
      features: features.length > 0 ? features : undefined,
      deed_type: deed,
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
    setFeatures([]);
    setDeed(undefined);
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
  const examples = EXAMPLES[currency];
  const hint = (word: string, amount: number) =>
    `${word} ${formatNumber(amount, 0)}`;
  // A market with one currency (Iran: toman only) has nothing to choose and nothing to say beside each box: the pills and
  // the word «تومان» inside the boxes would only repeat what is already known. Afghanistan (afghani | dollar) keeps both,
  // because there the unit is what the person is picking.
  const oneCurrency = config.currencies.length === 1;
  const unit = oneCurrency ? undefined : t(`currency.${currency}`);

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
            <AppText variant="label">{placeText('province', market, t)}</AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickerOpen(true)}
              style={styles.select}
            >
              <AppText color={province ? colors.text : colors.placeholder}>
                {province
                  ? province.name[language]
                  : placeText('allProvinces', market, t)}
              </AppText>
            </Pressable>
            <TextField
              label={t('home.district')}
              value={district}
              onChangeText={setDistrict}
              placeholder={placeText('districtPlaceholder', market, t)}
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
              options={config.propertyTypes.map(p => ({
                value: p,
                label: propertyTypeLabel(p, t, market),
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
              {config.dealTypes.map(d => (
                <Chip
                  compact
                  key={d}
                  label={dealTypeLabel(d, market, t)}
                  selected={deal === d}
                  onPress={() => setDeal(d)}
                />
              ))}
            </View>

            {config.features.length > 0 ? (
              <View testID="filter-features" style={styles.group}>
                <AppText variant="label">{t('listingFeature.label')}</AppText>
                <View style={styles.wrap}>
                  {config.features.map(f => (
                    <Chip
                      compact
                      key={f}
                      testID={`filter-feature-${f}`}
                      label={t(`listingFeature.${f}`)}
                      selected={features.includes(f)}
                      onPress={() =>
                        setFeatures(current =>
                          config.features.filter(x =>
                            x === f ? !current.includes(f) : current.includes(x),
                          ),
                        )
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {config.deedTypes.length > 0 ? (
              <View testID="filter-deed" style={styles.group}>
                <AppText variant="label">{t('deed.label')}</AppText>
                <View style={styles.wrap}>
                  <Chip
                    compact
                    label={t('deed.all')}
                    selected={!deed}
                    onPress={() => setDeed(undefined)}
                  />
                  {config.deedTypes.map(d => (
                    <Chip
                      compact
                      key={d}
                      testID={`filter-deed-${d}`}
                      label={t(`deed.${d}`)}
                      selected={deed === d}
                      onPress={() => setDeed(d)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </Card>

          <Card>
            <View style={styles.priceHead}>
              <AppText variant="label">{t('home.priceRange')}</AppText>
              {/* The same pills as under the price in the listing form. */}
              {oneCurrency ? null : (
                <View style={styles.wrap} testID="filter-currency">
                  {config.currencies.map(c => (
                    <Chip
                      compact
                      key={c}
                      label={t(`currency.${c}`)}
                      selected={currency === c}
                      onPress={() => setCurrency(c)}
                    />
                  ))}
                </View>
              )}
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
  group: { gap: spacing.sm },
  priceHead: {
    gap: spacing.md,
  },
  priceRow: { flexDirection: 'row', gap: spacing.md },
  priceBox: { flex: 1 },
  footerSmall: { flex: 1 },
  footerMain: { flex: 2 },
});
