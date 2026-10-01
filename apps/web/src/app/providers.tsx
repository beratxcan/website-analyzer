'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { apiClient } from '@/lib/api/client';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Dashboards are projections of mostly-idle data: a short
            // freshness window removes duplicate requests when navigating
            // between pages, while mutations still invalidate explicitly.
            staleTime: 15_000,
            gcTime: 5 * 60_000,
            retry: 1,
            // Focus refetching would re-hit the API on every tab switch;
            // polling for in-flight work is handled per query instead.
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
          mutations: {
            // Never replay a write automatically (e.g. analysis creation).
            retry: 0,
          },
        },
      }),
  );

  useEffect(() => {
    apiClient.onSessionExpired = () => {
      queryClient.clear();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    };
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}