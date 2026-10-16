import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import { KeyboardAwareScrollView } from './KeyboardAware';

interface Props {
  children: React.ReactNode;
  /** Screens under a navigation header leave the top edge to the header. */
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  edges = ['left', 'right', 'bottom'],
  style,
}: Props) {
  return (
    <SafeAreaView edges={edges} style={[styles.screen, style]}>
      {children}
    </SafeAreaView>
  );
}

/**
 * A screen that scrolls, for forms. Whatever input is tapped is brought above the keyboard, and taps on
 * buttons still work while the keyboard is open.
 */
export function ScrollScreen({ children, edges, style }: Props) {
  return (
    <Screen edges={edges}>
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, style]}>
        {children}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
