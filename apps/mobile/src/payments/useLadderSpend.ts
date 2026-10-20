import { useMutation, useQueryClient } from '@tanstack/react-query';
import { spendLadders } from '../api/endpoints';
import { queryKeys } from '../api/hooks';
import { useSafeAuth } from '../auth/useSafeAuth';

/**
 * Spends seven ladders (a featured frame on one listing, or one more listing). Everything that shows ladders, frames or
 * the listing quota is read again: the lists (the frame's badge), the wallet (under `properties`), the referral summary
 * (its ladder count) and the user (the frame credits and gift listings).
 */
export function useLadderSpend() {
  const queryClient = useQueryClient();
  const auth = useSafeAuth();
  const refreshUser = auth?.refreshUser;
  return useMutation({
    mutationFn: spendLadders,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.properties });
      queryClient.invalidateQueries({ queryKey: queryKeys.referral });
      refreshUser?.();
    },
  });
}
