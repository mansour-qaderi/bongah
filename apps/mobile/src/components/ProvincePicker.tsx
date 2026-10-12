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
import { PROVINCES, type Province } from '../constants/provinces';
import { useFormat } from '../i18n/useFormat';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';

interface Props {
  visible: boolean;
  selectedId: string | null;
  /** Adds an "all provinces" row (for filters; the add-property form needs a real province). */
  allowAll?: boolean;
  onSelect: (province: Province | null) => void;
  onClose: () => void;
}

export default function ProvincePicker({
  visible,
  selectedId,
  allowAll,
  onSelect,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { language } = useFormat();
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const q = query.trim();
    if (!q) return PROVINCES;
    return PROVINCES.filter(p =>
      [p.name.prs, p.name.ps, p.capital?.prs, p.capital?.ps].some(name =>
        name?.includes(q),
      ),
    );
  }, [query]);

  const choose = (province: Province | null) => {
    setQuery('');
    onSelect(province);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <AppText variant="heading">{t('home.selectProvince')}</AppText>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
            <AppText variant="label" color={colors.primary}>
              {t('common.close')}
            </AppText>
          </Pressable>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('home.searchProvince')}
          placeholderTextColor={colors.textMuted}
          style={styles.search}
        />
        <FlatList
          data={items}
          keyExtractor={p => p.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            allowAll && !query ? (
              <Row
                label={t('home.allProvinces')}
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
    fontSize: 16,
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
  rowSelected: { backgroundColor: colors.primarySoft },
});
