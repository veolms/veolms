import { QueryClient } from "@tanstack/react-query";

function isClientError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      // One retry for failures that may pass (network, 5xx). A 4xx is the
      // server's answer and will be the same the second time; retrying it
      // doubled every request made with an expired session.
      retry: (failureCount, error) => failureCount < 1 && !isClientError(error),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
