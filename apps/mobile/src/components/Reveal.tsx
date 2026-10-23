import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors } from '../theme';
import { useReducedMotionKnown } from './useReducedMotion';

/** How long the data takes to fade in, and the loader to fade out, when one replaces the other (ms). */
export const FADE_IN_MS = 240;
export const FADE_OUT_MS = 180;

/**
 * Knows when a loader has just been replaced by what it was waiting for. `pending` is the request's "nothing yet"; the
 * moment it turns false, `leaving` is true (in that very render, so the data never shows for a frame without its fade)
 * until the fade is over and `onDone` is called.
 *
 * ```tsx
 * const reveal = useReveal(query.isPending);
 * if (query.isPending) return <LoadingView />;
 * return <Reveal {...reveal} loader={<LoadingView />}>{page}</Reveal>;
 * ```
 */
export function useReveal(pending: boolean) {
  const [was, setWas] = useState(pending);
  const [leaving, setLeaving] = useState(false);
  // Derived from the props in the same render (React allows this for a component's own state).
  if (was !== pending) {
    setWas(pending);
    setLeaving(!pending);
  }
  const onDone = useCallback(() => setLeaving(false), []);
  return { leaving, onDone };
}

interface Props {
  /** From `useReveal`: the loader has just gone and the fade is to be played. */
  leaving: boolean;
  onDone: () => void;
  /** The loader that was on screen. It is drawn over the data and fades out while the data fades in. */
  loader: ReactNode;
  children: ReactNode;
  /** True (the default) for a screen or a list that fills its space; false for content that is as tall as it is. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The hand-over from a loader to the data: the data fades in (`FADE_IN_MS`) while the loader, drawn over it on the
 * page's own background, fades out (`FADE_OUT_MS`), and then the loader is taken away. Nothing jumps, because both are
 * in the same place for the whole fade. Opacity only, on the native driver.
 *
 * With "reduce motion" on there is no fade: the data is simply there. Data that was already there when the screen was
 * opened (cached from before) is not faded either: `leaving` is false from the start, so this is just a frame.
 */
export function Reveal({
  leaving,
  onDone,
  loader,
  children,
  fill = true,
  style,
}: Props) {
  const reduced = useReducedMotionKnown();
  // Fade only if this mounted at the moment the loader left.
  const entering = useRef(leaving).current;
  const content = useRef(new Animated.Value(entering ? 0 : 1)).current;
  const veil = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!leaving) return undefined;
    // Wait for the phone's answer: whether to play the fade depends on it.
    if (reduced === undefined) return undefined;
    if (reduced) {
      content.setValue(1);
      onDone();
      return undefined;
    }
    // The data may already be on screen under the loader (this was not mounted at the hand-over): hide it, so it fades
    // in with the loader's fade out. The loader is opaque, so nothing is seen of this.
    content.setValue(0);
    const play = Animated.parallel([
      Animated.timing(content, {
        toValue: 1,
        duration: FADE_IN_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(veil, {
        toValue: 0,
        duration: FADE_OUT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    play.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => play.stop();
  }, [leaving, reduced, content, veil, onDone]);

  return (
    <View style={[fill ? styles.fill : null, style]}>
      <Animated.View
        testID="reveal-content"
        style={[fill ? styles.fill : null, { opacity: content }]}
      >
        {children}
      </Animated.View>
      {leaving ? (
        <Animated.View
          pointerEvents="none"
          testID="reveal-loader"
          style={[styles.veil, { opacity: veil }]}
        >
          {loader}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  veil: { ...StyleSheet.absoluteFill, backgroundColor: colors.background },
});
