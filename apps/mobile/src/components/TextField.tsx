import React from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, ltrInput, radius, spacing } from '../theme';
import AppText from './AppText';

interface Props extends TextInputProps {
  label?: string;
  error?: string | null;
  /** For phone numbers, codes and URLs, which are typed left-to-right. */
  ltr?: boolean;
}

export default function TextField({
  label,
  error,
  ltr,
  style,
  multiline,
  ...rest
}: Props) {
  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText variant="label" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        multiline={multiline}
        {...rest}
        style={[
          styles.input,
          multiline && styles.multiline,
          ltr && ltrInput,
          error ? styles.inputError : null,
          style,
        ]}
      />
      {error ? (
        <AppText variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.xs },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  multiline: {
    minHeight: 110,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  inputError: { borderColor: colors.danger },
  error: { marginTop: spacing.xs },
});
