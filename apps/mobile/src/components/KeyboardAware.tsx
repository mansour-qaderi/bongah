import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type HostInstance,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Keeps whatever the person is typing into above the on-screen keyboard.
 *
 * Android and iOS disagree about who makes room for the keyboard: sometimes the window shrinks, sometimes
 * (edge-to-edge screens, modals, iOS) it does not and the keyboard simply covers the bottom. So nothing here
 * assumes either. It reads where the keyboard's top edge is, measures where its own box ends on screen, and
 * pads the difference. If the window did shrink, the difference is zero and nothing is added.
 */

/** Space kept between the focused input and the keyboard, so the field is never flush against it. */
export const KEYBOARD_MARGIN = 24;
/** How long to wait, after the keyboard starts to move, before measuring: the layout has to settle first. */
const SETTLE_MS = [0, 120, 320];

interface KeyboardFrame {
  /** Where the keyboard's top edge is, as the platform reports it. Only trusted on iOS (see below). */
  screenY: number;
  /** How tall the keyboard is. On Android this leaves out the navigation bar under it. */
  height: number;
}

/**
 * Where the keyboard is, kept current: its top edge on screen and how much of the screen's bottom it covers
 * (both Infinity / 0 when there is no keyboard).
 *
 * Android's `screenY` is not the keyboard's top. React Native reports the bottom of the activity window's
 * visible frame, which is the keyboard's top only if Android shrank that window for the keyboard. This app is
 * edge-to-edge, where windows are not shrunk, and sheets live in a window of their own (a Modal) that the
 * activity's frame knows nothing about: there it was off by far more than the keyboard's height, and a sheet
 * lifted by it stopped well above the keys. The keyboard's height, on the other hand, comes straight from the
 * window insets and is right in both cases, so on Android the top is worked out as: the window's full height,
 * less the keyboard, less the navigation bar the keyboard also covers. iOS reports its frame correctly.
 *
 * `covers` is the most any box can ever need lifting by: nothing on screen is covered by more than the keyboard
 * is tall. It is the safety net under the measurements: whatever a window reports, a sheet is never raised by
 * more than that, so the "gap the size of a keyboard between the sheet and the keys" cannot come back.
 */
export function useKeyboard(): { top: number; covers: number } {
  const [frame, setFrame] = useState<KeyboardFrame | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const { bottom: navigationBar } = useSafeAreaInsets();
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const shown = (event: KeyboardEvent) => {
      const { screenY, height } = event.endCoordinates;
      // iOS reports the hidden keyboard as a frame below the screen; treat an empty one the same.
      setFrame(height > 0 ? { screenY, height } : null);
    };
    const hidden = () => setFrame(null);
    const subscriptions = ios
      ? [
          Keyboard.addListener('keyboardWillChangeFrame', shown),
          Keyboard.addListener('keyboardWillHide', hidden),
        ]
      : [
          Keyboard.addListener('keyboardDidShow', shown),
          Keyboard.addListener('keyboardDidHide', hidden),
        ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, []);
  if (!frame) return NO_KEYBOARD;
  return {
    top: keyboardTopEdge(frame, windowHeight, navigationBar),
    covers: keyboardCovers(frame, navigationBar),
  };
}

const NO_KEYBOARD = { top: Infinity, covers: 0 } as const;

/** The keyboard's top edge, kept current. Infinity when there is no keyboard. */
export const useKeyboardTop = (): number => useKeyboard().top;

/** How much of the screen's bottom the keyboard covers: its height, plus the navigation bar on Android. */
export function keyboardCovers(
  frame: KeyboardFrame,
  navigationBar: number,
  platform: string = Platform.OS,
): number {
  return platform === 'ios' ? frame.height : frame.height + navigationBar;
}

/** The keyboard's top edge on screen: see `useKeyboard` for why Android is worked out from the height. */
export function keyboardTopEdge(
  frame: KeyboardFrame,
  windowHeight: number,
  navigationBar: number,
  platform: string = Platform.OS,
): number {
  return platform === 'ios'
    ? frame.screenY
    : windowHeight - frame.height - navigationBar;
}

interface Box {
  top: number;
  bottom: number;
}

/** Where a view is in the window, or null if the platform cannot say (and in tests). */
function measure(node: HostInstance | null): Promise<Box | null> {
  return new Promise(resolve => {
    if (!node || typeof node.measureInWindow !== 'function') {
      resolve(null);
      return;
    }
    node.measureInWindow((_x, y, _width, height) => {
      resolve(
        Number.isFinite(y) && Number.isFinite(height)
          ? { top: y, bottom: y + height }
          : null,
      );
    });
  });
}

/**
 * How far the keyboard covers the bottom of a box on screen. `covers` caps the answer: a box can never be
 * covered by more than the keyboard is tall, so a larger figure is a mismeasurement and is not acted on.
 */
export const overlapWith = (
  box: Box | null,
  keyboardTop: number,
  covers: number = Infinity,
): number =>
  box && Number.isFinite(keyboardTop)
    ? Math.min(covers, Math.max(0, box.bottom - keyboardTop))
    : 0;

/**
 * A box that stops above the keyboard: it pads its own bottom by however far the keyboard covers it, so a
 * footer with buttons rides up with the keyboard and a list inside it shrinks instead of hiding behind it.
 * Use it as the root of a screen or sheet that holds an input.
 */
export function KeyboardAvoider({
  children,
  style,
  onRoomChange,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Told how tall the box is once the keyboard's share is taken off (its own height when the window already
   * shrank, its height less the covered part when it did not). A sheet that sits in the box uses it as the most
   * it may grow to, so its top never rides up under the status bar when the keyboard opens.
   */
  onRoomChange?: (room: number) => void;
}) {
  const { top: keyboardTop, covers } = useKeyboard();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const [overlap, setOverlap] = useState(0);
  const [boxHeight, setBoxHeight] = useState<number | null>(null);
  const roomRef = useRef(onRoomChange);
  roomRef.current = onRoomChange;
  useEffect(() => {
    if (boxHeight !== null) roomRef.current?.(Math.max(0, boxHeight - overlap));
  }, [boxHeight, overlap]);

  const update = useCallback(async () => {
    setOverlap(overlapWith(await measure(ref.current), keyboardTop, covers));
  }, [keyboardTop, covers]);

  // The padding changes this box's children, not the box itself, so measuring it again is stable.
  useEffect(() => {
    if (!Number.isFinite(keyboardTop)) {
      setOverlap(0);
      return;
    }
    const timers = SETTLE_MS.map(ms => setTimeout(update, ms));
    return () => timers.forEach(clearTimeout);
  }, [keyboardTop, update]);

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={event => {
        setBoxHeight(event.nativeEvent.layout.height);
        if (Number.isFinite(keyboardTop)) update();
      }}
      style={[
        styles.fill,
        style,
        overlap > 0 ? { paddingBottom: overlap } : null,
      ]}
    >
      {children}
    </View>
  );
}

interface FocusContextValue {
  /** An input was focused: bring it into view once the keyboard is there. */
  inputFocused: () => void;
}
const FocusContext = createContext<FocusContextValue | null>(null);

/** For inputs inside a KeyboardAwareScrollView; null outside one. */
export const useKeyboardFocus = () => useContext(FocusContext);

type Props = ScrollViewProps & {
  /** Extra room kept under the focused input. */
  margin?: number;
};

/**
 * A ScrollView for forms. Tapping any input scrolls the page so that input sits above the keyboard, and
 * moving from one input to the next keeps following. While the keyboard is up the page gets extra room at its
 * foot, so the last field can always be brought fully into view.
 */
export const KeyboardAwareScrollView = forwardRef<
  React.ComponentRef<typeof ScrollView>,
  Props
>(function KeyboardAwareScrollViewImpl(
  { children, margin = KEYBOARD_MARGIN, onScroll, ...rest },
  forwarded,
) {
  const { top: keyboardTop, covers } = useKeyboard();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const box = useRef<React.ComponentRef<typeof View>>(null);
  const offset = useRef(0);
  const topRef = useRef(keyboardTop);
  topRef.current = keyboardTop;
  const coversRef = useRef(covers);
  coversRef.current = covers;
  const [overlap, setOverlap] = useState(0);
  useImperativeHandle(forwarded, () => scroll.current as never);

  const reveal = useCallback(async () => {
    const keyboard = topRef.current;
    if (!Number.isFinite(keyboard)) return;
    const view = await measure(box.current);
    setOverlap(overlapWith(view, keyboard, coversRef.current));
    const input = await measure(
      TextInput.State.currentlyFocusedInput?.() ?? null,
    );
    if (!view || !input) return;
    // The part of the box the keyboard leaves free.
    const visibleBottom = Math.min(view.bottom, keyboard);
    const hidden = input.bottom + margin - visibleBottom;
    const above = view.top - input.top;
    if (hidden > 0) {
      scroll.current?.scrollTo({
        y: offset.current + hidden,
        animated: true,
      });
    } else if (above > 0) {
      scroll.current?.scrollTo({
        y: Math.max(0, offset.current - above - margin),
        animated: true,
      });
    }
  }, [margin]);

  // The keyboard came or went: measure again once the layout has settled.
  useEffect(() => {
    if (!Number.isFinite(keyboardTop)) {
      setOverlap(0);
      return;
    }
    const timers = SETTLE_MS.map(ms => setTimeout(reveal, ms));
    return () => timers.forEach(clearTimeout);
  }, [keyboardTop, reveal]);

  const focusContext = useMemo<FocusContextValue>(
    () => ({
      inputFocused: () => {
        // Moving between inputs with the keyboard already up gives no keyboard event: follow the focus.
        SETTLE_MS.forEach(ms => setTimeout(reveal, ms));
      },
    }),
    [reveal],
  );

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  };
  const handleLayout = (event: LayoutChangeEvent) => {
    rest.onLayout?.(event);
    if (Number.isFinite(topRef.current)) reveal();
  };

  return (
    <View ref={box} collapsable={false} style={styles.fill}>
      <FocusContext.Provider value={focusContext}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === 'ios' ? 'interactive' : 'on-drag'
          }
          scrollEventThrottle={16}
          {...rest}
          ref={scroll}
          onScroll={handleScroll}
          onLayout={handleLayout}
        >
          {children}
          {/* Room under the content for the part of the page the keyboard covers, so the last field can rise. */}
          {overlap > 0 ? <View style={{ height: overlap + margin }} /> : null}
        </ScrollView>
      </FocusContext.Provider>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
