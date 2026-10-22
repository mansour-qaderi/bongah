import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import RNToast, {
  type ToastConfig,
  type ToastConfigParams,
} from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import Icon, { type IconName } from './Icon';

/**
 * A short message that slides in at the top of the screen, says exactly what happened, and goes away by itself (or on
 * a tap or a swipe up).
 *
 * The timing, the slide, the swipe to dismiss and the replacing of one message by the next come from
 * `react-native-toast-message`; what is drawn is ours (see `toastConfig`), so it keeps the app's flat look, its font
 * and its right-to-left layout.
 *
 * `showToast("…")` can be called from anywhere (a mutation's `onError`, an event handler): there is no provider to
 * wrap a screen in. The message is drawn by a `ToastHost`: one at the root of the app, and one inside every bottom
 * sheet (a sheet is a native modal and covers everything under it, so a toast from the form in a sheet would
 * otherwise be drawn behind the very sheet that caused it). The library draws on the host mounted last, so a message
 * is never drawn twice.
 */
export type ToastKind = 'error' | 'success' | 'info';

/** How long a message stays: long enough to read a sentence. */
export const TOAST_MS = 5000;

/** Hides whatever is showing. */
export function hideToast(): void {
  RNToast.hide();
}

/** Shows `message` (replacing any message on screen). An empty message is ignored. */
export function showToast(
  message: string,
  kind: ToastKind = 'error',
  durationMs: number = TOAST_MS,
): void {
  const text = message.trim();
  if (!text) return;
  RNToast.show({
    type: kind,
    text1: text,
    position: 'top',
    visibilityTime: durationMs,
    autoHide: true,
    swipeable: true,
  });
}

const palette: Record<ToastKind, { accent: string; icon: IconName }> = {
  error: { accent: colors.danger, icon: 'close' },
  success: { accent: colors.primary, icon: 'check' },
  info: { accent: colors.info, icon: 'info' },
};

/** One toast: a round coloured badge, the message, a 1 px edge. Flat, like the rest of the app (no shadow). */
function ToastCard({
  kind,
  text1,
  shown,
}: {
  kind: ToastKind;
  text1?: string;
  shown: boolean;
}) {
  const { accent, icon } = palette[kind];
  // The library keeps the card mounted, parked off screen, between messages (and while it slides out). A parked card
  // must not be an alert a screen reader can still find or announce, nor take a tap: only the card on show is.
  return (
    <Pressable
      testID={shown ? 'toast' : undefined}
      accessibilityRole={shown ? 'alert' : undefined}
      accessibilityLiveRegion={shown ? 'assertive' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'yes' : 'no-hide-descendants'}
      pointerEvents={shown ? 'auto' : 'none'}
      onPress={hideToast}
      style={[styles.toast, { borderColor: accent }]}
    >
      <View style={[styles.badge, { backgroundColor: accent }]}>
        <Icon
          name={icon}
          size={16}
          color={colors.textOnPrimary}
          background={accent}
          weight={2.4}
        />
      </View>
      <AppText variant="label" color={colors.text} style={styles.message}>
        {text1}
      </AppText>
    </Pressable>
  );
}

const card =
  (kind: ToastKind) =>
  ({ text1, isVisible }: ToastConfigParams<unknown>) =>
    <ToastCard kind={kind} text1={text1} shown={isVisible} />;

const toastConfig: ToastConfig = {
  error: card('error'),
  success: card('success'),
  info: card('info'),
};

/** Draws the toast. Mount one at the root of the app and one inside each bottom sheet. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  return (
    <RNToast
      config={toastConfig}
      topOffset={insets.top + spacing.sm}
      position="top"
      visibilityTime={TOAST_MS}
    />
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    alignSelf: 'stretch',
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { flex: 1 },
});
