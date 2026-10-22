import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import PriceLine from '../src/components/PriceLine';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import { allText } from '../test-utils';

const draw = (terms: 'NEGOTIABLE' | 'FIXED' | null) => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <PriceLine
        property={{ price: 2_500_000, currency: 'AFGHANI', price_terms: terms }}
      />,
    );
  });
  return tree;
};

describe('the price on a card', () => {
  beforeAll(async () => {
    await initI18n();
  });

  it('has the terms beside the price: «جورآمد (قابل توافق)» or «مقطوع»', () => {
    expect(allText(draw('NEGOTIABLE').root)).toContain(
      prs.priceTerms.NEGOTIABLE,
    );
    expect(allText(draw('FIXED').root)).toContain(prs.priceTerms.FIXED);
  });

  it('draws only the price when the owner said nothing about it', () => {
    const shown = allText(draw(null).root);
    expect(shown).toContain('؋');
    expect(shown).not.toContain(prs.priceTerms.NEGOTIABLE);
    expect(shown).not.toContain(prs.priceTerms.FIXED);
  });
});
