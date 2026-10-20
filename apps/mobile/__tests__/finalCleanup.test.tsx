import React from 'react';
import { StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Property } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import { allText, render } from '../test-utils';
import Button from '../src/components/Button';
import FilterSheet from '../src/components/FilterSheet';
import ListingCard from '../src/components/ListingCard';
import { colors } from '../src/theme';

declare const __dirname: string;

const act = ReactTestRenderer.act;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const show = async (element: React.ReactElement) => {
  const tree = await render(element);
  mounted.push(tree);
  return tree;
};

const listing = (): Property => ({
  id: 'p1',
  user_id: 'u1',
  agency_id: null,
  agency_name: null,
  title: 'خانه سه اتاقه در مرکز زرنج',
  description: '',
  type: 'HOUSE_HAWILI',
  deal_type: 'SALE',
  price: 1300000,
  currency: 'AFGHANI',
  area_sqm: 200,
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
  mortgage_months: null,
  price_terms: null,
});

beforeAll(async () => {
  await initI18n();
});
afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

/** Host views that draw a hairline across their top edge in the app's border grey (icons draw in other colours). */
const topRules = (root: ReactTestRenderer.ReactTestInstance) =>
  root.findAll(n => {
    if (typeof n.type !== 'string') return false;
    const style = StyleSheet.flatten(n.props.style);
    return (
      (style?.borderTopWidth ?? 0) > 0 &&
      style?.borderTopColor === colors.border
    );
  });

/** The drawn icons of one name (the host view only, not the component that makes it). */
const icons = (root: ReactTestRenderer.ReactTestInstance, name: string) =>
  root.findAll(
    n => typeof n.type === 'string' && n.props.testID === `icon-${name}`,
  );

describe('every action button carries a vector icon', () => {
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

  it('has an icon on every <Button> in the app, so a new button cannot be added without one', () => {
    const bare: string[] = [];
    for (const file of sources) {
      if (file.endsWith(path.join('components', 'Button.tsx'))) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const block of text.match(/<Button\b[\s\S]*?\/>/g) ?? []) {
        if (!/\bicon=/.test(block)) {
          bare.push(`${path.join(file)}: ${block.slice(0, 80)}`);
        }
      }
    }
    expect(bare).toEqual([]);
  });

  it('draws the icon inside the button, before its words', async () => {
    const tree = await show(
      <Button icon="plus" title="ثبت آگهی جدید" onPress={() => undefined} />,
    );
    expect(icons(tree.root, 'plus')).toHaveLength(1);
    expect(allText(tree.root)).toContain('ثبت آگهی جدید');
  });

  it('puts one on the filter sheet buttons (clear and apply)', async () => {
    const tree = await show(
      <FilterSheet
        visible
        value={{}}
        onApply={() => undefined}
        onClose={() => undefined}
      />,
    );
    const footer = tree.root.findAll(
      n => typeof n.type === 'string' && n.props.testID === 'sheet-footer',
    )[0];
    expect(allText(footer)).toContain(prs.home.clearFilters);
    expect(allText(footer)).toContain(prs.home.applyFilters);
    expect(icons(footer, 'close')).toHaveLength(1);
    expect(icons(footer, 'check')).toHaveLength(1);
  });
});

describe('no rule across the top of the parts of a card or the foot of a sheet', () => {
  it('has none above the facts or above the buttons of a My Listings card', async () => {
    const tree = await show(
      <ListingCard
        property={listing()}
        onPress={() => undefined}
        actions={[
          { label: prs.my.edit, icon: 'edit', onPress: () => undefined },
        ]}
        menu={[{ label: prs.my.archive, onPress: () => undefined }]}
      />,
    );
    // Edit is an icon now: it is there for a screen reader, not as words on the card.
    expect(
      tree.root.findAll(
        n =>
          typeof n.type === 'string' &&
          n.props.accessibilityLabel === prs.my.edit,
      ),
    ).toHaveLength(1);
    const facts = tree.root.findAll(
      n => typeof n.type === 'string' && n.props.testID === 'property-facts',
    )[0];
    expect(StyleSheet.flatten(facts.props.style)?.borderTopWidth ?? 0).toBe(0);
    expect(topRules(tree.root)).toHaveLength(0);
  });

  it('has none above the buttons at the foot of the filter sheet', async () => {
    const tree = await show(
      <FilterSheet
        visible
        value={{}}
        onApply={() => undefined}
        onClose={() => undefined}
      />,
    );
    const footer = tree.root.findAll(
      n => typeof n.type === 'string' && n.props.testID === 'sheet-footer',
    )[0];
    expect(StyleSheet.flatten(footer.props.style)?.borderTopWidth ?? 0).toBe(0);
  });
});
