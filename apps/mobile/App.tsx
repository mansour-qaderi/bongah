import React, { useEffect, useState } from 'react';
import { AppState, StatusBar } from 'react-native';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from './src/api/hooks';
import { AuthProvider } from './src/auth/AuthContext';
import { ChatProvider } from './src/chat/ChatProvider';
import AppLoader from './src/components/AppLoader';
import { ToastHost } from './src/components/Toast';
import i18n, { initI18n } from './src/i18n';
import { isRtlActive } from './src/i18n/rtl';
import { linking } from './src/navigation/linking';
import RootNavigator from './src/navigation/RootNavigator';
import PushRegistrar from './src/push/PushRegistrar';
import { colors } from './src/theme';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

export default function App() {
  const [ready, setReady] = useState(false);

  // Translations must be loaded before anything that calls t() renders.
  useEffect(() => {
    initI18n().then(() => setReady(true));
  }, []);

  // Tell React Query when the app returns to the foreground, so a payment that finished in
  // the HesabPay page is noticed as soon as the user comes back.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      focusManager.setFocused(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (__DEV__ && !isRtlActive()) {
      console.warn(
        'Bongah: the layout is not right-to-left. Fully close and reopen the app once; ' +
          'if it persists, the native RTL setup (MainApplication.kt / AppDelegate.swift) is missing.',
      );
    }
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      {ready ? (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ChatProvider>
              <PushRegistrar />
              {/* `linking`: shared listing links open the listing (see navigation/linking.ts). */}
              <NavigationContainer
                theme={navigationTheme}
                linking={linking}
                fallback={
                  <AppLoader fullscreen label={i18n.t('common.loading')} />
                }
              >
                <RootNavigator />
              </NavigationContainer>
              {/* Messages such as "could not save" are drawn here, over whatever screen is open. */}
              <ToastHost />
            </ChatProvider>
          </AuthProvider>
        </QueryClientProvider>
      ) : (
        // The languages are not loaded yet, so this one has no words (the logo is the loader).
        <AppLoader fullscreen />
      )}
    </SafeAreaProvider>
  );
}
