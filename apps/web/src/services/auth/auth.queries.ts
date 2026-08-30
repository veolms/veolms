import { useQuery } from "@tanstack/react-query";
import type { CurrentUserResponse, SessionResponse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { authStore } from "../../store/auth.store";
import { authKeys } from "./auth.keys";
import { authService } from "./auth.service";

export function useCurrentUser() {
  return useQuery<CurrentUserResponse, ApiError>({
    queryKey: authKeys.me(),
    queryFn: async () => {
      const profile = await authService.getMe();
      authStore.setUser(profile);
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
