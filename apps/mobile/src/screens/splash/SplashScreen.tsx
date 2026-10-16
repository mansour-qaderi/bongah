import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import AppText from '../../components/AppText';
import Logo from '../../components/Logo';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

/** How long the opening screen stays before the app takes over (ms). */
export const SPLASH_DURATION_MS = 1800;
/** The mark starts a little smaller than its final size and settles at exactly 1.0. */
const START_SCALE = 0.82;
const ICON_FADE_MS = 450;
const TEXT_DELAY_MS = 420;
const TEXT_FADE_MS = 520;
const LOGO_SIZE = 136;

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

/**
 * The opening screen: the logo fades in while springing up to full size, then the name and the tagline fade in under
 * it. After `SPLASH_DURATION_MS` the stack is *reset* to the main tabs (the map), so the splash is gone from the
 * back stack and the back button or swipe can never return to it.
 *
 * Only the logo and text are animated, and only with opacity and transforms (the native driver), so it stays smooth
 * while the app's own start-up work happens. With "reduce motion" switched on in the phone, everything simply appears.
 */
export default function SplashScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(START_SCALE)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textShift = useRef(new Animated.Value(10)).current;

  // The way out: one timer, cleared if the screen goes away first.
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    }, SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [navigation]);

  // The way in.
  useEffect(() => {
    let cancelled = false;
    let running: Animated.CompositeAnimation | null = null;

    const settle = () => {
      iconOpacity.setValue(1);
      iconScale.setValue(1);
      textOpacity.setValue(1);
      textShift.setValue(0);
    };

    const play = () => {
      running = Animated.parallel([
        Animated.timing(iconOpacity, {
          toValue: 1,
          duration: ICON_FADE_MS,
          useNativeDriver: true,
        }),
        // A spring that eases in without ever passing 1.0 (clamped), so the mark never looks too big for a moment.
        Animated.spring(iconScale, {
          toValue: 1,
          stiffness: 110,
          damping: 16,
          mass: 1,
          overshootClamping: true,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(TEXT_DELAY_MS),
          Animated.parallel([
            Animated.timing(textOpacity, {
              toValue: 1,
              duration: TEXT_FADE_MS,
              useNativeDriver: true,
            }),
            Animated.timing(textShift, {
              toValue: 0,
              duration: TEXT_FADE_MS,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]);
      running.start();
    };

    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
      .catch(() => false)
      .then(reduce => {
        if (cancelled) return;
        if (reduce) settle();
        else play();
      });

    return () => {
      cancelled = true;
      running?.stop();
    };
  }, [iconOpacity, iconScale, textOpacity, textShift]);

  return (
    <View style={styles.screen} testID="splash-screen">
      <View style={styles.center}>
        <Animated.View
          testID="splash-logo"
          style={{ opacity: iconOpacity, transform: [{ scale: iconScale }] }}
        >
          <Logo size={LOGO_SIZE} />
        </Animated.View>

        <Animated.View
          testID="splash-text"
          style={[
            styles.text,
            { opacity: textOpacity, transform: [{ translateY: textShift }] },
          ]}
        >
          <AppText style={styles.name}>{t('splash.name')}</AppText>
          <View style={styles.rule} />
          <AppText
            variant="body"
            color={colors.textMuted}
            style={styles.tagline}
          >
            {t('splash.tagline')}
          </AppText>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  // A touch above the middle: the eye reads the mark as centred, with the text hanging under it.
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  text: { alignItems: 'center', marginTop: spacing.xl },
  name: {
    fontSize: 30,
    lineHeight: 44,
    fontWeight: '700',
    color: colors.primaryDark,
    textAlign: 'center',
  },
  rule: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginVertical: spacing.md,
  },
  tagline: { textAlign: 'center' },
});
