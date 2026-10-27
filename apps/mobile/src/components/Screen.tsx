import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../theme';
import { KeyboardAwareScrollView } from './KeyboardAware';
import Spinner from './Spinner';

interface Props {
  children: React.ReactNode;
  /** Screens under a navigation header leave the top edge to the header. */
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  /**
   * A request is in flight and nothing on the screen should be touched until it is done (sending the code, signing
   * in): the green spinner lies over the screen under a pale veil.
   */
  busy?: boolean;
}

/** The veil. Its own component so the words come from the translations only when it is shown. */
function BusyVeil() {
  const { t } = useTranslation();
  return <Spinner overlay size={44} label={t('common.loading')} />;
}

export function Screen({
  children,
  edges = ['left', 'right', 'bottom'],
  style,
  busy = false,
}: Props) {
  return (
    <SafeAreaView edges={edges} style={[styles.screen, style]}>
      {children}
      {busy ? <BusyVeil /> : null}
    </SafeAreaView>
  );
}

/**
 * A screen that scrolls, for forms. Whatever input is tapped is brought above the keyboard, and taps on
 * buttons still work while the keyboard is open.
 */
export function ScrollScreen({ children, edges, style, busy }: Props) {
  return (
    <Screen edges={edges} busy={busy}>
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
