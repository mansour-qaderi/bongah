import {
  QueryClient,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from '@tanstack/react-query';
import type { Paginated, Property } from '@bongah/shared-types';
import { ApiError } from './client';
import {
  getMapLocationStatus,
  getPricing,
  getProperty,
  listMyProperties,
  listProperties,
  type PropertyFilters,
} from './endpoints';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry only when the request never reached the server (flaky mobile network).
      retry: (failureCount, error) =>
        error instanceof ApiError && error.kind !== 'http' && failureCount < 2,
    },
  },
});

/** Query keys in one place so a mutation can invalidate exactly what it changed. */
export const queryKeys = {
  properties: ['properties'] as const,
  list: (filters: PropertyFilters) => ['properties', 'list', filters] as const,
  mine: ['properties', 'mine'] as const,
  property: (id: string) => ['properties', 'detail', id] as const,
  pricing: ['pricing'] as const,
  mapLocation: ['map-location'] as const,
};

const nextPage = (last: Paginated<Property>) =>
  last.meta.page < last.meta.total_pages ? last.meta.page + 1 : undefined;

export const flattenPages = (
  data: InfiniteData<Paginated<Property>> | undefined,
): Property[] => data?.pages.flatMap(page => page.data) ?? [];

export function usePropertyList(filters: PropertyFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.list(filters),
    queryFn: ({ pageParam }) => listProperties(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function useMyProperties(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.mine,
    queryFn: ({ pageParam }) => listMyProperties(pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    enabled,
  });
}

export function usePropertyDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.property(id),
    queryFn: () => getProperty(id),
  });
}

export function usePricing() {
  return useQuery({
    queryKey: queryKeys.pricing,
    queryFn: getPricing,
    staleTime: 5 * 60_000,
  });
}

/** Whether I can pin exact coordinates (unlimited plan, or how many prepaid pins I hold). */
export function useMapLocationStatus(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.mapLocation,
    queryFn: getMapLocationStatus,
    enabled,
    // It changes the moment a payment lands or a pin is spent, so never trust an old answer.
    staleTime: 0,
  });
}
