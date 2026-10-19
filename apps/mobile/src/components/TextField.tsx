import React, { startTransition, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type TextInputSelectionChangeEvent,
  type TextStyle,
} from 'react-native';
import { toLatinDigits, toPersianDigits } from '../i18n/format';
import {
  editGroupedNumber,
  groupNumber,
  toRawNumber,
} from '../i18n/numberInput';
import { colors, fonts, ltrInput, radius, spacing } from '../theme';
import AppText from './AppText';
import { useKeyboardFocus } from './KeyboardAware';

interface Props extends TextInputProps {
  label?: string;
  /** Something small right beside the label (an info button), on the label's own line. */
  labelAccessory?: React.ReactNode;
  error?: string | null;
  /** For phone numbers, codes and URLs, which are typed left-to-right. */
  ltr?: boolean;
  /** A line under the field, e.g. the amount written out as money while it is typed. */
  helper?: string;
  /**
   * 'persian' (the default): the value handed to the screen always has plain 0-9, which is what the API and the
   * number parser expect, and the field shows it as ۰-۹ at all times, including while it is being typed into
   * (whatever digits the keyboard produces are converted as they arrive). 'keep': leave digits untouched (web
   * links, invite codes, anything a person pastes or copies back out).
   *
   * How it is made instant: the input is set in `fonts.digits`, Vazirmatn with its 0-9 glyphs swapped for ۰-۹. A
   * Latin digit the keyboard types is therefore already drawn as the Persian one by the native input itself, in
   * the frame it appears, so there is nothing to flash and nothing drawn on top (a second, overlaid copy of the
   * text is what showed up as a doubled number). The value converted in JavaScript is the same digit in the same
   * place, so the swap when it comes back is invisible.
   */
  digits?: 'persian' | 'keep';
  /**
   * A money amount or a count: the field shows the number grouped in thousands as it is typed ("۱,۳۰۰,۰۰۰"),
   * while the value handed to the screen stays plain digits ("1300000"). Needs `digits="persian"`.
   */
  thousands?: boolean;
}

export default function TextField({
  label,
  labelAccessory,
  error,
  ltr,
  helper,
  digits = 'persian',
  thousands = false,
  style,
  multiline,
  value,
  placeholder,
  onChangeText,
  onFocus,
  onBlur,
  onSelectionChange,
  selection,
  ...rest
}: Props) {
  const focus = useKeyboardFocus();
  const persian = digits === 'persian';
  const grouped = persian && thousands;
  // Where the caret is, as last reported. The keyboard reports a change before the new caret position, so at the
  // time of a change this still describes the field as it was.
  const caret = useRef({ start: 0, end: 0 });
  // Set for one edit when grouping moved the digits around and the caret has to be put back beside its digit.
  const [forcedCaret, setForcedCaret] = useState<number | null>(null);

  /**
   * The field shows the value in Persian digits (and grouped, for amounts) even while it is being typed into. The
   * conversion keeps every character in place (a Latin 1 becomes ۱, the same length), so the caret does not move;
   * grouping does change the length, and `editGroupedNumber` works out where the caret has to go.
   */
  // An amount field keeps its own copy of the number (`raw`) and draws the grouped text from it, so a keystroke
  // is shown grouped in the very render the keystroke causes: that render is only this field, not the whole form
  // around it. The screen is told in a transition (see `handleChange`), so a big screen re-rendering for the new
  // value never sits between the keystroke and the grouped text.
  const owned = grouped && value !== undefined;
  const [raw, setRaw] = useState(() => toRawNumber(value ?? ''));
  // What this field has handed to the screen that the screen has not handed back yet, oldest first.
  const pending = useRef<string[]>([]);
  const incoming = value === undefined ? '' : toRawNumber(value);
  useEffect(() => {
    if (!owned) return;
    const at = pending.current.indexOf(incoming);
    if (at >= 0) {
      // The screen caught up with something typed here: nothing to change, only forget what is now confirmed.
      pending.current = pending.current.slice(at + 1);
    } else {
      // A value that did not come from typing (a form reset, a draft restored): the field follows it.
      pending.current = [];
      setRaw(incoming);
    }
  }, [owned, incoming]);

  let shown = value;
  if (persian && value !== undefined) {
    shown = grouped ? groupNumber(raw) : toPersianDigits(value);
  }

  const inputStyle = StyleSheet.flatten([
    styles.input,
    persian && styles.digitsFont,
    multiline && styles.multiline,
    ltr && ltrInput,
    error ? styles.inputError : null,
    style,
  ]) as TextStyle;

  const handleChange = (text: string) => {
    if (!onChangeText) return;
    if (!persian) {
      onChangeText(text);
    } else if (grouped) {
      const edit = editGroupedNumber(text, {
        shown: shown ?? '',
        start: caret.current.start,
        end: caret.current.end,
      });
      setForcedCaret(edit.caret);
      setRaw(edit.raw);
      pending.current = [...pending.current, edit.raw].slice(-20);
      startTransition(() => {
        onChangeText(edit.raw);
      });
    } else {
      setForcedCaret(null);
      onChangeText(toLatinDigits(text));
    }
  };

  const handleSelection = (event: TextInputSelectionChangeEvent) => {
    const { start, end } = event.nativeEvent.selection;
    caret.current = { start, end };
    // Once the caret has arrived where it was put, stop controlling it so the person can move it freely.
    if (forcedCaret !== null && start === forcedCaret && end === forcedCaret) {
      setForcedCaret(null);
    }
    onSelectionChange?.(event);
  };

  return (
    <View style={styles.wrapper}>
      {label ? (
        <View style={styles.labelRow} testID="label-row">
          <AppText variant="label" color={colors.textSecondary}>
            {label}
          </AppText>
          {labelAccessory}
        </View>
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
        onChangeText={onChangeText ? handleChange : undefined}
        onSelectionChange={handleSelection}
        selection={
          forcedCaret !== null
            ? { start: forcedCaret, end: forcedCaret }
            : selection
        }
        onFocus={event => {
          focus?.inputFocused();
          onFocus?.(event);
        }}
        onBlur={event => {
          setForcedCaret(null);
          onBlur?.(event);
        }}
        style={inputStyle}
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  multiline: {
    minHeight: 110,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  inputError: { borderColor: colors.danger },
  // Regular Vazirmatn whose 0-9 are drawn as ۰-۹, so a digit is Persian from the moment it is typed.
  digitsFont: { fontFamily: fonts.digits },
  error: { marginTop: spacing.xs },
});
