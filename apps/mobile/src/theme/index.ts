import { StyleSheet, type TextStyle } from 'react-native';

/**
 * Emerald is the brand; gold marks what is paid or premium (featured, selected, stars).
 *
 * Gold needs care: white on #D97706 is only 3.2:1 (AA text needs 4.5), so
 *  - `accent` / `accentBright` are for fills, borders and icons, with `textOnAccent` on top of them;
 *  - `accentText` is the darker gold (5.0:1 on white) for gold-coloured words.
 * __tests__/theme.test.ts checks these ratios, so a future colour change cannot silently break them.
 */
export const colors = {
  primary: '#047857',
  primaryDark: '#065F46',
  primarySoft: '#D1FAE5',
  accent: '#D97706',
  accentBright: '#F59E0B',
  accentSoft: '#FEF3C7',
  accentText: '#B45309',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  text: '#111827',
  textMuted: '#6B7280',
  textOnPrimary: '#FFFFFF',
  textOnAccent: '#111827',
  border: '#E5E7EB',
  danger: '#C0392B',
  dangerSoft: '#FBE9E7',
  success: '#1E8E5A',
  successSoft: '#E3F4EA',
  overlay: 'rgba(0,0,0,0.45)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/**
 * Vazirmatn (SIL Open Font License, files in assets/fonts) covers Dari and Pashto letters, including
 * the Pashto-only ones, and has the Persian digits the app shows.
 *
 * A custom font is one file per weight, and the family name is the file name without ".ttf" (that is
 * how Android finds it; on iOS it is the font's PostScript name, which Vazirmatn makes the same).
 * So weight is chosen by family here, never by `fontWeight`: on Android a weight on a custom family
 * makes the system fake a bold from the regular file. If the files are not linked into the native
 * projects yet, React Native quietly uses the system font, so nothing breaks, it just looks different.
 */
export const fonts = {
  regular: 'Vazirmatn-Regular',
  semibold: 'Vazirmatn-SemiBold',
  bold: 'Vazirmatn-Bold',
} as const;

/** The family for a CSS-style weight: 100-500 regular, 600 semibold, 700 and up (or "bold") bold. */
export function fontFamilyFor(weight: TextStyle['fontWeight']): string {
  if (weight === 'bold') return fonts.bold;
  const n = Number(weight);
  if (!Number.isFinite(n) || n <= 500) return fonts.regular;
  return n >= 700 ? fonts.bold : fonts.semibold;
}

/**
 * Arabic-script text needs more line height than Latin text, otherwise dots and diacritics
 * collide with the line above. Sizes and heights live here so screens never invent their own.
 */
export const typography = {
  title: { fontSize: 24, lineHeight: 36, fontFamily: fonts.bold },
  heading: { fontSize: 18, lineHeight: 28, fontFamily: fonts.bold },
  body: { fontSize: 15, lineHeight: 24, fontFamily: fonts.regular },
  label: { fontSize: 14, lineHeight: 22, fontFamily: fonts.semibold },
  caption: { fontSize: 12, lineHeight: 18, fontFamily: fonts.regular },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof typography;

export const shadow = StyleSheet.create({
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});

/**
 * Phone numbers, codes and URLs are typed left-to-right even in an RTL app.
 * Spread this into the style of such inputs.
 */
export const ltrInput = { writingDirection: 'ltr' } satisfies TextStyle;
