'use client';

import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        shouldRetryOnError: (error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500),
        errorRetryCount: 3,
        errorRetryInterval: 4000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
