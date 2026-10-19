import React from 'react';
import { StyleSheet, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import i18next from 'i18next';
import type { Property } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import { allText, render as renderTree } from '../test-utils';
import AppText from '../src/components/AppText';
import BookmarkButton from '../src/components/BookmarkButton';
import BottomSheet from '../src/components/BottomSheet';
import { Chip } from '../src/components/Chip';
import ListingCard from '../src/components/ListingCard';
import PropertyCard from '../src/components/PropertyCard';
import { ICON_GRID, ICON_SHAPES } from '../src/components/iconShapes';
import { resetSavedForTests, toggleSaved } from '../src/favorites/store';
import { listingShareMessage } from '../src/share/listingShare';
import { KV_KEYS, kv } from '../src/storage/kv';

declare const __dirname: string;

const act = ReactTestRenderer.act;
const property = (overrides: Partial<Property> = {}): Property => ({
  id: 'p1',
  user_id: 'u1',
  agency_id: null,
  agency_name: null,
  title: 'خانه سه خوابه در شهر نو',
  description: '',
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

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const show = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
  mounted.push(tree);
  return tree;
};
const settle = (ms = 0) =>
  act(async () => {
    await new Promise<void>(resolve => setTimeout(() => resolve(), ms));
  });
const styleOf = (node: ReactTestRenderer.ReactTestInstance) =>
  (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
const hosts = (
  root: ReactTestRenderer.ReactTestInstance,
  match: (node: ReactTestRenderer.ReactTestInstance) => boolean,
) => root.findAll(node => typeof node.type === 'string' && match(node));

beforeAll(async () => {
  await initI18n();
});
beforeEach(async () => {
  await kv.remove(KV_KEYS.favorites);
  resetSavedForTests();
});
afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

// ─────────────────────────────── 1. the share text ───────────────────────────────

describe('the share message', () => {
  const t = i18next.t.bind(i18next);
  const name = () => 'نیمروز';

  it('is a one-line summary of title, price and place, then the invitation, then the link', () => {
    expect(listingShareMessage(property(), t, name)).toBe(
      [
        '🏠 خانه سه خوابه در شهر نو | 💰 ۱,۲۰۰,۰۰۰ ؋ | 📍 نیمروز، زرنج',
        'مشاهده کامل مشخصات در اپلیکیشن بنگاه:',
        'https://bongah.app/listing/p1',
      ].join('\n'),
    );
  });

  it('writes dollars with $, flattens line breaks in a title, and drops the pin when there is no place', () => {
    const message = listingShareMessage(
      property({
        title: 'خانه\nنو',
        price: 85000,
        currency: 'USD',
        province: '',
        district: '',
      }),
      t,
      () => '',
    );
    expect(message.split('\n')).toHaveLength(3);
    expect(message.split('\n')[0]).toBe('🏠 خانه نو | 💰 ۸۵,۰۰۰ $');
    expect(message).not.toContain('📍');
  });
});

// ───────────────────── 2. the property card: hierarchy, facts ─────────────────────

describe('PropertyCard hierarchy', () => {
  const card = (p: Property = property(), onPress = jest.fn()) =>
    show(<PropertyCard property={p} onPress={onPress} />).then(tree => ({
      tree,
      onPress,
    }));

  it('puts the title first, then the price with commas, then the place', async () => {
    const { tree } = await card();
    const text = allText(tree.root);
    const title = text.indexOf('خانه سه خوابه در شهر نو');
    const price = text.indexOf('۱,۲۰۰,۰۰۰');
    expect(title).toBeGreaterThanOrEqual(0);
    expect(price).toBeGreaterThan(title);
    expect(text.indexOf('زرنج')).toBeGreaterThan(price);
    expect(text).not.toContain('٬');
  });

  it('draws the title as the heading, the biggest text on the card after the price', async () => {
    const { tree } = await card();
    const title = tree.root
      .findAllByType(AppText)
      .find(n => allText(n).trim() === 'خانه سه خوابه در شهر نو')!;
    expect(title.props.variant).toBe('heading');
    expect(title.props.numberOfLines).toBe(2);
  });

  it('lays the facts out as a grid of four, each with its own icon', async () => {
    const { tree } = await card();
    const facts = hosts(tree.root, n => n.props.testID === 'property-facts')[0];
    const text = allText(facts);
    expect(text).toContain(prs.propertyType.HOUSE_HAWILI);
    expect(text).toContain('۲۵۳ متر مربع');
    expect(text).toContain(`۳ ${prs.property.bedrooms}`);
    expect(text).toContain(`۲ ${prs.property.bathrooms}`);
    const icons = facts
      .findAll(n => typeof n.props.name === 'string' && n.props.size === 16)
      .map(n => n.props.name as string);
    expect(icons).toEqual(['house', 'area', 'bed', 'shower']);
    expect(new Set(icons).size).toBe(4);
    // It wraps two to a row.
    expect(styleOf(facts).flexWrap).toBe('wrap');
  });

  it('leaves out the rooms for a plot of land', async () => {
    const { tree } = await card(
      property({ type: 'LAND', bedrooms: null, bathrooms: null }),
    );
    const facts = hosts(tree.root, n => n.props.testID === 'property-facts')[0];
    expect(allText(facts)).not.toContain(prs.property.bedrooms);
    expect(allText(facts)).not.toContain(prs.property.bathrooms);
  });

  it('keeps the badges on the picture at the start edge and gives the other edge to the bookmark', async () => {
    const { tree } = await card(property({ is_featured: true }));
    const badges = hosts(
      tree.root,
      n =>
        styleOf(n).position === 'absolute' &&
        allText(n).includes(prs.dealType.SALE),
    )[0];
    expect(allText(badges)).toContain(prs.property.featured);
    expect(styleOf(badges).end).toBeUndefined();
    const bookmark = hosts(tree.root, n => n.props.testID === 'bookmark-p1')[0];
    expect(styleOf(bookmark).position).toBe('absolute');
    expect(styleOf(bookmark).end).toBeDefined();
  });
});

describe('the new icons', () => {
  it.each(['shower', 'search', 'bookmark', 'bookmarkFilled'] as const)(
    'draws %s inside the 24-unit grid',
    name => {
      const shapes = ICON_SHAPES[name];
      expect(shapes.length).toBeGreaterThan(0);
      for (const shape of shapes) {
        expect(shape.x).toBeGreaterThanOrEqual(0);
        expect(shape.y).toBeGreaterThanOrEqual(0);
        expect(shape.x + shape.w).toBeLessThanOrEqual(ICON_GRID);
        expect(shape.y + shape.h).toBeLessThanOrEqual(ICON_GRID);
      }
    },
  );
});

// ──────────────────────────────── 3. bookmarks ────────────────────────────────

describe('saving a listing', () => {
  const button = (tree: ReactTestRenderer.ReactTestRenderer, id = 'p1') =>
    hosts(tree.root, n => n.props.testID === `bookmark-${id}`)[0];
  const tapBookmark = (tree: ReactTestRenderer.ReactTestRenderer, id = 'p1') =>
    act(async () => {
      button(tree, id).props.onPress?.() ?? button(tree, id).props.onClick?.();
    });
  const iconName = (tree: ReactTestRenderer.ReactTestRenderer, id = 'p1') =>
    button(tree, id).findAll(n => typeof n.props.name === 'string')[0].props
      .name;

  it('starts un-saved, saves with a tap, and un-saves with the next', async () => {
    const tree = await show(<BookmarkButton propertyId="p1" title="خانه" />);
    expect(iconName(tree)).toBe('bookmark');
    expect(button(tree).props.accessibilityLabel).toBe(
      `${prs.property.save}: خانه`,
    );
    expect(button(tree).props.accessibilityState).toMatchObject({
      selected: false,
    });

    await tapBookmark(tree);
    await settle();
    expect(iconName(tree)).toBe('bookmarkFilled');
    expect(button(tree).props.accessibilityLabel).toBe(
      `${prs.property.unsave}: خانه`,
    );
    expect(button(tree).props.accessibilityState).toMatchObject({
      selected: true,
    });

    await tapBookmark(tree);
    await settle();
    expect(iconName(tree)).toBe('bookmark');
  });

  it('keeps the saved ids on the phone, so they survive a restart', async () => {
    const tree = await show(<BookmarkButton propertyId="p1" title="خانه" />);
    await tapBookmark(tree);
    await settle();
    expect(JSON.parse((await kv.get(KV_KEYS.favorites)) ?? '[]')).toEqual([
      'p1',
    ]);

    // A fresh start reads them back.
    await act(async () => mounted.splice(0).forEach(t => t.unmount()));
    resetSavedForTests();
    const again = await show(<BookmarkButton propertyId="p1" title="خانه" />);
    await settle();
    expect(iconName(again)).toBe('bookmarkFilled');
  });

  it('is one list for the whole app: every card for the listing agrees', async () => {
    const tree = await show(
      <View>
        <BookmarkButton propertyId="p1" title="الف" />
        <BookmarkButton propertyId="p2" title="ب" />
      </View>,
    );
    await act(async () => {
      await toggleSaved('p2');
    });
    expect(iconName(tree, 'p1')).toBe('bookmark');
    expect(iconName(tree, 'p2')).toBe('bookmarkFilled');
  });

  it('does not open the listing when the ribbon is tapped', async () => {
    const onPress = jest.fn();
    const tree = await show(
      <PropertyCard property={property()} onPress={onPress} />,
    );
    await tapBookmark(tree);
    await settle();
    expect(onPress).not.toHaveBeenCalled();
    expect(iconName(tree)).toBe('bookmarkFilled');
  });
});

// ───────────────────────── 6. My Listings: badges near the title ─────────────────────────

describe('ListingCard badges', () => {
  const card = (p: Property, images: string[] = []) =>
    show(
      <ListingCard
        property={{ ...p, images }}
        onPress={jest.fn()}
        actions={[]}
      />,
    );
  const statusOf = (tree: ReactTestRenderer.ReactTestRenderer) =>
    hosts(tree.root, n => n.props.testID === 'listing-status')[0];

  it("puts the status in the card's top-left corner, clear of the picture and the title", async () => {
    const tree = await card(property(), ['https://img.example/a.jpg']);
    const status = statusOf(tree);
    expect(allText(status)).toContain(prs.status.ACTIVE);
    // Laid over the card's own corner: absolute, at its top and far (left, in RTL) edge.
    const style = styleOf(status);
    expect(style.position).toBe('absolute');
    expect(style.top).toBeGreaterThan(0);
    expect(style.end).toBeGreaterThan(0);
    expect(style.start).toBeUndefined();
    // It is not inside the box of the picture (nor of the title column): it belongs to the card itself.
    const picture = tree.root.findAll(
      n => n.props.source?.uri === 'https://img.example/a.jpg',
    )[0];
    const pictureBox = picture.parent!;
    expect(pictureBox.findAll(n => n === status)).toHaveLength(0);
    expect(allText(pictureBox)).not.toContain('خانه سه خوابه در شهر نو');
  });

  it('keeps room beside the title for the status pill, so a long title never runs under it', async () => {
    const tree = await card(property());
    const title = hosts(
      tree.root,
      n => n.props.children === 'خانه سه خوابه در شهر نو',
    );
    expect(title).toHaveLength(1);
    expect(styleOf(title[0]).paddingEnd).toBeGreaterThanOrEqual(80);
  });

  it('names the deal in a plain tag, with no dot, under the address', async () => {
    const tree = await card(property({ deal_type: 'SALE' }));
    const row = hosts(tree.root, n => n.props.testID === 'listing-badges')[0];
    expect(allText(row)).toContain(prs.dealType.SALE);
    // a pill holding the word and nothing else: no 6 x 6 round dot inside it
    const dots = hosts(
      row,
      n => styleOf(n).width === 6 && styleOf(n).height === 6,
    );
    expect(dots).toHaveLength(0);
    // after the place line, in reading order
    const text = allText(tree.root);
    expect(text.indexOf(prs.dealType.SALE)).toBeGreaterThan(text.indexOf('؋'));
  });

  it.each(['SALE', 'RENT', 'MORTGAGE_GROWI'] as const)(
    'shows the %s tag, not the other two',
    async deal => {
      const tree = await card(property({ deal_type: deal }));
      const row = hosts(tree.root, n => n.props.testID === 'listing-badges')[0];
      const text = allText(row);
      for (const other of ['SALE', 'RENT', 'MORTGAGE_GROWI'] as const) {
        if (other === deal) expect(text).toContain(prs.dealType[other]);
        else expect(text).not.toContain(prs.dealType[other]);
      }
    },
  );

  it('draws the status on the grey tile of a listing with no picture too', async () => {
    const tree = await card(property());
    expect(allText(statusOf(tree))).toContain(prs.status.ACTIVE);
  });

  it('draws the status as a quiet white pill with a dot', async () => {
    const tree = await card(property({ status: 'ACTIVE' }));
    const pill = hosts(
      statusOf(tree),
      n =>
        allText(n).trim() === prs.status.ACTIVE &&
        styleOf(n).borderRadius === 999,
    )[0];
    expect(styleOf(pill).backgroundColor).toBe('#FFFFFF');
    expect(styleOf(pill).borderColor).toBe('#E5E7EB');
  });

  it('shows the "featured" badge beside the deal tag, and only for a featured listing', async () => {
    const plain = await card(property({ is_featured: false }));
    expect(
      allText(hosts(plain.root, n => n.props.testID === 'listing-badges')[0]),
    ).not.toContain(prs.property.featured);
    const featured = await card(
      property({ is_featured: true, featured_until: '2026-12-01T00:00:00Z' }),
    );
    const row = hosts(
      featured.root,
      n => n.props.testID === 'listing-badges',
    )[0];
    expect(allText(row)).toContain(prs.property.featured);
  });

  it.each(['SOLD', 'ARCHIVED'] as const)(
    "keeps a %s listing's status neutral too",
    async status => {
      const tree = await card(property({ status }));
      const pill = hosts(
        statusOf(tree),
        n =>
          allText(n).trim() === prs.status[status] &&
          styleOf(n).borderRadius === 999,
      )[0];
      expect(styleOf(pill).backgroundColor).toBe('#FFFFFF');
    },
  );
});

// ───────────────────────────── 5. sheets and the keyboard ─────────────────────────────

describe('BottomSheet and the keyboard', () => {
  const sheetHeight = (tree: ReactTestRenderer.ReactTestRenderer) =>
    styleOf(hosts(tree.root, n => n.props.testID === 'bottom-sheet')[0])
      .height as number;
  /** Tells the sheet's overlay how tall it is on screen, as the layout pass would. */
  const layOut = (tree: ReactTestRenderer.ReactTestRenderer, height: number) =>
    act(async () => {
      hosts(
        tree.root,
        n =>
          n.props.collapsable === false &&
          typeof n.props.onLayout === 'function',
      )[0].props.onLayout({ nativeEvent: { layout: { height } } });
    });
  const sheet = (onDismissed?: () => void, visible = true) =>
    show(
      <BottomSheet
        visible={visible}
        onClose={jest.fn()}
        onDismissed={onDismissed}
        title="عنوان"
      >
        <AppText>محتوا</AppText>
      </BottomSheet>,
    );

  it('takes its usual height when there is room', async () => {
    const tree = await sheet();
    const usual = sheetHeight(tree);
    expect(usual).toBeGreaterThan(400);
    await layOut(tree, 10_000);
    expect(sheetHeight(tree)).toBe(usual);
  });

  it('shrinks to the room that is left, so its top never rides up under the status bar', async () => {
    const tree = await sheet();
    const usual = sheetHeight(tree);
    await layOut(tree, 480);
    const squeezed = sheetHeight(tree);
    expect(squeezed).toBeLessThan(usual);
    expect(squeezed).toBeLessThanOrEqual(480);
    expect(squeezed).toBeGreaterThanOrEqual(220);
    // And it grows back when the keyboard goes.
    await layOut(tree, 10_000);
    expect(sheetHeight(tree)).toBe(usual);
  });

  it('is never squeezed below a usable height by a bad measurement', async () => {
    const tree = await sheet();
    await layOut(tree, 10);
    expect(sheetHeight(tree)).toBe(220);
  });

  it('says when it has finished sliding away', async () => {
    const onDismissed = jest.fn();
    const tree = await sheet(onDismissed);
    expect(onDismissed).not.toHaveBeenCalled();
    await act(async () => {
      tree.update(
        <BottomSheet
          visible={false}
          onClose={jest.fn()}
          onDismissed={onDismissed}
          title="عنوان"
        >
          <AppText>محتوا</AppText>
        </BottomSheet>,
      );
    });
    expect(onDismissed).not.toHaveBeenCalled(); // still sliding
    await settle(500);
    expect(onDismissed).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────── 8. chips never cut their label ─────────────────────────

describe('Chip', () => {
  it('keeps a long label on one line and never lets it shrink, so it is not cut', async () => {
    const tree = await show(
      <Chip
        compact
        label={prs.propertyType.HOUSE_HAWILI}
        onPress={jest.fn()}
      />,
    );
    const label = tree.root.findAllByType(AppText)[0];
    expect(label.props.numberOfLines).toBe(1);
    expect(styleOf(label).flexShrink).toBe(0);
  });
});

// ─────────────────────── every piece of text in the app's inputs ───────────────────────

describe('placeholders for every input', () => {
  const fs = require('node:fs') as {
    readdirSync(
      p: string,
      o: { withFileTypes: true },
    ): { name: string; isDirectory(): boolean }[];
    readFileSync(p: string, e: 'utf8'): string;
  };
  const path = require('node:path') as { join(...p: string[]): string };
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.tsx$/.test(entry.name) ? [full] : [];
    });
  const sources = walk(path.join(__dirname, '..', 'src'));

  /** Every `<TextField ... />` and `<TextInput ... />` opening tag in a file, up to its closing `/>`. */
  const tags = (text: string) =>
    text.match(/<(TextField|TextInput)\b[\s\S]*?\/>/g) ?? [];

  it('gives each text field a placeholder, except the code boxes that draw their own', () => {
    const missing: string[] = [];
    for (const file of sources) {
      if (file.endsWith('TextField.tsx') || file.endsWith('OtpInput.tsx'))
        continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const tag of tags(text)) {
        if (!/\bplaceholder=/.test(tag)) {
          missing.push(`${file.split('/src/')[1]}: ${tag.slice(0, 80)}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('never uses a bare zero as a placeholder', () => {
    const offenders = sources.filter(file =>
      /placeholder=\{formatNumber\(0\)\}/.test(fs.readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
