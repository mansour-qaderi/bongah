import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useFormat } from '../i18n/useFormat';
import { onPushTokenRefresh } from './firebase';
import { syncPushDevice } from './registration';

/**
 * Keeps the server's idea of "this phone" up to date while someone who wants the morning messages is signed in:
 * at start-up, when the app language changes, when Firebase issues a new token, and when the app comes back to the
 * foreground (which is how a permission switched on in system settings gets noticed). It never shows a prompt:
 * asking is done from the welcome card and the settings switch, where the person can see why.
 */
export default function PushRegistrar() {
  const { user } = useAuth();
  const { language } = useFormat();
  const userId = user?.id;
  // Saved sessions from before this setting existed have no value: that means "on", like the default.
  const wanted = Boolean(userId) && user?.enable_daily_motivation !== false;

  useEffect(() => {
    if (!wanted) return;
    syncPushDevice(language);
    const unsubscribe = onPushTokenRefresh(() =>
      syncPushDevice(language, { force: true }),
    );
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') syncPushDevice(language);
    });
    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, [wanted, userId, language]);

  return null;
}
