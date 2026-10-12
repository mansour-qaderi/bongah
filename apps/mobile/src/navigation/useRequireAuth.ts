import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';

/**
 * Browsing is public; contacting an owner, listing and paying need an account.
 * `requireAuth(action)` runs the action when signed in, otherwise opens the sign-in flow
 * (the person taps the action again afterwards).
 */
export function useRequireAuth() {
  const { status } = useAuth();
  const navigation = useNavigation();
  return useCallback(
    (action: () => void) => {
      if (status === 'signedIn') action();
      else navigation.navigate('Auth');
    },
    [status, navigation],
  );
}
