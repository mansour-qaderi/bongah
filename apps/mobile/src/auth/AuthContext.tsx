import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { User, VerifyOtpResponse } from '@bongah/shared-types';
import { setAuthToken, setUnauthorizedHandler } from '../api/client';
import { getMe } from '../api/endpoints';
import { queryClient, queryKeys } from '../api/hooks';
import {
  clearSession,
  loadSession,
  saveSession,
  type Session,
} from './sessionStorage';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; session: Session };

interface AuthContextValue {
  status: AuthState['status'];
  user: User | null;
  /** Store the result of a successful OTP verification. */
  signIn: (response: VerifyOtpResponse) => Promise<void>;
  /** Replace the stored user, e.g. after the name was set. */
  updateUser: (user: User) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const endSession = useCallback(async () => {
    setAuthToken(null);
    setState({ status: 'signedOut' });
    queryClient.removeQueries({ queryKey: queryKeys.mine });
    queryClient.removeQueries({ queryKey: queryKeys.agencyDashboard });
    await clearSession();
  }, []);

  // A 401 on a signed-in request means the token expired or was revoked.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      endSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  // Restore the previous session, then refresh the user from the server: the role may have
  // changed since (an account that became an agency, say).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadSession();
      if (cancelled) return;
      if (!saved) {
        setState({ status: 'signedOut' });
        return;
      }
      setAuthToken(saved.token);
      setState({ status: 'signedIn', session: saved });
      try {
        const fresh = await getMe();
        if (cancelled) return;
        const session = { ...saved, user: fresh };
        setState({ status: 'signedIn', session });
        await saveSession(session);
      } catch {
        // Offline or server hiccup: keep the saved user. A 401 already signed the user out.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (response: VerifyOtpResponse) => {
    const session: Session = {
      token: response.access_token,
      expiresAt: Date.now() + response.expires_in * 1000,
      user: response.user,
    };
    setAuthToken(session.token);
    setState({ status: 'signedIn', session });
    await saveSession(session);
  }, []);

  const updateUser = useCallback(async (user: User) => {
    setState(current => {
      if (current.status !== 'signedIn') return current;
      const session = { ...current.session, user };
      saveSession(session);
      return { status: 'signedIn', session };
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.status === 'signedIn' ? state.session.user : null,
      signIn,
      updateUser,
      signOut: endSession,
    }),
    [state, signIn, updateUser, endSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
