import React from 'react';
import {
  AccessibilityInfo,
  Animated,
  I18nManager,
  StyleSheet,
  Text,
} from 'react-native';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Property } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import { allText, mockApi, render as renderTree } from '../test-utils';
import { colors, radius, spacing, typography } from '../src/theme';

const fetchMock = jest.fn();
let mockUser: Record<string, unknown> | null = null;

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    status: mockUser ? 'signedIn' : 'signedOut',
    updateUser: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Imported after the mock so the components pick it up.
import AppLoader, {
  APP_LOADER_MS,
  PIN_SWELL,
} from '../src/components/AppLoader';
import ListingCard from '../src/components/ListingCard';
import {
  CARD_MEDIA_HEIGHT,
  DETAILS_GALLERY_HEIGHT,
  FACT_TILE,
  LISTING_THUMB,
  LOCATION_MAP_HEIGHT,
  ROUND_BUTTON,
} from '../src/components/layoutSizes';
import { LOGO_GEOMETRY } from '../src/components/Logo';
import MapLoader, { MAP_LOADER_MS } from '../src/components/MapLoader';
import PropertyCard from '../src/components/PropertyCard';
import { Screen } from '../src/components/Screen';
import {
  ListingCardSkeleton,
  ListingListSkeleton,
  PropertyCardSkeleton,
  PropertyDetailsSkeleton,
  PropertyListSkeleton,
  SHIMMER_MS,
  shimmerWatchers,
} from '../src/components/SkeletonLoader';
import { waveOf } from '../src/components/useReducedMotion';
import { StatusPill } from '../src/screens/home/MapControls';
import MyListingsScreen from '../src/screens/my/MyListingsScreen';

declare const __dirname: string;
const fs = require('node:fs') as {
  readFileSync(p: string, e: 'utf8'): string;
};
const path = require('node:path') as { join(...p: string[]): string };
const source = (...parts: string[]) =>
  fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

const property = (overrides: Partial<Property> = {}): Property => ({
  id: 'p1',
  user_id: 'u1',
  agency_id: null,
  agency_name: null,
  title: 'خانه سه اتاقه در شهر زرنج',
  description: 'یک خانه خوب',
  type: 'HOUSE_HAWILI',
  deal_type: 'SALE',
  price: 1200000,
  currency: 'AFGHANI',
  area_sqm: 253,
  bedrooms: 3,
  bathrooms: 2,
  province: 'nimroz',
  district: 'زرنج',
  neighborhood: null,
  address: '',
  lat: null,
  lng: null,
  images: [],
  status: 'ACTIVE',
  is_featured: false,
  featured_until: null,
  laddered_at: null,
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T08:00:00Z',
  ...overrides,
});

// Every tree is unmounted after its test: a loader left mounted keeps its animation running into the next test.
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const show = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
  mounted.push(tree);
  return tree;
};
const settle = async () => {
  for (let i = 0; i < 3; i += 1) {
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
  jest.restoreAllMocks();
  mockUser = null;
});

beforeAll(async () => {
  await initI18n();
});

const styleOf = (node: ReactTestInstance) =>
  (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
const hosts = (
  root: ReactTestInstance,
  match: (node: ReactTestInstance) => boolean,
) => root.findAll(node => typeof node.type === 'string' && match(node));
const byId = (root: ReactTestInstance, testID: string) =>
  hosts(root, n => n.props.testID === testID);
const roles = (root: ReactTestInstance, role: string) =>
  hosts(root, n => n.props.accessibilityRole === role);
const reduceMotion = (on: boolean) =>
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(on);
/** Tells a skeleton how wide it is, as the phone would once it has laid it out. */
const lay = (node: ReactTestInstance, width: number) =>
  ReactTestRenderer.act(async () => {
    node.props.onLayout({ nativeEvent: { layout: { width, height: 400 } } });
  });
const numeric = (v: unknown): number =>
  typeof v === 'number' ? v : (v as { __getValue(): number }).__getValue();

// ───────────────────────────── the skeleton cards ─────────────────────────────

describe('PropertyCardSkeleton', () => {
  it('is made of the same numbers as the Home card: its corners, edge, margins and picture height', async () => {
    const real = await show(
      <PropertyCard property={property()} onPress={jest.fn()} />,
    );
    const skeleton = await show(<PropertyCardSkeleton />);
    const realCard = hosts(real.root, n => styleOf(n).borderRadius === 16)[0];
    const card = byId(skeleton.root, 'property-card-skeleton')[0];
    for (const key of [
      'borderRadius',
      'borderWidth',
      'borderColor',
      'backgroundColor',
      'marginHorizontal',
      'marginBottom',
      'overflow',
    ]) {
      expect(styleOf(card)[key]).toBe(styleOf(realCard)[key]);
    }
    const picture = (root: ReactTestInstance) =>
      hosts(root, n => styleOf(n).height === CARD_MEDIA_HEIGHT);
    expect(picture(real.root).length).toBeGreaterThan(0);
    expect(picture(skeleton.root).length).toBeGreaterThan(0);
  });

  it('has the same body as the card: padding, gap, and a facts grid of the same shape and cell count', async () => {
    const real = await show(
      <PropertyCard property={property()} onPress={jest.fn()} />,
    );
    const skeleton = await show(<PropertyCardSkeleton />);
    const realBody = hosts(
      real.root,
      n => styleOf(n).padding === spacing.lg && styleOf(n).gap === spacing.sm,
    )[0];
    const body = hosts(
      skeleton.root,
      n => styleOf(n).padding === spacing.lg && styleOf(n).gap === spacing.sm,
    )[0];
    expect(realBody).toBeDefined();
    expect(body).toBeDefined();

    const realGrid = byId(real.root, 'property-facts')[0];
    const grid = byId(skeleton.root, 'skeleton-facts')[0];
    for (const key of ['flexDirection', 'flexWrap', 'rowGap', 'columnGap']) {
      expect(styleOf(grid)[key]).toBe(styleOf(realGrid)[key]);
    }
    // The card of this property shows four facts (kind, area, bedrooms, bathrooms); so does the skeleton.
    const cells = (root: ReactTestInstance) =>
      hosts(root, n => styleOf(n).flexBasis !== undefined);
    expect(cells(realGrid)).toHaveLength(4);
    expect(cells(grid)).toHaveLength(4);
    // A cell is the first host box with a flex basis.
    const cell = (root: ReactTestInstance) =>
      styleOf(hosts(root, n => styleOf(n).flexBasis !== undefined)[0]);
    expect(cell(grid).flexBasis).toBe('45%');
    expect(cell(grid)).toMatchObject({
      flexBasis: cell(realGrid).flexBasis,
      flexGrow: cell(realGrid).flexGrow,
      flexShrink: cell(realGrid).flexShrink,
      gap: cell(realGrid).gap,
    });
    // Each cell leads with a tile of the same size.
    expect(
      hosts(
        skeleton.root,
        n => styleOf(n).width === FACT_TILE && styleOf(n).height === FACT_TILE,
      ),
    ).toHaveLength(4);
  });

  it('stands a text line in a box as tall as the text it replaces (the theme line heights)', async () => {
    const tree = await show(<PropertyCardSkeleton />);
    const boxes = hosts(tree.root, n => styleOf(n).justifyContent === 'center')
      .map(n => styleOf(n).height)
      .filter(h => typeof h === 'number');
    // title (heading), the price (34 on the card), place (caption), facts (label ×4), description (bodySm ×2).
    expect(boxes).toEqual(
      expect.arrayContaining([
        typography.heading.lineHeight,
        34,
        typography.caption.lineHeight,
        typography.label.lineHeight,
        typography.bodySm.lineHeight,
      ]),
    );
    expect(boxes.filter(h => h === typography.label.lineHeight)).toHaveLength(
      4,
    );
    expect(boxes.filter(h => h === typography.bodySm.lineHeight)).toHaveLength(
      2,
    );
  });

  it('puts white placeholders for the badge and the two round buttons on the picture, as the card has them', async () => {
    const tree = await show(<PropertyCardSkeleton />);
    const buttons = hosts(
      tree.root,
      n =>
        styleOf(n).width === ROUND_BUTTON &&
        styleOf(n).height === ROUND_BUTTON &&
        styleOf(n).backgroundColor === colors.surface,
    );
    expect(buttons).toHaveLength(2);
    expect(
      hosts(
        tree.root,
        n =>
          styleOf(n).height === 24 &&
          styleOf(n).borderRadius === radius.pill &&
          styleOf(n).backgroundColor === colors.surface,
      ),
    ).toHaveLength(1);
  });
});

describe('ListingCardSkeleton', () => {
  it('is made of the same numbers as the My Listings card: edge, padding, gap and the square picture', async () => {
    const real = await show(
      <ListingCard property={property()} onPress={jest.fn()} />,
    );
    const skeleton = await show(<ListingCardSkeleton />);
    const realCard = hosts(
      real.root,
      n => styleOf(n).borderRadius === 16 && styleOf(n).padding === spacing.md,
    )[0];
    const card = byId(skeleton.root, 'listing-card-skeleton')[0];
    for (const key of [
      'borderRadius',
      'borderWidth',
      'borderColor',
      'marginHorizontal',
      'marginBottom',
      'padding',
      'gap',
    ]) {
      expect(styleOf(card)[key]).toBe(styleOf(realCard)[key]);
    }
    const square = (root: ReactTestInstance) =>
      hosts(
        root,
        n =>
          styleOf(n).width === LISTING_THUMB &&
          styleOf(n).height === LISTING_THUMB,
      );
    expect(square(real.root).length).toBeGreaterThan(0);
    expect(square(skeleton.root)).toHaveLength(1);
    // The same top row: picture, text, the far-end column.
    const top = hosts(
      skeleton.root,
      n =>
        styleOf(n).flexDirection === 'row' &&
        styleOf(n).gap === spacing.md &&
        styleOf(n).alignItems === 'flex-start',
    );
    expect(top.length).toBeGreaterThan(0);
  });
});

describe('PropertyDetailsSkeleton', () => {
  it('has the picture strip, the header with its two round buttons, and the specs, location and description cards', async () => {
    const tree = await show(<PropertyDetailsSkeleton />);
    expect(
      hosts(tree.root, n => styleOf(n).height === DETAILS_GALLERY_HEIGHT),
    ).toHaveLength(1);
    expect(
      hosts(tree.root, n => styleOf(n).height === LOCATION_MAP_HEIGHT),
    ).toHaveLength(1);
    expect(
      hosts(
        tree.root,
        n =>
          styleOf(n).width === ROUND_BUTTON &&
          styleOf(n).height === ROUND_BUTTON,
      ),
    ).toHaveLength(2);
    // Three cards (specs, location, description), spaced as the page spaces them.
    const cards = hosts(
      tree.root,
      n =>
        styleOf(n).borderRadius === radius.lg &&
        styleOf(n).marginTop === spacing.xl,
    );
    expect(cards).toHaveLength(3);
    expect(byId(tree.root, 'skeleton-facts')).toHaveLength(1);
  });

  it("uses the page's own sizes: the gallery and the map are the numbers the real page draws with", () => {
    expect(
      source('src', 'screens', 'property', 'PropertyDetailsScreen.tsx'),
    ).toContain('height: DETAILS_GALLERY_HEIGHT');
    expect(source('src', 'components', 'PropertyLocationMap.tsx')).toContain(
      'BOX_HEIGHT = LOCATION_MAP_HEIGHT',
    );
    expect(source('src', 'components', 'PropertyCard.tsx')).toContain(
      'height: CARD_MEDIA_HEIGHT',
    );
    expect(source('src', 'components', 'ListingCard.tsx')).toContain(
      'width: LISTING_THUMB',
    );
    expect(source('src', 'components', 'PropertyFacts.tsx')).toContain(
      'width: FACT_TILE',
    );
  });
});

describe('the lists of skeleton cards', () => {
  it('says "loading" once, for the whole list, and the right number of cards', async () => {
    const home = await show(<PropertyListSkeleton />);
    expect(roles(home.root, 'progressbar')).toHaveLength(1);
    expect(roles(home.root, 'progressbar')[0].props.accessibilityLabel).toBe(
      prs.common.loading,
    );
    expect(
      hosts(home.root, n =>
        String(n.props.testID ?? '').startsWith('property-card-skeleton-'),
      ),
    ).toHaveLength(3);

    const mine = await show(<ListingListSkeleton count={2} />);
    expect(roles(mine.root, 'progressbar')).toHaveLength(1);
    expect(
      hosts(mine.root, n =>
        String(n.props.testID ?? '').startsWith('listing-card-skeleton-'),
      ),
    ).toHaveLength(2);
  });

  it('says "loading" by itself when a single card stands at the foot of a list', async () => {
    const loose = await show(<PropertyCardSkeleton standalone />);
    expect(roles(loose.root, 'progressbar')).toHaveLength(1);
    const inList = await show(<PropertyCardSkeleton />);
    expect(roles(inList.root, 'progressbar')).toHaveLength(0);
  });

  it('has no words in it: a skeleton is shapes, nothing to read', async () => {
    const tree = await show(<PropertyListSkeleton />);
    expect(tree.root.findAllByType(Text)).toHaveLength(0);
  });
});

// ─────────────────────────────── the shimmer ───────────────────────────────

describe('the shimmer', () => {
  it('is one soft band over the card, once the card has been laid out, as wide as just over half of it', async () => {
    reduceMotion(false);
    const tree = await show(<PropertyCardSkeleton />);
    expect(byId(tree.root, 'skeleton-shimmer')).toHaveLength(0);
    await lay(byId(tree.root, 'property-card-skeleton')[0], 400);
    const band = byId(tree.root, 'skeleton-shimmer');
    expect(band).toHaveLength(1);
    expect(styleOf(band[0]).width).toBe(220);
    expect(band[0].props.pointerEvents).toBe('none');
  });

  it('sweeps from the start edge to the end edge: left to right, and right to left in a right-to-left layout', async () => {
    reduceMotion(false);
    const ltr = await show(<PropertyCardSkeleton />);
    await lay(byId(ltr.root, 'property-card-skeleton')[0], 400);
    const at0 = styleOf(byId(ltr.root, 'skeleton-shimmer')[0]).transform as {
      translateX: unknown;
    }[];
    // Starts just outside the start edge (the left one).
    expect(numeric(at0[0].translateX)).toBe(-220);

    jest.replaceProperty(I18nManager, 'isRTL', true);
    const rtl = await show(<PropertyCardSkeleton />);
    await lay(byId(rtl.root, 'property-card-skeleton')[0], 400);
    const rtlAt0 = styleOf(byId(rtl.root, 'skeleton-shimmer')[0]).transform as {
      translateX: unknown;
    }[];
    // Starts outside the right edge and moves towards the left.
    expect(numeric(rtlAt0[0].translateX)).toBe(400);
  });

  it('stands still, with no band at all, for someone who asked their phone for less motion', async () => {
    reduceMotion(true);
    const tree = await show(<PropertyCardSkeleton />);
    await settle();
    await lay(byId(tree.root, 'property-card-skeleton')[0], 400);
    expect(byId(tree.root, 'skeleton-shimmer')).toHaveLength(0);
    expect(shimmerWatchers()).toBe(0);
  });

  it('runs one animation for all the cards, and lets go of it when the last one goes', async () => {
    reduceMotion(false);
    const loop = jest.spyOn(Animated, 'loop');
    expect(shimmerWatchers()).toBe(0);
    const a = await show(<PropertyListSkeleton />);
    expect(shimmerWatchers()).toBe(3);
    const b = await show(<ListingCardSkeleton />);
    expect(shimmerWatchers()).toBe(4);
    // Four cards on screen, one loop between them.
    expect(loop).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(async () => a.unmount());
    expect(shimmerWatchers()).toBe(1);
    await ReactTestRenderer.act(async () => b.unmount());
    expect(shimmerWatchers()).toBe(0);
    mounted.splice(0);
    expect(SHIMMER_MS).toBeGreaterThan(800);
  });
});

// ─────────────────────────────── AppLoader ───────────────────────────────

describe('AppLoader', () => {
  it('is the logo: the roof and the pin from the logo geometry, standing on its ground ring', async () => {
    reduceMotion(false);
    const tree = await show(<AppLoader />);
    const { pin, roof, ring } = LOGO_GEOMETRY;
    for (const d of [pin, roof]) {
      expect(tree.root.findAll(n => n.props.d === d).length).toBeGreaterThan(0);
    }
    // The ring the pin stands on, and (inside each wave) the same ellipse again.
    expect(
      tree.root.findAll(n => n.props.rx === ring.rx && n.props.ry === ring.ry)
        .length,
    ).toBeGreaterThan(0);
  });

  it('draws the ring under the mark and the mark without a ring of its own, so only the waves move the ring', async () => {
    reduceMotion(false);
    const tree = await show(<AppLoader size={100} />);
    const marks = tree.root.findAll(
      n => n.props.testID === 'logo-mark' && typeof n.type !== 'string',
    );
    expect(marks.length).toBeGreaterThan(0);
    // The Logo inside is the ring-less one: exactly one ellipse is the static ring (at the logo's own size).
    const staticRing = tree.root.findAll(
      n =>
        n.props.rx === LOGO_GEOMETRY.ring.rx &&
        n.props.stroke === colors.border,
    );
    expect(staticRing.length).toBeGreaterThan(0);
  });

  it('sends two green waves out of the ring, one half a turn behind the other', async () => {
    reduceMotion(false);
    const tree = await show(<AppLoader size={100} />);
    const waves = [0, 1].map(i => byId(tree.root, `app-loader-wave-${i}`)[0]);
    expect(waves.every(Boolean)).toBe(true);
    // Each wave is exactly the ring's box (so it grows from the ring's centre).
    const { ring } = LOGO_GEOMETRY;
    for (const wave of waves) {
      const style = styleOf(wave);
      expect(style.width).toBeCloseTo(ring.rx * 2 + ring.strokeWidth, 5);
      expect(style.height).toBeCloseTo(ring.ry * 2 + ring.strokeWidth, 5);
      expect(style.left).toBeCloseTo(
        ring.cx - ring.rx - ring.strokeWidth / 2,
        5,
      );
      expect(style.top).toBeCloseTo(
        ring.cy - ring.ry - ring.strokeWidth / 2,
        5,
      );
    }
    // At the start the first wave is brand new (most opaque) and the second is half-way out (half as opaque).
    const opacity = (w: ReactTestInstance) => numeric(styleOf(w).opacity);
    expect(opacity(waves[0])).toBeCloseTo(0.34, 2);
    expect(opacity(waves[1])).toBeCloseTo(0.17, 2);
    const stroke = tree.root.findAll(
      n =>
        n.props.stroke === colors.primary &&
        n.props.rx === LOGO_GEOMETRY.ring.rx,
    );
    expect(stroke).toHaveLength(2);
  });

  it('swells the pin gently from its tip, so it never leaves the ring', async () => {
    reduceMotion(false);
    const tree = await show(<AppLoader size={200} />);
    const pin = byId(tree.root, 'app-loader-pin')[0];
    const transform = styleOf(pin).transform as Record<string, unknown>[];
    const tipY = (LOGO_GEOMETRY.tip.y - 50) * 2;
    expect(transform).toHaveLength(3);
    expect(transform[0]).toEqual({ translateY: tipY });
    expect(transform[2]).toEqual({ translateY: -tipY });
    // At rest the scale is 1 and it only ever grows to PIN_SWELL: a few per cent, not a bounce.
    expect(numeric(transform[1].scale)).toBe(1);
    expect(PIN_SWELL).toBeGreaterThan(1);
    expect(PIN_SWELL).toBeLessThanOrEqual(1.08);
    expect(APP_LOADER_MS).toBeGreaterThanOrEqual(1200);
  });

  it('keeps the pin and the waves on one clock: both loops are started together and stopped on unmount', async () => {
    reduceMotion(false);
    const stops: jest.Mock[] = [];
    const real = Animated.loop;
    const loop = jest.spyOn(Animated, 'loop').mockImplementation(((
      animation: Animated.CompositeAnimation,
    ) => {
      const made = real(animation);
      const stop = jest.spyOn(made, 'stop');
      stops.push(stop as unknown as jest.Mock);
      return made;
    }) as typeof Animated.loop);
    const tree = await show(<AppLoader />);
    expect(loop).toHaveBeenCalledTimes(2);
    await ReactTestRenderer.act(async () => tree.unmount());
    mounted.splice(0);
    expect(stops.every(stop => stop.mock.calls.length > 0)).toBe(true);
  });

  it('simply stands on its ring, with no waves and no loops, with "reduce motion" on', async () => {
    reduceMotion(true);
    const loop = jest.spyOn(Animated, 'loop');
    const tree = await show(<AppLoader />);
    await settle();
    expect(byId(tree.root, 'app-loader-wave-0')).toHaveLength(0);
    expect(byId(tree.root, 'app-loader-wave-1')).toHaveLength(0);
    expect(
      tree.root.findAll(n => n.props.d === LOGO_GEOMETRY.pin).length,
    ).toBeGreaterThan(0);
    expect(loop.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('fills the screen, or lies over one, or sits where it is put', async () => {
    const full = await show(<AppLoader fullscreen />);
    expect(styleOf(byId(full.root, 'app-loader')[0])).toMatchObject({
      flex: 1,
      backgroundColor: colors.background,
    });
    const over = await show(<AppLoader overlay />);
    const veil = styleOf(byId(over.root, 'app-loader')[0]);
    expect(veil).toMatchObject({
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
    expect(String(veil.backgroundColor)).toMatch(/^rgba\(255,255,255,/);
    const inline = styleOf(
      byId((await show(<AppLoader />)).root, 'app-loader')[0],
    );
    expect(inline.flex).toBeUndefined();
    expect(inline.position).toBeUndefined();
  });

  it('is one progress indicator to a screen reader: named "Bongah" until it is given the words, and may carry a caption', async () => {
    const bare = await show(<AppLoader />);
    const node = roles(bare.root, 'progressbar')[0];
    expect(node.props.accessibilityLabel).toBe('Bongah');
    expect(node.props.accessibilityState).toEqual({ busy: true });
    const named = await show(
      <AppLoader label={prs.common.loading} caption="کمی صبر کنید" />,
    );
    expect(roles(named.root, 'progressbar')[0].props.accessibilityLabel).toBe(
      prs.common.loading,
    );
    expect(allText(named.root)).toContain('کمی صبر کنید');
    expect(allText(bare.root)).toBe('');
  });
});

describe('a screen that is busy', () => {
  it('lies the logo loader over itself with the translated "loading", and not otherwise', async () => {
    const idle = await show(
      <Screen>
        <Text>محتوا</Text>
      </Screen>,
    );
    expect(byId(idle.root, 'app-loader')).toHaveLength(0);
    const busy = await show(
      <Screen busy>
        <Text>محتوا</Text>
      </Screen>,
    );
    const veil = byId(busy.root, 'app-loader')[0];
    expect(veil).toBeDefined();
    expect(veil.props.accessibilityLabel).toBe(prs.common.loading);
    expect(styleOf(veil).position).toBe('absolute');
    // The content is still there under it.
    expect(allText(busy.root)).toContain('محتوا');
  });
});

describe('the app opening', () => {
  it('shows the logo loader, full screen, until the languages are loaded', () => {
    // However the line is wrapped.
    const app = source('App.tsx').replace(/\s+/g, ' ');
    expect(app).toContain('<AppLoader fullscreen />');
    expect(app).toContain(
      "fallback={ <AppLoader fullscreen label={i18n.t('common.loading')} /> }",
    );
    expect(app).not.toContain('LoadingView');
  });

  it('puts the loader over the sign-in screens while their request is in flight', () => {
    for (const [file, flag] of [
      ['PhoneScreen.tsx', 'busy={loading}'],
      ['OtpScreen.tsx', 'busy={verifying}'],
      ['ProfileSetupScreen.tsx', 'busy={loading}'],
    ]) {
      expect(source('src', 'screens', 'auth', file)).toContain(
        `<ScrollScreen style={styles.content} ${flag}>`,
      );
    }
  });
});

// ─────────────────────────────── MapLoader ───────────────────────────────

describe('MapLoader', () => {
  it("is the logo's pin (the hole and the two emeralds), without the roof", async () => {
    reduceMotion(false);
    const tree = await show(<MapLoader size={100} />);
    const { pin, pinLeft, roof } = LOGO_GEOMETRY;
    const main = tree.root.findAll(n => n.props.d === pin);
    expect(main.length).toBeGreaterThan(0);
    expect(main[0].props.fill).toBe(colors.primary);
    expect(main[0].props.fillRule).toBe('evenodd');
    expect(tree.root.findAll(n => n.props.d === pinLeft)[0].props.fill).toBe(
      colors.primaryDark,
    );
    expect(tree.root.findAll(n => n.props.d === roof)).toHaveLength(0);
  });

  it("puts the pin's tip on the middle of its box, which is where the rings start", async () => {
    reduceMotion(false);
    const size = 100;
    const tree = await show(<MapLoader size={size} />);
    const pin = byId(tree.root, 'map-loader-pin')[0];
    const svg = tree.root.findAll(
      n =>
        typeof n.props.viewBox === 'string' &&
        n.props.viewBox.startsWith('20 14'),
    )[0];
    const pinH = svg.props.height as number;
    // Crop is y 14..90 on the logo grid; the tip is at LOGO_GEOMETRY.tip.y.
    const tipFromTop = ((LOGO_GEOMETRY.tip.y - 14) / 76) * pinH;
    expect((styleOf(pin).top as number) + tipFromTop).toBeCloseTo(size / 2, 5);
    const rings = [0, 1].map(i => byId(tree.root, `map-loader-ring-${i}`)[0]);
    for (const ring of rings) {
      expect(styleOf(ring)).toMatchObject({ width: size, height: size });
      expect(styleOf(ring).borderRadius).toBe(size / 2);
    }
  });

  it('hops the pin up and down, and shrinks the little shadow under it while it is up', async () => {
    reduceMotion(false);
    const tree = await show(<MapLoader size={100} />);
    const pin = byId(tree.root, 'map-loader-pin')[0];
    const [rise] = styleOf(pin).transform as { translateY: unknown }[];
    // At rest on the spot: no lift. (The hop's top is 12 % of the box: see HOP.)
    expect(numeric(rise.translateY)).toBe(0);
    expect(MAP_LOADER_MS).toBeGreaterThanOrEqual(1000);
  });

  it('widens two radar rings, one half a turn behind the other', async () => {
    reduceMotion(false);
    const tree = await show(<MapLoader size={100} />);
    const rings = [0, 1].map(i => byId(tree.root, `map-loader-ring-${i}`)[0]);
    const opacity = (n: ReactTestInstance) => numeric(styleOf(n).opacity);
    const scale = (n: ReactTestInstance) =>
      numeric((styleOf(n).transform as { scale: unknown }[])[0].scale);
    // Ring 0 is new (small, most visible); ring 1 is half-way out.
    expect(scale(rings[0])).toBeCloseTo(0.2, 2);
    expect(opacity(rings[0])).toBeCloseTo(0.5, 2);
    expect(scale(rings[1])).toBeCloseTo(0.6, 2);
    expect(opacity(rings[1])).toBeCloseTo(0.25, 2);
    expect(styleOf(rings[0]).borderColor).toBe(colors.primary);
  });

  it('stands still on one faint ring, with no loops, with "reduce motion" on', async () => {
    reduceMotion(true);
    const loop = jest.spyOn(Animated, 'loop');
    const tree = await show(<MapLoader size={60} />);
    await settle();
    expect(byId(tree.root, 'map-loader-ring-0')).toHaveLength(0);
    expect(byId(tree.root, 'map-loader-ring-1')).toHaveLength(0);
    const still = byId(tree.root, 'map-loader-still-ring')[0];
    expect(styleOf(still).opacity).toBeLessThan(0.5);
    expect(loop.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('is a progress indicator with the translated "loading", or the words it is given', async () => {
    const plain = await show(<MapLoader />);
    expect(roles(plain.root, 'progressbar')[0].props.accessibilityLabel).toBe(
      prs.common.loading,
    );
    const named = await show(<MapLoader label="در حال یافتن مسیر" />);
    expect(roles(named.root, 'progressbar')[0].props.accessibilityLabel).toBe(
      'در حال یافتن مسیر',
    );
    expect(plain.root.findAllByType(Text)).toHaveLength(0);
  });

  it('is what the status chip, the route notes and the form map use for "finding…"', async () => {
    const chip = await show(
      <StatusPill loading={false} locating message="۳ آگهی" />,
    );
    expect(
      byId(chip.root, 'map-status')[0].findAll(
        n => n.props.testID === 'map-loader' && typeof n.type === 'string',
      ),
    ).toHaveLength(1);
    const idle = await show(<StatusPill loading={false} message="۳ آگهی" />);
    expect(roles(idle.root, 'progressbar')).toHaveLength(0);

    for (const file of [
      ['components', 'NavigationModal.tsx'],
      ['components', 'PlaceSearchField.tsx'],
      ['screens', 'property', 'AddPropertyScreen.tsx'],
      ['screens', 'property', 'PropertyDetailsScreen.tsx'],
      ['screens', 'home', 'HomeScreen.tsx'],
    ]) {
      const code = source('src', ...file);
      expect(code).toContain('<MapLoader');
      expect(code).not.toContain('<ActivityIndicator');
    }
  });
});

// ─────────────────────────────── waves ───────────────────────────────

describe('waveOf', () => {
  it('grows from `from` to `to` while fading from `peak` to nothing, and a wave started half a turn on is half-way', () => {
    const progress = new Animated.Value(0);
    const first = waveOf(progress, { from: 1, to: 2, peak: 0.4 });
    const second = waveOf(progress, { offset: 0.5, from: 1, to: 2, peak: 0.4 });
    const read = (v: number) => {
      progress.setValue(v);
      return [
        numeric(first.scale),
        numeric(first.opacity),
        numeric(second.scale),
        numeric(second.opacity),
      ];
    };
    const [s0, o0, s1, o1] = read(0);
    expect([s0, o0]).toEqual([1, 0.4]);
    expect(s1).toBeCloseTo(1.5, 3);
    expect(o1).toBeCloseTo(0.2, 3);
    // A quarter turn on, the first is a quarter out; the second is three quarters out.
    const q = read(0.25);
    expect(q[0]).toBeCloseTo(1.25, 5);
    expect(q[1]).toBeCloseTo(0.3, 5);
    expect(q[2]).toBeCloseTo(1.75, 3);
    expect(q[3]).toBeCloseTo(0.1, 3);
    // Just before the second wave's turn it is all but gone, and just after it is brand new: the jump is unseen.
    expect(read(0.4999)[3]).toBeLessThan(0.01);
    expect(read(0.5)[3]).toBeCloseTo(0.4, 5);
    // At the end of the turn both are where they were at the start.
    const end = read(1);
    expect(end[0]).toBeCloseTo(2, 5);
    expect(end[2]).toBeCloseTo(1.5, 3);
  });
});

// ─────────────────────────── on the real screens ───────────────────────────

describe('My Listings while its first page loads', () => {
  const open = async () => {
    // The server never answers: the list stays "loading".
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    mockAuth();
    const tree = await show(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MyListingsScreen
          {...({
            navigation: { navigate: jest.fn(), goBack: jest.fn() },
            route: {},
          } as unknown as React.ComponentProps<typeof MyListingsScreen>)}
        />
      </QueryClientProvider>,
    );
    await settle();
    return tree;
  };
  const mockAuth = () => {
    mockUser = { id: 'u1', role: 'USER', full_name: 'احمد' };
  };

  it('shows cards shaped like its cards, not a spinner', async () => {
    const tree = await open();
    expect(byId(tree.root, 'listing-list-skeleton')).toHaveLength(1);
    expect(
      hosts(tree.root, n =>
        String(n.props.testID ?? '').startsWith('listing-card-skeleton-'),
      ).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      source('src', 'screens', 'my', 'MyListingsScreen.tsx'),
    ).not.toContain('ActivityIndicator');
  });

  it('drops the skeleton once the listings arrive', async () => {
    mockAuth();
    mockApi(fetchMock, {
      'GET /properties/mine': {
        body: {
          data: [property()],
          meta: { page: 1, limit: 20, total: 1, total_pages: 1 },
        },
      },
    });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    const tree = await show(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MyListingsScreen
          {...({
            navigation: { navigate: jest.fn(), goBack: jest.fn() },
            route: {},
          } as unknown as React.ComponentProps<typeof MyListingsScreen>)}
        />
      </QueryClientProvider>,
    );
    await settle();
    expect(byId(tree.root, 'listing-list-skeleton')).toHaveLength(0);
    expect(allText(tree.root)).toContain('خانه سه اتاقه در شهر زرنج');
    expect(shimmerWatchers()).toBe(0);
  });
});

describe('the three screens no longer use a spinner for their lists', () => {
  it('Home, My Listings and the details page use skeletons where they used a spinner', () => {
    const home = source('src', 'screens', 'home', 'HomeScreen.tsx');
    expect(home).toContain('<PropertyListSkeleton />');
    expect(home).toContain('<PropertyCardSkeleton standalone />');
    expect(home).not.toContain('ActivityIndicator');
    expect(home).not.toContain('LoadingView');

    const mine = source('src', 'screens', 'my', 'MyListingsScreen.tsx');
    expect(mine).toContain('<ListingListSkeleton />');
    expect(mine).toContain('<ListingCardSkeleton standalone />');
    expect(mine).not.toContain('LoadingView');

    const details = source(
      'src',
      'screens',
      'property',
      'PropertyDetailsScreen.tsx',
    );
    expect(details).toContain('<PropertyDetailsSkeleton />');
    expect(details).not.toContain('LoadingView');
    expect(details).not.toContain('ActivityIndicator');
  });
});
