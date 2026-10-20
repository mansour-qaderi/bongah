import { useAuth } from './AuthContext';

/**
 * The auth state, or null when there is no provider above (shared hooks that also run on screens rendered alone, as
 * in tests). `useAuth` is still the one place the context is read, so anything that stands in for it stands in here.
 */
export function useSafeAuth(): ReturnType<typeof useAuth> | null {
  try {
    return useAuth();
  } catch {
    return null;
  }
}
