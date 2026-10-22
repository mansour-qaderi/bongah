import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { Property } from '@bongah/shared-types';
import PropertyFacts from '../src/components/PropertyFacts';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import { allText } from '../test-utils';

const base = {
  type: 'SHOP',
  area_sqm: 194,
  bedrooms: null,
  bathrooms: null,
  unit: null,
  price_terms: null,
} as unknown as Property;

const draw = (terms: Property['price_terms'], withPriceTerms = true) => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <PropertyFacts
        property={{ ...base, price_terms: terms }}
        withType
        withPriceTerms={withPriceTerms}
        layout="grid"
        divider={false}
      />,
    );
  });
  return tree;
};

/** The words of each cell of the grid, in order. */
const cells = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root
    .findAll(n => (n.type as unknown) === 'View' && n.props.testID === 'property-facts')[0]
    .children.filter(
      (cell): cell is ReactTestRenderer.ReactTestInstance =>
        typeof cell !== 'string',
    )
    .map(cell => allText(cell));

describe('the terms of the price on a card', () => {
  beforeAll(async () => {
    await initI18n();
  });

  it('are the last cell of the specs grid: «جورآمد (قابل توافق)» or «مقطوع», after the kind and the area', () => {
    expect(cells(draw('NEGOTIABLE')).at(-1)).toBe(prs.priceTerms.NEGOTIABLE);
    expect(cells(draw('FIXED')).at(-1)).toBe(prs.priceTerms.FIXED);
    expect(cells(draw('FIXED'))).toHaveLength(3);
  });

  it('are left out when the owner said nothing about the price, or when the card does not ask for them', () => {
    expect(cells(draw(null))).toHaveLength(2);
    expect(allText(draw('FIXED', false).root)).not.toContain(
      prs.priceTerms.FIXED,
    );
  });
});
