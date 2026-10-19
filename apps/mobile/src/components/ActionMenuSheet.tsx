import React, { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import AppText from './AppText';
import BottomSheet from './BottomSheet';
import Icon from './Icon';
import type { ListingAction } from './ListingCard';

interface Props {
  visible: boolean;
  /** The sheet's heading: what the actions are about (the listing's title). */
  title: string;
  actions: ListingAction[];
  onClose: () => void;
}

/** The ink of each kind of action. */
const INK = {
  neutral: colors.text,
  brand: colors.primary,
  danger: colors.danger,
} as const;

/**
 * The overflow menu: a bottom sheet with one plain row per action, for the actions that would clutter a card
 * if they all sat on it.
 *
 * The chosen action runs only once the sheet has slid fully away. Several actions open something of their own
 * (a confirmation alert, another sheet), and iOS silently refuses to present one while another modal is still
 * on its way out.
 */
export default function ActionMenuSheet({
  visible,
  title,
  actions,
  onClose,
}: Props) {
  const chosen = useRef<ListingAction | null>(null);

  return (
    <BottomSheet
      visible={visible}
      title={title}
      onClose={onClose}
      heightRatio={0.2 + 0.1 * actions.length}
      onDismissed={() => {
        const action = chosen.current;
        chosen.current = null;
        action?.onPress();
      }}
    >
      <View style={styles.list} testID="action-menu">
        {actions.map((action, index) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityState={{ disabled: Boolean(action.disabled) }}
            disabled={action.disabled || action.loading}
            onPress={() => {
              chosen.current = action;
              onClose();
            }}
            style={({ pressed }) => [
              styles.row,
              index > 0 ? styles.divider : null,
              pressed ? styles.pressed : null,
              action.disabled ? styles.disabled : null,
            ]}
          >
            {action.icon ? (
              <Icon
                name={action.icon}
                size={22}
                color={INK[action.tone ?? 'neutral']}
                weight={1.8}
              />
            ) : null}
            <AppText variant="body" color={INK[action.tone ?? 'neutral']}>
              {action.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
});
