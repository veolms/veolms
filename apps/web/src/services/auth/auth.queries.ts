import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentUserResponse, SessionResponse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { authStore } from "../../store/auth.store";
import { authKeys } from "./auth.keys";
import { authService } from "./auth.service";

export function useCurrentUser() {
  const queryClient = useQueryClient();

  return useQuery<CurrentUserResponse, ApiError>({
    queryKey: authKeys.me(),
    queryFn: async () => {
      const generation = authStore.getWriteGeneration();
      const profile = await authService.getMe();

      if (generation !== authStore.getWriteGeneration()) {
        // A logout/login write happened while this request was in flight.
        // Never let the old response restore a signed-out (or previous)
        // account. The mutation that changed auth state owns the cache now.
        return (
          queryClient.getQueryData<CurrentUserResponse>(authKeys.me()) ?? null
        );
      }

      if (profile) {
        authStore.setUser(profile);
      } else {
        authStore.clearAuth();
      }

      return profile;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useSessions(options?: { enabled?: boolean }) {
  return useQuery<SessionResponse[], ApiError>({
    queryKey: authKeys.sessions(),
    queryFn: () => authService.getSessions(),
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
    retry: false,
  });
}
