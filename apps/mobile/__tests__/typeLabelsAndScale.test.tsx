import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import i18next from 'i18next';
import { PROPERTY_TYPES, type Property } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import { propertyTypeLabel } from '../src/i18n/propertyType';
import { allText, render } from '../test-utils';
import ListingCard from '../src/components/ListingCard';
import PropertyCard from '../src/components/PropertyCard';
import PropertyFacts, { propertyKind } from '../src/components/PropertyFacts';
import { headerOptions } from '../src/navigation/screenOptions';
import { fonts, typography } from '../src/theme';

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: null, updateUser: jest.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});
beforeAll(async () => {
  await initI18n();
});

const property = (type: string): Property =>
  ({
    id: 'p1',
    user_id: 'u1',
    title: 'x',
    type,
    unit: null,
    deal_type: 'SALE',
    price: 1,
    currency: 'AFGHANI',
    area_sqm: 100,
    bedrooms: null,
    bathrooms: null,
    province: 'kabul',
    district: '',
    neighborhood: null,
    address: '',
    images: [],
    status: 'ACTIVE',
    is_featured: false,
  } as unknown as Property);

describe('property type labels', () => {
  const t = i18next.t.bind(i18next);

  it('names every type of today in clean Dari', () => {
    expect(PROPERTY_TYPES.map(type => propertyTypeLabel(type, t))).toEqual([
      'خانه',
      'آپارتمان',
      'دکان',
      'دفتر',
      'زمین',
      'باغ',
      'ویلا',
      'گاراج',
      'غیره',
    ]);
  });

  it('words the names an older server or build may still send, never as a raw key', () => {
    expect(propertyTypeLabel('HOUSE', t)).toBe('خانه');
    expect(propertyTypeLabel('OFFICE_SHOP', t)).toBe('دکان و دفتر');
    expect(propertyTypeLabel('GARDEN_VILLA', t)).toBe('باغ و ویلا');
    expect(propertyTypeLabel('GARAGE_OTHER', t)).toBe('پارکینگ / گراج / غیره');
    expect(propertyTypeLabel('APARTMENT', t)).toBe('آپارتمان');
    expect(propertyTypeLabel('LAND', t)).toBe('زمین');
  });

  it('reads anything it does not know, or nothing, as "غیره"', () => {
    for (const odd of [
      'PALACE',
      '',
      'propertyType.OFFICE_SHOP',
      undefined,
      null,
    ])
      expect(propertyTypeLabel(odd, t)).toBe(prs.propertyType.OTHER);
  });

  it('has the same names in Pashto, and no label anywhere reads like a key', async () => {
    expect(Object.keys(ps.propertyTypeLegacy).sort()).toEqual(
      Object.keys(prs.propertyTypeLegacy).sort(),
    );
    for (const dict of [prs, ps]) {
      for (const label of [
        ...Object.values(dict.propertyType),
        ...Object.values(dict.propertyTypeLegacy),
      ]) {
        expect(label).not.toMatch(/propertyType|_|\./);
      }
    }
    await i18next.changeLanguage('ps');
    try {
      expect(propertyTypeLabel('GARDEN_VILLA', i18next.t.bind(i18next))).toBe(
        ps.propertyTypeLegacy.GARDEN_VILLA,
      );
    } finally {
      await i18next.changeLanguage('prs');
    }
  });

  it('is what a listing card says, even for a type from an older server', async () => {
    for (const [type, label] of [
      ['OFFICE_SHOP', 'دکان و دفتر'],
      ['GARDEN_VILLA', 'باغ و ویلا'],
      ['GARAGE_OTHER', 'پارکینگ / گراج / غیره'],
      ['SHOP', 'دکان'],
    ] as const) {
      const tree = await render(
        <PropertyFacts property={property(type)} withType />,
      );
      mounted.push(tree);
      expect(allText(tree.root)).toContain(label);
      expect(allText(tree.root)).not.toContain('propertyType');
      expect(propertyKind(property(type), i18next.t.bind(i18next))).toBe(label);
    }
  });
});

describe('cards with a type from an older server', () => {
  it('draw a picture and the clean name instead of failing or showing a key', async () => {
    for (const element of [
      <ListingCard
        key="mine"
        property={property('GARDEN_VILLA')}
        onPress={jest.fn()}
      />,
      <PropertyCard
        key="home"
        property={property('GARAGE_OTHER')}
        onPress={jest.fn()}
      />,
    ]) {
      const tree = await render(element);
      mounted.push(tree);
      expect(allText(tree.root)).not.toContain('propertyType');
      expect(allText(tree.root)).toMatch(/باغ و ویلا|پارکینگ/);
    }
  });
});

describe('the placeholders of the listing form', () => {
  // The wording itself belongs to the translators (it is edited by hand in the locale files); the form only needs
  // each field to have a hint in both languages, in Persian digits.
  it('has a hint for the description and the address, in both languages', () => {
    for (const locale of [prs, ps]) {
      for (const hint of [
        locale.add.descriptionPlaceholder,
        locale.add.addressPlaceholder,
      ]) {
        expect(hint.trim().length).toBeGreaterThan(0);
        expect(hint).not.toMatch(/[0-9]/);
      }
    }
  });
});

describe('the type scale', () => {
  const size = (v: keyof typeof typography) => typography[v].fontSize;

  it('keeps page headers at 18-20 bold', () => {
    for (const v of ['heading', 'pageTitle'] as const) {
      expect(size(v)).toBeGreaterThanOrEqual(18);
      expect(size(v)).toBeLessThanOrEqual(20);
      expect(typography[v].fontFamily).toBe(fonts.bold);
    }
    expect(headerOptions.headerTitleStyle.fontSize).toBe(18);
    expect(headerOptions.headerTitleStyle.fontFamily).toBe(fonts.bold);
  });

  it('keeps section titles and field labels at 13-15 semibold', () => {
    for (const v of ['section', 'label'] as const) {
      expect(size(v)).toBeGreaterThanOrEqual(13);
      expect(size(v)).toBeLessThanOrEqual(15);
      expect(typography[v].fontFamily).toBe(fonts.semibold);
    }
  });

  it('keeps body text at 12-13 and captions at 11-12, regular', () => {
    expect(size('bodySm')).toBeGreaterThanOrEqual(12);
    expect(size('bodySm')).toBeLessThanOrEqual(13);
    expect(size('caption')).toBeGreaterThanOrEqual(11);
    expect(size('caption')).toBeLessThanOrEqual(12);
    expect(typography.bodySm.fontFamily).toBe(fonts.regular);
    expect(typography.caption.fontFamily).toBe(fonts.regular);
  });

  it('leaves room for the Arabic-script line height', () => {
    for (const v of Object.keys(typography) as (keyof typeof typography)[])
      expect(typography[v].lineHeight).toBeGreaterThanOrEqual(
        Math.round(typography[v].fontSize * 1.4),
      );
  });
});
