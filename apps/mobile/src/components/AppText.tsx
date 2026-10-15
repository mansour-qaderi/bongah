import React from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';
import { toPersianDigits } from '../i18n/format';
import { colors, fontFamilyFor, typography, type TextVariant } from '../theme';

interface Props extends TextProps {
  variant?: TextVariant;
  color?: string;
  /**
   * Keep the digits as they are (codes, links, ids that a person copies or types back). Everything else shows
   * Persian digits whatever was put in, so no screen has to remember to convert a number.
   */
  latinDigits?: boolean;
}

/** Turns the digits in the strings and numbers among the children; elements and other values pass through. */
function persianChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string' || typeof children === 'number')
    return toPersianDigits(children);
  if (Array.isArray(children)) {
    // Children.map (not a plain map) gives the elements the keys React expects.
    return React.Children.map(children, child =>
      typeof child === 'string' || typeof child === 'number'
        ? toPersianDigits(child)
        : child,
    );
  }
  return children;
}

/**
 * All app text goes through this so sizes, line heights, fonts and colours stay consistent.
 * A screen may still ask for `fontWeight`; it is turned into the matching font file (see theme `fonts`),
 * because a weight on a custom font family only makes Android fake it.
 */
export default function AppText({
  variant = 'body',
  color = colors.text,
  style,
  latinDigits = false,
  children,
  ...rest
}: Props) {
  const flat = StyleSheet.flatten([
    typography[variant],
    { color },
    style,
  ]) as TextStyle;
  const { fontWeight, ...textStyle } = flat;
  if (fontWeight !== undefined)
    textStyle.fontFamily = fontFamilyFor(fontWeight);
  return (
    <Text {...rest} style={textStyle}>
      {latinDigits ? children : persianChildren(children)}
    </Text>
  );
}
