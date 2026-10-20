import { useMutation, useQueryClient } from '@tanstack/react-query';
import { spendFeaturedCredit } from '../api/endpoints';
import { queryKeys } from '../api/hooks';
import { useSafeAuth } from '../auth/useSafeAuth';

/**
 * Makes one of my listings featured with a featured-listing credit instead of a payment. The listing lists change
 * (the badge), and so does the credit count on the user, which is read again from the server.
 */
export function useFeaturedCreditSpend() {
  const queryClient = useQueryClient();
  const auth = useSafeAuth();
  const refreshUser = auth?.refreshUser;
  return useMutation({
    mutationFn: spendFeaturedCredit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.properties });
      refreshUser?.();
    },
  });
}
