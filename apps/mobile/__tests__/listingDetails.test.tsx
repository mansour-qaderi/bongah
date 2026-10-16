import React from 'react';
import { StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Property } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import { allText, render as renderTree } from '../test-utils';
import Price, { SIGN_SCALE } from '../src/components/Price';
import PropertyFacts, { propertyPlace } from '../src/components/PropertyFacts';
import ListingCard from '../src/components/ListingCard';
import PropertyCard from '../src/components/PropertyCard';
import { ICON_GRID, ICON_SHAPES } from '../src/components/iconShapes';
import { listingLink, parseListingId } from '../src/share/listingLink';
import { colors, fonts, typography } from '../src/theme';

declare const __dirname: string;

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: null, updateUser: jest.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const property = (overrides: Partial<Property> = {}): Property => ({
  id: 'p1',
  user_id: 'u1',
  agency_id: null,
  agency_name: null,
  title: 'خانه سه اتاقه در شهر زرنج',
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
const flat = (node: ReactTestRenderer.ReactTestInstance) =>
  (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
const texts = (root: ReactTestRenderer.ReactTestInstance) =>
  root.findAll(n => (n.type as unknown) === 'Text');

beforeAll(async () => {
  await initI18n();
});
afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

describe('Price', () => {
  it('draws the figure with plain commas, and the sign smaller than the figure', async () => {
    const tree = await show(
      <Price amount={1200000} currency="AFGHANI" variant="title" />,
    );
    const outer = texts(tree.root)[0];
    expect(allText(tree.root)).toContain('۱,۲۰۰,۰۰۰');
    expect(allText(tree.root)).not.toContain('٬');
    // The smallest text that holds the sign: the figure's own text holds it too, as its parent.
    const sign = tree.root
      .findAll(
        n => allText(n).includes('؋') && typeof flat(n).fontSize === 'number',
      )
      .sort(
        (a, b) => (flat(a).fontSize as number) - (flat(b).fontSize as number),
      )[0];
    expect(flat(sign).fontSize).toBe(
      Math.round(typography.title.fontSize * SIGN_SCALE),
    );
    expect(flat(sign).fontSize as number).toBeLessThan(
      flat(outer).fontSize as number,
    );
    // And lighter in weight than the figure, so it reads as a unit, not a second number.
    expect(flat(sign).fontFamily).toBe(fonts.regular);
  });

  it('is read out as one phrase, and writes dollars with $', async () => {
    const tree = await show(<Price amount={85000} currency="USD" />);
    expect(allText(tree.root)).toContain('$');
    const labelled = tree.root.findAll(
      n => n.props.accessibilityLabel === '۸۵,۰۰۰ $',
    );
    expect(labelled.length).toBeGreaterThan(0);
  });
});

describe('PropertyFacts', () => {
  it('shows the area, bedrooms and bathrooms, each with its own line icon', async () => {
    const tree = await show(<PropertyFacts property={property()} />);
    const text = allText(tree.root);
    expect(text).toContain('۲۵۳');
    expect(text).toContain(`۳ ${prs.property.bedrooms}`);
    expect(text).toContain(`۲ ${prs.property.bathrooms}`);
  });

  it('leaves out the rooms of a plot of land, and leads with the kind when asked', async () => {
    const land = property({
      type: 'LAND',
      bedrooms: null,
      bathrooms: null,
    });
    const tree = await show(<PropertyFacts property={land} withType />);
    const text = allText(tree.root);
    expect(text).toContain(prs.propertyType.LAND);
    expect(text).not.toContain(prs.property.bedrooms);
    expect(text).not.toContain(prs.property.bathrooms);
  });

  it('is on both the Home list card and My Listings card', async () => {
    const home = await show(
      <PropertyCard property={property()} onPress={jest.fn()} />,
    );
    const mine = await show(
      <ListingCard property={property()} onPress={jest.fn()} />,
    );
    for (const tree of [home, mine]) {
      expect(allText(tree.root)).toContain(`۳ ${prs.property.bedrooms}`);
      expect(allText(tree.root)).toContain(`۲ ${prs.property.bathrooms}`);
    }
  });
});

describe('propertyPlace', () => {
  const name = (value: string) => (value === 'nimroz' ? 'نیمروز' : value);
  it('says the province and the district', () => {
    expect(propertyPlace(property(), name)).toBe('نیمروز، زرنج');
  });
  it('falls back to the neighbourhood and then to the written address when there is no district', () => {
    const base = { district: '', neighborhood: null, address: '' };
    expect(
      propertyPlace(property({ ...base, neighborhood: 'شهر نو' }), name),
    ).toBe('نیمروز، شهر نو');
    expect(
      propertyPlace(property({ ...base, address: 'زرنج، ناحیه ۵' }), name),
    ).toBe('نیمروز، زرنج، ناحیه ۵');
    expect(propertyPlace(property(base), name)).toBe('نیمروز');
  });
});

describe('the new line icons', () => {
  it.each(['bed', 'bath', 'area', 'coin'] as const)(
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

describe('the share link', () => {
  it('is bongah://listing/{id}, and reads back to the same id', () => {
    expect(listingLink('abc-123')).toBe('bongah://listing/abc-123');
    expect(parseListingId(listingLink('abc-123'))).toBe('abc-123');
    expect(parseListingId(listingLink('a b/c'))).toBe('a b/c');
  });
  it('refuses anything that is not one of our listing links', () => {
    expect(parseListingId('https://example.com/listing/1')).toBeNull();
    expect(parseListingId('bongah://listing/')).toBeNull();
    expect(parseListingId('bongah://listing/1/extra')).toBeNull();
    expect(parseListingId('bongah://chat/1')).toBeNull();
  });
  it('ignores a query string or fragment after the id', () => {
    expect(parseListingId('bongah://listing/42?ref=wa#x')).toBe('42');
  });
});

describe('the placeholder colour', () => {
  const luminance = (hex: string) => {
    const channel = (i: number) => {
      const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };
  it('is distinctly lighter than the muted text and the typed text, but still readable on white', () => {
    expect(luminance(colors.placeholder)).toBeGreaterThan(
      luminance(colors.textMuted) + 0.1,
    );
    expect(luminance(colors.placeholder)).toBeGreaterThan(
      luminance(colors.text),
    );
    const ratio = (1 + 0.05) / (luminance(colors.placeholder) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(2.5);
  });
});

describe('every input uses the placeholder colour', () => {
  // The app has no Node typings; these are the few calls the scan needs.
  const fs = require('node:fs') as {
    readdirSync(
      p: string,
      o: { withFileTypes: true },
    ): { name: string; isDirectory(): boolean }[];
    readFileSync(p: string, e: 'utf8'): string;
  };
  const path = require('node:path') as {
    join(...p: string[]): string;
    basename(p: string): string;
  };
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.tsx$/.test(entry.name) ? [full] : [];
    });
  const sources = walk(path.join(__dirname, '..', 'src'));

  it('never hands an input the muted-text colour as its placeholder colour', () => {
    const offenders = sources.filter(file =>
      /placeholderTextColor=\{colors\.(?!placeholder\b)\w+\}/.test(
        fs.readFileSync(file, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('has a placeholder colour on each of the app text inputs', () => {
    const inputs = sources.filter(file =>
      /<TextInput\b/.test(fs.readFileSync(file, 'utf8')),
    );
    expect(inputs.length).toBeGreaterThan(0);
    for (const file of inputs) {
      const text = fs.readFileSync(file, 'utf8');
      // The code-entry boxes draw their own hints; every other input names the colour.
      if (file.endsWith('OtpInput.tsx')) continue;
      expect({
        file: path.basename(file),
        ok: text.includes('placeholderTextColor={colors.placeholder}'),
      }).toEqual({
        file: path.basename(file),
        ok: true,
      });
    }
  });
});
