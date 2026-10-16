import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  CURRENCIES,
  DEAL_TYPES,
  PROPERTY_TYPES,
  PROPERTY_UNITS,
  type Currency,
  type DealType,
  type Property,
  type PropertyType,
  type PropertyUnitType,
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
import BottomSheet from '../../components/BottomSheet';
import Button from '../../components/Button';
import Card from '../../components/Card';
import { Chip } from '../../components/Chip';
import JeribInfoButton from '../../components/JeribInfo';
import { KeyboardAwareScrollView } from '../../components/KeyboardAware';
import PinSection from '../../components/PinSection';
import ProvincePicker from '../../components/ProvincePicker';
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
  toLngLat,
  type Coordinate,
  type MapCamera,
} from '../../map/geo';
import { findAddress as findOnMap, lookUpPlace } from '../../map/geocode';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddProperty'>;
type AreaUnit = 'sqm' | 'jerib';
type FieldErrors = Partial<Record<string, string>>;
/** What the pin's address lookup did: still asking, filled the form in, or the service could not say. */
type Lookup = 'idle' | 'finding' | 'filled' | 'failed';
/** What the map did about a written address: still looking, moved there, or did not know the place. */
type MapSync = 'idle' | 'finding' | 'found' | 'none';

const MAX_IMAGE_LINKS = 10;
/** After the last tap on the map, wait this long before asking for the address: one question per settled pin. */
export const LOOKUP_DELAY_MS = 700;
/** After the last key in the address, wait this long before asking the map where it is. */
export const ADDRESS_SYNC_DELAY_MS = 1000;
const roundTo2 = (n: number) => Math.round(n * 100) / 100;

/** Land and garages have no rooms to count. */
const hasRoomsFor = (type: PropertyType) =>
  type !== 'LAND' && type !== 'GARAGE_OTHER';

/** The place a pin found, written the way a person would say it: wide to narrow, one line. */
const addressFrom = (place: {
  district: string;
  neighborhood: string;
  street: string;
}) =>
  [place.district, place.neighborhood, place.street].filter(Boolean).join('، ');

/**
 * Post a listing, or (with a `propertyId`) change one of mine.
 *
 * The form and the map follow each other. Choose a province or write an address and the map flies there (it never
 * moves the pin, which only the person places); tap the map or drag the pin and the province and the address are
 * filled in from where it landed. Neither direction overwrites what the person typed.
 *
 * Where it is can be said two ways: put a pin on the map, which is free for everyone and fills in the province and
 * the address by itself, or write the address out as one line ("زرنج، ناحیه ۵، پهلوی شفاخانه ABC، داخل کوچه
 * موتررو"). With a pin the address is optional; without one it is required. The district and neighbourhood are no
 * longer asked for: the pin supplies them (they feed the district filter) and a written address carries them in its
 * own words. Typed text is never overwritten by a later pin move: the address only follows the pin while the
 * person has not written their own.
 *
 * It is a sheet, not a page: a transparent route (see RootNavigator) holds a bottom sheet that slides up over the
 * screen it was opened from, exactly like the filter sheet, with the main button pinned at its foot. Anything that
 * leaves for another screen (the subscription page, the sign-in) first slides the sheet away, and it slides back
 * with the form as it was when that screen is closed.
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
  const [unit, setUnit] = useState<PropertyUnitType | null>(null);
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
  const [open, setOpen] = useState(true);
  const [lookup, setLookup] = useState<Lookup>('idle');
  const [mapSync, setMapSync] = useState<MapSync>('idle');
  const [provinceGuessed, setProvinceGuessed] = useState(false);
  // Where the map looks. It moves when a province is picked by hand or an existing listing is loaded, never
  // because a pin was just placed (it is already there) or the province was filled in from the pin.
  const [camera, setCamera] = useState<MapCamera>(AFGHANISTAN_CAMERA);

  // What the pin filled in last, so a later move only replaces what the person has not changed by hand.
  const filledWith = useRef({ address: '' });
  const provinceIsAuto = useRef(false);
  // The latest typed values, for the address lookup, which finishes after the person may have kept typing.
  const typed = useRef({ address, province });
  typed.current = { address, province };
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupAbort = useRef<AbortController | null>(null);
  const syncAbort = useRef<AbortController | null>(null);
  const syncNonce = useRef(0);
  // An address the map must not chase: the one a pin wrote, or the one a listing being edited came with.
  const ignoredAddress = useRef('');
  useEffect(
    () => () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
      lookupAbort.current?.abort();
      syncAbort.current?.abort();
    },
    [],
  );

  // The written address (and the province it is in) say where the map should look. Waits for the typing to stop.
  useEffect(() => {
    const text = address.trim();
    if (text.length < 3 || text === ignoredAddress.current.trim()) {
      syncAbort.current?.abort();
      setMapSync('idle');
      return;
    }
    const timer = setTimeout(async () => {
      syncAbort.current?.abort();
      const abort = new AbortController();
      syncAbort.current = abort;
      setMapSync('finding');
      const where = province ? `${text}، ${province.name.prs}` : text;
      const result = await findOnMap(where, abort.signal);
      if (abort.signal.aborted) return;
      if (result.status === 'found') {
        syncNonce.current += 1;
        setCamera({
          center: toLngLat(result.coordinate),
          zoom: result.zoom,
          nonce: syncNonce.current,
        });
        setMapSync('found');
      } else {
        setMapSync(result.status === 'none' ? 'none' : 'idle');
      }
    }, ADDRESS_SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [address, province]);

  // What to do once the sheet has slid away: go to another screen. Nothing means the person closed the sheet, so
  // this route is left too.
  const pending = useRef<(() => void) | null>(null);
  const stepAside = (go: () => void) => {
    pending.current = go;
    setOpen(false);
  };
  const dismissed = () => {
    const go = pending.current;
    pending.current = null;
    if (go) go();
    else navigation.goBack();
  };
  // Back from the screen the sheet stepped aside for: slide up again, form intact.
  useEffect(
    () => navigation.addListener('focus', () => setOpen(true)),
    [navigation],
  );
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);

  function fillFrom(property: Property) {
    setTitle(property.title);
    setDescription(property.description);
    setType(property.type);
    setUnit(property.unit_type ?? null);
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
    // The address a listing already has is not a request to move the map: its own pin (or province) decides.
    ignoredAddress.current = property.address;
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
      if (editing) stepAside(() => navigation.goBack());
      else
        stepAside(() =>
          navigation.replace('PropertyDetails', { id: property.id }),
        );
    },
  });

  const sheetTitle = editing ? t('add.editTitle') : t('nav.addProperty');
  /** The sheet around whatever the screen has to show right now. */
  const sheet = (content: React.ReactNode, footer?: React.ReactNode) => (
    <BottomSheet
      visible={open}
      onClose={() => setOpen(false)}
      onDismissed={dismissed}
      title={sheetTitle}
      heightRatio={0.92}
      footer={footer}
    >
      {content}
    </BottomSheet>
  );

  if (status !== 'signedIn') {
    return sheet(
      <EmptyView message={t('auth.signInRequired')}>
        <Button
          title={t('auth.signIn')}
          onPress={() => stepAside(() => navigation.navigate('Auth'))}
        />
      </EmptyView>,
    );
  }
  if (editing && existing.isPending) return sheet(<LoadingView />);
  if (editing && existing.isError) {
    return sheet(
      <ErrorView
        message={errorMessage(existing.error, t)}
        onRetry={() => existing.refetch()}
      />,
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
  /** The ℹ beside the "مساحت" label: what a jerib is, and what the typed area comes to in jerib. */
  const areaInfo = (
    <JeribInfoButton
      areaSqm={
        typedArea === null
          ? undefined
          : areaUnit === 'jerib'
          ? jeribToSqm(typedArea)
          : typedArea
      }
    />
  );

  /** "۲,۵۰۰,۰۰۰": a sample figure for an empty box (the lighter placeholder colour is what says it is only a hint). */
  const example = (amount: number) => formatNumber(amount);

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
    // The service could not describe the spot: say so, so the person knows to write the address themselves.
    if (!place.answered) {
      if (
        place.province &&
        (typed.current.province === null || provinceIsAuto.current)
      ) {
        provinceIsAuto.current = true;
        setProvince(place.province);
        setProvinceGuessed(true);
        clearError('province');
      }
      setLookup('failed');
      return;
    }

    const now = typed.current;
    // The structured parts are the pin's own (the district filter reads them): they always follow it.
    if (place.district) setDistrict(place.district);
    if (place.neighborhood) setNeighborhood(place.neighborhood);
    // The written address follows the pin only while it is empty or still what the last pin put there.
    const found = addressFrom(place);
    if (
      found &&
      (now.address === '' || now.address === filledWith.current.address)
    ) {
      setAddress(found);
      filledWith.current.address = found;
      ignoredAddress.current = found;
      clearError('address');
    }
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
      unit_type: unit,
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

    const next: FieldErrors = {};
    // The schema lets a count be left out; this form does not (a listing without them is not comparable).
    if (hasRooms && bedrooms === null) next.bedrooms = t('add.required');
    if (hasRooms && bathrooms === null) next.bathrooms = t('add.required');

    // The same schema the server enforces, so mistakes are caught before a round trip.
    const parsed = createPropertySchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        let field = String(issue.path[0] ?? 'form');
        if (field === 'lat' || field === 'lng') field = 'location';
        // The district and neighbourhood have no box of their own: what is wrong with them is wrong with the address.
        if (field === 'district' || field === 'neighborhood') field = 'address';
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
    }
    if (!parsed.success || Object.keys(next).length > 0) {
      setErrors(next);
      // The banner that says what is wrong is at the top of the form.
      scroller.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  };

  const setImageLink = (index: number, value: string) =>
    setImageLinks(links =>
      links.map((link, i) => (i === index ? value : link)),
    );

  /** The address: required until the map says where it is, optional after. */
  const addressLabel = pinned
    ? `${t('add.address')} (${t('common.optional')})`
    : t('add.address');

  return sheet(
    <KeyboardAwareScrollView
      ref={scroller}
      contentContainerStyle={styles.content}
    >
      {mutation.isError ? (
        <Banner kind="error" message={errorMessage(mutation.error, t)}>
          {isSubscriptionRequired(mutation.error) ? (
            <Button
              title={t('add.buySubscription')}
              variant="outline"
              onPress={() =>
                stepAside(() =>
                  navigation.navigate('Checkout', { tab: 'subscription' }),
                )
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
          placeholder={t(`add.titleExamples.${type}`)}
          maxLength={150}
          error={errors.title}
        />

        <AppText variant="label" color={colors.textSecondary}>
          {t('add.type')}
        </AppText>
        <View style={styles.wrap}>
          {PROPERTY_TYPES.map(p => (
            <Chip
              compact
              key={p}
              label={t(`propertyType.${p}`)}
              selected={type === p}
              onPress={() => {
                setType(p);
                // A unit belongs to one type: changing the type drops one that no longer fits.
                if (unit && !PROPERTY_UNITS[p].includes(unit)) setUnit(null);
              }}
            />
          ))}
        </View>

        <AppText variant="label" color={colors.textSecondary}>
          {`${t('add.unit')} (${t('common.optional')})`}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} style={styles.help}>
          {t('add.unitHelp')}
        </AppText>
        <View style={styles.wrap} testID="unit-chips">
          {PROPERTY_UNITS[type].map(u => (
            <Chip
              compact
              key={u}
              label={t(`unitType.${u}`)}
              selected={unit === u}
              onPress={() => setUnit(unit === u ? null : u)}
            />
          ))}
        </View>

        <AppText variant="label" color={colors.textSecondary}>
          {t('add.deal')}
        </AppText>
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
          placeholder={example(currency === 'USD' ? 25_000 : 2_500_000)}
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
          labelAccessory={areaInfo}
          value={areaText}
          onChangeText={v => {
            setAreaText(v);
            clearError('area_sqm');
          }}
          keyboardType="decimal-pad"
          placeholder={example(areaUnit === 'jerib' ? 2 : 200)}
          helper={areaHelper}
          error={errors.area_sqm}
        />
        <View style={styles.toggle}>
          <SegmentedControl
            value={areaUnit}
            onChange={setAreaUnit}
            options={(['sqm', 'jerib'] as const).map(measure => ({
              value: measure,
              label: t(`unit.${measure}`),
            }))}
          />
        </View>

        {hasRooms ? (
          <View style={styles.counts}>
            <Stepper
              label={t('add.bedrooms')}
              required
              value={bedrooms}
              onChange={v => {
                setBedrooms(v);
                clearError('bedrooms');
              }}
              error={errors.bedrooms}
            />
            <Stepper
              label={t('add.bathrooms')}
              required
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
          ) : lookup === 'failed' ? (
            <AppText variant="caption" color={colors.textMuted}>
              {t('add.lookupFailed')}
            </AppText>
          ) : null}
          {mapSync === 'finding' ? (
            <View style={styles.finding}>
              <ActivityIndicator size="small" color={colors.primary} />
              <AppText variant="caption" color={colors.textMuted}>
                {t('add.mapFinding')}
              </AppText>
            </View>
          ) : mapSync === 'found' ? (
            <AppText variant="caption" color={colors.primaryDark}>
              {t('add.mapFound')}
            </AppText>
          ) : mapSync === 'none' ? (
            <AppText variant="caption" color={colors.textMuted}>
              {t('add.mapNotFound')}
            </AppText>
          ) : null}
        </PinSection>

        <AppText variant="label" color={colors.textSecondary}>
          {t('add.province')}
        </AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPickerOpen(true)}
          style={[styles.select, errors.province ? styles.selectError : null]}
        >
          <AppText color={province ? colors.text : colors.placeholder}>
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

        <TextField
          label={addressLabel}
          value={address}
          onChangeText={v => {
            setAddress(v);
            clearError('address');
          }}
          placeholder={t('add.addressPlaceholder')}
          helper={pinned ? t('add.addressOptional') : t('add.addressRequired')}
          multiline
          maxLength={300}
          error={errors.address}
          style={styles.addressInput}
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
          placeholder={t('add.descriptionPlaceholder')}
          multiline
          maxLength={5000}
          error={errors.description}
          style={styles.descriptionInput}
        />

        <AppText variant="label" color={colors.textSecondary}>
          {t('add.images')}
        </AppText>
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
    </KeyboardAwareScrollView>,
    <Button
      title={editing ? t('add.save') : t('add.submit')}
      onPress={submit}
      loading={mutation.isPending}
      style={styles.submit}
    />,
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  submit: { flex: 1 },
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
  addressInput: { minHeight: 88 },
  help: { marginBottom: spacing.sm },
  descriptionInput: { marginTop: 0 },
});
