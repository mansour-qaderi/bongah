import { I18nManager } from 'react-native';

/**
 * Dari and Pashto are both right-to-left, so the app is RTL from its very first launch.
 *
 * React Native applies these flags to the NEXT process start, not the running one — which is
 * why the native entry points (MainApplication.kt, AppDelegate.swift) also switch RTL on
 * before React Native loads. This JS call is the safety net for platforms/builds where that
 * native step is missing. `isRtlActive` lets the app notice if neither worked.
 */
export function configureRtl(): void {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

/** True when the running layout is actually right-to-left. */
export const isRtlActive = (): boolean => I18nManager.isRTL;
