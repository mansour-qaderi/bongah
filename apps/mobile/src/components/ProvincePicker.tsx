import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { provincesFor, type Province } from '../constants/provinces';
import type { Market } from '@bongah/shared-types';
import { placeText } from '../i18n/market';
import { useActiveMarket } from '../market/marketStore';
import { useFormat } from '../i18n/useFormat';
import { colors, fonts, radius, spacing } from '../theme';
import AppText from './AppText';
import { KeyboardAvoider } from './KeyboardAware';

interface Props {
  visible: boolean;
  selectedId: string | null;
  /** Adds an "all provinces" row (for filters; the add-property form needs a real province). */
  allowAll?: boolean;
  /** Whose provinces to list. Default: the market in use (a listing form for the other country passes its own). */
  market?: Market;
  onSelect: (province: Province | null) => void;
  onClose: () => void;
}

export default function ProvincePicker({
  visible,
  selectedId,
  allowAll,
  market,
  onSelect,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { language } = useFormat();
  const [query, setQuery] = useState('');
  const active = useActiveMarket();
  const where = market ?? active;
  const provinces = provincesFor(where);

  const items = useMemo(() => {
    const q = query.trim();
    if (!q) return provinces;
    return provinces.filter(p =>
      [p.name.prs, p.name.ps, p.capital?.prs, p.capital?.ps].some(name =>
        name?.includes(q),
      ),
    );
  }, [query, provinces]);

  const choose = (province: Province | null) => {
    setQuery('');
    onSelect(province);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoider>
          <View style={styles.header}>
            <AppText variant="heading">{placeText('selectProvince', where, t)}</AppText>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              hitSlop={12}
            >
              <AppText variant="label" color={colors.primary}>
                {t('common.close')}
              </AppText>
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={placeText('searchProvince', where, t)}
            placeholderTextColor={colors.placeholder}
            style={styles.search}
          />
          <FlatList
            data={items}
            keyExtractor={p => p.id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              allowAll && !query ? (
                <Row
                  label={placeText('allProvinces', where, t)}
                  selected={selectedId === null}
                  onPress={() => choose(null)}
                />
              ) : undefined
            }
            renderItem={({ item }) => (
              <Row
                label={item.name[language]}
                hint={item.capital?.[language]}
                selected={item.id === selectedId}
                onPress={() => choose(item)}
              />
            )}
          />
        </KeyboardAvoider>
      </SafeAreaView>
    </Modal>
  );
}

function Row({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.row, selected && styles.rowSelected]}
    >
      <AppText
        variant="body"
        color={selected ? colors.primaryDark : colors.text}
      >
        {label}
      </AppText>
      {hint ? (
        <AppText variant="caption" color={colors.textMuted}>
          {hint}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowSelected: { backgroundColor: colors.neutralSoft },
});
