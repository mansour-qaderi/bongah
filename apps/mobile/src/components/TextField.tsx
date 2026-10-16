import React, { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { toLatinDigits, toPersianDigits } from '../i18n/format';
import { colors, fonts, ltrInput, radius, spacing } from '../theme';
import AppText from './AppText';
import { useKeyboardFocus } from './KeyboardAware';

interface Props extends TextInputProps {
  label?: string;
  error?: string | null;
  /** For phone numbers, codes and URLs, which are typed left-to-right. */
  ltr?: boolean;
  /** A line under the field, e.g. the amount written out as money while it is typed. */
  helper?: string;
  /**
   * 'persian' (the default): the value handed to the screen always has plain 0-9, which is what the API and the
   * number parser expect, and a field that is not being edited shows it as ۰-۹. While the person is typing, the
   * field shows exactly what the keyboard produced and nothing is rewritten under their fingers; the Persian
   * digits appear when they leave the field. 'keep': leave digits untouched (web links, invite codes, anything
   * a person pastes or copies back out).
   */
  digits?: 'persian' | 'keep';
}

export default function TextField({
  label,
  error,
  ltr,
  helper,
  digits = 'persian',
  style,
  multiline,
  value,
  placeholder,
  onChangeText,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const focus = useKeyboardFocus();
  const persian = digits === 'persian';
  const [focused, setFocused] = useState(false);
  // What the person has typed in this editing session, exactly as the keyboard produced it.
  const [draft, setDraft] = useState<string | null>(null);

  /**
   * Rewriting a controlled input's text while it is being typed into is what makes the caret jump and characters
   * go missing, so while the field is focused it shows the draft (the very text it was just given) and never a
   * converted copy of it. Digits are converted only for display, when the field is at rest.
   */
  let shown = value;
  if (persian && value !== undefined) {
    if (!focused) shown = toPersianDigits(value);
    else if (draft !== null && toLatinDigits(draft) === toLatinDigits(value))
      shown = draft;
  }
  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText
          variant="label"
          color={colors.textSecondary}
          style={styles.label}
        >
          {label}
        </AppText>
      ) : null}
      <TextInput
        placeholderTextColor={colors.placeholder}
        accessibilityLabel={label}
        multiline={multiline}
        {...rest}
        value={shown}
        placeholder={
          persian && placeholder !== undefined
            ? toPersianDigits(placeholder)
            : placeholder
        }
        onChangeText={
          onChangeText
            ? text => {
                setDraft(text);
                onChangeText(persian ? toLatinDigits(text) : text);
              }
            : undefined
        }
        onFocus={event => {
          setFocused(true);
          focus?.inputFocused();
          onFocus?.(event);
        }}
        onBlur={event => {
          setFocused(false);
          setDraft(null);
          onBlur?.(event);
        }}
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
      ) : helper ? (
        <AppText
          variant="caption"
          color={colors.textMuted}
          style={styles.error}
        >
          {helper}
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
    fontFamily: fonts.regular,
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
