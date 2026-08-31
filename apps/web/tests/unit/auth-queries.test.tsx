import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentUser } from "../../src/services/auth/auth.queries.ts";
import { authService } from "../../src/services/auth/auth.service.ts";
import { authStore } from "../../src/store/auth.store.ts";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return function QueryWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  authStore.clearAuth();
});

describe("useCurrentUser", () => {
  it("does not request the session until the query is enabled", async () => {
    const getMe = vi.spyOn(authService, "getMe").mockResolvedValue(null);
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useCurrentUser({ enabled }),
      {
        initialProps: { enabled: false },
        wrapper: createWrapper(),
      },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getMe).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMe).toHaveBeenCalledOnce();
  });
});
