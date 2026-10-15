import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  I18nManager,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../components/AppText';
import { colors, fonts, shadow, spacing } from '../theme';

/** The bar itself, without the space around it. */
export const FLOATING_BAR_HEIGHT = 60;
/**
 * The gap that lifts the bar off the bottom of the screen. It is added to the safe area (the gesture strip or
 * the navigation buttons), not folded into it, so on every phone the bar visibly floats above what is below it
 * instead of sitting on its edge.
 */
export const FLOATING_BAR_MARGIN = spacing.md;
/** The room left on each side, so the bar floats as a pill and does not run edge to edge. */
const SIDE_MARGIN = spacing.xl - spacing.xs;

/**
 * How far up from the bottom of the screen the bar reaches. Things that float over the map (buttons, the
 * credit) sit above this, so the map can run underneath the bar without anything being covered.
 */
export const floatingBarClearance = (safeBottom: number) =>
  FLOATING_BAR_HEIGHT + safeBottom + FLOATING_BAR_MARGIN;

/** Which screen lets the map run under the bar. Every other tab keeps its own space above it. */
const OVERLAY_ROUTE = 'Home';

const BAR_PADDING = 4;
/** The capsule behind the current tab holds its icon and its word, and stops just short of its neighbours. */
export const CAPSULE_INSET = 4;
export const CAPSULE_GAP = 4;
const ICON_SIZE = 24;
/** The icon swells to this much of its size half-way through changing tab, then settles back to full size. */
export const ICON_POP = 1.12;
const LABEL_HEIGHT = 16;

const SLIDE = { stiffness: 320, damping: 26, mass: 0.9 } as const;
// A little under-damped on purpose: the colour change arrives with a small, soft overshoot.
const POP = { stiffness: 280, damping: 15, mass: 0.8 } as const;

/**
 * The tab bar, after Telegram's: a slim white pill floating above the bottom edge. The current tab sits on a
 * soft emerald capsule that holds both its icon and its word and glides across to whichever tab is chosen,
 * while the icon and word turn emerald; the other tabs stay quiet in a neutral ink. Icons and words cross-fade
 * between the two looks and the icon gives a small pop. The row follows the language direction, so in Dari and
 * Pashto (right to left) the first tab is at the right and the capsule travels the right way.
 *
 * On Home the bar is laid over the map (nothing is lost under it: the screen keeps its own controls above it).
 * On the other tabs it takes its own space under the screen, as an ordinary bar does. A screen that needs the
 * space for something else (a listing card) hides it with `tabBarStyle: { display: 'none' }`; it slides away.
 */
export default function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const focusedRoute = state.routes[state.index];
  const hidden =
    StyleSheet.flatten(descriptors[focusedRoute.key].options.tabBarStyle)
      ?.display === 'none';
  const count = state.routes.length;

  // Width of the row of tabs, known once it has been laid out.
  const [rowWidth, setRowWidth] = useState(0);
  const itemWidth = rowWidth > 0 ? (rowWidth - BAR_PADDING * 2) / count : 0;
  const capsuleWidth = Math.max(0, itemWidth - CAPSULE_GAP);
  // Which way "forward" is on screen: the first tab is at the right when the language runs right to left.
  const direction = I18nManager.isRTL ? -1 : 1;

  const slide = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  // One 0..1 value per tab: 1 while it is the current one. A spring drives it, so it may overshoot 1 briefly.
  const active = useRef<Animated.Value[]>([]);
  while (active.current.length < count) {
    active.current.push(
      new Animated.Value(active.current.length === state.index ? 1 : 0),
    );
  }
  const away = useRef(new Animated.Value(hidden ? 1 : 0)).current;

  useEffect(() => {
    const target = state.index * itemWidth * direction;
    if (itemWidth === 0) return;
    if (!placed.current) {
      // The first drawing puts the capsule straight on the current tab; only later changes travel.
      slide.setValue(target);
      placed.current = true;
    } else {
      Animated.spring(slide, {
        toValue: target,
        useNativeDriver: true,
        ...SLIDE,
      }).start();
    }
  }, [state.index, itemWidth, direction, slide]);

  // Only a change of tab animates: on the first drawing every value already holds the right answer.
  const shownIndex = useRef(state.index);
  useEffect(() => {
    if (shownIndex.current === state.index) return;
    shownIndex.current = state.index;
    active.current.forEach((value, index) =>
      Animated.spring(value, {
        toValue: index === state.index ? 1 : 0,
        useNativeDriver: true,
        ...POP,
      }).start(),
    );
  }, [state.index]);

  useEffect(() => {
    Animated.timing(away, {
      toValue: hidden ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [hidden, away]);

  const overlay = focusedRoute.name === OVERLAY_ROUTE;
  const onLayout = (event: LayoutChangeEvent) =>
    reportHeight?.(event.nativeEvent.layout.height);
  const bottomSpace = insets.bottom + FLOATING_BAR_MARGIN;

  return (
    <Animated.View
      onLayout={onLayout}
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[
        styles.host,
        overlay ? styles.overlay : styles.inFlow,
        { paddingBottom: bottomSpace },
        {
          opacity: away.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
          }),
          transform: [
            {
              translateY: away.interpolate({
                inputRange: [0, 1],
                outputRange: [0, FLOATING_BAR_HEIGHT + bottomSpace],
              }),
            },
          ],
        },
      ]}
    >
      <View
        testID="tab-bar"
        style={[styles.bar, shadow.bar]}
        onLayout={event => setRowWidth(event.nativeEvent.layout.width)}
      >
        {itemWidth > 0 ? (
          <Animated.View
            testID="tab-pill"
            pointerEvents="none"
            style={[
              styles.pill,
              {
                width: capsuleWidth,
                start: BAR_PADDING + (itemWidth - capsuleWidth) / 2,
                transform: [{ translateX: slide }],
              },
            ]}
          />
        ) : null}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : options.title ?? route.name;
          const badge = options.tabBarBadge;
          const glow = active.current[index];
          // The spring can overshoot a little; opacity of either look must stay inside 0..1.
          const between = (from: number, to: number) =>
            glow.interpolate({
              inputRange: [0, 1],
              outputRange: [from, to],
              extrapolate: 'clamp',
            });

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () =>
            navigation.emit({ type: 'tabLongPress', target: route.key });

          return (
            <Pressable
              key={route.key}
              testID={`tab-${route.name}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.item,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.glyph}>
                {/* The icon's two looks sit on top of each other and cross-fade, with a pop in between. */}
                <Animated.View
                  testID={`tab-pop-${route.name}`}
                  style={[
                    styles.layerBox,
                    {
                      transform: [
                        {
                          scale: glow.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [1, ICON_POP, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Animated.View
                    style={[styles.layer, { opacity: between(1, 0) }]}
                  >
                    {options.tabBarIcon?.({
                      focused: false,
                      color: colors.textSecondary,
                      size: ICON_SIZE,
                    })}
                  </Animated.View>
                  <Animated.View
                    style={[styles.layer, { opacity: between(0, 1) }]}
                  >
                    {options.tabBarIcon?.({
                      focused: true,
                      color: colors.primary,
                      size: ICON_SIZE,
                    })}
                  </Animated.View>
                </Animated.View>
                {badge !== undefined && badge !== null && badge !== '' ? (
                  <View style={styles.badge}>
                    <AppText variant="caption" color={colors.textOnPrimary}>
                      {badge}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <View style={styles.labelBox}>
                <Animated.View
                  style={[styles.layer, { opacity: between(1, 0) }]}
                >
                  <AppText
                    variant="caption"
                    color={colors.textSecondary}
                    numberOfLines={1}
                    style={styles.label}
                  >
                    {label}
                  </AppText>
                </Animated.View>
                <Animated.View
                  style={[styles.layer, { opacity: between(0, 1) }]}
                >
                  <AppText
                    variant="caption"
                    color={colors.primary}
                    numberOfLines={1}
                    style={[styles.label, styles.labelOn]}
                  >
                    {label}
                  </AppText>
                </Animated.View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    paddingHorizontal: SIDE_MARGIN,
    paddingTop: spacing.xs,
  },
  // Over the map: takes no space, so the screen above it is the full height.
  overlay: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  // Under an ordinary screen: takes its own space on the page colour.
  inFlow: { backgroundColor: colors.background },
  bar: {
    height: FLOATING_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surfaceGlass,
    borderRadius: FLOATING_BAR_HEIGHT / 2,
    paddingHorizontal: BAR_PADDING,
  },
  pill: {
    position: 'absolute',
    top: CAPSULE_INSET,
    bottom: CAPSULE_INSET,
    borderRadius: (FLOATING_BAR_HEIGHT - CAPSULE_INSET * 2) / 2,
    backgroundColor: colors.primaryTint,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    width: ICON_SIZE + spacing.xl,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerBox: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBox: {
    alignSelf: 'stretch',
    height: LABEL_HEIGHT,
    marginTop: 2,
  },
  label: { lineHeight: LABEL_HEIGHT, fontSize: 11 },
  labelOn: { fontFamily: fonts.semibold },
  badge: {
    position: 'absolute',
    top: -4,
    end: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
