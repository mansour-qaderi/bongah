import React, { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  I18nManager,
  ScrollView,
  StyleSheet,
  View,
  type DimensionValue,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, surfaces, typography } from '../theme';
import type { TextVariant } from '../theme';
import {
  CARD_MEDIA_HEIGHT,
  DETAILS_GALLERY_HEIGHT,
  FACT_TILE,
  LISTING_THUMB,
  LOCATION_MAP_HEIGHT,
  ROUND_BUTTON,
} from './layoutSizes';
import { useReducedMotion } from './useReducedMotion';

/**
 * Placeholders for what is loading, drawn with the same boxes, gaps and line heights as the real thing, so nothing
 * jumps when the data arrives:
 *
 *  - `PropertyCardSkeleton`   a card of the Home list (PropertyCard);
 *  - `ListingCardSkeleton`    a card of "آگهی‌های من" (ListingCard);
 *  - `PropertyDetailsSkeleton` the details page (PropertyDetailsScreen);
 *  - `PropertyListSkeleton` / `ListingListSkeleton` a screenful of cards, for a list that has not loaded yet;
 *  - `ConversationListSkeleton` the list of chats (ChatListScreen), a row each: avatar, name, listing, last message;
 *  - `ChatThreadSkeleton`     one chat (ChatScreen): the listing strip, bubbles on both sides, the message box;
 *  - `TemplatesSkeleton`      the quick-reply templates page (TemplatesScreen): the new-template card and the saved ones.
 *
 * The sizes come from `layoutSizes.ts` (shared with the real cards) and from the theme's text variants: a line of text
 * is a bar inside a box as tall as that variant's line height, which is what the real text takes.
 *
 * The shimmer is one soft band that sweeps across a whole skeleton card (clipped to its edge), the same way for all of
 * them, from the start edge to the end edge (so right to left in Dari and Pashto). It is a transform on the native
 * driver, so it stays smooth while the screen is busy. With "reduce motion" on, the shapes simply stay still.
 */

/** The grey of every placeholder shape: the app's hairline grey, a touch darker than the soft fill behind a picture. */
const BONE = colors.border;
/** How long one sweep takes. */
export const SHIMMER_MS = 1300;

// One sweep value for every skeleton on screen, so the cards of a list shimmer together (and only one animation runs).
// It runs while at least one skeleton is mounted.
const sweep = new Animated.Value(0);
let watchers = 0;
let loop: Animated.CompositeAnimation | null = null;

function startSweep() {
  watchers += 1;
  if (watchers !== 1) return;
  sweep.setValue(0);
  loop = Animated.loop(
    Animated.timing(sweep, {
      toValue: 1,
      duration: SHIMMER_MS,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }),
  );
  loop.start();
}

function stopSweep() {
  watchers = Math.max(0, watchers - 1);
  if (watchers === 0) {
    loop?.stop();
    loop = null;
  }
}

/** Is any shimmer running? (For tests: every skeleton that unmounts must let go of the animation.) */
export const shimmerWatchers = () => watchers;

/**
 * A skeleton card's surface: clips what is drawn on it and lays the sweeping band over the shapes. `style` is the card
 * (or page) itself, so the band is exactly as wide as the thing it covers.
 */
function Shimmer({
  style,
  children,
  testID,
}: {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (reduced) return undefined;
    startSweep();
    return stopSweep;
  }, [reduced]);

  const band = Math.max(1, Math.round(width * 0.55));
  // From the start edge to the end edge. The band is placed on the physical left, so in a right-to-left layout it runs
  // the other way round.
  const translateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: I18nManager.isRTL ? [width, -band] : [-band, width],
  });

  return (
    <View
      style={[style, styles.clip]}
      onLayout={(e: LayoutChangeEvent) =>
        setWidth(Math.round(e.nativeEvent.layout.width))
      }
      testID={testID}
    >
      {children}
      {reduced || width === 0 ? null : (
        <Animated.View
          pointerEvents="none"
          testID="skeleton-shimmer"
          style={[styles.band, { width: band, transform: [{ translateX }] }]}
        >
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.7" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#sweep)" />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

/** One grey shape. */
export function Bone({
  width,
  height,
  rounded = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[{ width, height, borderRadius: rounded }, styles.bone, style]}
    />
  );
}

/**
 * A line of text: a bar sitting in a box as tall as `variant`'s line height (what the real text takes), so a card
 * built of lines is as tall as the card built of text. `lineHeight` overrides the box where a screen sets its own.
 */
export function TextBone({
  variant,
  width = '100%',
  lineHeight,
}: {
  variant: TextVariant;
  width?: DimensionValue;
  lineHeight?: number;
}) {
  const { fontSize, lineHeight: natural } = typography[variant];
  const box = lineHeight ?? natural;
  return (
    <View style={[styles.textBox, { height: box }]}>
      <Bone
        width={width}
        height={Math.min(box - 4, Math.round(fontSize * 0.85))}
        rounded={radius.sm / 2}
      />
    </View>
  );
}

/** The facts grid of a card: two to a row, each an icon tile and a line, as PropertyFacts draws it. */
function FactsBones({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.facts} testID="skeleton-facts">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.cell}>
          <Bone width={FACT_TILE} height={FACT_TILE} rounded={radius.sm} />
          <View style={styles.cellText}>
            <TextBone variant="label" width={i % 2 === 0 ? '78%' : '62%'} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** The two description lines every card ends with. */
function DescriptionBones() {
  return (
    <View>
      <TextBone variant="bodySm" />
      <TextBone variant="bodySm" width="64%" />
    </View>
  );
}

/** A deal-badge-sized pill (white when it sits on a picture, like a badge's own edge against it). */
function PillBone({
  width = 64,
  onPicture = false,
}: {
  width?: number;
  onPicture?: boolean;
}) {
  return (
    <Bone
      width={width}
      height={24}
      rounded={radius.pill}
      style={onPicture ? styles.pillOnPicture : undefined}
    />
  );
}

/** A round button, drawn white on its picture like the real one. */
function RoundBone({ onPicture = false }: { onPicture?: boolean }) {
  return (
    <View
      style={[
        styles.round,
        onPicture ? styles.roundOnPicture : { backgroundColor: BONE },
      ]}
    />
  );
}

/** Gives a skeleton the words and role a screen reader needs, and hides its shapes from it. */
function Announce({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      accessibilityState={{ busy: true }}
      importantForAccessibility="yes"
      style={style}
      testID={testID}
    >
      {children}
    </View>
  );
}

/** A card of the Home list while it loads: the picture, then title, price, place, the facts grid, the description. */
export function PropertyCardSkeleton({
  testID,
  standalone = false,
}: {
  testID?: string;
  /** On its own (the foot of a list that is fetching its next page), so it says "loading" itself. */
  standalone?: boolean;
}) {
  const card = (
    <Shimmer
      style={styles.homeCard}
      testID={testID ?? 'property-card-skeleton'}
    >
      <View style={styles.homeMedia}>
        <View style={styles.homeBadges}>
          <PillBone onPicture />
        </View>
        <View style={styles.homeCorner}>
          <RoundBone onPicture />
          <RoundBone onPicture />
        </View>
      </View>
      <View style={styles.homeBody}>
        <TextBone variant="heading" width="80%" />
        <TextBone variant="title" width="44%" lineHeight={34} />
        <View style={styles.place}>
          <Bone width={16} height={16} rounded={8} />
          <View style={styles.placeText}>
            <TextBone variant="caption" width="58%" />
          </View>
        </View>
        <FactsBones />
        <View style={styles.homeDescription}>
          <DescriptionBones />
        </View>
      </View>
    </Shimmer>
  );
  return standalone ? <Announce>{card}</Announce> : card;
}

/** A card of "آگهی‌های من" while it loads: the square picture, the title, price and place, the tag and the buttons. */
export function ListingCardSkeleton({
  testID,
  standalone = false,
}: {
  testID?: string;
  /** On its own (the foot of a list that is fetching its next page), so it says "loading" itself. */
  standalone?: boolean;
}) {
  const card = (
    <Shimmer style={styles.myCard} testID={testID ?? 'listing-card-skeleton'}>
      <View style={styles.myTop}>
        <Bone
          width={LISTING_THUMB}
          height={LISTING_THUMB}
          rounded={radius.md}
        />
        <View style={styles.myMain}>
          <TextBone variant="label" width="88%" />
          <TextBone variant="label" width="52%" />
          <TextBone variant="title" width="48%" />
          <View style={styles.place}>
            <Bone width={14} height={14} rounded={7} />
            <View style={styles.placeText}>
              <TextBone variant="caption" width="62%" />
            </View>
          </View>
        </View>
        <View style={styles.mySide}>
          <PillBone width={56} />
          <RoundBone />
          <RoundBone />
        </View>
      </View>
      <FactsBones />
      <DescriptionBones />
    </Shimmer>
  );
  return standalone ? <Announce>{card}</Announce> : card;
}

/** The details page while it loads: the picture strip, the header, the specs, the location and the description. */
export function PropertyDetailsSkeleton({ testID }: { testID?: string }) {
  return (
    <Announce style={styles.detailsRoot} testID={testID ?? 'details-skeleton'}>
      <ScrollView
        scrollEnabled={false}
        contentContainerStyle={styles.detailsContent}
      >
        <Shimmer>
          <Bone height={DETAILS_GALLERY_HEIGHT} rounded={0} width="100%" />

          <View style={[styles.section, styles.header]}>
            <View style={styles.headerRow}>
              <View style={styles.headerTitle}>
                <TextBone variant="pageTitle" width="72%" />
              </View>
              <View style={styles.headerActions}>
                <RoundBone />
                <RoundBone />
              </View>
            </View>
            <View style={styles.priceBox}>
              <View style={styles.priceMain}>
                <TextBone variant="caption" width={72} />
                <TextBone variant="title" width="52%" />
              </View>
              <PillBone width={60} />
            </View>
            <View style={styles.place}>
              <Bone width={16} height={16} rounded={8} />
              <View style={styles.placeText}>
                <TextBone variant="caption" width="40%" />
              </View>
            </View>
          </View>

          <View style={[styles.section, styles.detailsCard]}>
            <TextBone variant="section" width="26%" />
            <FactsBones />
          </View>

          <View style={[styles.section, styles.detailsCard]}>
            <TextBone variant="section" width="30%" />
            <TextBone variant="bodySm" width="76%" />
            <Bone
              height={LOCATION_MAP_HEIGHT}
              width="100%"
              rounded={radius.md}
            />
          </View>

          <View style={[styles.section, styles.detailsCard]}>
            <TextBone variant="section" width="34%" />
            <View>
              <TextBone variant="bodySm" />
              <TextBone variant="bodySm" />
              <TextBone variant="bodySm" width="58%" />
            </View>
          </View>
        </Shimmer>
      </ScrollView>
    </Announce>
  );
}

/** A screenful of Home cards, for the list before its first page has arrived. */
export function PropertyListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Announce style={styles.list} testID="property-list-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <PropertyCardSkeleton key={i} testID={`property-card-skeleton-${i}`} />
      ))}
    </Announce>
  );
}

/** A screenful of My Listings cards, for the list before its first page has arrived. */
export function ListingListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Announce style={styles.list} testID="listing-list-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <ListingCardSkeleton key={i} testID={`listing-card-skeleton-${i}`} />
      ))}
    </Announce>
  );
}

/** One chat in the list, as ChatListScreen's row draws it: the avatar, the name and time, the listing, the last message. */
function ConversationRowSkeleton({ testID }: { testID?: string }) {
  return (
    <Shimmer style={styles.chatRow} testID={testID}>
      <Bone width={52} height={52} rounded={26} />
      <View style={styles.chatMain}>
        <View style={styles.chatLine}>
          <View style={styles.chatName}>
            <TextBone variant="label" width="46%" />
          </View>
          <Bone width={36} height={10} rounded={5} />
        </View>
        <TextBone variant="caption" width="58%" />
        <TextBone variant="caption" width="82%" />
      </View>
    </Shimmer>
  );
}

/** The list of chats before it has arrived. */
export function ConversationListSkeleton({ count = 7 }: { count?: number }) {
  return (
    <Announce style={styles.chatList} testID="conversation-list-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <ConversationRowSkeleton
          key={i}
          testID={`conversation-skeleton-${i}`}
        />
      ))}
    </Announce>
  );
}

// The bubbles of a chat that has not arrived: who speaks, how wide, how many lines. A made-up but natural exchange,
// newest at the bottom (as the real chat is), mine on the start edge and theirs on the end edge (as MessageBubble does).
const THREAD: { mine: boolean; width: number; lines: number }[] = [
  { mine: false, width: 0.52, lines: 1 },
  { mine: true, width: 0.7, lines: 2 },
  { mine: false, width: 0.62, lines: 2 },
  { mine: true, width: 0.4, lines: 1 },
  { mine: false, width: 0.74, lines: 3 },
  { mine: true, width: 0.56, lines: 1 },
];

/** One chat while it loads: the listing strip on top, the bubbles, and the message box at the foot. */
export function ChatThreadSkeleton({ testID }: { testID?: string }) {
  return (
    <Announce style={styles.thread} testID={testID ?? 'chat-thread-skeleton'}>
      <Shimmer style={styles.threadBody}>
        <View style={styles.threadProperty}>
          <Bone width={48} height={48} rounded={radius.md} />
          <View style={styles.threadPropertyText}>
            <TextBone variant="label" width="60%" />
            <TextBone variant="caption" width="34%" />
            <TextBone variant="caption" width="46%" />
          </View>
        </View>
        <View style={styles.threadMessages}>
          {THREAD.map((bubble, i) => (
            <View
              key={i}
              style={[
                styles.bubbleRow,
                bubble.mine ? styles.bubbleMine : styles.bubbleTheirs,
              ]}
            >
              <View
                testID={`chat-bubble-skeleton-${i}`}
                style={[
                  styles.bubble,
                  { width: `${Math.round(bubble.width * 100)}%` },
                ]}
              >
                {Array.from({ length: bubble.lines }, (__, line) => (
                  <TextBone
                    key={line}
                    variant="body"
                    width={
                      line === bubble.lines - 1 && bubble.lines > 1
                        ? '60%'
                        : '100%'
                    }
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
        <View style={styles.threadComposer}>
          <View style={styles.threadInput} />
        </View>
      </Shimmer>
    </Announce>
  );
}

/** The templates page while it loads: the count, the form card, and two saved templates. */
export function TemplatesSkeleton() {
  return (
    <Announce style={styles.templates} testID="templates-skeleton">
      <Shimmer>
        <View style={styles.templatesContent}>
          <TextBone variant="body" width="30%" />
          <View style={styles.templateCard}>
            <TextBone variant="heading" width="40%" />
            <Bone height={96} width="100%" rounded={radius.md} />
            <TextBone variant="label" width="50%" />
            <Bone height={48} width="100%" rounded={radius.md} />
          </View>
          {[0, 1].map(i => (
            <View key={i} style={styles.templateCard}>
              <TextBone variant="body" />
              <TextBone variant="body" width="72%" />
              <View style={styles.templateButtons}>
                <Bone height={48} rounded={radius.md} style={styles.flex1} />
                <Bone height={48} rounded={radius.md} style={styles.flex1} />
                <Bone height={48} rounded={radius.md} style={styles.flex1} />
              </View>
            </View>
          ))}
        </View>
      </Shimmer>
    </Announce>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  bone: { backgroundColor: BONE },
  textBox: { justifyContent: 'center' },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  list: { flex: 1, overflow: 'hidden', paddingTop: spacing.xs },

  // — shared pieces —
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    columnGap: spacing.md,
  },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexBasis: '45%',
    flexGrow: 1,
    flexShrink: 1,
  },
  cellText: { flex: 1 },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  placeText: { flex: 1 },
  round: {
    width: ROUND_BUTTON,
    height: ROUND_BUTTON,
    borderRadius: ROUND_BUTTON / 2,
  },
  pillOnPicture: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roundOnPicture: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // — the Home card (the same as PropertyCard) —
  homeCard: {
    ...surfaces.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  homeMedia: { height: CARD_MEDIA_HEIGHT, backgroundColor: BONE },
  homeBadges: { position: 'absolute', top: spacing.md, start: spacing.md },
  homeCorner: {
    position: 'absolute',
    top: spacing.md,
    end: spacing.md,
    gap: spacing.sm,
  },
  homeBody: { padding: spacing.lg, gap: spacing.sm },
  homeDescription: { marginTop: spacing.xs },

  // — the My Listings card (the same as ListingCard) —
  myCard: {
    ...surfaces.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  myTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  myMain: { flex: 1, gap: spacing.xs },
  mySide: { alignItems: 'center', gap: spacing.sm },

  // — the details page (the same as PropertyBody) —
  detailsRoot: { flex: 1, backgroundColor: colors.background },
  detailsContent: { padding: 0, paddingBottom: spacing.xxl },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  header: { gap: spacing.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerTitle: { flex: 1 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  priceBox: {
    ...surfaces.tile,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  priceMain: { flex: 1, gap: 2 },
  detailsCard: {
    ...surfaces.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },

  // — the chat list and one chat (the same as ChatListScreen and ChatScreen) —
  chatList: { flex: 1, overflow: 'hidden', paddingVertical: spacing.md },
  chatRow: {
    ...surfaces.tile,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  chatMain: { flex: 1, gap: 2 },
  chatLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chatName: { flex: 1 },
  thread: { flex: 1, backgroundColor: colors.background },
  threadBody: { flex: 1 },
  threadProperty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  threadPropertyText: { flex: 1 },
  threadMessages: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingVertical: spacing.md,
  },
  bubbleRow: { paddingHorizontal: spacing.md, paddingVertical: 3 },
  bubbleMine: { alignItems: 'flex-start' },
  bubbleTheirs: { alignItems: 'flex-end' },
  bubble: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  threadComposer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  threadInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
  },

  // — the templates page (the same as TemplatesScreen's Manager) —
  templates: { flex: 1, backgroundColor: colors.background },
  templatesContent: { padding: spacing.lg, gap: spacing.lg },
  templateCard: { ...surfaces.card, padding: spacing.lg, gap: spacing.md },
  templateButtons: { flexDirection: 'row', gap: spacing.sm },
  flex1: { flex: 1 },
});
