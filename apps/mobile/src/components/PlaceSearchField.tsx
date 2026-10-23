import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Language } from '@bongah/shared-types';
import type { Coordinate } from '../map/geo';
import {
  MIN_QUERY_LENGTH,
  newSearchSession,
  resolvePlace,
  suggestPlaces,
  type PlaceOption,
  type ResolvedPlace,
} from '../map/GeocodingService';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import Icon, { type IconName } from './Icon';
import MapLoader from './MapLoader';
import TextField from './TextField';

/** Wait this long after the last key before asking: one question per pause in the typing, not per letter. */
export const SUGGEST_DELAY_MS = 350;

type Status = 'idle' | 'searching' | 'shown' | 'empty' | 'failed';

/** The row's icon: a building for a place you can walk into, a pin for an area or a street. */
function iconFor(category: string | null): IconName {
  if (!category) return 'pin';
  if (/hospital|clinic|doctor|pharmacy|health/.test(category)) return 'plus';
  if (/university|school|college|education/.test(category)) return 'office';
  if (/cafe|restaurant|food|shop|store|market|mall|bakery/.test(category))
    return 'shop';
  if (/mosque|place_of_worship/.test(category)) return 'house';
  return 'pin';
}

interface Props {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** A row was chosen and found on the map. The field already holds its name. */
  onPlace: (place: ResolvedPlace, option: PlaceOption) => void;
  /** A row was chosen but could not be found (the provider no longer knows it, or no network). */
  onPlaceFailed?: (option: PlaceOption) => void;
  /**
   * The search for this text found nothing (or nobody could be asked). The caller may then look for the written
   * address the slow way (Nominatim, see `findAddressLoosely`), which its usage policy allows once typing has stopped.
   */
  onNoMatch?: (text: string) => void;
  /** Ranks places near here first (the map's centre or the phone's position). */
  near?: Coordinate | null;
  language?: Language;
  placeholder?: string;
  helper?: string;
  error?: string;
  testID?: string;
}

/**
 * The listing form's one place field, "آدرس یا اسم مکان": type an address or the name of something nearby (a
 * hospital, a university, a café, a mosque) and pick it from the list under the field; the map then flies there.
 * Anything typed is also kept as the written address, picked or not.
 *
 * The list sits under the field, in the page, not floating over it: in a scrolling sheet a floating list is clipped
 * and covers the next fields. A request that is overtaken by more typing is cancelled, so an old answer never
 * replaces a newer one.
 */
export default function PlaceSearchField({
  label,
  value,
  onChangeText,
  onPlace,
  onPlaceFailed,
  onNoMatch,
  near,
  language,
  placeholder,
  helper,
  error,
  testID = 'place-search',
}: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('idle');
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  // Text the list must not search for again: what a pick wrote into the field, or what the screen set itself.
  const settled = useRef(value);
  const session = useRef(newSearchSession());
  const abort = useRef<AbortController | null>(null);
  const nearRef = useRef(near);
  nearRef.current = near;
  const callbacks = useRef({ onNoMatch });
  callbacks.current = { onNoMatch };

  // Text set from outside while not typing (a pin's address, an edited listing) is not a search.
  useEffect(() => {
    if (!focused) settled.current = value;
  }, [value, focused]);

  useEffect(() => {
    const text = value.replace(/\s+/g, ' ').trim();
    if (!focused || text === settled.current.trim()) return;
    abort.current?.abort();
    if (text.length < MIN_QUERY_LENGTH) {
      setStatus('idle');
      setOptions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const controller = new AbortController();
      abort.current = controller;
      setStatus('searching');
      const result = await suggestPlaces(text, {
        near: nearRef.current ?? undefined,
        session: session.current,
        language,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.status === 'failed') {
        setOptions([]);
        setStatus('failed');
        callbacks.current.onNoMatch?.(text);
      } else if (result.options.length === 0) {
        setOptions([]);
        setStatus('empty');
        callbacks.current.onNoMatch?.(text);
      } else {
        setOptions(result.options);
        setStatus('shown');
      }
    }, SUGGEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value, focused, language]);

  useEffect(() => () => abort.current?.abort(), []);

  const pick = async (option: PlaceOption) => {
    abort.current?.abort();
    Keyboard.dismiss();
    const text = [option.title, option.subtitle]
      .filter(Boolean)
      .join('، ')
      .slice(0, 300);
    settled.current = text;
    onChangeText(text);
    setOptions([]);
    setStatus('idle');
    setResolving(option.id);
    const controller = new AbortController();
    abort.current = controller;
    const place = await resolvePlace(option, {
      session: session.current,
      language,
      signal: controller.signal,
    });
    // The pick ends the billing session; the next search starts a new one.
    session.current = newSearchSession();
    if (controller.signal.aborted) return;
    setResolving(null);
    if (place) onPlace(place, option);
    else onPlaceFailed?.(option);
  };

  const showList = focused && status === 'shown' && options.length > 0;
  const note =
    focused && status === 'searching'
      ? t('add.placeSearching')
      : focused && status === 'empty'
      ? t('add.placeNoResults')
      : focused && status === 'failed'
      ? t('add.placeOffline')
      : null;

  return (
    <View testID={testID}>
      <TextField
        testID={`${testID}-input`}
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        helper={note ? undefined : helper}
        error={error}
        maxLength={300}
        autoCorrect={false}
        // A written address can be long ("زرنج، ناحیه ۵، پهلوی شفاخانه…، داخل کوچه…"): it wraps instead of scrolling away.
        multiline
        style={styles.input}
        onFocus={() => setFocused(true)}
        // A tap on a row arrives before the field loses focus only on some phones: wait a moment so it lands.
        onBlur={() => setTimeout(() => setFocused(false), 200)}
      />
      {note ? (
        <View style={styles.note}>
          {status === 'searching' ? (
            <View style={styles.loaderSlot}>
              <MapLoader size={26} />
            </View>
          ) : null}
          <AppText variant="caption" color={colors.textMuted}>
            {note}
          </AppText>
        </View>
      ) : null}
      {resolving ? (
        <View style={styles.note}>
          <View style={styles.loaderSlot}>
            <MapLoader size={26} />
          </View>
          <AppText variant="caption" color={colors.textMuted}>
            {t('add.mapFinding')}
          </AppText>
        </View>
      ) : null}
      {showList ? (
        <View style={styles.list} testID={`${testID}-list`}>
          {options.map((option, index) => (
            <Pressable
              key={`${option.source}-${option.id}`}
              testID={`${testID}-option-${index}`}
              accessibilityRole="button"
              accessibilityLabel={[option.title, option.subtitle]
                .filter(Boolean)
                .join('، ')}
              onPress={() => pick(option)}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.rowDivider,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.rowIcon}>
                <Icon
                  name={iconFor(option.category)}
                  size={18}
                  color={colors.primary}
                  weight={1.8}
                />
              </View>
              <View style={styles.rowText}>
                <AppText variant="bodySm" numberOfLines={1}>
                  {option.title}
                </AppText>
                {option.subtitle ? (
                  <AppText
                    variant="caption"
                    color={colors.textMuted}
                    numberOfLines={1}
                  >
                    {option.subtitle}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 64 },
  // The map loader's pin hops above its box: the slot keeps the line as tall as the words.
  loaderSlot: {
    width: 26,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  list: {
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 52,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutralSoft,
  },
  rowText: { flex: 1, gap: 2 },
  pressed: { backgroundColor: colors.neutralSoft },
});
