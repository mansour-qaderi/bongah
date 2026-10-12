import { StyleSheet, type TextStyle } from 'react-native';

export const colors = {
  primary: '#0F6B4F',
  primaryDark: '#0A4D39',
  primarySoft: '#E3F2EC',
  accent: '#C8962E',
  accentSoft: '#FBF2DC',
  background: '#F6F7F5',
  surface: '#FFFFFF',
  text: '#1B1F1D',
  textMuted: '#6B7571',
  textOnPrimary: '#FFFFFF',
  border: '#E2E6E3',
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
 * Arabic-script text needs more line height than Latin text, otherwise dots and diacritics
 * collide with the line above. Sizes and heights live here so screens never invent their own.
 */
export const typography = {
  title: { fontSize: 24, lineHeight: 36, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
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
