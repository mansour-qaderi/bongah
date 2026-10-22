import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../theme';
import ActionIcon, { type ActionIconName } from './ActionIcon';
import AppText from './AppText';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  /** A glyph before the label, in the label's colour (send, check, refresh...). Hidden while the button is loading. */
  icon?: ActionIconName;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: {
    bg: colors.primary,
    fg: colors.textOnPrimary,
    border: colors.primary,
  },
  // A quiet button: white with a 1 px grey edge and emerald words (resend, change number...).
  secondary: {
    bg: colors.surface,
    fg: colors.primary,
    border: colors.border,
  },
  outline: { bg: 'transparent', fg: colors.primary, border: colors.primary },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.danger },
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
  testID,
}: Props) {
  const inactive = disabled || loading;
  const { bg, fg, border } = palette[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <ActionIcon name={icon} color={fg} /> : null}
          <AppText variant="label" color={fg}>
            {title}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  base: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
