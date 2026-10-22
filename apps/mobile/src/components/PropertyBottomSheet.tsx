import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Property } from '@bongah/shared-types';
import { colors, radius, spacing } from '../theme';
import PropertyPreviewCard from './PropertyPreviewCard';

interface Props {
  /** The listing to show; null keeps the sheet closed (or slides it away if it was open). */
  property: Property | null;
  /** The card body was tapped: open the full details page. */
  onOpenDetails: (property: Property) => void;
  /**
   * The person dismissed the sheet (×, swipe down, Android back). The parent must answer by passing
   * `property={null}`; the sheet then slides itself away. Tapping the map outside the sheet is the parent's
   * job too (the map is not ours), and it ends the same way.
   */
  onClose: () => void;
  /** «مسیریابی» in the card: directions to the listing (the card shows no such button when this is left out). */
  onNavigate?: (property: Property) => void;
  /** The phone is being located for those directions. */
  navigating?: boolean;
}

const ENTER_MS = 260;
const EXIT_MS = 200;
/** Far enough below the screen that a sheet which has not been measured yet cannot be seen. */
const PARKED = 10_000;
/** A downward drag shorter than this is a tap or a wobble, not a swipe. */
const DRAG_START_PX = 6;
/** Let go past this share of the sheet's height, or flick faster than this (px/ms), and it closes. */
const CLOSE_DISTANCE = 0.3;
const CLOSE_VELOCITY = 0.9;

/**
 * The listing sheet that slides up over the map when a marker is chosen.
 *
 * What is inside (picture, price, title, type, area / rooms, and the sticky Call / WhatsApp / Chat bar) is
 * `PropertyPreviewCard`, so the sheet and the details page share one set of contact rules. This component
 * owns only the motion and the lifecycle:
 *  - it slides up when `property` appears and down when it becomes null, and stays mounted for the slide
 *    down, so closing never makes the card vanish;
 *  - it follows a finger dragging it down, and closes on a long drag or a flick;
 *  - choosing a different listing while it is open swaps the content in place, and choosing one while it is
 *    sliding away brings it back;
 *  - Android back closes it instead of leaving the screen.
 * Motion uses the native driver (transform only), so it stays smooth while the map is busy. The layout uses
 * logical edges only, so Dari and Pashto (right-to-left) need nothing special; a vertical drag has no
 * direction to mirror.
 */
export default function PropertyBottomSheet({
  property,
  onOpenDetails,
  onClose,
  onNavigate,
  navigating = false,
}: Props) {
  const insets = useSafeAreaInsets();
  // What is drawn. It follows `property`, but outlives it while the sheet slides away.
  const [content, setContent] = useState<Property | null>(property);
  const translateY = useRef(new Animated.Value(PARKED)).current;
  const height = useRef(0);
  // Set once the sheet has been measured and started sliding in; cleared when it has slid out.
  const placed = useRef(false);

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const slideTo = (
    toValue: number,
    duration: number,
    easing: (t: number) => number,
    done?: () => void,
  ) =>
    Animated.timing(translateY, {
      toValue,
      duration,
      easing,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Starting another animation on the same value ends this one with finished = false.
      if (finished) done?.();
    });

  useEffect(() => {
    if (property) {
      setContent(property);
      // First open: onLayout starts the slide once the height is known.
      if (placed.current) {
        slideTo(0, ENTER_MS, Easing.out(Easing.cubic));
      }
      return;
    }
    if (!placed.current) {
      setContent(null);
      return;
    }
    slideTo(
      Math.max(height.current, 1),
      EXIT_MS,
      Easing.in(Easing.cubic),
      () => {
        placed.current = false;
        translateY.setValue(PARKED);
        setContent(null);
      },
    );
    // `slideTo` and `translateY` never change; only `property` should restart the motion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property]);

  const open = property !== null;
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        closeRef.current();
        return true;
      },
    );
    return () => subscription.remove();
  }, [open]);

  const onLayout = (event: LayoutChangeEvent) => {
    height.current = event.nativeEvent.layout.height;
    if (placed.current) return; // already on screen: a taller card (an error banner) just grows upward
    placed.current = true;
    translateY.setValue(height.current);
    slideTo(0, ENTER_MS, Easing.out(Easing.cubic));
  };

  const pan = useMemo(() => {
    const springBack = () =>
      Animated.spring(translateY, {
        toValue: 0,
        bounciness: 0,
        useNativeDriver: true,
      }).start();
    return PanResponder.create({
      // Capture the drag from the card's own buttons, but only once it is clearly a downward swipe, so
      // taps still reach them.
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        gesture.dy > DRAG_START_PX && gesture.dy > Math.abs(gesture.dx) * 1.5,
      onPanResponderMove: (_event, gesture) =>
        translateY.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_event, gesture) => {
        if (
          gesture.dy > height.current * CLOSE_DISTANCE ||
          gesture.vy > CLOSE_VELOCITY
        ) {
          // The parent answers with property = null, and the effect above carries on from here.
          closeRef.current();
        } else {
          springBack();
        }
      },
      onPanResponderTerminate: springBack,
    });
  }, [translateY]);

  if (!content) return null;

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <Animated.View
        testID="property-bottom-sheet"
        onLayout={onLayout}
        style={{ transform: [{ translateY }] }}
        {...pan.panHandlers}
      >
        <PropertyPreviewCard
          // A new listing gets its own contact state.
          key={content.id}
          property={content}
          onOpen={() => onOpenDetails(content)}
          onClose={() => closeRef.current()}
          onNavigate={
            onNavigate && content.lat !== null && content.lng !== null
              ? () => onNavigate(content)
              : undefined
          }
          navigating={navigating}
        />
        {/* The sheet reaches the screen's edge (the tab bar steps aside), so its colour continues under the
            gesture bar / home indicator instead of leaving the map showing through. */}
        <View
          style={{ height: insets.bottom, backgroundColor: colors.surface }}
        />
        <View pointerEvents="none" style={styles.grabberRow}>
          <View style={styles.grabber} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Covers the map and clips the sheet at its bottom edge, so sliding down never draws over the tab bar.
  // `box-none`: the map above the sheet stays touchable.
  host: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  grabberRow: {
    position: 'absolute',
    top: spacing.xs,
    start: 0,
    end: 0,
    alignItems: 'center',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
});
