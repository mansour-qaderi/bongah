import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '../theme';
import AppText from './AppText';
import BottomSheet from './BottomSheet';
import Icon, { type IconName } from './Icon';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** A small picture before the name (the kind of property). */
  icon?: IconName;
}

interface BaseProps<T extends string> {
  label: string;
  options: readonly SelectOption<T>[];
  /** The sheet's title (the label when left out). */
  title?: string;
  searchPlaceholder?: string;
  /** What the sheet says when the search finds nothing. */
  emptyText?: string;
  error?: string;
  /** For a field inside a card that spaces its own children: no margin under the box. */
  flush?: boolean;
  testID?: string;
}

interface Props<T extends string> extends BaseProps<T> {
  value: T;
  onChange: (value: T) => void;
}

/** The closed box: the label above, what is chosen inside, a chevron at the far end. */
function SelectBox({
  label,
  summary,
  icon,
  open,
  error,
  flush,
  testID,
  onOpen,
}: {
  label: string;
  summary: string;
  icon?: IconName;
  open: boolean;
  error?: string;
  flush: boolean;
  testID: string;
  onOpen: () => void;
}) {
  return (
    <>
      <AppText variant="label" color={colors.textSecondary}>
        {label}
      </AppText>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${summary}`}
        accessibilityState={{ expanded: open }}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.box,
          flush ? styles.boxFlush : null,
          error ? styles.boxError : null,
          pressed ? styles.pressed : null,
        ]}
      >
        {icon ? (
          <Icon name={icon} size={20} color={colors.textSecondary} />
        ) : null}
        <AppText variant="body" style={styles.value} numberOfLines={1}>
          {summary}
        </AppText>
        <Icon name="chevronDown" size={20} color={colors.textMuted} />
      </Pressable>
      {error ? (
        <AppText variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </>
  );
}

/** The sheet: a search box over the list of rows. `selected` says which rows are ticked; `pick` is what a tap does. */
function OptionSheet<T extends string>({
  visible,
  onClose,
  title,
  searchPlaceholder,
  emptyText,
  testID,
  options,
  selected,
  pick,
  leading,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  searchPlaceholder?: string;
  emptyText?: string;
  testID: string;
  options: readonly SelectOption<T>[];
  selected: (value: T) => boolean;
  pick: (value: T) => void;
  /** A row before the options that is not one of them («همه انواع»), kept out of the search. */
  leading?: { testID: string; label: string; selected: boolean; onPress: () => void };
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  // Whatever way the sheet closes (a pick, the close button, a swipe), it opens clean the next time.
  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);
  const shown = useMemo(() => {
    const q = query.trim();
    return q ? options.filter(option => option.label.includes(q)) : options;
  }, [options, query]);

  const row = (
    key: string,
    rowTestID: string,
    text: string,
    isSelected: boolean,
    onPress: () => void,
    icon?: IconName,
  ) => (
    <Pressable
      key={key}
      testID={rowTestID}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={[styles.row, isSelected ? styles.rowSelected : null]}
    >
      {icon ? (
        <Icon
          name={icon}
          size={20}
          color={isSelected ? colors.primaryDark : colors.textSecondary}
        />
      ) : null}
      <AppText
        variant="body"
        color={isSelected ? colors.primaryDark : colors.text}
        style={styles.rowText}
      >
        {text}
      </AppText>
      {isSelected ? <Icon name="check" size={20} color={colors.primary} /> : null}
    </Pressable>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      heightRatio={0.7}
    >
      <View style={styles.sheet}>
        <TextInput
          testID={`${testID}-search`}
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder ?? t('common.search')}
          placeholderTextColor={colors.placeholder}
          style={styles.search}
          autoCorrect={false}
          returnKeyType="search"
        />
        <FlatList
          data={shown}
          keyExtractor={option => option.value}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            leading && !query.trim()
              ? row(
                  'leading',
                  leading.testID,
                  leading.label,
                  leading.selected,
                  leading.onPress,
                )
              : undefined
          }
          ListEmptyComponent={
            <AppText
              variant="bodySm"
              color={colors.textMuted}
              style={styles.empty}
              testID={`${testID}-empty`}
            >
              {emptyText ?? t('common.noMatch')}
            </AppText>
          }
          renderItem={({ item }) =>
            row(
              item.value,
              `${testID}-option-${item.value}`,
              item.label,
              selected(item.value),
              () => pick(item.value),
              item.icon,
            )
          }
        />
      </View>
    </BottomSheet>
  );
}

/**
 * A closed box that shows the chosen option and opens a sheet with a search box and the full list: one line of the
 * form instead of a block of chips. Typing narrows the list (a part of a name is enough); choosing a row closes the
 * sheet. The list is never empty of a choice: the box always shows one.
 */
export default function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  title,
  searchPlaceholder,
  emptyText,
  error,
  flush = false,
  testID = 'select-field',
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find(option => option.value === value);
  return (
    <View>
      <SelectBox
        label={label}
        summary={current?.label ?? ''}
        icon={current?.icon}
        open={open}
        error={error}
        flush={flush}
        testID={testID}
        onOpen={() => setOpen(true)}
      />
      <OptionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={title ?? label}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
        testID={testID}
        options={options}
        selected={option => option === value}
        pick={next => {
          onChange(next);
          setOpen(false);
        }}
      />
    </View>
  );
}

interface MultiProps<T extends string> extends BaseProps<T> {
  /** What is ticked; empty means no restriction. */
  values: readonly T[];
  onChange: (values: T[]) => void;
  /** What the box and the first row say when nothing is ticked («همه انواع»). */
  allLabel: string;
}

/**
 * The same box and the same sheet, for a choice of several: a tap ticks a row or clears it and the sheet stays open
 * (the person closes it when done), and the first row, `allLabel`, clears every tick at once. The box says what is
 * ticked: the one name, the names side by side, or `allLabel` when nothing is.
 */
export function MultiSelectField<T extends string>({
  label,
  values,
  options,
  onChange,
  allLabel,
  title,
  searchPlaceholder,
  emptyText,
  error,
  flush = false,
  testID = 'multi-select-field',
}: MultiProps<T>) {
  const [open, setOpen] = useState(false);
  const chosen = options.filter(option => values.includes(option.value));
  const summary =
    chosen.length === 0
      ? allLabel
      : chosen.map(option => option.label).join('، ');
  return (
    <View>
      <SelectBox
        label={label}
        summary={summary}
        icon={chosen.length === 1 ? chosen[0].icon : undefined}
        open={open}
        error={error}
        flush={flush}
        testID={testID}
        onOpen={() => setOpen(true)}
      />
      <OptionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={title ?? label}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
        testID={testID}
        options={options}
        selected={option => values.includes(option)}
        pick={next =>
          onChange(
            values.includes(next)
              ? values.filter(v => v !== next)
              : [...values, next],
          )
        }
        leading={{
          testID: `${testID}-option-all`,
          label: allLabel,
          selected: values.length === 0,
          onPress: () => onChange([]),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  boxFlush: { marginBottom: 0 },
  boxError: { borderColor: colors.danger },
  pressed: { backgroundColor: colors.neutralSoft },
  value: { flex: 1 },
  error: { marginTop: -spacing.sm, marginBottom: spacing.md },
  sheet: { flex: 1 },
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 13,
    fontFamily: fonts.regular,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowSelected: { backgroundColor: colors.neutralSoft },
  rowText: { flex: 1 },
  empty: { textAlign: 'center', padding: spacing.xl },
});
