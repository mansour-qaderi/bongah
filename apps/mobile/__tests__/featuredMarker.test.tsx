import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Property } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import { ClusterMarker, PropertyMarker } from '../src/map/markers';
import { colors } from '../src/theme';
import { render } from '../test-utils';

const act = ReactTestRenderer.act;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

const property = (overrides: Partial<Property> = {}): Property =>
  ({
    id: 'p1',
    user_id: 'u',
    agency_id: null,
    agency_name: null,
    title: 'آپارتمان',
    description: 'تازه‌ساز',
    type: 'APARTMENT',
    deal_type: 'SALE',
    price: 2500000,
    currency: 'AFGHANI',
    area_sqm: 100,
    bedrooms: 2,
    bathrooms: 1,
    province: 'کابل',
    district: 'شهر نو',
    neighborhood: 'قلعه',
    address: 'سرک',
    lat: 34.5,
    lng: 69.1,
    images: [],
    status: 'ACTIVE',
    is_featured: false,
    featured_until: null,
    laddered_at: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  } as Property);

const mount = async (element: React.ReactElement) => {
  const tree = await render(element);
  mounted.push(tree);
  // Let the reduce-motion question be answered.
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  });
  return tree;
};
const has = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => n.props.testID === id).length > 0;

beforeAll(async () => {
  await initI18n();
});
afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
  jest.restoreAllMocks();
});

describe('the featured pin', () => {
  it('pulses a gold ring while the phone allows motion', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    const loop = jest.spyOn(Animated, 'loop');
    const tree = await mount(
      <PropertyMarker
        property={property({ is_featured: true })}
        selected={false}
      />,
    );
    expect(has(tree, 'featured-glow')).toBe(true);
    expect(has(tree, 'featured-pulse')).toBe(true);
    expect(loop).toHaveBeenCalledTimes(1);
  });

  it('keeps the steady glow but stops the pulse for someone who asked for less motion', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    const loop = jest.spyOn(Animated, 'loop');
    const tree = await mount(
      <PropertyMarker
        property={property({ is_featured: true })}
        selected={false}
      />,
    );
    expect(has(tree, 'featured-glow')).toBe(true);
    expect(loop).not.toHaveBeenCalled();
  });

  it('adds nothing to an ordinary listing, and keeps the pin gold when it is chosen', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    const loop = jest.spyOn(Animated, 'loop');
    const plain = await mount(
      <PropertyMarker property={property()} selected={false} />,
    );
    expect(has(plain, 'featured-glow')).toBe(false);
    expect(loop).not.toHaveBeenCalled();

    const chosen = await mount(
      <PropertyMarker property={property({ is_featured: true })} selected />,
    );
    const badge = chosen.root.find(n => n.props.testID === 'marker-badge');
    expect(JSON.stringify(badge.props.style)).toContain(colors.accentBright);
    expect(has(chosen, 'featured-pulse')).toBe(true);
  });

  it('gives a pile with a featured listing in it a gold edge, and others the plain one', async () => {
    const withFeatured = await mount(<ClusterMarker count={5} hasFeatured />);
    const without = await mount(<ClusterMarker count={5} />);
    const edge = (tree: ReactTestRenderer.ReactTestRenderer) =>
      JSON.stringify(
        tree.root.find(n => n.props.accessibilityRole === 'button').props.style,
      );
    expect(edge(withFeatured)).toContain(colors.accentBright);
    expect(edge(without)).not.toContain(colors.accentBright);
  });
});
