import React from 'react';
import { I18nManager, StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Property } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import { formatCurrency, toLatinDigits } from '../src/i18n/format';
import prs from '../src/i18n/locales/prs.json';
import { allText, inputLabelled, render } from '../test-utils';
import AppText from '../src/components/AppText';
import BottomSheet from '../src/components/BottomSheet';
import FilterSheet from '../src/components/FilterSheet';
import RangeSlider, { nearestStop } from '../src/components/RangeSlider';
import { priceStops } from '../src/constants/priceStops';
import { PropertyMarker } from '../src/map/markers';

const act = ReactTestRenderer.act;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const show = async (element: React.ReactElement) => {
  const tree = await render(element);
  mounted.push(tree);
  return tree;
};
const settle = (ms = 700) =>
  act(async () => {
    await new Promise<void>(resolve => setTimeout(() => resolve(), ms));
  });
const setRtl = (value: boolean) =>
  Object.defineProperty(I18nManager, 'isRTL', { value, configurable: true });
const originalRtl = I18nManager.isRTL;

beforeAll(async () => {
  await initI18n();
});
afterEach(async () => {
  setRtl(originalRtl);
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

// ──────────────────────────────── RangeSlider ────────────────────────────────

describe('RangeSlider', () => {
  const STOPS = [0, 10, 20, 30, 40, 50];
  const WIDTH = 300; // usable travel = 300 - 28 (thumb) = 272

  const slider = async (
    props: Partial<React.ComponentProps<typeof RangeSlider>> = {},
  ) => {
    const onChange = jest.fn();
    const tree = await show(
      <RangeSlider
        stops={STOPS}
        low={undefined}
        high={undefined}
        onChange={onChange}
        describe={v => (v === undefined ? 'بدون حد' : `v${v}`)}
        lowLabel="حداقل"
        highLabel="حداکثر"
        {...props}
      />,
    );
    // The slider only draws its thumbs once it knows its width.
    await act(async () => {
      tree.root
        .findAll(n => typeof n.props.onLayout === 'function')[0]
        .props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width: WIDTH, height: 40 } },
        });
    });
    await settle();
    return { tree, onChange };
  };
  const thumb = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
    tree.root.findAll(
      n => n.props.testID === id && typeof n.type === 'string',
    )[0];
  const x = (tree: ReactTestRenderer.ReactTestRenderer, id: string) => {
    const style = StyleSheet.flatten(thumb(tree, id).props.style) as {
      transform: { translateX: number }[];
    };
    return style.transform[0].translateX;
  };
  const act_ = (
    tree: ReactTestRenderer.ReactTestRenderer,
    id: string,
    actionName: 'increment' | 'decrement',
  ) =>
    act(async () => {
      thumb(tree, id).props.onAccessibilityAction({
        nativeEvent: { actionName },
      });
    });

  it('finds the stop nearest to a value, and the fallback for none', () => {
    expect(nearestStop(STOPS, 24, 0)).toBe(2);
    expect(nearestStop(STOPS, 26, 0)).toBe(3);
    expect(nearestStop(STOPS, undefined, 5)).toBe(5);
  });

  it('puts the low end at the left and the high end at the right in a left-to-right language', async () => {
    setRtl(false);
    const { tree } = await slider({ low: 20, high: undefined });
    expect(x(tree, 'range-low')).toBeCloseTo((2 / 5) * 272, 0);
    expect(x(tree, 'range-high')).toBeCloseTo(272, 0);
  });

  it('mirrors that in a right-to-left language: the low end is at the right', async () => {
    setRtl(true);
    const { tree } = await slider({ low: 20, high: undefined });
    expect(x(tree, 'range-low')).toBeCloseTo((1 - 2 / 5) * 272, 0);
    expect(x(tree, 'range-high')).toBeCloseTo(0, 0);
  });

  it('reads its thumbs out to a screen reader, and says "no limit" at an open end', async () => {
    const { tree } = await slider({ low: 20, high: undefined });
    expect(thumb(tree, 'range-low').props.accessibilityValue).toEqual({
      text: 'v20',
    });
    expect(thumb(tree, 'range-high').props.accessibilityValue).toEqual({
      text: 'بدون حد',
    });
    expect(thumb(tree, 'range-low').props.accessibilityRole).toBe('adjustable');
  });

  it('makes a thumb bigger or smaller on "increment" and "decrement", in either direction', async () => {
    for (const rtl of [false, true]) {
      setRtl(rtl);
      const { tree, onChange } = await slider({ low: 20, high: 40 });
      await act_(tree, 'range-low', 'increment');
      expect(onChange).toHaveBeenLastCalledWith(30, 40);
      await act_(tree, 'range-high', 'decrement');
      expect(onChange).toHaveBeenLastCalledWith(20, 30);
      await act(async () => {
        mounted.splice(0).forEach(t => t.unmount());
      });
    }
  });

  it('opens an end again when its thumb returns to the first or last stop', async () => {
    const { tree, onChange } = await slider({ low: 10, high: 40 });
    await act_(tree, 'range-low', 'decrement');
    expect(onChange).toHaveBeenLastCalledWith(undefined, 40);
    await act_(tree, 'range-high', 'increment');
    expect(onChange).toHaveBeenLastCalledWith(10, undefined);
  });

  it('never lets the thumbs cross or run off the track', async () => {
    const { tree, onChange } = await slider({ low: 40, high: undefined });
    await act_(tree, 'range-low', 'increment'); // would meet the open top end
    expect(onChange).not.toHaveBeenCalled();
    await act_(tree, 'range-high', 'increment'); // already at the last stop
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('price stops', () => {
  it('start at zero ("no minimum"), only rise, and differ by deal and currency', () => {
    for (const currency of ['AFGHANI', 'USD'] as const) {
      for (const deal of [
        undefined,
        'SALE',
        'RENT',
        'MORTGAGE_GROWI',
      ] as const) {
        const stops = priceStops(deal, currency);
        expect(stops[0]).toBe(0);
        expect(stops.length).toBeGreaterThan(5);
        stops.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(stops[i]));
      }
    }
    expect(priceStops('RENT', 'AFGHANI')).not.toEqual(
      priceStops('SALE', 'AFGHANI'),
    );
    expect(priceStops('SALE', 'USD')).not.toEqual(
      priceStops('SALE', 'AFGHANI'),
    );
  });
});

// ──────────────────────────────── BottomSheet ────────────────────────────────

describe('BottomSheet', () => {
  const sheet = (visible: boolean, onClose = jest.fn()) =>
    show(
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title="عنوان برگه"
        footer={<AppText>دکمه پایین</AppText>}
      >
        <AppText>محتوا</AppText>
      </BottomSheet>,
    );
  const sheetNodes = (tree: ReactTestRenderer.ReactTestRenderer) =>
    tree.root.findAll(n => n.props.testID === 'bottom-sheet');

  it('draws nothing while closed', async () => {
    const tree = await sheet(false);
    expect(sheetNodes(tree)).toHaveLength(0);
  });

  it('shows its title, content and pinned footer once opened', async () => {
    const tree = await sheet(true);
    expect(sheetNodes(tree).length).toBeGreaterThan(0);
    const text = allText(tree.root);
    expect(text).toContain('عنوان برگه');
    expect(text).toContain('محتوا');
    expect(text).toContain('دکمه پایین');
  });

  it('closes from the dimmed backdrop and from the close word', async () => {
    const onClose = jest.fn();
    const tree = await sheet(true, onClose);
    const closers = tree.root.findAll(
      n =>
        typeof n.props.onPress === 'function' &&
        n.props.accessibilityRole === 'button',
    );
    expect(closers.length).toBeGreaterThanOrEqual(2);
    await act(async () => {
      closers.forEach(c => c.props.onPress());
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps itself on screen until the closing animation has finished, then goes', async () => {
    const tree = await sheet(true);
    await act(async () => {
      tree.update(
        <BottomSheet visible={false} onClose={jest.fn()} title="عنوان برگه">
          <AppText>محتوا</AppText>
        </BottomSheet>,
      );
    });
    await settle(500);
    expect(sheetNodes(tree)).toHaveLength(0);
  });
});

// ──────────────────────────────── FilterSheet ────────────────────────────────

describe('FilterSheet', () => {
  const open = async (value = {}) => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    const tree = await show(
      <FilterSheet visible value={value} onApply={onApply} onClose={onClose} />,
    );
    await settle(50);
    return { tree, onApply, onClose };
  };
  const thumb = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
    tree.root.findAll(
      n => n.props.testID === id && typeof n.type === 'string',
    )[0];
  const tap = (tree: ReactTestRenderer.ReactTestRenderer, label: string) =>
    act(async () => {
      tree.root
        .findAll(
          n =>
            typeof n.props.onPress === 'function' &&
            (n.props.accessibilityLabel === label ||
              allText(n).trim() === label),
        )[0]
        .props.onPress();
    });
  const typed = (tree: ReactTestRenderer.ReactTestRenderer, label: string) =>
    toLatinDigits(String(inputLabelled(tree.root, label).props.value)).replace(
      /[٬,\s]/g,
      '',
    );

  it('slides up with compact chips, a price range and an apply button', async () => {
    const { tree } = await open();
    const text = allText(tree.root);
    expect(text).toContain(prs.home.filters);
    expect(text).toContain(prs.home.applyFilters);
    expect(text).toContain(prs.home.priceRange);
    expect(text).toContain(prs.propertyType.HOUSE_HAWILI);
    expect(text).toContain(prs.dealType.RENT);
    expect(text).toContain(`${prs.home.priceFromTo.split('{{from}}')[0]}`);
  });

  it('starts from the filters already applied', async () => {
    const { tree } = await open({
      type: 'LAND',
      deal_type: 'SALE',
      min_price: 1_000_000,
      currency: 'AFGHANI',
    });
    expect(typed(tree, prs.home.minPrice)).toBe('1000000');
    expect(typed(tree, prs.home.maxPrice)).toBe('');
  });

  it('writes the exact number into the box when a thumb moves', async () => {
    const { tree } = await open();
    const stops = priceStops(undefined, 'AFGHANI');
    // The slider needs a width before its thumbs act.
    await act(async () => {
      tree.root
        .findAll(
          n =>
            typeof n.props.onLayout === 'function' &&
            n.props.testID === undefined,
        )
        .forEach(n => {
          try {
            n.props.onLayout({
              nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 40 } },
            });
          } catch {
            /* not the slider */
          }
        });
    });
    await settle(50);
    await act(async () => {
      thumb(tree, 'range-low').props.onAccessibilityAction({
        nativeEvent: { actionName: 'increment' },
      });
    });
    expect(typed(tree, prs.home.minPrice)).toBe(String(stops[1]));
    expect(allText(tree.root)).toContain(formatCurrency(stops[1], 'AFGHANI'));
  });

  it('moves the thumb when a number is typed in the box', async () => {
    const { tree } = await open();
    await act(async () => {
      inputLabelled(tree.root, prs.home.minPrice).props.onChangeText('5000000');
    });
    expect(allText(tree.root)).toContain(formatCurrency(5_000_000, 'AFGHANI'));
  });

  it('applies exactly what was chosen, with the currency only when a price is set', async () => {
    const { tree, onApply } = await open();
    await tap(tree, prs.propertyType.APARTMENT);
    await tap(tree, prs.dealType.RENT);
    await act(async () => {
      inputLabelled(tree.root, prs.home.maxPrice).props.onChangeText('20000');
    });
    await tap(tree, prs.home.applyFilters);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'APARTMENT',
        deal_type: 'RENT',
        max_price: 20000,
        min_price: undefined,
        currency: 'AFGHANI',
      }),
    );
  });

  it('applies no currency when no price was set', async () => {
    const { tree, onApply } = await open();
    await tap(tree, prs.home.applyFilters);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ currency: undefined }),
    );
  });

  it('does not apply a minimum above the maximum, and says why', async () => {
    const { tree, onApply } = await open();
    await act(async () => {
      inputLabelled(tree.root, prs.home.minPrice).props.onChangeText('900');
      inputLabelled(tree.root, prs.home.maxPrice).props.onChangeText('100');
    });
    await tap(tree, prs.home.applyFilters);
    expect(onApply).not.toHaveBeenCalled();
    expect(allText(tree.root)).toContain(prs.errors.validation);
  });

  it('clears the choices without applying them', async () => {
    const { tree, onApply } = await open({ type: 'LAND', min_price: 5000 });
    await tap(tree, prs.home.clearFilters);
    expect(onApply).not.toHaveBeenCalled();
    expect(typed(tree, prs.home.minPrice)).toBe('');
  });
});

// ──────────────────────────────── map marker tail ────────────────────────────────

describe('map marker', () => {
  const property = {
    id: 'p1',
    title: 'خانه',
    type: 'HOUSE_HAWILI',
    deal_type: 'SALE',
    price: 5_000_000,
    currency: 'AFGHANI',
    agency_name: null,
    is_featured: false,
  } as unknown as Property;

  it('lays its pointer out left-to-right, so the "v" under it cannot turn sideways in Dari', async () => {
    const tree = await show(
      <PropertyMarker property={property} selected={false} />,
    );
    const tails = tree.root
      .findAll(n => typeof n.type === 'string')
      .map(n => StyleSheet.flatten(n.props.style) as Record<string, unknown>)

      // The pointer is the one square pulled up under the badge (the icons' own strokes also have right/bottom edges).
      .filter(
        style => style && style.marginTop === -7 && style.borderRightWidth,
      );
    expect(tails.length).toBe(1);
    expect(tails[0].direction).toBe('ltr');
    expect(tails[0].transform).toEqual([{ rotate: '45deg' }]);
  });
});
