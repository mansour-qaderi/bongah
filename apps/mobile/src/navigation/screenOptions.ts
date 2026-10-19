import { colors, fonts } from '../theme';

/**
 * The header every screen with a title bar shares: white, no hard shadow line, the title in Vazirmatn
 * bold, and emerald for the back arrow and header buttons. Page content sits on the app background.
 */
export const headerOptions = {
  headerTitleAlign: 'center',
  headerShadowVisible: false,
  headerStyle: { backgroundColor: colors.surface },
  headerTitleStyle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
  },
  headerTintColor: colors.primary,
} as const;

/** For stack navigators (react-native-stack's page background is `contentStyle`). */
export const stackScreenOptions = {
  ...headerOptions,
  contentStyle: { backgroundColor: colors.background },
} as const;
