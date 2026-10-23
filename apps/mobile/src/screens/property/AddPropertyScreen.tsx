import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  CURRENCIES,
  DEAL_TYPES,
  PROPERTY_TYPES,
  PRICE_TERMS,
  PROPERTY_UNIT_MAX_LENGTH,
  type Currency,
  type DealType,
  type PriceTerms,
  type Property,
  type PropertyType,
} from '@bongah/shared-types';
import {
  createPropertySchema,
  type CreatePropertyInput,
} from '@bongah/validation';
import { createProperty, getMe, updateProperty } from '../../api/endpoints';
import {
  errorMessage,
  isAnyListingLimit,
  isListingLimitReached,
  isSubscriptionRequired,
  listingLimitMessage,
} from '../../api/errors';
import { queryKeys, usePricing, usePropertyDetail } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import BottomSheet from '../../components/BottomSheet';
import Button from '../../components/Button';
import Card from '../../components/Card';
import { Chip } from '../../components/Chip';
import FramePayStep from '../../components/FramePayStep';
import LadderUnlockBanner from '../../components/LadderUnlockBanner';
import { KeyboardAwareScrollView } from '../../components/KeyboardAware';
import LocationEditor from '../../components/LocationEditor';
import MapLoader from '../../components/MapLoader';
import { Reveal, useReveal } from '../../components/Reveal';
import LocationPermissionModal, {
  type LocationProblem,
} from '../../components/LocationPermissionModal';
import PinSection from '../../components/PinSection';
import PlaceSearchField from '../../components/PlaceSearchField';
import ProvincePicker from '../../components/ProvincePicker';
import SegmentedControl from '../../components/SegmentedControl';
import SelectField from '../../components/SelectField';
import Stepper from '../../components/Stepper';
import SwitchRow from '../../components/SwitchRow';
import { showToast } from '../../components/Toast';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import TextField from '../../components/TextField';
import {
  findProvince,
  provinceValue,
  type Province,
} from '../../constants/provinces';
import { hasRoomsFor } from '../../constants/propertyRooms';
import {
  formatDate,
  formatNumber,
  parseNumberInput,
} from '../../i18n/format';
import { propertyTypeLabel } from '../../i18n/propertyType';
import { propertyLineIcon } from '../../map/markers';
import { useFormat } from '../../i18n/useFormat';
import {
  AFGHANISTAN_CAMERA,
  cameraAt,
  provinceCamera,
  toLngLat,
  type Coordinate,
  type MapCamera,
} from '../../map/geo';
import {
  findAddressLoosely as findOnMap,
  nearestProvince,
} from '../../map/geocode';
import type { MapViewChange } from '../../map/BaseMap';
import { describeSpot, type ResolvedPlace } from '../../map/GeocodingService';
import { locate } from '../../map/location';
import type { RootStackParamList } from '../../navigation/types';
import { useFeaturedCreditSpend } from '../../payments/useFeaturedCreditSpend';
import { colors, radius, spacing } from '../../theme';
import {
  failingFields,
  formFieldFor,
  fieldMessage,
  serverFieldErrors,
  toastForErrors,
  type FieldErrors,
  type FormField,
} from './formErrors';
import { monthsFromInput, splitMonths, type DurationUnit } from './mortgage';
import { addressFrom, swapProvince } from '../../utils/addressLine';

type Props = NativeStackScreenProps<RootStackParamList, 'AddProperty'>;
type ViewNode = React.ComponentRef<typeof View>;
/** What the pin's address lookup did: still asking, filled the form in, or the service could not say. */
type Lookup = 'idle' | 'finding' | 'filled' | 'failed';
/** What the map did about a written address: still looking, moved there, or did not know the place. */
type MapSync = 'idle' | 'finding' | 'found' | 'none' | 'province';

const MAX_IMAGE_LINKS = 10;
/** After the last tap on the map, wait this long before asking for the address: one question per settled pin. */
export const LOOKUP_DELAY_MS = 700;
/** How far in the map looks at the phone's position: a few streets, enough to find the property's own. */
export const MY_POSITION_ZOOM = 16;
const roundTo2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Only a house, an apartment or an office is "unit 3 of a building". Asking it of land, a garden, a garage or a shop
 * only confuses people (a garage is not "unit 3"), so the field is not there for them.
 */
export const UNIT_TYPES: readonly PropertyType[] = [
  'HOUSE_HAWILI',
  'APARTMENT',
  'OFFICE',
];
export const hasUnitFor = (type: PropertyType) => UNIT_TYPES.includes(type);

/**
 * Post a listing, or (with a `propertyId`) change one of mine.
 *
 * The form and the map follow each other. One field, "آدرس یا اسم مکان", takes an address or the name of a place
 * nearby (a hospital, a university, a café) and suggests places as the person types (Google / Mapbox through the API,
 * OpenStreetMap otherwise, see GeocodingService); picking one flies the map there and fills in the province. Tap the
 * map or drag the pin, and the province and the address are filled in from where it is.
 * Neither direction overwrites what the person typed, and only the person places the pin.
 *
 * The map opens on the phone's position (the permission is asked for once, when the form opens) and can be made
 * fullscreen for an exact pin. The property's place is its pin and only that: a pin in the colour of the deal (green
 * for a sale, blue for a rent, orange for a mortgage), put by a tap and moved by dragging. There is no outline to
 * draw and no area worked out from the map: the area is the number the person types.
 *
 * The address is always required, written out as one line ("نیمروز، زرنج، ناحیه ۴، پهلوی شفاخانه، داخل کوچه
 * موتررو"); the pin is not. When the form opens the phone's position fills the province and the address in (if nobody
 * has written or chosen anything yet); a pin writes the whole line, province first, into the field
 * when it is empty; and a written address is looked up and the map goes there (to the province when the map does not
 * know the address). The province is still stored on its own (the filters and the DB need it): it comes from the pin,
 * the chosen place or the phone, and its small "تغییر" row under the field shows only while it is unknown or was only
 * guessed.
 *
 * It is a sheet, not a page: a transparent route (see RootNavigator) holds a bottom sheet that slides up over the
 * screen it was opened from, exactly like the filter sheet, with the main button pinned at its foot. Anything that
 * leaves for another screen (the subscription page, the sign-in) first slides the sheet away, and it slides back
 * with the form as it was when that screen is closed.
 */
export default function AddPropertyScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const { language } = format;
  const { status, user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const propertyId = route.params?.propertyId;
  const editing = propertyId !== undefined;
  const existing = usePropertyDetail(propertyId ?? '', editing);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<PropertyType>(PROPERTY_TYPES[0]);
  // Which unit of a building ("واحد ۳"), as the owner writes it.
  const [unit, setUnit] = useState('');
  const [deal, setDeal] = useState<DealType>('SALE');
  const [priceText, setPriceText] = useState('');
  const [currency, setCurrency] = useState<Currency>('AFGHANI');
  // How long a mortgage (گروی) runs, as typed, and whether the number is months or years.
  const [durationText, setDurationText] = useState('');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('month');
  // مقطوع / جورآمد; null says neither.
  const [priceTerms, setPriceTerms] = useState<PriceTerms | null>(null);
  // Asked for the featured frame (کادر ویژه) along with this save.
  const [framed, setFramed] = useState(false);
  // The id of the listing just saved while its frame still has to be paid for: the sheet shows the payment step.
  const [payingFrame, setPayingFrame] = useState<string | null>(null);
  const [areaText, setAreaText] = useState('');
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
  const [fullscreen, setFullscreen] = useState(false);
  // Where the map is looking now (a finger moves it without telling `camera`), so the other map opens exactly there.
  const view = useRef<{ center: MapCamera['center']; zoom: number } | null>(
    null,
  );
  const keepView = useCallback((next: MapViewChange) => {
    view.current = { center: next.center, zoom: next.zoom };
  }, []);
  // The phone's position (the blue dot), and the search for it.
  const [me, setMe] = useState<Coordinate | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationProblem, setLocationProblem] =
    useState<LocationProblem | null>(null);
  const [outside, setOutside] = useState(false);
  // What the place field did with a chosen row: flew the map there, or could not find it.
  const [placeNote, setPlaceNote] = useState<
    { kind: 'chosen'; name: string } | { kind: 'notResolved' } | null
  >(null);

  const clearError = (field: string) =>
    setErrors(current =>
      current[field] ? { ...current, [field]: undefined } : current,
    );

  // What the pin filled in last, so a later move only replaces what the person has not changed by hand.
  const filledWith = useRef({ address: '' });
  const provinceIsAuto = useRef(false);
  // Fills the province and the address in from a spot (see findAddress, defined below the early returns).
  const describePlace = useRef<(point: Coordinate) => void>(() => undefined);
  // The latest typed values, for the address lookup, which finishes after the person may have kept typing.
  const typed = useRef({ address, province });
  typed.current = { address, province };
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupAbort = useRef<AbortController | null>(null);
  const syncAbort = useRef<AbortController | null>(null);
  const syncNonce = useRef(0);
  // Set once the map was sent somewhere on purpose (a province, a place, a listing being edited), so a slow first
  // GPS fix does not pull it away again.
  const steered = useRef(false);
  const mounted = useRef(true);
  // The latest pin, for the handlers that run after an await or a timer.
  const pinRef = useRef(coordinate);
  pinRef.current = coordinate;
  useEffect(
    () => () => {
      mounted.current = false;
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
      lookupAbort.current?.abort();
      syncAbort.current?.abort();
    },
    [],
  );

  /** Sends the map somewhere, and remembers it as where the map is looking (the next view event refines it). */
  const moveCamera = useCallback((next: MapCamera) => {
    view.current = { center: next.center, zoom: next.zoom };
    setCamera(next);
  }, []);

  /** Points the map at a spot. Every move gets a new nonce, so flying back to the same place still flies. */
  const lookAt = useCallback(
    (at: Coordinate, zoom: number) => {
      syncNonce.current += 1;
      moveCamera({ center: toLngLat(at), zoom, nonce: syncNonce.current });
    },
    [moveCamera],
  );

  /**
   * Where is the phone? `auto` is the look when the form opens: it asks for the permission (once; the phone remembers
   * the answer), shows the blue dot, and moves the map only while nobody has steered it and there is no pin. The
   * button (not auto) always moves it and explains a refusal or a GPS that is off.
   */
  const locateMe = useCallback(
    async (auto: boolean) => {
      setLocating(true);
      const result = await locate({ ask: true });
      if (!mounted.current) return;
      setLocating(false);
      if (result.status === 'ok') {
        setMe(result.coordinate);
        if (auto && (steered.current || pinRef.current)) return;
        lookAt(result.coordinate, MY_POSITION_ZOOM);
        // The form has just opened on the phone's position: the province and the address start from it (only what is
        // still empty; the person's own words and choices are never overwritten). No pin is placed: that is theirs.
        if (auto) describePlace.current(result.coordinate);
      } else if (!auto && result.status !== 'outside') {
        setLocationProblem(result.status);
      }
    },
    [lookAt],
  );

  /**
   * The place field found nothing for what was typed (or could not ask): look for the written address the slow way,
   * dropping its narrowest parts until the map knows it (see findAddressLoosely), and fly there.
   */
  const chaseAddress = async (text: string) => {
    if (text.trim().length < 3) return;
    syncAbort.current?.abort();
    const abort = new AbortController();
    syncAbort.current = abort;
    setMapSync('finding');
    const result = await findOnMap(
      text,
      typed.current.province?.name.prs,
      abort.signal,
    );
    if (abort.signal.aborted || !mounted.current) return;
    if (result.status === 'found') {
      steered.current = true;
      lookAt(result.coordinate, result.zoom);
      // No province yet: the nearest capital to where the address is, said to be a guess.
      if (typed.current.province === null || provinceIsAuto.current) {
        provinceIsAuto.current = true;
        setProvince(nearestProvince(result.coordinate));
        setProvinceGuessed(true);
        clearError('province');
      }
      setMapSync('found');
    } else if (result.status === 'none') {
      // The map does not know this address: show the province it is in, the nearest thing it does know (unless a pin
      // is already placed, which is where the person wants the map to look).
      const known = typed.current.province;
      if (known && !pinRef.current) {
        steered.current = true;
        syncNonce.current += 1;
        moveCamera({ ...provinceCamera(known), nonce: syncNonce.current });
        setMapSync('province');
      } else {
        setMapSync('none');
      }
    } else {
      setMapSync('idle');
    }
  };

  /** A row of the place field was chosen and found: fly there and take its province, unless one was chosen by hand. */
  const placeChosen = (place: ResolvedPlace) => {
    syncAbort.current?.abort();
    setMapSync('idle');
    steered.current = true;
    lookAt(place.coordinate, place.zoom);
    if (typed.current.province === null || provinceIsAuto.current) {
      provinceIsAuto.current = true;
      setProvince(place.province);
      setProvinceGuessed(place.provinceApproximate);
      clearError('province');
    }
    // The structured parts belong to the pin when there is one; without one the chosen place supplies them.
    if (!pinRef.current) {
      if (place.district) setDistrict(place.district);
      if (place.neighborhood) setNeighborhood(place.neighborhood);
    }
    clearError('address');
    setPlaceNote({ kind: 'chosen', name: place.title });
  };

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

  // A new listing: find the phone as the form opens, so the map starts on the street the person is standing in.
  // (An edit starts on the listing's own pin; the button still finds the phone there.)
  const signedIn = status === 'signedIn';
  useEffect(() => {
    if (signedIn && !editing) locateMe(true);
  }, [signedIn, editing, locateMe]);

  // Back from the phone's settings after allowing location: try again.
  const awaitingSettings = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && awaitingSettings.current) {
        awaitingSettings.current = false;
        locateMe(false);
      }
    });
    return () => subscription.remove();
  }, [locateMe]);
  const openPhoneSettings = () => {
    awaitingSettings.current = true;
    const kind = locationProblem;
    setLocationProblem(null);
    if (kind === 'unavailable' && Platform.OS === 'android') {
      Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(
        () => Linking.openSettings(),
      );
    } else {
      Linking.openSettings();
    }
  };
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  // Where each field sits, so the form can scroll to the first one that needs fixing.
  const anchors = useRef<Partial<Record<FormField, ViewNode | null>>>({});
  const anchor = (field: FormField) => (node: ViewNode | null) => {
    anchors.current[field] = node;
  };
  const scrollToFirst = (failed: FieldErrors) => {
    const first = failingFields(failed)[0];
    const node = first ? anchors.current[first] : null;
    const inner = scroller.current?.getInnerViewRef?.();
    if (!node || !inner) {
      scroller.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    node.measureLayout(
      inner as never,
      (_x, y) =>
        scroller.current?.scrollTo({
          y: Math.max(0, y - spacing.xl),
          animated: true,
        }),
      () => scroller.current?.scrollTo({ y: 0, animated: true }),
    );
  };

  function fillFrom(property: Property) {
    setTitle(property.title);
    setDescription(property.description);
    setType(property.type);
    setUnit(property.unit ?? '');
    setDeal(property.deal_type);
    setPriceText(String(property.price));
    setCurrency(property.currency);
    const length = splitMonths(property.mortgage_months);
    setDurationText(length.text);
    setDurationUnit(length.unit);
    setPriceTerms(property.price_terms ?? null);
    setAreaText(String(property.area_sqm));
    setBedrooms(property.bedrooms);
    setBathrooms(property.bathrooms);
    const known = findProvince(property.province) ?? null;
    setProvince(known);
    setDistrict(property.district);
    setNeighborhood(property.neighborhood ?? '');
    setAddress(property.address);
    // The listing's own pin (or province) decides where the map looks; the phone's position does not move it.
    steered.current = true;
    const pin =
      property.lat !== null && property.lng !== null
        ? { latitude: property.lat, longitude: property.lng }
        : null;
    setCoordinate(pin);
    if (pin) moveCamera(cameraAt(pin));
    else if (known) moveCamera(provinceCamera(known));
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

  // Featured-frame credits (bought in a bundle, or the first-subscription gift), and what one frame costs and lasts.
  const frameCredits = user?.featured_credits ?? 0;
  // The price is only asked for once the frame is switched on: a form that is only filled in makes no payment call.
  const pricing = usePricing(framed);
  const frameSpend = useFeaturedCreditSpend();

  const mutation = useMutation({
    mutationFn: (data: CreatePropertyInput) =>
      editing ? updateProperty(propertyId, data) : createProperty(data),
    onError: error => {
      // The server said which fields it did not accept: show each under its own field, and say so in a toast.
      const fields = serverFieldErrors(error, t);
      if (fields) {
        setErrors(fields);
        showToast(toastForErrors(fields, t));
        scrollToFirst(fields);
        return;
      }
      // A subscription is needed, or this month's free listing is used up: the banner at the top of the form says
      // so and has the button that leads to the plans.
      if (isSubscriptionRequired(error) || isListingLimitReached(error)) {
        scroller.current?.scrollTo({ y: 0, animated: true });
        return;
      }
      showToast(errorMessage(error, t));
    },
    onSuccess: async property => {
      // A new listing may have spent the welcome gift or a bonus credit: ask the server for the account again so the
      // balances (and the prompt) follow.
      if (!editing) getMe().then(updateUser, () => undefined);
      await queryClient.invalidateQueries({ queryKey: queryKeys.properties });
      if (framed) {
        if (frameCredits > 0) {
          // A credit pays for the frame at once.
          try {
            const used = await frameSpend.mutateAsync(property.id);
            showToast(
              t('checkout.creditUsed', {
                count: formatNumber(used.featured_credits, 0),
              }),
              'success',
            );
          } catch {
            // The listing is saved either way; only the frame did not happen.
            showToast(t('frame.creditFailed'));
          }
        } else {
          // No credit: pay for the frame here, in the sheet. Closing the sheet from now on lands on the listing.
          pending.current = () => leave(property.id);
          setPayingFrame(property.id);
          return;
        }
      }
      leave(property.id);
    },
  });

  /** Done with the form: back to where it was opened from (an edit), or on to the new listing. */
  const leave = (id: string) =>
    stepAside(() =>
      editing
        ? navigation.goBack()
        : navigation.replace('PropertyDetails', { id }),
    );

  // Editing: the form fades in over the loader once the listing has arrived.
  const reveal = useReveal(editing && existing.isPending);
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
      <Reveal {...reveal} loader={<LoadingView />}>
        {content}
      </Reveal>
    </BottomSheet>
  );

  if (status !== 'signedIn') {
    return sheet(
      <EmptyView message={t('auth.signInRequired')}>
        <Button
          icon="login"
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

  // The listing is saved and its frame is being paid for: nothing of the form is left to show.
  if (payingFrame) {
    return sheet(
      <View style={styles.payStep}>
        <FramePayStep
          propertyId={payingFrame}
          onDone={() => leave(payingFrame)}
        />
      </View>,
    );
  }

  const hasRooms = hasRoomsFor(type);
  const hasUnit = hasUnitFor(type);

  // The area typed so far, written back with its unit, so a mistyped zero is seen before it is sent. (The price
  // needs no such line: its field already shows the amount grouped in thousands.)
  const typedArea = parseNumberInput(areaText);
  const areaHelper =
    typedArea === null
      ? undefined
      : `${formatNumber(typedArea)} ${t('unit.sqm')}`;
  // The price typed so far, written back with its currency, like the area above: "۲۵,۰۰۰ افغانی" or "۲۵,۰۰۰ دالر".
  const typedPrice = parseNumberInput(priceText);
  const priceHelper =
    typedPrice === null
      ? undefined
      : `${formatNumber(typedPrice)} ${t(`currency.${currency}`)}`;
  // The mortgage length typed so far; a number of years also says how many months it comes to.
  const mortgage = deal === 'MORTGAGE_GROWI';
  const typedMonths = monthsFromInput(durationText, durationUnit);
  const durationHelper =
    mortgage && durationUnit === 'year' && typeof typedMonths === 'number'
      ? t('mortgage.equals', { months: formatNumber(typedMonths, 0) })
      : undefined;
  // What turning the frame on does, so nobody is surprised by a payment page: it costs a credit, or money.
  const featuredUntil =
    editing && original?.is_featured ? original.featured_until : null;
  const framePrice = pricing.data
    ? format.price(pricing.data.featured_ad, pricing.data.currency)
    : null;
  const frameHelper = featuredUntil
    ? t('frame.toggleExtends', { date: formatDate(featuredUntil) })
    : frameCredits > 0
    ? t('frame.toggleCredit', { count: formatNumber(frameCredits, 0) })
    : framePrice
    ? t('frame.togglePay', { price: framePrice })
    : t('frame.togglePayGeneric');

  /** "۲,۵۰۰,۰۰۰": a sample figure for an empty box (the lighter placeholder colour is what says it is only a hint). */
  const example = (amount: number) => formatNumber(amount);

  /** Asks what is at the pin and fills in what the person has not written themselves. */
  const findAddress = async (point: Coordinate) => {
    lookupAbort.current?.abort();
    const abort = new AbortController();
    lookupAbort.current = abort;
    setLookup('finding');
    const place = await describeSpot(point, { language, signal: abort.signal });
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
    // The written address follows the pin only while it is empty or still what the last pin put there. It is the whole
    // line, province first: the province the form will use (the one chosen by hand, else the one the pin found).
    const provinceHere =
      now.province === null || provinceIsAuto.current
        ? place.province
        : now.province;
    const found = addressFrom({
      province: provinceHere ? provinceHere.name[language] : '',
      district: place.district,
      neighborhood: place.neighborhood,
      street: place.street,
    });
    if (
      found &&
      (now.address === '' || now.address === filledWith.current.address)
    ) {
      setAddress(found);
      filledWith.current.address = found;
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

  describePlace.current = findAddress;

  const placePin = (point: Coordinate) => {
    setCoordinate(point);
    pinRef.current = point;
    setOutside(false);
    clearError('location');
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(() => {
      findAddress(point);
    }, LOOKUP_DELAY_MS);
  };

  const openFullscreen = () => {
    setFullscreen(true);
    const pin = pinRef.current;
    if (!pin) {
      // The map picker opens on the phone's position when there is no pin to show yet.
      if (me && !steered.current) lookAt(me, MY_POSITION_ZOOM);
      else if (!me) locateMe(steered.current);
    } else {
      lookAt(pin, Math.max(view.current?.zoom ?? 0, 16));
    }
  };

  /**
   * Back from the big map. It keeps everything (pin, address). The form's map opens exactly where the big one was
   * looking, not where it was last sent: the pin just set is in view.
   */
  const closeFullscreen = () => {
    if (view.current) {
      syncNonce.current += 1;
      setCamera({ ...view.current, nonce: syncNonce.current });
    }
    setFullscreen(false);
  };

  const submit = () => {
    const area = parseNumberInput(areaText);
    const price = parseNumberInput(priceText);
    const raw = {
      title,
      description,
      type,
      // What was typed for a unit stays in the box while the type is changed, but only a type that has units sends it.
      unit: hasUnit ? unit.trim() || null : null,
      deal_type: deal,
      // Only a mortgage has a length. (An edit that moves a listing off a mortgage needs no null: the server drops it.)
      mortgage_months:
        mortgage && typeof typedMonths === 'number' ? typedMonths : undefined,
      // Neither term is sent unless it clears one that was there.
      price_terms:
        priceTerms ?? (editing && original?.price_terms ? null : undefined),
      price: price === null ? undefined : roundTo2(price),
      currency,
      area_sqm:
        area === null ? undefined : roundTo2(area),
      bedrooms: hasRooms ? bedrooms ?? undefined : undefined,
      bathrooms: hasRooms ? bathrooms ?? undefined : undefined,
      province: province ? provinceValue(province) : '',
      district,
      neighborhood,
      address,
      // The pin is the property's place. (An outline an older version of the form saved is left as it is: it is not
      // sent, so the server keeps it.)
      lat: coordinate?.latitude,
      lng: coordinate?.longitude,
      images: imageLinks.map(link => link.trim()).filter(Boolean),
    };

    const next: FieldErrors = {};
    // The address is always needed (a pin does not stand in for it); the schema alone lets a pin do that.
    if (!address.trim()) next.address = t('add.addressMissing');
    // The schema lets a count be left out; this form does not (a listing without them is not comparable).
    if (hasRooms && bedrooms === null) next.bedrooms = t('add.required');
    if (hasRooms && bathrooms === null) next.bathrooms = t('add.required');
    // A mortgage says how long it runs; the schema lets it be left out, this form does not.
    if (mortgage && typedMonths === 'empty')
      next.mortgage_months = t('add.required');
    else if (mortgage && typedMonths === 'invalid')
      next.mortgage_months = fieldMessage('mortgage_months', 'invalid', t);

    // The same schema the server enforces, so mistakes are caught before a round trip.
    const parsed = createPropertySchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = formFieldFor(String(issue.path[0] ?? ''));
        if (!field || next[field]) continue;
        const value = (raw as Record<string, unknown>)[issue.path[0] as string];
        const empty =
          value === undefined ||
          (typeof value === 'string' && value.trim() === '') ||
          (Array.isArray(value) && !value.length);
        // Each field says what is wrong with it in its own words (a price is not "invalid", it is "not a number above zero").
        next[field] = fieldMessage(field, empty ? 'required' : 'invalid', t);
      }
    }
    if (!parsed.success || Object.keys(next).length > 0) {
      setErrors(next);
      showToast(toastForErrors(next, t));
      scrollToFirst(next);
      return;
    }
    setErrors({});
    mutation.reset();
    // A blank unit is not sent unless it clears one that was there (a listing changed to a type without units loses
    // its unit): a server that has no such field yet (an older deployment) would refuse the whole listing over a
    // field nobody filled in.
    const { unit: sentUnit, ...rest } = parsed.data;
    const clearsUnit = editing && Boolean(original?.unit);
    mutation.mutate(sentUnit || clearsUnit ? parsed.data : rest);
  };

  const setImageLink = (index: number, value: string) =>
    setImageLinks(links =>
      links.map((link, i) => (i === index ? value : link)),
    );

  /** The place field: the address, always required. */
  const placeLabel = t('add.place');

  /** The place field, the same in the form and at the top of the fullscreen map. */
  const placeField = (testID: string, compact = false) => (
    <PlaceSearchField
      testID={testID}
      label={compact ? '' : placeLabel}
      value={address}
      onChangeText={v => {
        setAddress(v);
        setPlaceNote(null);
        clearError('address');
      }}
      onPlace={placeChosen}
      onPlaceFailed={() => setPlaceNote({ kind: 'notResolved' })}
      onNoMatch={chaseAddress}
      near={coordinate ?? me ?? null}
      language={language}
      placeholder={t('add.placePlaceholder')}
      error={compact ? undefined : errors.address}
    />
  );

  /** What the place field just did, or what the map made of a written address. */
  const placeStatus =
    placeNote?.kind === 'chosen' ? (
      <AppText
        variant="caption"
        color={colors.primaryDark}
        style={styles.status}
        testID="place-chosen"
      >
        {t('add.placeChosen', { name: placeNote.name })}
      </AppText>
    ) : placeNote?.kind === 'notResolved' ? (
      <AppText variant="caption" color={colors.textMuted} style={styles.status}>
        {t('add.placeNotResolved')}
      </AppText>
    ) : mapSync === 'finding' ? (
      <View style={[styles.finding, styles.status]}>
        <View style={styles.finderSlot}>
          <MapLoader size={26} />
        </View>
        <AppText variant="caption" color={colors.textMuted}>
          {t('add.mapFinding')}
        </AppText>
      </View>
    ) : mapSync === 'found' ? (
      <AppText variant="caption" color={colors.primaryDark} style={styles.status}>
        {t('add.mapFound')}
      </AppText>
    ) : mapSync === 'province' && province ? (
      <AppText variant="caption" color={colors.textMuted} style={styles.status}>
        {t('add.mapNotFoundProvince', { province: province.name[language] })}
      </AppText>
    ) : mapSync === 'none' ? (
      <AppText variant="caption" color={colors.textMuted} style={styles.status}>
        {t('add.mapNotFound')}
      </AppText>
    ) : null;

  /** What the pin's address lookup did. */
  const pinStatus =
    lookup === 'finding' ? (
      <View style={styles.finding}>
        <View style={styles.finderSlot}>
          <MapLoader size={26} />
        </View>
        <AppText variant="caption" color={colors.textMuted}>
          {t('add.finding')}
        </AppText>
      </View>
    ) : lookup === 'failed' ? (
      <AppText variant="caption" color={colors.textMuted}>
        {t('add.lookupFailed')}
      </AppText>
    ) : null;

  /** The map, in the form or fullscreen: one component and one state, so both show the same pin. */
  const editor = (big: boolean) => (
    <LocationEditor
      testID={big ? 'location-editor-full' : 'location-editor'}
      mapTestID={big ? 'location-picker-map-full' : 'location-picker-map'}
      pin={coordinate}
      onPin={placePin}
      deal={deal}
      type={type}
      camera={camera}
      me={me}
      onLocate={() => locateMe(false)}
      locating={locating}
      fullscreen={big}
      onToggleFullscreen={() => (big ? closeFullscreen() : openFullscreen())}
      onView={keepView}
      onOutside={() => setOutside(true)}
    />
  );

  return sheet(
    <KeyboardAwareScrollView
      ref={scroller}
      contentContainerStyle={styles.content}
    >
      {/* The one banner left has a button: a listing that needs a subscription says so, and offers to buy one. Every
          other failure is a toast, and every field that is wrong says so under itself. */}
      {isSubscriptionRequired(mutation.error) ? (
        <Banner kind="error" message={errorMessage(mutation.error, t)}>
          <Button
            icon="card"
            title={t('add.buySubscription')}
            variant="outline"
            onPress={() => stepAside(() => navigation.navigate('Upgrade'))}
          />
        </Banner>
      ) : null}
      {/* This month's free listing is used up: not a fault but an invitation, with the way to the plans. */}
      {isListingLimitReached(mutation.error) ? (
        <Banner kind="promo" message={listingLimitMessage(mutation.error, t)}>
          <Button
            icon="up"
            title={t('add.upgradeAccount')}
            onPress={() => stepAside(() => navigation.navigate('Upgrade'))}
          />
        </Banner>
      ) : null}
      {/* Seven ladders open one more listing (and the save runs again); fewer say how to earn them. */}
      {isAnyListingLimit(mutation.error) ? (
        <LadderUnlockBanner
          onUnlocked={submit}
          onInvite={() => stepAside(() => navigation.navigate('Referral'))}
        />
      ) : null}

      <Card title={t('add.sectionPlace')} flush>
        {/* One field for the address or the name of a nearby place; picking a suggestion flies the map there. */}
        <View ref={anchor('address')} collapsable={false}>
          {placeField('place-search')}
          {placeStatus}
        </View>
        {/* The province is still its own value (filters, the database) and is written at the head of the address
            line. Its row, with the button to change it, is only there while it is unknown or only a guess (or
            refused): once it is certain there is nothing to say about it. */}
        <View ref={anchor('province')} collapsable={false}>
          {!province || provinceGuessed || errors.province ? (
            <View style={styles.provinceRow}>
              <AppText
                variant="bodySm"
                color={province ? colors.textSecondary : colors.textMuted}
                style={styles.provinceText}
              >
                {province
                  ? t('add.provinceLine', { name: province.name[language] })
                  : t('add.provinceUnknown')}
              </AppText>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPickerOpen(true)}
                hitSlop={8}
                testID="province-change"
              >
                <AppText variant="label" color={colors.primary}>
                  {province ? t('add.provinceChange') : t('home.selectProvince')}
                </AppText>
              </Pressable>
            </View>
          ) : null}
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
        </View>
        <View ref={anchor('location')} collapsable={false}>
          <PinSection
            outside={outside}
            error={errors.location}
            map={fullscreen ? null : editor(false)}
          >
            {pinStatus}
          </PinSection>
        </View>
      </Card>

      <Card title={t('add.sectionBasics')} flush>
        <View ref={anchor('title')} collapsable={false}>
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
        </View>
        <View ref={anchor('type')} collapsable={false}>
          <SelectField
            testID="type-select"
            label={t('add.type')}
            title={t('add.type')}
            searchPlaceholder={t('add.typeSearch')}
            value={type}
            onChange={v => {
              setType(v);
              clearError('type');
            }}
            options={PROPERTY_TYPES.map(p => ({
              value: p,
              label: propertyTypeLabel(p, t),
              icon: propertyLineIcon(p),
            }))}
            error={errors.type}
          />
        </View>
        {hasUnit ? (
          <View ref={anchor('unit')} collapsable={false}>
            <TextField
              label={`${t('add.unit')} (${t('common.optional')})`}
              value={unit}
              onChangeText={v => {
                setUnit(v);
                clearError('unit');
              }}
              placeholder={t('add.unitPlaceholder')}
              helper={t('add.unitHelp')}
              maxLength={PROPERTY_UNIT_MAX_LENGTH}
              error={errors.unit}
            />
          </View>
        ) : null}
        <View ref={anchor('deal_type')} collapsable={false}>
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
          {errors.deal_type ? (
            <AppText
              variant="caption"
              color={colors.danger}
              style={styles.chipError}
            >
              {errors.deal_type}
            </AppText>
          ) : null}
        </View>
      </Card>

      <Card title={t('add.sectionPrice')} flush>
        <View ref={anchor('price')} collapsable={false}>
          <TextField
            label={t(`dealPrice.${deal}`)}
            value={priceText}
            onChangeText={v => {
              setPriceText(v);
              clearError('price');
            }}
            keyboardType="decimal-pad"
            placeholder={example(currency === 'USD' ? 25_000 : 2_500_000)}
            thousands
            helper={priceHelper}
            error={errors.price}
          />
          <View style={styles.wrap}>
            {CURRENCIES.map(c => (
              <Chip
                compact
                key={c}
                label={t(`currency.${c}`)}
                selected={currency === c}
                onPress={() => {
                  setCurrency(c);
                  clearError('currency');
                }}
              />
            ))}
          </View>
          {errors.currency ? (
            <AppText
              variant="caption"
              color={colors.danger}
              style={styles.chipError}
            >
              {errors.currency}
            </AppText>
          ) : null}
        </View>
        {mortgage ? (
          <View ref={anchor('mortgage_months')} collapsable={false}>
            <TextField
              testID="mortgage-duration"
              label={t('mortgage.label')}
              value={durationText}
              onChangeText={v => {
                setDurationText(v);
                clearError('mortgage_months');
              }}
              keyboardType="decimal-pad"
              placeholder={t('mortgage.placeholder')}
              helper={durationHelper}
              error={errors.mortgage_months}
            />
            <View style={styles.toggle}>
              <SegmentedControl
                value={durationUnit}
                onChange={setDurationUnit}
                options={(['month', 'year'] as const).map(measure => ({
                  value: measure,
                  label: t(`mortgage.${measure}`),
                }))}
              />
            </View>
          </View>
        ) : null}
        <View ref={anchor('price_terms')} collapsable={false}>
          <AppText variant="label" color={colors.textSecondary}>
            {`${t('priceTerms.label')} (${t('common.optional')})`}
          </AppText>
          <View style={styles.wrap}>
            {[...PRICE_TERMS, null].map(term => (
              <Chip
                compact
                key={term ?? 'none'}
                label={t(`priceTerms.${term ?? 'NONE'}`)}
                selected={priceTerms === term}
                onPress={() => {
                  setPriceTerms(term);
                  clearError('price_terms');
                }}
              />
            ))}
          </View>
          {errors.price_terms ? (
            <AppText
              variant="caption"
              color={colors.danger}
              style={styles.chipError}
            >
              {errors.price_terms}
            </AppText>
          ) : null}
        </View>
        <View ref={anchor('area_sqm')} collapsable={false}>
          <TextField
            label={t('add.area')}
            value={areaText}
            onChangeText={v => {
              setAreaText(v);
              clearError('area_sqm');
            }}
            keyboardType="decimal-pad"
            placeholder={example(200)}
            helper={areaHelper}
            error={errors.area_sqm}
          />
        </View>
        <View ref={anchor('bedrooms')} collapsable={false}>
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
        </View>
      </Card>

      <Card title={t('add.sectionDetails')} flush>
        <View ref={anchor('description')} collapsable={false}>
          <TextField
            label={t('add.descriptionLabel')}
            required
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
        </View>
        <View ref={anchor('images')} collapsable={false}>
          <AppText variant="label" color={colors.textSecondary}>
            {t('add.images')}
          </AppText>
          <AppText
            variant="caption"
            color={colors.textMuted}
            style={styles.help}
          >
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
              icon="plus"
              title={t('add.addImage')}
              variant="outline"
              onPress={() => setImageLinks(links => [...links, ''])}
            />
          ) : null}
        </View>
      </Card>

      {/* The last thing on the form: put the featured frame on this listing now, instead of going to a payment page
          afterwards. With a credit it is spent on save; without, the payment step follows the save. */}
      <SwitchRow
        gold
        testID="frame-switch"
        label={t('frame.toggle', {
          days: formatNumber(pricing.data?.featured_ad_days ?? 7, 0),
        })}
        helper={frameHelper}
        value={framed}
        onValueChange={setFramed}
        style={styles.frameRow}
      />

      <ProvincePicker
        visible={pickerOpen}
        selectedId={province?.id ?? null}
        onClose={() => setPickerOpen(false)}
        onSelect={p => {
          if (!p) return;
          // Chosen by hand: from now on a pin does not change it.
          provinceIsAuto.current = false;
          steered.current = true;
          setProvinceGuessed(false);
          // An address the pin wrote still starts with the old province: it follows the new one.
          if (province && address && address === filledWith.current.address) {
            const swapped = swapProvince(
              address,
              province.name[language],
              p.name[language],
            );
            setAddress(swapped);
            filledWith.current.address = swapped;
          }
          setProvince(p);
          moveCamera(provinceCamera(p));
          clearError('province');
          setPickerOpen(false);
        }}
      />

      {/* The same map, fullscreen: for an exact pin. Closing it keeps everything. */}
      <Modal
        visible={fullscreen}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => closeFullscreen()}
      >
        <SafeAreaProvider>
          <SafeAreaView style={styles.full} edges={['top', 'bottom']}>
            <View style={styles.fullHeader}>
              {placeField('place-search-full', true)}
              {placeStatus}
            </View>
            <View style={styles.fullMap}>{fullscreen ? editor(true) : null}</View>
            <View style={styles.fullFooter}>
              <View style={styles.fullSummary}>
                {/* Only what needs attention: the first hint, a lookup in progress or failed, a tap outside the
                    country. What the map already shows (the area, "placed", "address filled") is not repeated. */}
                {!coordinate ? (
                  <AppText variant="caption" color={colors.textMuted}>
                    {t('map.tapToPlace')}
                  </AppText>
                ) : null}
                {pinStatus}
                {outside ? (
                  <AppText variant="caption" color={colors.danger}>
                    {t('map.outside')}
                  </AppText>
                ) : null}
              </View>
              <Button
                testID="map-done"
                icon="check"
                title={t('map.done')}
                onPress={closeFullscreen}
              />
            </View>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      <LocationPermissionModal
        problem={locationProblem}
        onOpenSettings={openPhoneSettings}
        onClose={() => setLocationProblem(null)}
      />
    </KeyboardAwareScrollView>,
    <Button
      icon="check"
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
  // The map loader's pin hops above its box: the slot keeps the line as tall as the words.
  finderSlot: {
    width: 26,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  // Under a row of chips: the error sits between the chips and the next field.
  chipError: { marginTop: -spacing.sm, marginBottom: spacing.md },
  status: { marginTop: -spacing.sm, marginBottom: spacing.md },
  provinceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  provinceText: { flex: 1 },
  full: { flex: 1, backgroundColor: colors.surface },
  fullHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fullMap: { flex: 1 },
  fullFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  fullSummary: { flex: 1, gap: spacing.xs },
  help: { marginBottom: spacing.sm },
  descriptionInput: { marginTop: 0 },
  frameRow: { marginTop: spacing.sm },
  payStep: { padding: spacing.lg, gap: spacing.sm },
});
