import React from 'react';
import { Text, type TextProps } from 'react-native';
import { colors, typography, type TextVariant } from '../theme';

interface Props extends TextProps {
  variant?: TextVariant;
  color?: string;
}

/** All app text goes through this so sizes, line heights and colours stay consistent. */
export default function AppText({
  variant = 'body',
  color = colors.text,
  style,
  ...rest
}: Props) {
  return <Text {...rest} style={[typography[variant], { color }, style]} />;
}
