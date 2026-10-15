import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import { KeyboardAvoider, useKeyboardTop } from './KeyboardAware';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** The scrolling content; give it flex: 1 (a KeyboardAwareScrollView does) so the footer stays pinned. */
  children: React.ReactNode;
  /** Pinned under the content: the sheet's main button. */
  footer?: React.ReactNode;
  /** How much of the screen the sheet takes when there is room, 0..1. */
  heightRatio?: number;
}

/** Drag the handle down this far, or flick it this fast, and the sheet closes. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.9;

/**
 * A sheet that slides up from the bottom over a dimmed page. Tapping the dimmed part, pulling the handle down or
 * the system back button closes it. It rises with the keyboard (and shrinks if it must), so a field inside is
 * never behind the keys.
 */
export default function BottomSheet({
  visible,
  onClose,
  title,
  children,
  footer,
  heightRatio = 0.88,
}: Props) {
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // With the keyboard up the sheet ends at the keys; without it, it ends at the screen edge, under the gesture bar.
  const keyboardUp = Number.isFinite(useKeyboardTop());
  // The modal stays mounted until the closing animation has finished.
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(progress, {
        toValue: 1,
        useNativeDriver: true,
        stiffness: 260,
        damping: 28,
        mass: 0.9,
      }).start();
      return;
    }
    // Closed and never opened: nothing to animate.
    if (!mounted) return;
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
        drag.setValue(0);
      }
    });
    // `mounted` is only read to skip the very first, already-closed run; it must not retrigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, progress, drag]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
        onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
            onCloseRef.current();
          } else {
            Animated.spring(drag, {
              toValue: 0,
              useNativeDriver: true,
              stiffness: 300,
              damping: 26,
            }).start();
          }
        },
        onPanResponderTerminate: () =>
          Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [drag],
  );

  const sheetHeight = Math.round(screenHeight * heightRatio);
  const translateY = Animated.add(
    progress.interpolate({
      inputRange: [0, 1],
      outputRange: [sheetHeight, 0],
    }),
    drag,
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* The top padding keeps a tall sheet, or one squeezed by the keyboard, out from under the status bar. */}
      <KeyboardAvoider style={[styles.overlay, { paddingTop: insets.top }]}>
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
                extrapolate: 'clamp',
              }),
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={styles.fill}
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View
          testID="bottom-sheet"
          style={[
            styles.sheet,
            { height: sheetHeight, transform: [{ translateY }] },
          ]}
        >
          <View {...pan.panHandlers} style={styles.head}>
            <View style={styles.handle} />
            <View style={styles.titleRow}>
              <AppText variant="heading">{title}</AppText>
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                hitSlop={12}
              >
                <AppText variant="label" color={colors.primary}>
                  {t('common.close')}
                </AppText>
              </Pressable>
            </View>
          </View>
          {children}
          {footer ? (
            <View
              style={[
                styles.footer,
                {
                  paddingBottom: spacing.lg + (keyboardUp ? 0 : insets.bottom),
                },
              ]}
            >
              {footer}
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAvoider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { justifyContent: 'flex-end' },
  fill: { flex: 1 },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: colors.overlay,
  },
  sheet: {
    // Never taller than the room above the keyboard.
    maxHeight: '100%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
  },
  head: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.handle,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
