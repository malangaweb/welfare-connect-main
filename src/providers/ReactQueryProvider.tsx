import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Single shared QueryClient instance for the whole app
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,       // 5 minutes — data is "fresh" and won't refetch
      gcTime: 1000 * 60 * 15,          // 15 minutes — keep unused data in cache longer
      retry: 1,                         // Only retry failed requests once
      refetchOnWindowFocus: false,      // Don't refetch on tab switch
      refetchOnReconnect: true,         // Do refetch on reconnect
    },
  },
});

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* DevTools are tree-shaken and excluded from production builds automatically */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}