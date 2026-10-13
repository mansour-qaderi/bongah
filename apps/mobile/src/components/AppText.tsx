import React from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';
import { colors, fontFamilyFor, typography, type TextVariant } from '../theme';

interface Props extends TextProps {
  variant?: TextVariant;
  color?: string;
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
  return <Text {...rest} style={textStyle} />;
}
