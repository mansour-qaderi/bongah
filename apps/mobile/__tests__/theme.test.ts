import * as theme from '../src/theme';
import {
  colors,
  dealColors,
  fontFamilyFor,
  fonts,
  surfaces,
  typography,
} from '../src/theme';

// The app has no @types/node (it is a React Native project); this test only needs a few Node calls.
declare const __dirname: string;

/** WCAG relative luminance / contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('colour palette', () => {
  it('uses the brand colours', () => {
    expect(colors.primary).toBe('#047857');
    expect(colors.primaryDark).toBe('#065F46');
    expect(colors.accent).toBe('#D97706');
    expect(colors.accentBright).toBe('#F59E0B');
    expect(colors.background).toBe('#FFFFFF');
  });

  // Every pairing the app draws as text must reach AA (4.5:1 for normal text).
  it.each([
    ['white on primary (buttons)', colors.textOnPrimary, colors.primary],
    ['primary on the page background', colors.primary, colors.background],
    ['primary on a card', colors.primary, colors.surface],
    ['emerald words on white (quiet buttons)', colors.primary, colors.surface],
    ['white on danger (error accents)', colors.surface, colors.danger],
    ['danger words on white (danger buttons)', colors.danger, colors.surface],
    ['white on blue (rent badge)', colors.textOnPrimary, colors.info],
    [
      'neutral words on white (neutral badges)',
      colors.neutralText,
      colors.surface,
    ],
    [
      'secondary text on white (form labels)',
      colors.textSecondary,
      colors.surface,
    ],
    ['body text on the page', colors.text, colors.background],
    ['muted text on the page', colors.textMuted, colors.background],
    ['muted text on a card', colors.textMuted, colors.surface],
    ['dark text on gold (badges)', colors.textOnAccent, colors.accent],
    ['dark text on bright gold', colors.textOnAccent, colors.accentBright],
    ['gold words on a card', colors.accentText, colors.surface],
  ])('%s is readable', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('documents why plain gold is never used for small text', () => {
    expect(contrast(colors.textOnPrimary, colors.accent)).toBeLessThan(4.5);
    expect(contrast(colors.accent, colors.surface)).toBeLessThan(4.5);
  });
});

describe('the flat look', () => {
  it('has no pale-green or pastel tint tokens for the screens, and no gradients', () => {
    for (const gone of [
      'primarySoft',
      'successSoft',
      'accentSoft',
      'infoSoft',
      'dangerSoft',
    ]) {
      expect(colors).not.toHaveProperty(gone);
    }
    expect(Object.keys(theme)).not.toContain('gradients');
  });

  it("keeps the floating tab bar's own look (its tint, glass and shadow tokens) exactly as it was", () => {
    // The bottom bar is deliberately left alone by the flat redesign. Its tokens stay, and
    // flatUi.test.tsx checks that nothing but the bar itself uses them.
    expect(colors.primaryTint).toBe('#E6F4EA');
    expect(colors.surfaceGlass).toBe('rgba(255,255,255,0.94)');
    expect(Object.keys(theme)).toContain('shadow');
  });

  it('draws every surface with a 1 px border and no shadow', () => {
    for (const surface of Object.values(surfaces)) {
      expect(surface.backgroundColor).toBe('#FFFFFF');
      expect(surface.borderWidth).toBe(1);
      expect(surface.borderColor).toBe(colors.border);
      expect(surface).not.toHaveProperty('shadowOpacity');
      expect(surface).not.toHaveProperty('elevation');
    }
  });

  it('keeps cards and tiles inside the 12-16 point corner range', () => {
    expect(surfaces.card.borderRadius).toBe(16);
    expect(surfaces.tile.borderRadius).toBe(12);
  });
});

describe('deal colours', () => {
  it.each(Object.entries(dealColors))(
    'a white icon is visible on the %s marker',
    (_deal, { main }) => {
      // 3:1 is the bar for graphics (WCAG 1.4.11); the marker also has a white ring.
      expect(contrast('#FFFFFF', main)).toBeGreaterThanOrEqual(3);
    },
  );

  // The solid deal badges draw words on these fills, so the ink must reach AA text contrast (4.5:1).
  it.each(Object.entries(dealColors))(
    'the words on the %s badge are readable',
    (_deal, { main, on }) => {
      expect(contrast(on, main)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('keeps the three deals apart', () => {
    const mains = Object.values(dealColors).map(c => c.main);
    expect(new Set(mains).size).toBe(mains.length);
  });
});

describe('fonts', () => {
  it('picks the font file for a weight, so Android never fakes a bold', () => {
    expect(fontFamilyFor('400')).toBe(fonts.regular);
    expect(fontFamilyFor('normal')).toBe(fonts.regular);
    expect(fontFamilyFor('500')).toBe(fonts.regular);
    expect(fontFamilyFor('600')).toBe(fonts.semibold);
    expect(fontFamilyFor('700')).toBe(fonts.bold);
    expect(fontFamilyFor('bold')).toBe(fonts.bold);
    expect(fontFamilyFor('900')).toBe(fonts.bold);
  });

  it('gives every text variant a font and no fontWeight', () => {
    for (const style of Object.values(typography)) {
      expect(Object.values(fonts)).toContain(style.fontFamily);
      expect(style).not.toHaveProperty('fontWeight');
    }
  });

  it('uses file names that exist in assets/fonts', () => {
    const fs = require('node:fs') as { existsSync(p: string): boolean };
    const path = require('node:path') as { join(...p: string[]): string };
    for (const family of Object.values(fonts)) {
      expect(
        fs.existsSync(
          path.join(__dirname, '..', 'assets', 'fonts', `${family}.ttf`),
        ),
      ).toBe(true);
    }
  });
});
