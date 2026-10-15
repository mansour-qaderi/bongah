import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Animated, I18nManager, StyleSheet, Text } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import { allText, render } from '../test-utils';
import Icon, { ICON_ROOT } from '../src/components/Icon';
import { ICON_SHAPES, type IconName } from '../src/components/iconShapes';
import LocationPermissionModal from '../src/components/LocationPermissionModal';
import FloatingTabBar, {
  FLOATING_BAR_HEIGHT,
  CAPSULE_GAP,
  CAPSULE_INSET,
  ICON_POP,
  FLOATING_BAR_MARGIN,
  floatingBarClearance,
} from '../src/navigation/FloatingTabBar';

const act = ReactTestRenderer.act;

beforeAll(async () => {
  await initI18n();
});

describe('Icon', () => {
  it('draws corners at fixed left and right positions, so a map pin points down in right-to-left too', async () => {
    const tree = await render(<Icon name="pin" />);
    const corners = tree.root
      .findAll(n => typeof n.type === 'string')
      .map(n => StyleSheet.flatten(n.props.style) as Record<string, unknown>)
      .filter(style => style && 'borderTopLeftRadius' in style);
    expect(corners.length).toBeGreaterThan(0);
    for (const style of corners) {
      for (const logical of [
        'borderTopStartRadius',
        'borderTopEndRadius',
        'borderBottomStartRadius',
        'borderBottomEndRadius',
      ]) {
        expect(style).not.toHaveProperty(logical);
      }
    }
    // The teardrop is a square with one sharp corner, the bottom-left one, turned to point down.
    const drop = corners.find(style => style.borderBottomLeftRadius === 0)!;
    expect(drop.borderTopLeftRadius).toBeGreaterThan(0);
    expect(drop.borderTopRightRadius).toBeGreaterThan(0);
    expect(drop.borderBottomRightRadius).toBeGreaterThan(0);
    expect(drop.transform).toEqual([{ rotate: '-45deg' }]);
  });

  it('is drawn left-to-right whatever the language, so no shape mirrors or turns sideways', async () => {
    expect(ICON_ROOT).toEqual({ direction: 'ltr' });
    for (const name of ['pin', 'house', 'chat', 'locate'] as const) {
      const tree = await render(<Icon name={name} />);
      const root = tree.root.findAll(n => typeof n.type === 'string')[0];
      const style = StyleSheet.flatten(root.props.style) as {
        direction?: string;
      };
      expect(style.direction).toBe('ltr');
    }
  });

  it('draws every icon the app uses, inside its square, from at least one shape', () => {
    const names = Object.keys(ICON_SHAPES) as IconName[];
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      expect(ICON_SHAPES[name].length).toBeGreaterThan(0);
    }
  });

  it('is hidden from screen readers (the control around it carries the label) and sized as asked', async () => {
    const tree = await render(<Icon name="locate" size={30} color="#123456" />);
    const root = tree.root.findAll(n => typeof n.type === 'string')[0];
    const style = StyleSheet.flatten(root.props.style) as {
      width: number;
      height: number;
    };
    expect(style.width).toBe(30);
    expect(style.height).toBe(30);
    expect(root.props.accessible).toBe(false);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('paints in the colour it is given', async () => {
    const tree = await render(<Icon name="user" color="#123456" />);
    const colours = tree.root
      .findAll(n => typeof n.type === 'string')
      .flatMap(n => {
        const style = StyleSheet.flatten(n.props.style) as Record<
          string,
          unknown
        > | null;
        return [style?.backgroundColor, style?.borderColor];
      });
    expect(colours).toContain('#123456');
  });
});

describe('LocationPermissionModal', () => {
  const show = (
    problem: 'denied' | 'unavailable' | null,
    handlers = { onOpenSettings: jest.fn(), onClose: jest.fn() },
  ) => render(<LocationPermissionModal problem={problem} {...handlers} />);

  it('is not on screen until there is a problem', async () => {
    const tree = await show(null);
    expect(allText(tree.root)).toBe('');
  });

  it.each([
    ['denied', prs.home.permissionDeniedTitle, prs.home.locationDenied],
    ['unavailable', prs.home.permissionOffTitle, prs.home.locationUnavailable],
  ] as const)(
    'for "%s" says what is wrong and why the position is wanted',
    async (problem, title, body) => {
      const tree = await show(problem);
      const text = allText(tree.root);
      expect(text).toContain(title);
      expect(text).toContain(body);
      expect(text).toContain(prs.home.permissionPrivacy);
    },
  );

  it('offers the settings and "not now", and each does its own thing', async () => {
    const handlers = { onOpenSettings: jest.fn(), onClose: jest.fn() };
    const tree = await show('denied', handlers);
    const press = (label: string) =>
      act(async () => {
        tree.root
          .findAll(
            n =>
              typeof n.props.onPress === 'function' &&
              allText(n).includes(label),
          )[0]
          .props.onPress();
      });
    await press(prs.account.openSettings);
    expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).not.toHaveBeenCalled();
    await press(prs.home.permissionLater);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('FloatingTabBar', () => {
  const route = (name: string) => ({ key: `${name}-key`, name });
  const routes = ['Home', 'Messages', 'Account'].map(route);

  const build = (index: number, options: Record<string, unknown> = {}) => {
    const emit = jest.fn(() => ({ defaultPrevented: false }));
    const navigate = jest.fn();
    const descriptors = Object.fromEntries(
      routes.map(r => [
        r.key,
        {
          options: {
            title: r.name === 'Home' ? 'نقشه' : r.name,
            tabBarIcon: ({ color }: { color: string }) => (
              <Text testID={`glyph-${r.name}`}>{color}</Text>
            ),
            ...(r.name === 'Messages' ? { tabBarBadge: '۳' } : {}),
            ...(r.name === routes[index].name ? options : {}),
          },
        },
      ]),
    );
    const props = {
      state: { index, routes },
      descriptors,
      navigation: { emit, navigate },
    } as unknown as BottomTabBarProps;
    return { props, emit, navigate };
  };

  it('names every tab, and marks only the current one as selected', async () => {
    const { props } = build(0);
    const tree = await render(<FloatingTabBar {...props} />);
    const text = allText(tree.root);
    for (const name of ['نقشه', 'Messages', 'Account']) {
      expect(text).toContain(name);
    }
    const selected = tree.root
      .findAll(n => n.props.accessibilityRole === 'tab')
      .filter(n => n.props.accessibilityState?.selected);
    expect(new Set(selected.map(n => n.props.testID))).toEqual(
      new Set(['tab-Home']),
    );
  });

  it('shows the current tab in the brand colour and the others muted, cross-fading between the two looks', async () => {
    const { props } = build(1);
    const tree = await render(<FloatingTabBar {...props} />);
    // The layer a glyph sits in: the nearest host view above it that has an opacity of its own.
    const opacityOf = (node: ReactTestRenderer.ReactTestInstance) => {
      let up = node.parent;
      while (up) {
        const style = StyleSheet.flatten(up.props.style) as
          | { opacity?: number }
          | undefined;
        if (typeof up.type === 'string' && style?.opacity !== undefined)
          return style.opacity;
        up = up.parent;
      }
      throw new Error('No layer above the glyph');
    };
    const layers = (name: string) => {
      const found = tree.root.findAll(
        n => n.props.testID === `glyph-${name}` && typeof n.type === 'string',
      );
      const colourOf = (n: ReactTestRenderer.ReactTestInstance) =>
        String(n.props.children);
      const muted = found.find(n => colourOf(n) === '#374151')!;
      const brand = found.find(n => colourOf(n) === '#047857')!;
      return { muted: opacityOf(muted), brand: opacityOf(brand) };
    };
    expect(layers('Messages')).toEqual({ muted: 0, brand: 1 }); // the current tab
    expect(layers('Home')).toEqual({ muted: 1, brand: 0 });
    expect(layers('Account')).toEqual({ muted: 1, brand: 0 });
  });

  it('slides the pill to the chosen tab, the right way round for the language direction', async () => {
    const spring = jest.spyOn(Animated, 'spring');
    const first = build(0);
    const tree = await render(<FloatingTabBar {...first.props} />);
    // Before the bar has a width there is no pill to place.
    expect(tree.root.findAll(n => n.props.testID === 'tab-pill')).toHaveLength(
      0,
    );
    await act(async () => {
      tree.root.findByProps({ testID: 'tab-bar' }).props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 316, height: 68 } },
      });
    });
    expect(
      tree.root.findAll(n => n.props.testID === 'tab-pill').length,
    ).toBeGreaterThan(0);
    expect(spring).not.toHaveBeenCalled(); // the first placement does not travel

    const second = build(2);
    await act(async () => {
      tree.update(<FloatingTabBar {...second.props} />);
    });
    // (316 - 2 x 4 padding) / 3 tabs = 102.67 per tab; two tabs along.
    const direction = I18nManager.isRTL ? -1 : 1;
    expect(spring).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        toValue: ((316 - 8) / 3) * 2 * direction,
        useNativeDriver: true,
      }),
    );
  });

  describe('the Telegram-style look', () => {
    const laidOut = async (index: number) => {
      const { props } = build(index);
      const tree = await render(<FloatingTabBar {...props} />);
      await act(async () => {
        tree.root.findByProps({ testID: 'tab-bar' }).props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width: 328, height: 60 } },
        });
      });
      return tree;
    };
    const flat = (node: ReactTestRenderer.ReactTestInstance) =>
      StyleSheet.flatten(node.props.style) as Record<string, unknown>;

    it('is a slim, fully rounded, slightly see-through pill with a soft shadow', async () => {
      const { props } = build(0);
      const tree = await render(<FloatingTabBar {...props} />);
      const bar = flat(tree.root.findByProps({ testID: 'tab-bar' }));
      expect(FLOATING_BAR_HEIGHT).toBeLessThanOrEqual(64);
      expect(bar.height).toBe(FLOATING_BAR_HEIGHT);
      expect(bar.borderRadius).toBe(FLOATING_BAR_HEIGHT / 2);
      expect(bar.backgroundColor).toBe('rgba(255,255,255,0.94)');
      expect(bar.shadowOpacity).toBeLessThanOrEqual(0.15);
      expect(bar.elevation).toBeGreaterThan(0);
    });

    it('floats clear of the screen edge: the host pads its foot by the margin plus the safe area', async () => {
      const { props } = build(0);
      const tree = await render(<FloatingTabBar {...props} />);
      const bar = tree.root.findByProps({ testID: 'tab-bar' });
      // The host is the animated wrapper around the bar; its padding is the gap under the pill.
      let host = bar.parent;
      while (
        host &&
        StyleSheet.flatten(host.props.style)?.paddingBottom === undefined
      ) {
        host = host.parent;
      }
      const inset =
        jest.requireMock('react-native-safe-area-context').initialWindowMetrics
          ?.insets?.bottom ?? 0;
      expect(StyleSheet.flatten(host!.props.style).paddingBottom).toBe(
        inset + FLOATING_BAR_MARGIN,
      );
      expect(FLOATING_BAR_MARGIN).toBeGreaterThanOrEqual(8);
    });

    it('puts an emerald-tinted capsule behind the current tab, holding its icon and its word', async () => {
      const tree = await laidOut(1);
      const pill = flat(
        tree.root.findAll(
          n => n.props.testID === 'tab-pill' && typeof n.type === 'string',
        )[0],
      );
      expect(pill.backgroundColor).toBe('#E6F4EA');
      // (328 - 2 x 4 padding) / 3 tabs = 106.67 per tab, less the gap to its neighbours.
      expect(pill.width).toBeCloseTo((328 - 8) / 3 - CAPSULE_GAP);
      // Nearly the whole height of the bar, so it wraps the word under the icon as well.
      expect(pill.top).toBe(CAPSULE_INSET);
      expect(pill.bottom).toBe(CAPSULE_INSET);
      expect(pill.borderRadius).toBe(
        (FLOATING_BAR_HEIGHT - 2 * CAPSULE_INSET) / 2,
      );
    });

    it('shows the current word and icon in emerald and the others in a neutral ink', async () => {
      const tree = await render(<FloatingTabBar {...build(2).props} />);
      const wordColours = (word: string) =>
        tree.root
          .findAll(n => n.type === Text && n.props.children === word)
          .map(n => flat(n).color);
      expect(wordColours('Account')).toEqual(
        expect.arrayContaining(['#047857', '#374151']),
      );
      // Both looks of every word are drawn; the cross-fade decides which one shows (see the opacity test above).
      expect(wordColours('نقشه')).toEqual(
        expect.arrayContaining(['#047857', '#374151']),
      );
    });

    it('gives the icon a small pop half-way through a change of tab, and no lift or dot', async () => {
      expect(ICON_POP).toBeGreaterThan(1);
      expect(ICON_POP).toBeLessThanOrEqual(1.2);
      const tree = await render(<FloatingTabBar {...build(0).props} />);
      expect(
        tree.root.findAll(n => /^tab-(lift|dot)-/.test(n.props.testID ?? '')),
      ).toHaveLength(0);
      const pop = tree.root.findAll(
        n => n.props.testID === 'tab-pop-Home' && typeof n.type === 'string',
      )[0];
      const scale = (flat(pop).transform as { scale: number }[])[0].scale;
      expect(scale).toBe(1); // at rest it is full size, active or not
    });

    it('springs the new tab in and the old one out when the tab changes', async () => {
      const spring = jest.spyOn(Animated, 'spring');
      const first = build(0);
      const tree = await render(<FloatingTabBar {...first.props} />);
      spring.mockClear();
      const second = build(1);
      await act(async () => {
        tree.update(<FloatingTabBar {...second.props} />);
      });
      // One spring per tab for its "active" amount (0 or 1); all on the native driver.
      const targets = spring.mock.calls.map(([, config]) => config.toValue);
      expect(targets).toEqual(expect.arrayContaining([0, 1]));
      for (const [, config] of spring.mock.calls) {
        expect(config.useNativeDriver).toBe(true);
      }
      spring.mockRestore();
    });
  });

  it('shows a badge, and goes to a tab on press unless it is the one you are on', async () => {
    const { props, emit, navigate } = build(0);
    const tree = await render(<FloatingTabBar {...props} />);
    expect(allText(tree.root)).toContain('۳');
    const tap = (name: string) =>
      act(async () => {
        tree.root.findByProps({ testID: `tab-${name}` }).props.onPress();
      });
    await tap('Home');
    expect(navigate).not.toHaveBeenCalled();
    await tap('Messages');
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: 'Messages-key' }),
    );
    expect(navigate).toHaveBeenCalledWith('Messages', undefined);
  });

  it('does not navigate when a listener prevented the press', async () => {
    const { props, emit, navigate } = build(0);
    emit.mockReturnValue({ defaultPrevented: true });
    const tree = await render(<FloatingTabBar {...props} />);
    await act(async () => {
      tree.root.findByProps({ testID: 'tab-Account' }).props.onPress();
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('floats over the map on Home, and sits in its own space on the other tabs', async () => {
    const hostStyle = (index: number) => {
      const { props } = build(index);
      return render(<FloatingTabBar {...props} />).then(
        tree =>
          StyleSheet.flatten(
            tree.root.findAll(n => n.props.pointerEvents === 'box-none')[0]
              .props.style,
          ) as { position?: string },
      );
    };
    expect((await hostStyle(0)).position).toBe('absolute');
    expect((await hostStyle(1)).position).toBeUndefined();
  });

  it('slides away, and stops taking touches, when the screen asks for it', async () => {
    const { props } = build(0, { tabBarStyle: { display: 'none' } });
    const tree = await render(<FloatingTabBar {...props} />);
    const host = tree.root.findAll(
      n => n.props.pointerEvents === 'none' && typeof n.type === 'string',
    )[0];
    const style = StyleSheet.flatten(host.props.style) as {
      opacity: number;
      transform: { translateY: number }[];
    };
    expect(style.opacity).toBe(0);
    expect(style.transform[0].translateY).toBeGreaterThan(0);
  });

  it('stays put and takes touches while the screen does not ask', async () => {
    const { props } = build(0);
    const tree = await render(<FloatingTabBar {...props} />);
    expect(
      tree.root.findAll(n => n.props.pointerEvents === 'none'),
    ).toHaveLength(0);
  });

  it('works out how far up its top edge reaches, from the safe area', () => {
    expect(floatingBarClearance(0)).toBe(
      FLOATING_BAR_HEIGHT + FLOATING_BAR_MARGIN,
    );
    expect(floatingBarClearance(34)).toBe(
      FLOATING_BAR_HEIGHT + 34 + FLOATING_BAR_MARGIN,
    );
  });
});
