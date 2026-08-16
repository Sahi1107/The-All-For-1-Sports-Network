import { QueryClient } from '@tanstack/react-query';

// Shared query client. Tuned for mobile: a short stale window so a re-focused
// screen shows fresh data, one quiet retry (a transient blip shouldn't surface as
// an error), and a refetch when the connection returns — the offline→online path
// the read-first screens rely on.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});
