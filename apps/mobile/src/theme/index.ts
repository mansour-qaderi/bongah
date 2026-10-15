import { StyleSheet, type TextStyle } from 'react-native';
import type { DealType } from '@bongah/shared-types';

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
  /** A faint emerald wash: the capsule behind the current tab, selected rows, quiet highlights. */
  primaryTint: '#E6F4EA',
  accent: '#D97706',
  accentBright: '#F59E0B',
  accentSoft: '#FEF3C7',
  accentText: '#B45309',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  text: '#111827',
  textMuted: '#6B7280',
  /** Neutral ink for things that are quiet but must still read clearly: the tabs that are not current. */
  textSecondary: '#374151',
  textOnPrimary: '#FFFFFF',
  textOnAccent: '#111827',
  border: '#E5E7EB',
  /** The faintest edge: a card's outline, which the shadow does the real work of defining. */
  hairline: 'rgba(15,23,42,0.06)',
  /** Blue for rentals and for "you are here"; the soft and text shades are for badges. */
  info: '#2563EB',
  infoSoft: '#DBEAFE',
  infoText: '#1D4ED8',
  danger: '#C0392B',
  dangerSoft: '#FBE9E7',
  success: '#1E8E5A',
  successSoft: '#E3F4EA',
  successText: '#166534',
  /** Gold's darkest shade, for words on the soft gold. */
  warningText: '#92400E',
  /** The quiet grey: neutral badges and resting buttons. */
  neutralSoft: '#F3F4F6',
  neutralText: '#4B5563',
  /** Grab handles and other small hairline furniture. */
  handle: '#D1D5DB',
  /** Near-black ink for map labels and clusters, so they never compete with the deal colours. */
  ink: '#0F172A',
  overlay: 'rgba(0,0,0,0.45)',
  /** The tab bar's white: slightly see-through, so the page or map shows faintly behind it. */
  surfaceGlass: 'rgba(255,255,255,0.94)',
} as const;

/**
 * One colour per kind of deal, used for the map markers, the quick filter and anywhere a listing says what it
 * is offered for. Emerald (the brand) is a sale; blue is a rental; gold is a "growi" (pledge/lease). White
 * icons sit on all three at 3:1 or better (checked in __tests__/theme.test.ts).
 */
export const dealColors = {
  SALE: { main: colors.primary, soft: colors.primarySoft },
  RENT: { main: colors.info, soft: colors.infoSoft },
  MORTGAGE_GROWI: { main: colors.accent, soft: colors.accentSoft },
} as const satisfies Record<DealType, { main: string; soft: string }>;

/**
 * Page backgrounds: white at the top easing into the page colour, so screens have a little depth without a
 * visible band. `backgroundColor` stays as the fallback wherever a gradient is not drawn.
 */
export const gradients = {
  screen: 'linear-gradient(to bottom, #FFFFFF 0%, #F9FAFB 38%)',
  /** The emerald profile card: the brand colour deepening towards one corner. */
  hero: 'linear-gradient(135deg, #059669 0%, #047857 45%, #065F46 100%)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;
/** Corners: `md` for tiles and fields, `lg` for cards, `xl` for larger hero surfaces, `sheet` for the top of a bottom sheet. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  sheet: 24,
  pill: 999,
} as const;

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
  /** Cards and fields at rest: a soft lift, no hard edge. */
  card: {
    shadowColor: '#064E3B',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  /** The floating tab bar: a wide, faint lift, so it hovers rather than sits. */
  bar: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  /** The capsule behind the current tab: a soft emerald glow rather than a grey drop shadow. */
  capsule: {
    shadowColor: '#047857',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  /**
   * For things that float over the map (the + button, "my location", the status chips): wider, softer and a
   * little lower than `card`, tinted with the brand's dark emerald so they lift off the map without a hard edge.
   */
  floating: {
    shadowColor: '#064E3B',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});

/**
 * Phone numbers, codes and URLs are typed left-to-right even in an RTL app.
 * Spread this into the style of such inputs.
 */
export const ltrInput = { writingDirection: 'ltr' } satisfies TextStyle;

/**
 * The surfaces screens are built from, so every card, tile and row has the same corners, edge and lift: crisp
 * white, a hairline edge and a soft shadow that does the real work. A card (16-point corners) holds a group of
 * things; a tile (12) is a smaller box inside one or a row in a list.
 */
export const surfaces = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    ...shadow.card,
  },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    ...shadow.card,
  },
});
