import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import Logo, { LOGO_GEOMETRY } from '../src/components/Logo';
import SplashScreen, {
  SPLASH_DURATION_MS,
} from '../src/screens/splash/SplashScreen';
import { colors, fonts } from '../src/theme';
import { allText } from '../test-utils';

declare const __dirname: string;

const fs = require('node:fs') as {
  readFileSync(p: string, e: 'utf8'): string;
};
const path = require('node:path') as { join(...p: string[]): string };
const read = (...parts: string[]) =>
  fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

const { pin, pinLeft, roof, roofLeft, chimney, ring } = LOGO_GEOMETRY;

/** Host elements only (the test renderer also lists the composite wrappers around them). */
const host = (root: ReactTestInstance, testID: string) =>
  root.findAll(n => n.props.testID === testID && typeof n.type === 'string');

/** An animated style value as a plain number (the renderer may hand over the Animated.Value itself). */
const numeric = (v: unknown): number =>
  typeof v === 'number' ? v : (v as { __getValue(): number }).__getValue();

// Every tree is unmounted after its test: a splash left mounted keeps its animation timers running, and when they fire
// later (after this file is torn down) they throw inside whichever test file the same worker is running by then.
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

async function render(element: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(element);
  });
  mounted.push(renderer);
  return renderer;
}

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

beforeAll(async () => {
  await initI18n();
});

// ─────────────────────────── the Logo component ───────────────────────────

describe('Logo', () => {
  const find = (tree: ReactTestRenderer.ReactTestRenderer, d: string) =>
    tree.root.findAll(n => n.props.d === d);

  it('draws the roof, the chimney, the pin with its hole and the ground ring from the shared geometry', async () => {
    const tree = await render(<Logo />);
    for (const d of [roof, roofLeft, pin, pinLeft]) {
      expect(find(tree, d).length).toBeGreaterThan(0);
    }
    expect(find(tree, pin)[0].props.fillRule).toBe('evenodd');
    expect(
      tree.root.findAll(
        n =>
          n.props.x === chimney.x &&
          n.props.y === chimney.y &&
          n.props.width === chimney.width &&
          n.props.height === chimney.height,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAll(n => n.props.rx === ring.rx && n.props.ry === ring.ry)
        .length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAll(n => n.props.viewBox === LOGO_GEOMETRY.viewBox).length,
    ).toBeGreaterThan(0);
  });

  it('is two emeralds by default, one flat colour when given one, and the ring can go', async () => {
    expect(colors.primary).toBe('#047857');
    const plain = await render(<Logo />);
    expect(find(plain, pin)[0].props.fill).toBe('#047857');
    expect(find(plain, pinLeft)[0].props.fill).toBe(colors.primaryDark);
    expect(find(plain, roofLeft)[0].props.fill).toBe(colors.primaryDark);
    expect(
      plain.root.findAll(n => n.props.rx === ring.rx)[0].props.stroke,
    ).toBe(colors.border);

    const custom = await render(
      <Logo size={40} color="#112233" ring={false} />,
    );
    for (const d of [roof, roofLeft, pin, pinLeft]) {
      expect(find(custom, d)[0].props.fill).toBe('#112233');
    }
    expect(custom.root.findAll(n => n.props.rx === ring.rx)).toHaveLength(0);
    expect(
      custom.root.findAll(n => n.props.width === 40).length,
    ).toBeGreaterThan(0);

    const toned = await render(<Logo color="#112233" shadeColor="#001122" />);
    expect(find(toned, pinLeft)[0].props.fill).toBe('#001122');

    expect(
      plain.root.findAll(n => n.props.width === 96).length,
    ).toBeGreaterThan(0);
  });

  it('writes the optional label in Vazirmatn bold, in the deep emerald unless told otherwise', async () => {
    const bare = await render(<Logo />);
    expect(host(bare.root, 'logo-label')).toHaveLength(0);

    const tree = await render(<Logo label="بنگاه معاملات" />);
    expect(allText(tree.root)).toContain('بنگاه معاملات');
    const label = host(tree.root, 'logo-label')[0];
    const style = StyleSheet.flatten(label.props.style);
    expect(style.fontFamily).toBe(fonts.bold);
    expect(style.color).toBe(colors.primaryDark);

    const inked = await render(<Logo label="بنگاه" labelColor="#123456" />);
    expect(
      StyleSheet.flatten(host(inked.root, 'logo-label')[0].props.style).color,
    ).toBe('#123456');
  });

  it('is one image to a screen reader, named by the label when there is one', async () => {
    const named = await render(<Logo label="بنگاه معاملات" />);
    const image = named.root.findAll(
      n => n.props.accessibilityRole === 'image' && typeof n.type === 'string',
    )[0];
    expect(image.props.accessibilityLabel).toBe('بنگاه معاملات');
    expect(image.props.accessible).toBe(true);

    const bare = await render(<Logo />);
    expect(
      bare.root.findAll(n => n.props.accessibilityRole === 'image')[0].props
        .accessibilityLabel,
    ).toBe('Bongah');

    const custom = await render(<Logo accessibilityLabel="لوگو" />);
    expect(
      custom.root.findAll(n => n.props.accessibilityRole === 'image')[0].props
        .accessibilityLabel,
    ).toBe('لوگو');
  });

  it('keeps every number of the drawing on its 100 x 100 grid, with the pin under the roof', () => {
    const numbers = `${pin} ${pinLeft} ${roof} ${roofLeft}`
      .match(/-?\d+(\.\d+)?/g)!
      .map(Number);
    for (const n of numbers) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(100);
    }
    expect(ring.cy + ring.ry + ring.strokeWidth / 2).toBeLessThanOrEqual(100);
    expect(ring.cx - ring.rx - ring.strokeWidth / 2).toBeGreaterThanOrEqual(0);
    // The chimney stands on the roof band: its top is above the apex of the pin and inside the roof's width.
    expect(chimney.x).toBeGreaterThan(50);
    expect(chimney.x + chimney.width).toBeLessThan(90.5);
    // The roof band reaches further out than the pin's shoulders.
    expect(roofPoints()[0].x).toBeLessThan(23.4);
  });
});

/** The roof's corner points, outer left eave first. */
function roofPoints() {
  return [...roof.matchAll(/([\d.]+) ([\d.]+)/g)]
    .map(m => ({
      x: Number(m[1]),
      y: Number(m[2]),
    }))
    .sort((a, b) => a.x - b.x);
}

// ─────────────────────────── the opening screen ───────────────────────────

describe('SplashScreen', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const props = () => {
    const navigation = { reset: jest.fn() };
    return {
      navigation,
      element: (
        <SplashScreen
          {...({
            navigation,
            route: { key: 's', name: 'Splash' },
          } as unknown as React.ComponentProps<typeof SplashScreen>)}
        />
      ),
    };
  };

  it('stays for 1.8 seconds, then resets the stack to the main tabs exactly once', async () => {
    expect(SPLASH_DURATION_MS).toBe(1800);
    jest.useFakeTimers();
    const { navigation, element } = props();
    await render(element);

    await ReactTestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(SPLASH_DURATION_MS - 1);
    });
    expect(navigation.reset).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(navigation.reset).toHaveBeenCalledTimes(1);
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Tabs' }],
    });

    await ReactTestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });
    expect(navigation.reset).toHaveBeenCalledTimes(1);
  });

  it('does not navigate if it goes away first', async () => {
    jest.useFakeTimers();
    const { navigation, element } = props();
    const tree = await render(element);
    await ReactTestRenderer.act(async () => {
      tree.unmount();
    });
    await ReactTestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(SPLASH_DURATION_MS * 2);
    });
    expect(navigation.reset).not.toHaveBeenCalled();
  });

  it('shows the name and the tagline in Dari, with the logo, on a white screen', async () => {
    const { element } = props();
    const tree = await render(element);
    const text = allText(tree.root);
    expect(text).toContain('بنگاه معاملات');
    expect(text).toContain('راهنمای معاملات و املاک');
    expect(host(tree.root, 'splash-logo')).toHaveLength(1);
    expect(
      tree.root.findAll(n => n.props.testID === 'logo-mark').length,
    ).toBeGreaterThan(0);
    expect(
      StyleSheet.flatten(host(tree.root, 'splash-screen')[0].props.style)
        .backgroundColor,
    ).toBe('#FFFFFF');
  });

  it('starts hidden and a little small, then fades and springs in (never past 1.0)', async () => {
    jest.useFakeTimers();
    const { element } = props();
    const tree = await render(element);
    const logo = () =>
      StyleSheet.flatten(host(tree.root, 'splash-logo')[0].props.style);
    const text = () =>
      StyleSheet.flatten(host(tree.root, 'splash-text')[0].props.style);

    expect(numeric(logo().opacity)).toBeLessThan(1);
    const start = numeric((logo().transform as { scale: unknown }[])[0].scale);
    expect(start).toBeLessThan(1);
    expect(numeric(text().opacity)).toBe(0);

    let biggest = start;
    for (let i = 0; i < 40; i += 1) {
      await ReactTestRenderer.act(async () => {
        await jest.advanceTimersByTimeAsync(50);
      });
      biggest = Math.max(
        biggest,
        numeric((logo().transform as { scale: unknown }[])[0].scale),
      );
    }
    expect(biggest).toBeLessThanOrEqual(1);
  });

  it('shows everything at once when the phone asks for reduced motion', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    const { element } = props();
    const tree = await render(element);
    const logo = StyleSheet.flatten(
      host(tree.root, 'splash-logo')[0].props.style,
    );
    const text = StyleSheet.flatten(
      host(tree.root, 'splash-text')[0].props.style,
    );
    expect(numeric(logo.opacity)).toBe(1);
    expect(numeric((logo.transform as { scale: unknown }[])[0].scale)).toBe(1);
    expect(numeric(text.opacity)).toBe(1);
  });
});

// ─────────────────────────── language files ───────────────────────────

describe('splash texts', () => {
  it('exist in both languages, and the Dari ones are the agreed wording', () => {
    expect(prs.splash).toEqual({
      name: 'بنگاه معاملات',
      tagline: 'راهنمای معاملات و املاک',
    });
    expect(Object.keys(ps.splash).sort()).toEqual(
      Object.keys(prs.splash).sort(),
    );
    for (const value of Object.values(ps.splash)) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────── launcher icon files ───────────────────────────

describe('launcher icon assets', () => {
  const svg = (name: string) => read('assets', 'branding', name);
  const files = [
    'logo.svg',
    'app-icon.svg',
    'app-icon-android-foreground.svg',
    'app-icon-android-monochrome.svg',
  ];

  it.each(files)(
    '%s draws the same roof, chimney and pin as the Logo component',
    name => {
      const source = svg(name);
      expect(source).toContain(`d="${roof}"`);
      expect(source).toContain(`d="${pin}"`);
      expect(source).toContain('fill-rule="evenodd"');
      expect(source).toContain(
        `<rect x="${chimney.x}" y="${chimney.y}" width="${chimney.width}" height="${chimney.height}"`,
      );
    },
  );

  it.each(files.filter(f => !f.includes('monochrome')))(
    '%s has the two emerald tones of the theme',
    name => {
      const source = svg(name).toUpperCase();
      expect(source).toContain(colors.primary);
      expect(source).toContain(colors.primaryDark);
      expect(source).toContain(`d="${roofLeft.toUpperCase()}"`.toUpperCase());
      expect(source).toContain(pinLeft.toUpperCase());
    },
  );

  it('keeps the ground ring on the full logo only, and the monochrome layer to one colour', () => {
    expect(svg('logo.svg')).toContain('<ellipse');
    for (const name of [
      'app-icon.svg',
      'app-icon-android-foreground.svg',
      'app-icon-android-monochrome.svg',
    ]) {
      expect(svg(name)).not.toContain('<ellipse');
    }
    const mono = svg('app-icon-android-monochrome.svg').toUpperCase();
    expect(mono).not.toContain(colors.primary);
    expect(mono).not.toContain(colors.primaryDark);
  });

  it('has an opaque white 1024 square for iOS, with the mark well inside it', () => {
    const source = svg('app-icon.svg');
    expect(source).toContain('width="1024" height="1024"');
    expect(source).toContain(
      '<rect width="1024" height="1024" fill="#FFFFFF"/>',
    );
    const box = markBox(source);
    for (const edge of [
      box.left,
      box.top,
      1024 - box.right,
      1024 - box.bottom,
    ]) {
      expect(edge).toBeGreaterThanOrEqual(1024 * 0.1);
    }
    // Centred, within a pixel.
    expect(Math.abs(box.left - (1024 - box.right))).toBeLessThan(1);
    expect(Math.abs(box.top - (1024 - box.bottom))).toBeLessThan(1);
  });

  it.each([
    'app-icon-android-foreground.svg',
    'app-icon-android-monochrome.svg',
  ])(
    '%s keeps the whole mark inside the 66 dp safe circle of the 108 dp canvas',
    name => {
      const source = svg(name);
      expect(source).toContain('width="108" height="108"');
      const { scale, dx, dy } = transformOf(source);
      // The mark's far points: the roof's apex and eaves, the chimney's top corners and the pin's tip.
      const points: [number, number][] = [
        [50, 4.6],
        [9.5, 36.6],
        [90.5, 36.6],
        [chimney.x, chimney.y],
        [chimney.x + chimney.width, chimney.y],
        [50, 86.7],
      ];
      for (const [x, y] of points) {
        expect(
          Math.hypot(dx + x * scale - 54, dy + y * scale - 54),
        ).toBeLessThanOrEqual(33);
      }
    },
  );

  it('has a plain white background layer', () => {
    const source = svg('app-icon-android-background.svg');
    expect(source).toContain('fill="#FFFFFF"');
    expect(source).not.toContain('<path');
  });

  it('is documented, for Android and iOS', () => {
    const guide = read('assets', 'branding', 'README.md');
    for (const needle of [
      'mipmap-anydpi-v26',
      'ic_launcher_foreground',
      'AppIcon.appiconset',
      '1024',
    ]) {
      expect(guide).toContain(needle);
    }
  });
});

/** `translate(dx dy) scale(s)` of the group that holds the mark. */
function transformOf(source: string) {
  const m = source.match(
    /transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)"/,
  );
  if (!m) throw new Error('no transform on the mark group');
  return { dx: Number(m[1]), dy: Number(m[2]), scale: Number(m[3]) };
}

/** Where the mark's bounding box (x 9.5..90.5, y 4.6..86.7 on the 100 grid, no ring) lands on the canvas. */
function markBox(source: string) {
  const { dx, dy, scale } = transformOf(source);
  return {
    left: dx + 9.5 * scale,
    right: dx + 90.5 * scale,
    top: dy + 4.6 * scale,
    bottom: dy + 86.7 * scale,
  };
}

// ─────────────────────────── the navigation bar stays as it was ───────────────────────────

describe('the floating bottom navigation bar', () => {
  it('knows nothing about the splash screen or the logo', () => {
    for (const file of ['FloatingTabBar.tsx', 'MainTabs.tsx']) {
      expect(read('src', 'navigation', file)).not.toMatch(
        /Splash|Logo|branding/,
      );
    }
  });

  it('is not part of the splash: the splash is the first stack screen, before the tabs', () => {
    const root = read('src', 'navigation', 'RootNavigator.tsx');
    expect(root).toMatch(/initialRouteName="Splash"/);
    expect(root.indexOf('name="Splash"')).toBeGreaterThan(-1);
    expect(root.indexOf('name="Splash"')).toBeLessThan(
      root.indexOf('name="Tabs"'),
    );
  });
});
