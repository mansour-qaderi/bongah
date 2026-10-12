import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  CURRENCIES,
  DEAL_TYPES,
  PROPERTY_TYPES,
  type Currency,
  type DealType,
  type PropertyType,
} from '@bongah/shared-types';
import { createPropertySchema } from '@bongah/validation';
import { createProperty } from '../../api/endpoints';
import {
  errorMessage,
  isMapLocationRequired,
  isSubscriptionRequired,
} from '../../api/errors';
import { queryKeys } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import { Chip } from '../../components/Chip';
import PinSection from '../../components/PinSection';
import ProvincePicker from '../../components/ProvincePicker';
import { ScrollScreen } from '../../components/Screen';
import { EmptyView } from '../../components/States';
import TextField from '../../components/TextField';
import { provinceValue, type Province } from '../../constants/provinces';
import { jeribToSqm, parseNumberInput } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import {
  AFGHANISTAN_CAMERA,
  provinceCamera,
  type Coordinate,
} from '../../map/geo';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddProperty'>;
type AreaUnit = 'sqm' | 'jerib';
type FieldErrors = Partial<Record<string, string>>;

const MAX_IMAGE_LINKS = 10;
const roundTo2 = (n: number) => Math.round(n * 100) / 100;

export default function AddPropertyScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { language } = useFormat();
  const { status } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<PropertyType>('APARTMENT');
  const [deal, setDeal] = useState<DealType>('SALE');
  const [priceText, setPriceText] = useState('');
  const [currency, setCurrency] = useState<Currency>('AFGHANI');
  const [areaText, setAreaText] = useState('');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('sqm');
  const [bedroomsText, setBedroomsText] = useState('');
  const [bathroomsText, setBathroomsText] = useState('');
  const [province, setProvince] = useState<Province | null>(null);
  const [district, setDistrict] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [address, setAddress] = useState('');
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [imageLinks, setImageLinks] = useState<string[]>(['']);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  const provinceId = province?.id;
  const camera = useMemo(
    () => (province ? provinceCamera(province) : AFGHANISTAN_CAMERA),
    [province],
  );

  const mutation = useMutation({
    mutationFn: createProperty,
    onSuccess: async property => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.properties }),
        // A pin spends a prepaid credit, so the balance changed.
        queryClient.invalidateQueries({ queryKey: queryKeys.mapLocation }),
      ]);
      navigation.replace('PropertyDetails', { id: property.id });
    },
    onError: () => {
      // "You need an add-on" may come from a stale balance (spent on another device): refresh it.
      queryClient.invalidateQueries({ queryKey: queryKeys.mapLocation });
    },
  });

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

  const clearError = (field: string) =>
    setErrors(current =>
      current[field] ? { ...current, [field]: undefined } : current,
    );

  const submit = () => {
    const hasRooms = type !== 'LAND';
    const area = parseNumberInput(areaText);
    const price = parseNumberInput(priceText);
    const bedrooms = hasRooms ? parseNumberInput(bedroomsText) : null;
    const bathrooms = hasRooms ? parseNumberInput(bathroomsText) : null;

    const raw = {
      title,
      description,
      type,
      deal_type: deal,
      price: price === null ? undefined : roundTo2(price),
      currency,
      area_sqm:
        area === null
          ? undefined
          : roundTo2(areaUnit === 'jerib' ? jeribToSqm(area) : area),
      bedrooms: bedrooms ?? undefined,
      bathrooms: bathrooms ?? undefined,
      province: province ? provinceValue(province) : '',
      district,
      neighborhood,
      address,
      lat: coordinate?.latitude,
      lng: coordinate?.longitude,
      images: imageLinks.map(link => link.trim()).filter(Boolean),
    };

    // The same schema the server enforces, so mistakes are caught before a round trip.
    const parsed = createPropertySchema.safeParse(raw);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        let field = String(issue.path[0] ?? 'form');
        if (field === 'lat' || field === 'lng') field = 'location';
        if (next[field]) continue;
        const value = (raw as Record<string, unknown>)[issue.path[0] as string];
        const empty =
          value === undefined ||
          value === '' ||
          (Array.isArray(value) && !value.length);
        next[field] =
          field === 'location'
            ? t('map.outside')
            : empty
            ? t('add.required')
            : t('add.fieldInvalid');
      }
      setErrors(next);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  };

  const setImageLink = (index: number, value: string) =>
    setImageLinks(links =>
      links.map((link, i) => (i === index ? value : link)),
    );

  return (
    <ScrollScreen>
      {mutation.isError ? (
        <Banner kind="error" message={errorMessage(mutation.error, t)}>
          {isSubscriptionRequired(mutation.error) ? (
            <Button
              title={t('add.buySubscription')}
              variant="outline"
              onPress={() =>
                navigation.navigate('Checkout', { tab: 'subscription' })
              }
            />
          ) : null}
          {isMapLocationRequired(mutation.error) ? (
            <Button
              title={t('map.buy')}
              variant="outline"
              onPress={() => navigation.navigate('Checkout', { tab: 'map' })}
            />
          ) : null}
        </Banner>
      ) : null}
      {Object.keys(errors).length > 0 ? (
        <Banner kind="error" message={t('add.fixErrors')} />
      ) : null}

      <TextField
        label={t('add.titleField')}
        value={title}
        onChangeText={v => {
          setTitle(v);
          clearError('title');
        }}
        placeholder={t('add.titlePlaceholder')}
        maxLength={150}
        error={errors.title}
      />

      <AppText variant="label">{t('add.type')}</AppText>
      <View style={styles.wrap}>
        {PROPERTY_TYPES.map(p => (
          <Chip
            key={p}
            label={t(`propertyType.${p}`)}
            selected={type === p}
            onPress={() => setType(p)}
          />
        ))}
      </View>

      <AppText variant="label">{t('add.deal')}</AppText>
      <View style={styles.wrap}>
        {DEAL_TYPES.map(d => (
          <Chip
            key={d}
            label={t(`dealType.${d}`)}
            selected={deal === d}
            onPress={() => setDeal(d)}
          />
        ))}
      </View>

      <TextField
        label={t('add.price')}
        value={priceText}
        onChangeText={v => {
          setPriceText(v);
          clearError('price');
        }}
        keyboardType="decimal-pad"
        ltr
        error={errors.price}
      />
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

      <TextField
        label={t('add.area')}
        value={areaText}
        onChangeText={v => {
          setAreaText(v);
          clearError('area_sqm');
        }}
        keyboardType="decimal-pad"
        ltr
        error={errors.area_sqm}
      />
      <View style={styles.wrap}>
        {(['sqm', 'jerib'] as const).map(unit => (
          <Chip
            key={unit}
            label={t(`unit.${unit}`)}
            selected={areaUnit === unit}
            onPress={() => setAreaUnit(unit)}
          />
        ))}
      </View>

      {type !== 'LAND' ? (
        <View style={styles.pair}>
          <View style={styles.half}>
            <TextField
              label={t('add.bedrooms')}
              value={bedroomsText}
              onChangeText={v => {
                setBedroomsText(v);
                clearError('bedrooms');
              }}
              keyboardType="number-pad"
              maxLength={2}
              ltr
              error={errors.bedrooms}
            />
          </View>
          <View style={styles.half}>
            <TextField
              label={t('add.bathrooms')}
              value={bathroomsText}
              onChangeText={v => {
                setBathroomsText(v);
                clearError('bathrooms');
              }}
              keyboardType="number-pad"
              maxLength={2}
              ltr
              error={errors.bathrooms}
            />
          </View>
        </View>
      ) : null}

      <AppText variant="label">{t('add.province')}</AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => setPickerOpen(true)}
        style={[styles.select, errors.province ? styles.selectError : null]}
      >
        <AppText color={province ? colors.text : colors.textMuted}>
          {province ? province.name[language] : t('home.selectProvince')}
        </AppText>
      </Pressable>
      {errors.province ? (
        <AppText
          variant="caption"
          color={colors.danger}
          style={styles.fieldError}
        >
          {errors.province}
        </AppText>
      ) : null}

      <TextField
        label={t('add.district')}
        value={district}
        onChangeText={v => {
          setDistrict(v);
          clearError('district');
        }}
        placeholder={t('home.districtPlaceholder')}
        maxLength={80}
        error={errors.district}
      />
      <TextField
        label={t('add.neighborhood')}
        value={neighborhood}
        onChangeText={v => {
          setNeighborhood(v);
          clearError('neighborhood');
        }}
        placeholder={t('add.neighborhoodPlaceholder')}
        maxLength={80}
        error={errors.neighborhood}
      />
      <TextField
        label={t('add.address')}
        value={address}
        onChangeText={v => {
          setAddress(v);
          clearError('address');
        }}
        maxLength={300}
        error={errors.address}
      />

      <PinSection
        value={coordinate}
        camera={camera}
        onChange={c => {
          setCoordinate(c);
          clearError('location');
        }}
        onBuy={() => navigation.navigate('Checkout', { tab: 'map' })}
        error={errors.location}
      />

      <TextField
        label={t('add.descriptionField')}
        value={description}
        onChangeText={v => {
          setDescription(v);
          clearError('description');
        }}
        multiline
        maxLength={5000}
        error={errors.description}
        style={styles.descriptionInput}
      />

      <AppText variant="label">{t('add.images')}</AppText>
      <AppText variant="caption" color={colors.textMuted} style={styles.help}>
        {t('add.imagesHelp')}
      </AppText>
      {imageLinks.map((link, index) => (
        <TextField
          key={index}
          value={link}
          onChangeText={v => {
            setImageLink(index, v);
            clearError('images');
          }}
          placeholder={t('add.imageUrl')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          ltr
          error={index === 0 ? errors.images : undefined}
        />
      ))}
      {imageLinks.length < MAX_IMAGE_LINKS ? (
        <Button
          title={t('add.addImage')}
          variant="secondary"
          onPress={() => setImageLinks(links => [...links, ''])}
          style={styles.addImage}
        />
      ) : null}

      <Button
        title={t('add.submit')}
        onPress={submit}
        loading={mutation.isPending}
      />

      <ProvincePicker
        visible={pickerOpen}
        selectedId={provinceId ?? null}
        onClose={() => setPickerOpen(false)}
        onSelect={p => {
          setProvince(p);
          clearError('province');
          setPickerOpen(false);
        }}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  pair: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  select: {
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  selectError: { borderColor: colors.danger },
  fieldError: { marginTop: -spacing.sm, marginBottom: spacing.md },
  help: { marginBottom: spacing.sm },
  descriptionInput: { marginTop: spacing.lg },
  addImage: { marginBottom: spacing.xl },
});
