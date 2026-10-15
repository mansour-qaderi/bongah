import React from 'react';
import { StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Chip, ChipRow, CHIP_HEIGHT } from '../src/components/Chip';

const flat = (style: unknown) =>
  StyleSheet.flatten(style as Parameters<typeof StyleSheet.flatten>[0]) ?? {};

describe('ChipRow', () => {
  const render = () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <ChipRow>
          <Chip label="کابل" selected onPress={() => undefined} />
          <Chip label="هرات" onPress={() => undefined} />
        </ChipRow>,
      );
    });
    return tree;
  };

  it('does not grow to fill spare height, so a flexible screen cannot stretch the chips', () => {
    const tree = render();
    const scroll = tree.root.findByProps({ horizontal: true });
    expect(flat(scroll.props.style).flexGrow).toBe(0);
    expect(flat(scroll.props.contentContainerStyle).alignItems).toBe('center');
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('draws each chip at a fixed, compact height', () => {
    expect(CHIP_HEIGHT).toBeGreaterThanOrEqual(36);
    expect(CHIP_HEIGHT).toBeLessThanOrEqual(40);
    const tree = render();
    const chips = tree.root.findAll(
      n => n.props.accessibilityRole === 'button' && n.props.onPress,
    );
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      const style =
        typeof chip.props.style === 'function'
          ? chip.props.style({ pressed: false })
          : chip.props.style;
      expect(flat(style).height).toBe(CHIP_HEIGHT);
    }
    ReactTestRenderer.act(() => tree.unmount());
  });
});
