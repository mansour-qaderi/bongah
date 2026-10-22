import React from 'react';
import { StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import PriceLine from '../src/components/PriceLine';
import { ICON_SHAPES } from '../src/components/iconShapes';
import { initI18n } from '../src/i18n';

const draw = (element: React.ReactElement) => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(element);
  });
  return tree;
};

beforeAll(async () => {
  await initI18n();
});

describe('the price and its terms', () => {
  it('sit on one baseline, wrapping rather than squeezing, whatever line height the price has', () => {
    const tree = draw(
      <PriceLine
        property={{ price: 2_500_000, currency: 'AFGHANI', price_terms: 'FIXED' }}
        priceStyle={{ lineHeight: 34 }}
      />,
    );
    const root = tree.toJSON() as ReactTestRenderer.ReactTestRendererJSON;
    const row = StyleSheet.flatten(root.props.style as never);
    expect(row).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'baseline',
    });
  });
});

describe('the map icons', () => {
  it('has a pin (a teardrop with a ring in it) and a satellite, both drawn from shapes', () => {
    const pin = ICON_SHAPES.pin;
    expect(pin.length).toBeGreaterThanOrEqual(2);
    // The teardrop is an outline turned onto its point; the ring sits inside it.
    expect(pin.some(shape => shape.rotate === -45 && shape.stroke)).toBe(true);
    const satellite = ICON_SHAPES.satellite;
    // Body, two panels, the dish and the two signal arcs at least.
    expect(satellite.length).toBeGreaterThanOrEqual(8);
    for (const shape of [...pin, ...satellite]) {
      expect(shape.w).toBeGreaterThan(0);
      expect(shape.h).toBeGreaterThan(0);
    }
  });

  it('keeps every part of the satellite on the 24 × 24 grid', () => {
    for (const shape of ICON_SHAPES.satellite) {
      const rotated = shape.rotate !== undefined && shape.rotate !== 0;
      // A turned part is placed by its middle; the corner of an unturned one must lie inside the grid.
      if (!rotated) {
        expect(shape.x).toBeGreaterThanOrEqual(0);
        expect(shape.y).toBeGreaterThanOrEqual(0);
        expect(shape.x + shape.w).toBeLessThanOrEqual(24);
        expect(shape.y + shape.h).toBeLessThanOrEqual(24);
      }
    }
  });
});
