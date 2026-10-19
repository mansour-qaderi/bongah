import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';

/**
 * A short message that appears at the top of the screen, says exactly what happened, and goes away by itself.
 *
 * `showToast("…")` can be called from anywhere (a mutation's `onError`, an event handler): there is no provider to
 * wrap a screen in. The message is drawn by a `ToastHost`: one at the root of the app, and one inside every bottom
 * sheet (a sheet is a native modal and covers everything under it, so a toast from the form in a sheet would
 * otherwise be drawn behind the very sheet that caused it). Only the host mounted last draws, so a message is never
 * drawn twice.
 */
export type ToastKind = 'error' | 'success' | 'info';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

/** How long a message stays: long enough to read a sentence. */
export const TOAST_MS = 5000;

type Listener = (item: ToastItem | null) => void;

let current: ToastItem | null = null;
let counter = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
/** The hosts, in the order they were mounted; the last one draws. */
const hosts: Listener[] = [];

const publish = () => hosts[hosts.length - 1]?.(current);

export function hideToast(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  current = null;
  publish();
}

/** Shows `message` (replacing any message on screen). An empty message is ignored. */
export function showToast(
  message: string,
  kind: ToastKind = 'error',
  durationMs: number = TOAST_MS,
): void {
  const text = message.trim();
  if (!text) return;
  if (timer) clearTimeout(timer);
  counter += 1;
  current = { id: counter, message: text, kind };
  publish();
  timer = setTimeout(hideToast, durationMs);
}

const palette: Record<ToastKind, { border: string; fg: string }> = {
  error: { border: colors.danger, fg: colors.danger },
  success: { border: colors.primary, fg: colors.primaryDark },
  info: { border: colors.border, fg: colors.text },
};

/** Draws the toast. Mount one at the root of the app and one inside each bottom sheet. */
export function ToastHost() {
  const [item, setItem] = useState<ToastItem | null>(current);
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const previous = hosts[hosts.length - 1];
    hosts.push(setItem);
    // The newest host takes over; the one it covers lets go of the message.
    previous?.(null);
    setItem(current);
    return () => {
      const at = hosts.indexOf(setItem);
      if (at >= 0) hosts.splice(at, 1);
      hosts[hosts.length - 1]?.(current);
    };
  }, []);

  const id = item?.id;
  useEffect(() => {
    if (id === undefined) return;
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [id, fade]);

  if (!item) return null;
  const { border, fg } = palette[item.kind];
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: insets.top + spacing.sm,
          opacity: fade,
          transform: [
            {
              translateY: fade.interpolate({
                inputRange: [0, 1],
                outputRange: [-12, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Pressable
        testID="toast"
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        onPress={hideToast}
        style={[styles.toast, { borderColor: border }]}
      >
        <AppText variant="label" color={fg}>
          {item.message}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    start: spacing.lg,
    end: spacing.lg,
    zIndex: 1000,
  },
  toast: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
