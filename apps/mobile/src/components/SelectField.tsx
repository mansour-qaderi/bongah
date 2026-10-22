import React, { useMemo, useState } from 'react';
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

interface Props<T extends string> {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** The sheet's title (the label when left out). */
  title?: string;
  searchPlaceholder?: string;
  /** What the sheet says when the search finds nothing. */
  emptyText?: string;
  error?: string;
  testID?: string;
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
  testID = 'select-field',
}: Props<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const current = options.find(option => option.value === value);
  const shown = useMemo(() => {
    const q = query.trim();
    return q ? options.filter(option => option.label.includes(q)) : options;
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const choose = (next: T) => {
    onChange(next);
    close();
  };

  return (
    <View>
      <AppText variant="label" color={colors.textSecondary}>
        {label}
      </AppText>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.box,
          error ? styles.boxError : null,
          pressed ? styles.pressed : null,
        ]}
      >
        {current?.icon ? (
          <Icon name={current.icon} size={20} color={colors.textSecondary} />
        ) : null}
        <AppText variant="body" style={styles.value} numberOfLines={1}>
          {current?.label ?? ''}
        </AppText>
        <Icon name="chevronDown" size={20} color={colors.textMuted} />
      </Pressable>
      {error ? (
        <AppText variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <BottomSheet
        visible={open}
        onClose={close}
        title={title ?? label}
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
            renderItem={({ item }) => {
              const selected = item.value === value;
              return (
                <Pressable
                  testID={`${testID}-option-${item.value}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => choose(item.value)}
                  style={[styles.row, selected ? styles.rowSelected : null]}
                >
                  {item.icon ? (
                    <Icon
                      name={item.icon}
                      size={20}
                      color={selected ? colors.primaryDark : colors.textSecondary}
                    />
                  ) : null}
                  <AppText
                    variant="body"
                    color={selected ? colors.primaryDark : colors.text}
                    style={styles.rowText}
                  >
                    {item.label}
                  </AppText>
                  {selected ? (
                    <Icon name="check" size={20} color={colors.primary} />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </BottomSheet>
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
