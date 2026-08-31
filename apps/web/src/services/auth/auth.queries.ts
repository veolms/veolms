import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentUserResponse, SessionResponse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { authStore } from "../../store/auth.store";
import { authKeys } from "./auth.keys";
import { authService } from "./auth.service";

export function useCurrentUser(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();

  return useQuery<CurrentUserResponse, ApiError>({
    queryKey: authKeys.me(),
    queryFn: async () => {
      const generation = authStore.getWriteGeneration();
      const profile = await authService.getMe();

      if (generation !== authStore.getWriteGeneration()) {
        return (
          queryClient.getQueryData<CurrentUserResponse>(authKeys.me()) ??
          profile
        );
      }

      if (profile) {
        authStore.setUser(profile);
      } else {
        authStore.clearAuth();
      }

      return profile;
    },
    enabled: options?.enabled ?? true,
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
