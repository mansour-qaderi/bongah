import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors } from '../theme';
import Icon, { type IconName } from './Icon';

export type CircleIconTone = 'neutral' | 'brand' | 'danger';

interface Props {
  icon: IconName;
  /** What the button does, said to a screen reader (the button itself shows no words). */
  label: string;
  onPress: () => void;
  /** 'brand' for the useful thing to do next, 'danger' for the one to be careful with. */
  tone?: CircleIconTone;
  loading?: boolean;
  disabled?: boolean;
  /** The icon is drawn filled/selected-looking by the caller through `icon`; this only marks it for assistive tech. */
  selected?: boolean;
  size?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const INK: Record<CircleIconTone, string> = {
  neutral: colors.text,
  brand: colors.primary,
  danger: colors.danger,
};

/**
 * A round, white, 1 px-edged button with one line icon in it: the same design as the bookmark ribbon on a listing, so
 * the actions of a card (share, edit, more) read as one family with it.
 */
export default function CircleIconButton({
  icon,
  label,
  onPress,
  tone = 'neutral',
  loading = false,
  disabled = false,
  selected,
  size = 40,
  testID,
  style,
}: Props) {
  const inactive = loading || disabled;
  const ink = INK[tone];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading, disabled: inactive, selected }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        tone === 'danger' ? styles.danger : null,
        { opacity: loading ? 0.75 : disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={ink} />
      ) : (
        <Icon name={icon} size={size * 0.55} color={ink} weight={1.9} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: { borderColor: colors.danger },
});
