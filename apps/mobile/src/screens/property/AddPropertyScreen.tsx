import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  CURRENCIES,
  DEAL_TYPES,
  PROPERTY_TYPES,
  type Currency,
  type DealType,
  type Property,
  type PropertyType,
} from '@bongah/shared-types';
import {
  createPropertySchema,
  type CreatePropertyInput,
} from '@bongah/validation';
import { createProperty, updateProperty } from '../../api/endpoints';
import { errorMessage, isSubscriptionRequired } from '../../api/errors';
import { queryKeys, usePropertyDetail } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import Card from '../../components/Card';
import { Chip } from '../../components/Chip';
import PinSection from '../../components/PinSection';
import ProvincePicker from '../../components/ProvincePicker';
import { ScrollScreen } from '../../components/Screen';
import SegmentedControl from '../../components/SegmentedControl';
import Stepper from '../../components/Stepper';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import TextField from '../../components/TextField';
import {
  findProvince,
  provinceValue,
  type Province,
} from '../../constants/provinces';
import {
  formatCurrency,
  formatNumber,
  jeribToSqm,
  parseNumberInput,
} from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import {
  AFGHANISTAN_CAMERA,
  cameraAt,
  provinceCamera,
  type Coordinate,
  type MapCamera,
} from '../../map/geo';
import { lookUpPlace } from '../../map/geocode';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddProperty'>;
type AreaUnit = 'sqm' | 'jerib';
type FieldErrors = Partial<Record<string, string>>;
type Lookup = 'idle' | 'finding' | 'filled';

const MAX_IMAGE_LINKS = 10;
/** After the last tap on the map, wait this long before asking for the address: one question per settled pin. */
export const LOOKUP_DELAY_MS = 700;
const roundTo2 = (n: number) => Math.round(n * 100) / 100;

/** Land and garages have no rooms to count. */
const hasRoomsFor = (type: PropertyType) =>
  type !== 'LAND' && type !== 'GARAGE_OTHER';

/**
 * Post a listing, or (with a `propertyId`) change one of mine.
 *
 * Where it is can be said two ways: put a pin on the map, which is free for everyone and fills in the province,
 * district, neighbourhood and street by itself, or write the address out. With a pin the written parts are
 * optional; without one they are required. Typed text is never overwritten by a later pin move: the address
 * only follows the pin for the parts the person has not touched.
 */
export default function AddPropertyScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { language } = useFormat();
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const propertyId = route.params?.propertyId;
  const editing = propertyId !== undefined;
  const existing = usePropertyDetail(propertyId ?? '', editing);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<PropertyType>(PROPERTY_TYPES[0]);
  const [deal, setDeal] = useState<DealType>('SALE');
  const [priceText, setPriceText] = useState('');
  const [currency, setCurrency] = useState<Currency>('AFGHANI');
  const [areaText, setAreaText] = useState('');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('sqm');
  const [bedrooms, setBedrooms] = useState<number | null>(null);
  const [bathrooms, setBathrooms] = useState<number | null>(null);
  const [province, setProvince] = useState<Province | null>(null);
  const [district, setDistrict] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [address, setAddress] = useState('');
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [imageLinks, setImageLinks] = useState<string[]>(['']);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lookup, setLookup] = useState<Lookup>('idle');
  const [provinceGuessed, setProvinceGuessed] = useState(false);
  // Where the map looks. It moves when a province is picked by hand or an existing listing is loaded, never
  // because a pin was just placed (it is already there) or the province was filled in from the pin.
  const [camera, setCamera] = useState<MapCamera>(AFGHANISTAN_CAMERA);

  // What the pin filled in last, so a later move only replaces what the person has not changed by hand.
  const filledWith = useRef({
    district: '',
    neighborhood: '',
    address: '',
  });
  const provinceIsAuto = useRef(false);
  // The latest typed values, for the address lookup, which finishes after the person may have kept typing.
  const typed = useRef({ district, neighborhood, address, province });
  typed.current = { district, neighborhood, address, province };
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupAbort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
      lookupAbort.current?.abort();
    },
    [],
  );

  // A new listing keeps the title the navigator gives the route; editing one says so.
  useEffect(() => {
    if (editing) navigation.setOptions({ title: t('add.editTitle') });
  }, [navigation, editing, t]);

  function fillFrom(property: Property) {
    setTitle(property.title);
    setDescription(property.description);
    setType(property.type);
    setDeal(property.deal_type);
    setPriceText(String(property.price));
    setCurrency(property.currency);
    setAreaText(String(property.area_sqm));
    setAreaUnit('sqm');
    setBedrooms(property.bedrooms);
    setBathrooms(property.bathrooms);
    const known = findProvince(property.province) ?? null;
    setProvince(known);
    setDistrict(property.district);
    setNeighborhood(property.neighborhood ?? '');
    setAddress(property.address);
    const pin =
      property.lat !== null && property.lng !== null
        ? { latitude: property.lat, longitude: property.lng }
        : null;
    setCoordinate(pin);
    if (pin) setCamera(cameraAt(pin));
    else if (known) setCamera(provinceCamera(known));
    setImageLinks(property.images.length ? [...property.images] : ['']);
  }

  // Editing: fill the form from the listing, once.
  const loaded = useRef(false);
  const original = existing.data;
  useEffect(() => {
    if (!original || loaded.current) return;
    loaded.current = true;
    fillFrom(original);
  }, [original]);

  const mutation = useMutation({
    mutationFn: (data: CreatePropertyInput) =>
      editing ? updateProperty(propertyId, data) : createProperty(data),
    onSuccess: async property => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.properties });
      if (editing) navigation.goBack();
      else navigation.replace('PropertyDetails', { id: property.id });
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
  if (editing && existing.isPending) return <LoadingView />;
  if (editing && existing.isError) {
    return (
      <ErrorView
        message={errorMessage(existing.error, t)}
        onRetry={() => existing.refetch()}
      />
    );
  }

  const pinned = coordinate !== null;
  const hasRooms = hasRoomsFor(type);

  // What has been typed, written back as money / an area, so a mistyped zero is seen before it is sent.
  const typedPrice = parseNumberInput(priceText);
  const moneyHelper =
    typedPrice === null ? undefined : formatCurrency(typedPrice, currency);
  const typedArea = parseNumberInput(areaText);
  const areaHelper =
    typedArea === null
      ? undefined
      : `${formatNumber(typedArea)} ${t(`unit.${areaUnit}`)}`;

  const clearError = (field: string) =>
    setErrors(current =>
      current[field] ? { ...current, [field]: undefined } : current,
    );

  /** Asks what is at the pin and fills in what the person has not written themselves. */
  const findAddress = async (point: Coordinate) => {
    lookupAbort.current?.abort();
    const abort = new AbortController();
    lookupAbort.current = abort;
    setLookup('finding');
    const place = await lookUpPlace(point, abort.signal);
    if (abort.signal.aborted) return;

    const fill = (
      field: 'district' | 'neighborhood' | 'address',
      current: string,
      found: string,
      set: (value: string) => void,
    ) => {
      // Untouched (empty) or still what the last pin put there: follow the pin. Anything else is the person's.
      if (found && (current === '' || current === filledWith.current[field])) {
        set(found);
        filledWith.current[field] = found;
        clearError(field);
      }
    };
    const now = typed.current;
    fill('district', now.district, place.district, setDistrict);
    fill('neighborhood', now.neighborhood, place.neighborhood, setNeighborhood);
    fill('address', now.address, place.street, setAddress);
    if (place.province && (now.province === null || provinceIsAuto.current)) {
      provinceIsAuto.current = true;
      setProvince(place.province);
      setProvinceGuessed(place.provinceApproximate);
      clearError('province');
    }
    setLookup('filled');
  };

  const placePin = (point: Coordinate) => {
    setCoordinate(point);
    clearError('location');
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(() => {
      findAddress(point);
    }, LOOKUP_DELAY_MS);
  };

  const submit = () => {
    const area = parseNumberInput(areaText);
    const price = parseNumberInput(priceText);

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
      bedrooms: hasRooms ? bedrooms ?? undefined : undefined,
      bathrooms: hasRooms ? bathrooms ?? undefined : undefined,
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

  /** A part of the address: required until the map says where it is, optional after. */
  const placeLabel = (
    key: 'add.district' | 'add.neighborhood' | 'add.address',
  ) => (pinned ? `${t(key)} (${t('common.optional')})` : t(key));

  const addressErrors =
    errors.district || errors.neighborhood || errors.address;

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
        </Banner>
      ) : null}
      {Object.keys(errors).length > 0 ? (
        <Banner kind="error" message={t('add.fixErrors')} />
      ) : null}

      <Card title={t('add.sectionBasics')} flush>
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
              compact
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
              compact
              key={d}
              label={t(`dealType.${d}`)}
              selected={deal === d}
              onPress={() => setDeal(d)}
            />
          ))}
        </View>
      </Card>

      <Card title={t('add.sectionPrice')} flush>
        <TextField
          label={t('add.price')}
          value={priceText}
          onChangeText={v => {
            setPriceText(v);
            clearError('price');
          }}
          keyboardType="decimal-pad"
          helper={moneyHelper}
          error={errors.price}
        />
        <View style={styles.toggle}>
          <SegmentedControl
            value={currency}
            onChange={setCurrency}
            options={CURRENCIES.map(c => ({
              value: c,
              label: t(`currency.${c}`),
            }))}
          />
        </View>

        <TextField
          label={t('add.area')}
          value={areaText}
          onChangeText={v => {
            setAreaText(v);
            clearError('area_sqm');
          }}
          keyboardType="decimal-pad"
          helper={areaHelper}
          error={errors.area_sqm}
        />
        <View style={styles.toggle}>
          <SegmentedControl
            value={areaUnit}
            onChange={setAreaUnit}
            options={(['sqm', 'jerib'] as const).map(unit => ({
              value: unit,
              label: t(`unit.${unit}`),
            }))}
          />
        </View>

        {hasRooms ? (
          <View style={styles.counts}>
            <Stepper
              label={t('add.bedrooms')}
              value={bedrooms}
              onChange={v => {
                setBedrooms(v);
                clearError('bedrooms');
              }}
              error={errors.bedrooms}
            />
            <Stepper
              label={t('add.bathrooms')}
              value={bathrooms}
              onChange={v => {
                setBathrooms(v);
                clearError('bathrooms');
              }}
              error={errors.bathrooms}
            />
          </View>
        ) : null}
      </Card>

      <Card title={t('add.sectionPlace')} flush>
        <PinSection
          value={coordinate}
          camera={camera}
          onChange={placePin}
          error={errors.location}
        >
          {lookup === 'finding' ? (
            <View style={styles.finding}>
              <ActivityIndicator size="small" color={colors.primary} />
              <AppText variant="caption" color={colors.textMuted}>
                {t('add.finding')}
              </AppText>
            </View>
          ) : lookup === 'filled' ? (
            <AppText variant="caption" color={colors.primaryDark}>
              {t('add.filled')}
            </AppText>
          ) : null}
        </PinSection>

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
        ) : provinceGuessed ? (
          <AppText
            variant="caption"
            color={colors.accentText}
            style={styles.fieldError}
          >
            {t('add.provinceGuessed')}
          </AppText>
        ) : null}

        <AppText
          variant="caption"
          color={addressErrors ? colors.danger : colors.textMuted}
          style={styles.addressNote}
        >
          {pinned ? t('add.addressOptional') : t('add.addressRequired')}
        </AppText>
        <TextField
          label={placeLabel('add.district')}
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
          label={placeLabel('add.neighborhood')}
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
          label={placeLabel('add.address')}
          value={address}
          onChangeText={v => {
            setAddress(v);
            clearError('address');
          }}
          maxLength={300}
          error={errors.address}
        />
      </Card>

      <Card title={t('add.sectionDetails')} flush>
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
            digits="keep"
            ltr
            error={index === 0 ? errors.images : undefined}
          />
        ))}
        {imageLinks.length < MAX_IMAGE_LINKS ? (
          <Button
            title={t('add.addImage')}
            variant="outline"
            onPress={() => setImageLinks(links => [...links, ''])}
          />
        ) : null}
      </Card>

      <Button
        title={editing ? t('add.save') : t('add.submit')}
        onPress={submit}
        loading={mutation.isPending}
      />

      <ProvincePicker
        visible={pickerOpen}
        selectedId={province?.id ?? null}
        onClose={() => setPickerOpen(false)}
        onSelect={p => {
          if (!p) return;
          // Chosen by hand: from now on a pin does not change it.
          provinceIsAuto.current = false;
          setProvinceGuessed(false);
          setProvince(p);
          setCamera(provinceCamera(p));
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
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  toggle: { marginTop: spacing.xs, marginBottom: spacing.lg },
  counts: { flexDirection: 'row', gap: spacing.md },
  finding: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  addressNote: { marginBottom: spacing.md },
  help: { marginBottom: spacing.sm },
  descriptionInput: { marginTop: 0 },
});
