import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { toAsciiDigits } from '@bongah/validation';
import { colors, fonts, radius, spacing } from '../theme';
import AppText from './AppText';
import { useKeyboardFocus } from './KeyboardAware';

interface Props {
  /** The digits entered so far, always plain 0-9. */
  value: string;
  onChange: (digits: string) => void;
  /** How many boxes there are (the length of the code). */
  length: number;
  /** What a screen reader calls the field ("verification code"). */
  label: string;
  /** Draws the boxes in the error colour. */
  invalid?: boolean;
  /** Focus the field as soon as the screen opens. On by default: the code is the only thing to do here. */
  autoFocus?: boolean;
  testID?: string;
}

/** What is kept from whatever arrives: Persian / Arabic-Indic digits become 0-9, everything else is dropped. */
export function cleanOtp(text: string, length: number): string {
  return toAsciiDigits(text).replace(/\D/g, '').slice(0, length);
}

/**
 * A verification code drawn as one box per digit.
 *
 * It is ONE text input laid over the boxes (transparent, with no caret), and the boxes only display what it
 * holds. That is what makes the things a code field needs work on both platforms, which a row of separate inputs
 * does not do reliably:
 *  - paste: the long-press menu, the keyboard's clipboard suggestion and the SMS suggestion all hand the whole code
 *    to the one input, and `cleanOtp` keeps the digits ("123 456" and "۱۲۳۴۵۶" both work);
 *  - backspace and moving between boxes need no key handling: the current box is simply `value.length`;
 *  - the system one-time-code autofill (`oneTimeCode` on iOS, `sms-otp` on Android) attaches to a single input.
 * The row is always left-to-right (digits of a code are not mirrored in an RTL layout).
 */
export default function OtpInput({
  value,
  onChange,
  length,
  label,
  invalid = false,
  autoFocus = true,
  testID,
}: Props) {
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const keyboard = useKeyboardFocus();
  const [focused, setFocused] = useState(false);

  // `autoFocus` alone is unreliable while a screen is still sliding in on Android, so ask again once it has settled.
  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => input.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  const active = Math.min(value.length, length - 1);

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.row} pointerEvents="none">
        {Array.from({ length }, (_, index) => {
          const digit = value[index];
          const current = focused && index === active;
          return (
            <View
              key={index}
              testID={`otp-box-${index}`}
              style={[
                styles.box,
                current ? styles.boxCurrent : null,
                invalid ? styles.boxInvalid : null,
              ]}
            >
              {digit ? (
                <AppText style={styles.digit}>{digit}</AppText>
              ) : current ? (
                <View style={styles.caret} />
              ) : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        testID={testID ? `${testID}-input` : 'otp-input'}
        accessibilityLabel={label}
        value={value}
        onChangeText={text => onChange(cleanOtp(text, length))}
        onFocus={() => {
          setFocused(true);
          keyboard?.inputFocused();
        }}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoCorrect={false}
        caretHidden
        contextMenuHidden={false}
        selectionColor="transparent"
        style={styles.hidden}
      />
    </View>
  );
}

const BOX_HEIGHT = 56;

const styles = StyleSheet.create({
  wrap: { height: BOX_HEIGHT },
  row: {
    direction: 'ltr',
    flexDirection: 'row',
    gap: spacing.sm,
    height: BOX_HEIGHT,
  },
  box: {
    flex: 1,
    height: BOX_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  boxCurrent: { borderColor: colors.primary, borderWidth: 2 },
  boxInvalid: { borderColor: colors.danger },
  digit: { fontSize: 24, lineHeight: 36, fontFamily: fonts.bold },
  caret: {
    width: 2,
    height: 24,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  // Covers the boxes so a tap anywhere on them focuses it and the long-press paste menu appears over them.
  hidden: {
    ...StyleSheet.absoluteFill,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 1,
    opacity: 0.02,
  },
});
